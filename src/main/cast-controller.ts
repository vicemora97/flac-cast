import Bonjour = require("bonjour-service");
import { Client, DefaultMediaReceiver, type CastMediaStatus } from "castv2-client";
import type { CastDevice, CastState, CastTrack } from "../shared/contracts.js";

type KnownDevice = CastDevice & { host: string; lastSeen: number };
type LosslessFallback = (track: CastTrack, targetBits: 16 | 24) => Promise<string>;
type PreparedFlac = { url: string; repacked: boolean };
type FlacPreparer = (track: CastTrack) => Promise<PreparedFlac>;
type ReceiverStatus = { volume?: { level?: number; muted?: boolean } };

export class CastController {
  private readonly devices = new Map<string, KnownDevice>();
  private readonly bonjour: Bonjour;
  private readonly browser: Bonjour.Browser;
  private client?: Client;
  private player?: DefaultMediaReceiver;
  private state: CastState = { connected: false };
  private stateUpdatedAt = Date.now();
  private volumeRefresh?: Promise<void>;

  constructor(
    private readonly prepareFlac: FlacPreparer,
    private readonly createLosslessFallback: LosslessFallback
  ) {
    this.bonjour = new Bonjour({}, (error: Error) => {
      this.state = { ...this.state, error: `No se pudo usar mDNS: ${error.message}` };
    });
    this.browser = this.bonjour.find({ type: "googlecast", protocol: "tcp" }, (service) => this.remember(service));
    // Windows puede emitir `down` desde una interfaz virtual aunque el mismo
    // receptor siga visible por Wi-Fi. La caducidad temporal lo elimina luego.
    this.browser.on("txt-update", (service) => this.remember(service));
    this.browser.on("srv-update", (service) => this.remember(service));
  }

  listDevices(): CastDevice[] {
    // `bonjour-service` no vuelve a emitir `up` cuando una respuesta mDNS
    // corresponde a un servicio que ya tiene en su caché. Sincronizamos esa
    // caché antes de caducar nuestra lista para que un dispositivo conectado
    // durante más de 90 segundos no desaparezca al terminar una sesión Cast.
    for (const service of this.browser.services) this.remember(service);

    // Fuerza una nueva consulta para receptores que se encendieron después.
    this.browser.update();
    const cutoff = Date.now() - 90_000;
    for (const [id, device] of this.devices) {
      if (device.lastSeen < cutoff) this.devices.delete(id);
    }
    return [...this.devices.values()]
      .map(({ id, name, model }) => ({ id, name, model }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  getState(): CastState {
    const state = { ...this.state };
    if (state.playerState === "PLAYING" && state.currentTime != null) {
      const elapsed = (Date.now() - this.stateUpdatedAt) / 1000;
      state.currentTime = Math.min(state.duration ?? Number.POSITIVE_INFINITY, state.currentTime + elapsed);
    }
    return state;
  }

  getReceiverHost(): string | undefined {
    return this.state.deviceId ? this.devices.get(this.state.deviceId)?.host : undefined;
  }

  async getFreshState(): Promise<CastState> {
    this.volumeRefresh ??= this.refreshVolume().finally(() => { this.volumeRefresh = undefined; });
    await this.volumeRefresh;
    return this.getState();
  }

  async connect(deviceId: string): Promise<CastState> {
    const device = this.devices.get(deviceId);
    if (!device) throw new Error("El dispositivo ya no está disponible. Actualiza la búsqueda.");
    if (this.state.connected && this.state.deviceId === deviceId && this.player) return this.getState();

    await this.disconnect(false);
    const client = new Client();
    this.client = client;
    try {
      await withTimeout(new Promise<void>((resolve, reject) => {
        const onInitialError = (error: Error) => reject(error);
        client.once("error", onInitialError);
        client.connect(device.host, () => {
          client.removeListener("error", onInitialError);
          resolve();
        });
      }), 8_000, "Tiempo de conexión agotado");

      client.on("error", (error: Error) => {
        this.invalidateSession(error.message);
      });
      client.on("status", (status: ReceiverStatus) => this.applyReceiverStatus(status));

      const player = await withTimeout(new Promise<DefaultMediaReceiver>((resolve, reject) => {
        client.launch(DefaultMediaReceiver, (error, receiver) => {
          if (error) reject(error);
          else if (!receiver) reject(new Error("Chromecast no entregó una sesión multimedia"));
          else resolve(receiver);
        });
      }), 10_000, "Chromecast no inició el receptor multimedia");

      this.player = player;
      this.state = { connected: true, deviceId, deviceName: device.name, deviceModel: device.model, playerState: "IDLE" };
      this.stateUpdatedAt = Date.now();
      player.on("status", (status: CastMediaStatus) => this.applyStatus(status));
      player.once("close", () => this.handleSessionClosed(player));
      client.getVolume((error, volume) => {
        if (!error && volume) {
          this.state = { ...this.state, volumeLevel: volume.level, muted: volume.muted };
        }
      });
      return this.getState();
    } catch (error) {
      try { client.close(); } catch { /* La conexión nunca llegó a abrirse. */ }
      this.client = undefined;
      this.player = undefined;
      this.state = { connected: false, error: error instanceof Error ? error.message : String(error) };
      throw error;
    }
  }

  async castTrack(track: CastTrack, startTimeSeconds = 0): Promise<CastState> {
    if (!this.player || !this.state.connected) throw new Error("Primero selecciona un dispositivo Chromecast");
    if (!track.castUrl) throw new Error("No hay una dirección de red local disponible para esta pista");
    const requestedStartTime = Number.isFinite(startTimeSeconds) ? startTimeSeconds : 0;
    const startTime = Math.max(0, Math.min(track.durationSeconds ?? Number.POSITIVE_INFINITY, requestedStartTime));

    const metadata: Record<string, unknown> = {
      metadataType: 3,
      title: track.title,
      artist: track.artist,
      albumName: track.album,
      albumArtist: track.albumArtist || track.artist
    };
    if (isPositiveInteger(track.trackNumber)) metadata.trackNumber = track.trackNumber;
    if (isPositiveInteger(track.discNumber)) metadata.discNumber = track.discNumber;
    if (track.castArtworkUrl) metadata.images = [{ url: track.castArtworkUrl }];

    this.state = {
      ...this.state,
      playerState: "BUFFERING",
      idleReason: undefined,
      error: undefined,
      deliveryMode: "flac-cached",
      deliveryBits: track.bitsPerSample,
      deliveryPhase: "preparing",
      currentTime: startTime,
      duration: track.durationSeconds
    };

    try {
      const prepared = await this.prepareFlac(track);
      const deliveryMode = prepared.repacked ? "flac-repacked" : "flac-cached";
      for (const contentType of ["audio/flac", "audio/x-flac"]) {
        if (await this.tryLoad(prepared.url, contentType, track.durationSeconds, metadata, deliveryMode, 4_000, 1_500, startTime)) {
          return this.getState();
        }
      }
    } catch (error) {
      console.warn(`No se pudo preparar el FLAC directo de ${track.title}`, error);
    }

    this.state = {
      ...this.state,
      playerState: "BUFFERING",
      idleReason: undefined,
      error: undefined,
      deliveryMode: "wav-lossless",
      deliveryBits: track.bitsPerSample && track.bitsPerSample <= 16 ? 16 : 24,
      deliveryPhase: "converting",
      currentTime: startTime,
      duration: track.durationSeconds
    };
    const targetBits = this.state.deliveryBits === 16 ? 16 : 24;
    const wavUrl = await this.createLosslessFallback(track, targetBits);
    for (const contentType of ["audio/wav", "audio/x-wav"]) {
      if (await this.tryLoad(wavUrl, contentType, track.durationSeconds, metadata, "wav-lossless", 8_000, 0, startTime)) {
        return this.getState();
      }
    }
    this.state = { ...this.state, deliveryPhase: "failed" };
    throw new Error("La barra rechazó tanto el FLAC preparado como el WAV PCM lossless");
  }

  async command(command: "play" | "pause"): Promise<CastState> {
    if (!this.player) throw new Error("No hay una sesión Chromecast activa");
    const status = await new Promise<CastMediaStatus>((resolve, reject) => {
      this.player![command]((error, result) => {
        if (error) reject(error);
        else resolve((result ?? {}) as CastMediaStatus);
      });
    });
    this.applyStatus(status);
    return this.getState();
  }

  async seek(seconds: number): Promise<CastState> {
    if (!this.player) throw new Error("No hay una sesión Chromecast activa");
    const target = Math.max(0, Math.min(this.state.duration ?? Number.POSITIVE_INFINITY, seconds));
    const status = await new Promise<CastMediaStatus>((resolve, reject) => {
      this.player!.seek(target, (error, result) => {
        if (error) reject(error);
        else resolve((result ?? { currentTime: target }) as CastMediaStatus);
      });
    });
    this.applyStatus({ ...status, currentTime: status.currentTime ?? target });
    return this.getState();
  }

  async setVolume(level: number): Promise<CastState> {
    if (!this.client || !this.state.connected) throw new Error("No hay una sesión Chromecast activa");
    const safeLevel = Math.max(0, Math.min(1, level));
    const volume = await new Promise<{ level?: number; muted?: boolean }>((resolve, reject) => {
      this.client!.setVolume({ level: safeLevel }, (error, result) => {
        if (error) reject(error);
        else resolve(result ?? { level: safeLevel });
      });
    });
    this.state = { ...this.state, volumeLevel: volume.level ?? safeLevel, muted: volume.muted };
    return this.getState();
  }

  async disconnect(stopReceiver = true): Promise<CastState> {
    const client = this.client;
    const player = this.player;
    this.client = undefined;
    this.player = undefined;

    if (client && player && stopReceiver) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 2_000);
        client.stop(player, () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    try { client?.close(); } catch { /* La conexión ya estaba cerrada. */ }
    this.state = { connected: false };
    return this.getState();
  }

  destroy(): void {
    void this.disconnect(false);
    this.browser.stop();
    this.bonjour.destroy();
  }

  private remember(service: Bonjour.Service): void {
    const host = service.addresses?.find((address) => /^\d{1,3}(\.\d{1,3}){3}$/.test(address))
      ?? service.referer?.address
      ?? service.host;
    if (!host) return;
    const id = textValue(service.txt?.id) ?? service.fqdn ?? `${host}:${service.port}`;
    this.devices.set(id, {
      id,
      name: textValue(service.txt?.fn) ?? service.name ?? "Chromecast",
      model: textValue(service.txt?.md),
      host,
      lastSeen: Date.now()
    });
  }

  private applyStatus(status: CastMediaStatus): void {
    this.state = {
      ...this.state,
      error: undefined,
      playerState: status.playerState ?? this.state.playerState,
      idleReason: status.idleReason,
      currentTime: status.currentTime ?? this.state.currentTime,
      duration: status.media?.duration ?? this.state.duration
    };
    this.stateUpdatedAt = Date.now();
    this.applyReceiverStatus({ volume: status.volume });
    if (status.playerState === "PLAYING") this.state.deliveryPhase = "playing";
  }

  private applyReceiverStatus(status: ReceiverStatus): void {
    if (!status.volume) return;
    this.state = {
      ...this.state,
      volumeLevel: status.volume.level ?? this.state.volumeLevel,
      muted: status.volume.muted ?? this.state.muted
    };
  }

  private async refreshVolume(): Promise<void> {
    const client = this.client;
    if (!client || !this.state.connected) return;
    try {
      const volume = await withTimeout(new Promise<{ level?: number; muted?: boolean }>((resolve, reject) => {
        client.getVolume((error, result) => {
          if (error) reject(error);
          else resolve(result ?? {});
        });
      }), 1_500, "Chromecast no respondió al consultar el volumen");
      if (this.client !== client) return;
      this.applyReceiverStatus({ volume });
    } catch {
      // Una consulta de volumen perdida no debe interrumpir la reproducción.
    }
  }

  private handleSessionClosed(player: DefaultMediaReceiver): void {
    if (this.player !== player) return;
    this.player = undefined;
    const client = this.client;
    this.client = undefined;
    try { client?.close(); } catch { /* El canal ya estaba cerrado. */ }
    this.state = {
      connected: false,
      error: "La barra cerró la sesión Cast. Vuelve a conectarla para continuar."
    };
  }

  private invalidateSession(message: string): void {
    const client = this.client;
    this.client = undefined;
    this.player = undefined;
    try { client?.close(); } catch { /* El socket ya estaba cerrado. */ }
    this.state = { connected: false, error: message };
  }

  private async tryLoad(
    contentId: string,
    contentType: string,
    duration: number | undefined,
    metadata: Record<string, unknown>,
    deliveryMode: "flac-original" | "flac-cached" | "flac-repacked" | "wav-lossless",
    waitMilliseconds = 4_000,
    stabilityMilliseconds = 0,
    startTime = 0
  ): Promise<boolean> {
    if (!this.player) return false;
    this.state = {
      ...this.state,
      playerState: "BUFFERING",
      idleReason: undefined,
      error: undefined,
      deliveryMode,
      deliveryPhase: "loading",
      currentTime: startTime,
      duration: duration ?? this.state.duration
    };
    try {
      const status = await withTimeout(new Promise<CastMediaStatus>((resolve, reject) => {
        this.player!.load({ contentId, contentType, streamType: "BUFFERED", duration, metadata }, { autoplay: true, currentTime: startTime }, (error, result) => {
          if (error) reject(error);
          else resolve((result ?? {}) as CastMediaStatus);
        });
      }), 6_000, `Chromecast no pudo cargar ${contentType}`);
      this.applyStatus(status);
      if (status.playerState === "PLAYING") {
        return stabilityMilliseconds > 0 ? this.confirmPlaybackStability(stabilityMilliseconds) : true;
      }
      if (status.playerState === "IDLE" && status.idleReason === "ERROR") return false;
      const playing = await this.waitForPlaybackOutcome(waitMilliseconds);
      return playing && stabilityMilliseconds > 0
        ? this.confirmPlaybackStability(stabilityMilliseconds)
        : playing;
    } catch {
      return false;
    }
  }

  private waitForPlaybackOutcome(milliseconds: number): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.player) {
        resolve(false);
        return;
      }
      let settled = false;
      const finish = (result: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.player?.removeListener("status", onStatus);
        resolve(result);
      };
      const onStatus = (status: CastMediaStatus) => {
        if (status.playerState === "PLAYING") finish(true);
        else if (status.playerState === "IDLE" && status.idleReason === "ERROR") finish(false);
      };
      const timer = setTimeout(() => finish(this.state.playerState === "PLAYING"), milliseconds);
      this.player.on("status", onStatus);
    });
  }

  private confirmPlaybackStability(milliseconds: number): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.player) {
        resolve(false);
        return;
      }
      let settled = false;
      const finish = (result: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.player?.removeListener("status", onStatus);
        resolve(result);
      };
      const onStatus = (status: CastMediaStatus) => {
        if (status.playerState === "IDLE" && status.idleReason === "ERROR") finish(false);
      };
      const timer = setTimeout(() => {
        finish(this.state.playerState !== "IDLE" || this.state.idleReason !== "ERROR");
      }, milliseconds);
      this.player.on("status", onStatus);
    });
  }
}

function textValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  return value == null ? undefined : String(value);
}

function isPositiveInteger(value: number | undefined): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

async function withTimeout<T>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
