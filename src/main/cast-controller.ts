import Bonjour = require("bonjour-service");
import { Client, DefaultMediaReceiver, type CastMediaStatus } from "castv2-client";
import type { CastDeliveryMode, CastDevice, CastQueueRequest, CastState, CastTrack } from "../shared/contracts.js";

type KnownDevice = CastDevice & { host: string; lastSeen: number };
type LosslessFallback = (track: CastTrack, targetBits: 16 | 24, targetSampleRate: number) => Promise<string>;
type CompatibleFlacFallback = (track: CastTrack, targetBits: 16 | 24, targetSampleRate: number) => Promise<string>;
type PreparedFlac = { url: string; repacked: boolean; cached: boolean };
type FlacPreparer = (track: CastTrack) => Promise<PreparedFlac>;
type ReceiverStatus = { volume?: { level?: number; muted?: boolean } };
export type PreferredCastDelivery = "original" | "compatible" | "wav";

export class CastController {
  private readonly devices = new Map<string, KnownDevice>();
  private readonly bonjour: Bonjour;
  private readonly browser: Bonjour.Browser;
  private client?: Client;
  private player?: DefaultMediaReceiver;
  private state: CastState = { connected: false };
  private stateUpdatedAt = Date.now();
  private volumeRefresh?: Promise<void>;
  private lastLoadedContent?: { contentId: string; contentType: string };
  private recoveryInProgress = false;
  private queueAllowed = true;
  private queueMutation = Promise.resolve();
  private readonly receiverProfiles = new Map<string, Map<string, PreferredCastDelivery>>();

  constructor(
    private readonly prepareFlac: FlacPreparer,
    private readonly createLosslessFallback: LosslessFallback,
    private readonly createCompatibleFlac: CompatibleFlacFallback
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

  getPreferredPrewarmDelivery(track: CastTrack): PreferredCastDelivery {
    const deviceId = this.state.deviceId;
    if (!deviceId || !isFlac(track)) return "original";
    return this.receiverProfiles.get(deviceId)?.get(deliveryProfileKey(track)) ?? "original";
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
        if (this.client === client) this.invalidateSession(error.message);
      });
      client.on("status", (status: ReceiverStatus) => {
        if (this.client === client) this.applyReceiverStatus(status);
      });

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
      player.on("status", (status: CastMediaStatus) => {
        if (this.player === player) this.applyStatus(status);
      });
      player.once("close", () => this.handleSessionClosed(player));
      client.getVolume((error, volume) => {
        if (this.client === client && !error && volume) {
          this.state = { ...this.state, volumeLevel: volume.level, muted: volume.muted };
        }
      });
      return this.getState();
    } catch (error) {
      try { client.close(); } catch { /* La conexión nunca llegó a abrirse. */ }
      if (this.client === client) {
        this.client = undefined;
        this.player = undefined;
        this.state = { connected: false, error: error instanceof Error ? error.message : String(error) };
      }
      throw error;
    }
  }

  async castTrack(track: CastTrack, startTimeSeconds = 0, allowSessionRecovery = true): Promise<CastState> {
    if (!this.player || !this.state.connected) throw new Error("Primero selecciona un dispositivo Chromecast");
    if (!track.castUrl) throw new Error("No hay una dirección de red local disponible para esta pista");
    const requestedStartTime = Number.isFinite(startTimeSeconds) ? startTimeSeconds : 0;
    const startTime = Math.max(0, Math.min(track.durationSeconds ?? Number.POSITIVE_INFINITY, requestedStartTime));
    const recoveryDeviceId = this.state.deviceId;

    const metadata = createMetadata(track);

    this.state = {
      ...this.state,
      playerState: "BUFFERING",
      idleReason: undefined,
      error: undefined,
      deliveryMode: isFlac(track) ? "flac-cached" : "original",
      deliveryBits: track.bitsPerSample,
      deliverySampleRate: track.sampleRate,
      deliveryPhase: "preparing",
      currentTime: startTime,
      duration: track.durationSeconds,
      currentTrackId: track.id,
      queueActive: false
    };

    let directUrl = track.castUrl;
    let directTypes = directContentTypes(track);
    let directMode: CastState["deliveryMode"] = "original";
    if (isFlac(track)) {
      try {
        const prepared = await this.prepareFlac(track);
        directUrl = prepared.url;
        directTypes = ["audio/flac", "audio/x-flac"];
        directMode = prepared.repacked ? "flac-repacked" : prepared.cached ? "flac-cached" : "flac-original";
      } catch (error) {
        console.warn(`[cast] direct preparation failed for "${track.title}"`, error);
      }
    }

    if (await this.tryDirectCandidates(track, directUrl, directTypes, metadata, directMode, startTime, "initial")) {
      this.rememberDelivery(track, "original");
      return this.getState();
    }

    // A stale Default Media Receiver session can answer with a media error even
    // when the exact same file is valid after reconnecting. Recover once and
    // retry the original URL (with a cache-busting query) before transcoding.
    if (allowSessionRecovery && await this.recoverCurrentDevice(`direct playback failed for ${track.id}`, recoveryDeviceId)) {
      const retryUrl = appendRetryToken(directUrl);
      if (await this.tryDirectCandidates(track, retryUrl, directTypes, metadata, directMode, startTime, "recovered")) {
        this.rememberDelivery(track, "original");
        return this.getState();
      }
    }

    const compatibleBits: 16 | 24 = track.bitsPerSample && track.bitsPerSample > 16 ? 24 : 16;
    const compatibleRate = compatibleSampleRate(track.sampleRate);
    if (isFlac(track)) {
      this.state = {
        ...this.state,
        playerState: "BUFFERING",
        idleReason: undefined,
        error: undefined,
        deliveryMode: "flac-compatible",
        deliveryBits: compatibleBits,
        deliverySampleRate: compatibleRate,
        deliveryPhase: "converting",
        currentTime: startTime,
        duration: track.durationSeconds
      };
      try {
        const compatibleUrl = await this.createCompatibleFlac(track, compatibleBits, compatibleRate);
        for (const contentType of ["audio/flac", "audio/x-flac"]) {
          if (await this.tryLoad(compatibleUrl, contentType, track.durationSeconds, metadata, "flac-compatible", 6_000, 2_000, startTime)) {
            this.rememberDelivery(track, "compatible");
            return this.getState();
          }
        }
      } catch (error) {
        console.warn(`[cast] compatible FLAC preparation failed for "${track.title}"`, error);
      }
    }

    this.state = {
      ...this.state,
      playerState: "BUFFERING",
      idleReason: undefined,
      error: undefined,
      deliveryMode: "wav-lossless",
      deliveryBits: 16,
      deliverySampleRate: compatibleRate,
      deliveryPhase: "converting",
      currentTime: startTime,
      duration: track.durationSeconds
    };
    const wavUrl = await this.createLosslessFallback(track, 16, compatibleRate);
    for (const contentType of ["audio/wav", "audio/x-wav"]) {
      if (await this.tryLoad(wavUrl, contentType, track.durationSeconds, metadata, "wav-lossless", 8_000, 2_000, startTime)) {
        this.rememberDelivery(track, "wav");
        return this.getState();
      }
    }
    this.state = { ...this.state, deliveryPhase: "failed" };
    throw new Error("The receiver rejected the original audio, compatible FLAC, and PCM fallback");
  }

  async castQueue(request: CastQueueRequest): Promise<CastState> {
    const tracks = request.tracks.slice(0, 40);
    if (tracks.length === 0) throw new Error("The Cast queue is empty");
    const currentIndex = Math.max(0, Math.min(tracks.length - 1, request.currentIndex));
    const current = tracks[currentIndex]!;
    if (!this.queueAllowed) return this.castTrack(current, request.startTimeSeconds ?? 0);
    if (!this.player || !this.state.connected) throw new Error("Primero selecciona un dispositivo Chromecast");
    if (!current.castUrl) throw new Error("No hay una dirección de red local disponible para esta pista");
    const recoveryDeviceId = this.state.deviceId;
    const requestedStartTime = Number.isFinite(request.startTimeSeconds) ? request.startTimeSeconds ?? 0 : 0;
    const startTime = Math.max(0, Math.min(current.durationSeconds ?? Number.POSITIVE_INFINITY, requestedStartTime));

    let contentId = current.castUrl;
    let contentType = directContentTypes(current)[0] ?? "application/octet-stream";
    let deliveryMode: NonNullable<CastState["deliveryMode"]> = "original";
    this.state = {
      ...this.state,
      playerState: "BUFFERING",
      idleReason: undefined,
      error: undefined,
      deliveryMode: isFlac(current) ? "flac-cached" : "original",
      deliveryBits: current.bitsPerSample,
      deliverySampleRate: current.sampleRate,
      deliveryPhase: "preparing",
      currentTime: startTime,
      duration: current.durationSeconds,
      currentTrackId: current.id,
      queueActive: false
    };

    if (isFlac(current)) {
      try {
        const prepared = await this.prepareFlac(current);
        contentId = prepared.url;
        contentType = "audio/flac";
        deliveryMode = prepared.repacked ? "flac-repacked" : prepared.cached ? "flac-cached" : "flac-original";
      } catch (error) {
        console.warn(`[cast] queue preparation failed for "${current.title}"; using original URL`, error);
      }
    }

    if (await this.tryQueueLoad(tracks, currentIndex, contentId, contentType, deliveryMode, request, startTime)) {
      this.rememberDelivery(current, "original");
      return this.getState();
    }

    // A valid queue can be rejected by a stale Default Media Receiver session.
    // Rebuild that session once and retry the exact queue before degrading to
    // single-item playback. The retry token prevents a stale media response
    // from being reused while leaving every later queue item unchanged.
    if (await this.recoverCurrentDevice(`queue playback failed for ${current.id}`, recoveryDeviceId)) {
      const retryContentId = appendRetryToken(contentId);
      if (await this.tryQueueLoad(tracks, currentIndex, retryContentId, contentType, deliveryMode, request, startTime)) {
        this.rememberDelivery(current, "original");
        return this.getState();
      }
    }

    // QUEUE_LOAD is optional compatibility surface. If the receiver rejects it,
    // switch to the proven single-item pipeline only after the bounded recovery
    // attempt. This prevents both false capability negatives and retry loops.
    console.warn("[cast] queueLoad failed after session recovery; switching this connection to single-item playback");
    this.queueAllowed = false;
    const restored = await this.castTrack(current, startTime, false);
    this.state = { ...restored, queueActive: false };
    return this.getState();
  }

  updateQueue(request: CastQueueRequest): Promise<CastState> {
    const operation = this.queueMutation.then(() => this.updateQueueNow(request));
    this.queueMutation = operation.then(() => undefined, () => undefined);
    return operation;
  }

  updateQueueModes(request: CastQueueRequest): Promise<CastState> {
    const operation = this.queueMutation.then(() => this.updateQueueModesNow(request));
    this.queueMutation = operation.then(() => undefined, () => undefined);
    return operation;
  }

  private async updateQueueModesNow(request: CastQueueRequest): Promise<CastState> {
    const player = this.player;
    if (!player || !this.state.connected) throw new Error("No hay una sesión Chromecast activa");
    if (!this.state.queueActive) return this.getState();

    const status = await withTimeout(new Promise<CastMediaStatus>((resolve, reject) => {
      player.getStatus((error, result) => {
        if (error) reject(error);
        else resolve((result ?? {}) as CastMediaStatus);
      });
    }), 3_000, "Chromecast no respondió al consultar la cola");
    if (this.player !== player) throw new Error("La sesión Chromecast cambió mientras se actualizaban los controles de cola");

    const currentItemId = status.currentItemId;
    const items = status.items ?? [];
    const currentPosition = currentItemId == null ? -1 : items.findIndex((item) => item.itemId === currentItemId);
    if (currentPosition >= 0) {
      // Reorder only already-loaded future items. Cast's native shuffle update
      // can reload the item at the current position, which creates an audible
      // interruption on some audio receivers.
      const desiredIds = request.tracks
        .slice(Math.max(0, request.currentIndex + 1))
        .map((track) => track.id);
      const desiredPosition = new Map(desiredIds.map((trackId, index) => [trackId, index]));
      const future = items.slice(currentPosition + 1).filter((item): item is typeof item & { itemId: number } => item.itemId != null);
      const reordered = [...future].sort((left, right) => {
        const leftPosition = desiredPosition.get(left.media?.customData?.trackId ?? "") ?? Number.MAX_SAFE_INTEGER;
        const rightPosition = desiredPosition.get(right.media?.customData?.trackId ?? "") ?? Number.MAX_SAFE_INTEGER;
        return leftPosition - rightPosition;
      });
      const changed = future.some((item, index) => item.itemId !== reordered[index]?.itemId);
      if (changed && reordered.length > 1) {
        await withTimeout(new Promise<void>((resolve, reject) => {
          player.queueReorder(reordered.map((item) => item.itemId), {}, (error) => error ? reject(error) : resolve());
        }), 3_000, "Chromecast no respondió al reordenar la cola");
        if (this.player !== player) throw new Error("La sesión Chromecast cambió mientras se reordenaba la cola");
      }
    }

    // Repeat mode is a queue property and can be changed without replacing the
    // current media item.
    const updated = await withTimeout(new Promise<CastMediaStatus>((resolve, reject) => {
      player.queueUpdate([], { repeatMode: castRepeatMode(request.repeatMode) }, (error, result) => {
        if (error) reject(error);
        else resolve((result ?? {}) as CastMediaStatus);
      });
    }), 3_000, "Chromecast no respondió al actualizar la repetición");
    if (this.player !== player) throw new Error("La sesión Chromecast cambió mientras se actualizaba la repetición");
    this.applyStatus(updated);
    this.state = { ...this.state, queueActive: true };
    return this.getState();
  }

  private async updateQueueNow(request: CastQueueRequest): Promise<CastState> {
    const player = this.player;
    if (!player || !this.state.connected) throw new Error("No hay una sesión Chromecast activa");
    if (!this.state.queueActive) return this.getState();

    let status = await this.readQueueStatus(player);
    if (this.player !== player) throw new Error("La sesión Chromecast cambió mientras se actualizaba la cola");

    const currentIndex = Math.max(0, Math.min(request.tracks.length - 1, request.currentIndex));
    const desiredFuture = request.tracks.slice(currentIndex + 1, 40).filter((track) => Boolean(track.castUrl));
    const currentItemId = status.currentItemId;
    const currentPosition = currentItemId == null ? -1 : (status.items ?? []).findIndex((item) => item.itemId === currentItemId);
    if (currentItemId == null || currentPosition < 0) throw new Error("Chromecast no informó el elemento actual de la cola");

    const pastItems = (status.items ?? []).slice(0, currentPosition);
    const existingFuture = (status.items ?? []).slice(currentPosition + 1);
    const usedItemIds = new Set<number>();
    const missingTracks: CastTrack[] = [];
    for (const track of desiredFuture) {
      const match = existingFuture.find((item) => item.itemId != null
        && !usedItemIds.has(item.itemId)
        && item.media?.customData?.trackId === track.id
        && item.media?.contentId === track.castUrl);
      if (match?.itemId != null) usedItemIds.add(match.itemId);
      else missingTracks.push(track);
    }

    if (missingTracks.length > 0) {
      const futureItems = missingTracks.map((track, index) => ({
        media: {
          contentId: track.castUrl!,
          contentType: directContentTypes(track)[0] ?? "application/octet-stream",
          streamType: "BUFFERED",
          duration: track.durationSeconds,
          metadata: createMetadata(track),
          customData: createQueueCustomData(track)
        },
        autoplay: true,
        startTime: 0,
        preloadTime: suggestedPreloadTime(track, index)
      }));
      // Insert new entries before the first retained future item instead of
      // appending them and relying solely on QUEUE_REORDER. Some audio-only
      // receivers acknowledge reordering but keep the appended item at the
      // end, which made a manually queued FIFO track get skipped.
      const firstRetainedFuture = existingFuture.find((item) => item.itemId != null && usedItemIds.has(item.itemId));
      await withTimeout(new Promise<void>((resolve, reject) => {
        player.queueInsert(futureItems, { insertBefore: firstRetainedFuture?.itemId }, (error) => error ? reject(error) : resolve());
      }), 3_000, "Chromecast no respondió al insertar la nueva cola");
      if (this.player !== player) throw new Error("La sesión Chromecast cambió mientras se actualizaba la cola");
      status = await this.readQueueStatus(player);
      if (status.currentItemId !== currentItemId) {
        this.applyStatus(status);
        this.state = { ...this.state, queueActive: true };
        return this.getState();
      }
    }

    // Remove stale entries only after their replacements exist. This keeps a
    // valid next item available if the current track ends during a queue sync.
    const currentItems = status.items ?? [];
    const currentPositionAfterInsert = currentItems.findIndex((item) => item.itemId === currentItemId);
    const currentFutureAfterInsert = currentPositionAfterInsert >= 0 ? currentItems.slice(currentPositionAfterInsert + 1) : [];
    const desiredKeys = new Map<string, number>();
    for (const track of desiredFuture) {
      const key = `${track.id}\0${track.castUrl}`;
      desiredKeys.set(key, (desiredKeys.get(key) ?? 0) + 1);
    }
    const obsoleteFutureIds: number[] = [];
    for (const item of currentFutureAfterInsert) {
      if (item.itemId == null) continue;
      const key = `${item.media?.customData?.trackId ?? ""}\0${item.media?.contentId ?? ""}`;
      const remaining = desiredKeys.get(key) ?? 0;
      if (remaining > 0) desiredKeys.set(key, remaining - 1);
      else obsoleteFutureIds.push(item.itemId);
    }
    const obsoleteItemIds = [
      ...pastItems.slice(0, Math.max(0, pastItems.length - 5)).flatMap((item) => item.itemId ?? []),
      ...obsoleteFutureIds
    ];
    if (obsoleteItemIds.length > 0) {
      await withTimeout(new Promise<void>((resolve, reject) => {
        player.queueRemove(obsoleteItemIds, {}, (error) => error ? reject(error) : resolve());
      }), 3_000, "Chromecast no respondió al actualizar la cola");
      if (this.player !== player) throw new Error("La sesión Chromecast cambió mientras se actualizaba la cola");
      status = await this.readQueueStatus(player);
      if (status.currentItemId !== currentItemId) {
        this.applyStatus(status);
        this.state = { ...this.state, queueActive: true };
        return this.getState();
      }
    }

    const refreshedItems = status.items ?? [];
    const refreshedCurrentPosition = refreshedItems.findIndex((item) => item.itemId === currentItemId);
    const refreshedFuture = refreshedCurrentPosition >= 0 ? refreshedItems.slice(refreshedCurrentPosition + 1) : [];
    const reorderedItemIds: number[] = [];
    const reorderedUsed = new Set<number>();
    for (const track of desiredFuture) {
      const match = refreshedFuture.find((item) => item.itemId != null
        && !reorderedUsed.has(item.itemId)
        && item.media?.customData?.trackId === track.id
        && item.media?.contentId === track.castUrl);
      if (match?.itemId != null) {
        reorderedUsed.add(match.itemId);
        reorderedItemIds.push(match.itemId);
      }
    }
    const currentFutureIds = refreshedFuture.flatMap((item) => item.itemId ?? []);
    const orderChanged = reorderedItemIds.length > 1
      && reorderedItemIds.some((itemId, index) => currentFutureIds[index] !== itemId);
    if (orderChanged) {
      await withTimeout(new Promise<void>((resolve, reject) => {
        player.queueReorder(reorderedItemIds, {}, (error) => error ? reject(error) : resolve());
      }), 3_000, "Chromecast no respondió al reordenar la cola");
      if (this.player !== player) throw new Error("La sesión Chromecast cambió mientras se reordenaba la cola");
      status = await this.readQueueStatus(player);
    }

    const desiredRepeatMode = castRepeatMode(request.repeatMode);
    if (status.repeatMode !== desiredRepeatMode) {
      status = await withTimeout(new Promise<CastMediaStatus>((resolve, reject) => {
        player.queueUpdate([], { repeatMode: desiredRepeatMode }, (error, result) => {
          if (error) reject(error);
          else resolve((result ?? {}) as CastMediaStatus);
        });
      }), 3_000, "Chromecast no respondió al actualizar el modo de repetición");
    }
    if (this.player !== player) throw new Error("La sesión Chromecast cambió mientras se actualizaba la cola");
    this.applyStatus(status);
    this.state = { ...this.state, queueActive: true };
    return this.getState();
  }

  private async readQueueStatus(player: DefaultMediaReceiver): Promise<CastMediaStatus> {
    return withTimeout(new Promise<CastMediaStatus>((resolve, reject) => {
      player.getStatus((error, result) => {
        if (error) reject(error);
        else resolve((result ?? {}) as CastMediaStatus);
      });
    }), 3_000, "Chromecast no respondió al consultar la cola");
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
    this.lastLoadedContent = undefined;
    this.queueAllowed = true;

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
      duration: status.media?.duration ?? this.state.duration,
      currentTrackId: status.media?.customData?.trackId ?? this.state.currentTrackId,
      deliveryMode: status.media?.customData?.deliveryMode ?? this.state.deliveryMode,
      deliveryBits: status.media?.customData?.deliveryBits ?? this.state.deliveryBits,
      deliverySampleRate: status.media?.customData?.deliverySampleRate ?? this.state.deliverySampleRate,
      repeatMode: status.repeatMode === "REPEAT_SINGLE" ? "single"
        : status.repeatMode === "REPEAT_ALL" || status.repeatMode === "REPEAT_ALL_AND_SHUFFLE" ? "all"
          : status.repeatMode === "REPEAT_OFF" ? "off" : this.state.repeatMode
    };
    this.stateUpdatedAt = Date.now();
    // MEDIA_STATUS.volume belongs to the media session and is commonly 1.0.
    // Receiver volume comes from Client status/getVolume and must remain the
    // source of truth for the physical soundbar slider.
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
    this.invalidateSession("La barra cerró inesperadamente la sesión Cast.");
  }

  private invalidateSession(message: string): void {
    const interruptedState = this.getState();
    const client = this.client;
    this.client = undefined;
    this.player = undefined;
    this.lastLoadedContent = undefined;
    try { client?.close(); } catch { /* El socket ya estaba cerrado. */ }
    console.warn(`[cast] control session lost: ${message}`);
    // Preserve the receiver, track, position and delivery data. The renderer
    // can rebuild one interrupted session without guessing what was playing.
    this.state = { ...interruptedState, connected: false, error: message };
    this.stateUpdatedAt = Date.now();
  }

  private async tryQueueLoad(
    tracks: CastTrack[],
    currentIndex: number,
    currentContentId: string,
    currentContentType: string,
    deliveryMode: NonNullable<CastState["deliveryMode"]>,
    request: CastQueueRequest,
    startTime: number
  ): Promise<boolean> {
    const player = this.player;
    if (!player) return false;
    const items: Array<Record<string, unknown>> = [];
    let startIndex = -1;
    tracks.forEach((track, index) => {
      const active = index === currentIndex;
      const contentId = active ? currentContentId : track.castUrl;
      if (!contentId) return;
      if (active) startIndex = items.length;
      items.push({
        media: {
          contentId,
          contentType: active ? currentContentType : directContentTypes(track)[0] ?? "application/octet-stream",
          streamType: "BUFFERED",
          duration: track.durationSeconds,
          metadata: createMetadata(track),
          customData: createQueueCustomData(track, active ? deliveryMode : undefined)
        },
        autoplay: true,
        startTime: active ? startTime : 0,
        preloadTime: index > currentIndex ? suggestedPreloadTime(track, index - currentIndex - 1) : 0
      });
    });
    if (startIndex < 0 || items.length === 0) return false;

    this.state = {
      ...this.state,
      playerState: "BUFFERING",
      idleReason: undefined,
      error: undefined,
      deliveryMode,
      deliveryPhase: "loading",
      currentTime: startTime,
      queueActive: false
    };
    try {
      const status = await withTimeout(new Promise<CastMediaStatus>((resolve, reject) => {
        player.queueLoad(items, {
          startIndex,
          currentTime: startTime,
          repeatMode: castRepeatMode(request.repeatMode)
        }, (error, result) => error ? reject(error) : resolve(result ?? {}));
      }), 8_000, "Chromecast did not accept the playback queue");
      if (this.player !== player) return false;
      this.applyStatus(status);
      if (status.playerState === "IDLE" && status.idleReason === "ERROR") return false;
      const playing = status.playerState === "PLAYING" || await this.waitForPlaybackOutcome(player, 4_000);
      const stable = playing && await this.confirmPlaybackStability(player, 1_200);
      if (!stable || this.player !== player) return false;
      this.lastLoadedContent = { contentId: currentContentId, contentType: currentContentType };
      this.state = { ...this.state, queueActive: true };
      return true;
    } catch (error) {
      if (this.player === player) console.warn(`[cast] queueLoad failed (${currentContentType})`, error);
      return false;
    }
  }

  private async tryLoad(
    contentId: string,
    contentType: string,
    duration: number | undefined,
    metadata: Record<string, unknown>,
    deliveryMode: CastDeliveryMode,
    waitMilliseconds = 4_000,
    stabilityMilliseconds = 0,
    startTime = 0
  ): Promise<boolean> {
    const player = this.player;
    if (!player) return false;
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
        player.load({ contentId, contentType, streamType: "BUFFERED", duration, metadata }, { autoplay: true, currentTime: startTime }, (error, result) => {
          if (error) reject(error);
          else resolve((result ?? {}) as CastMediaStatus);
        });
      }), 6_000, `Chromecast no pudo cargar ${contentType}`);
      if (this.player !== player) return false;
      this.applyStatus(status);
      if (status.playerState === "PLAYING") {
        const stable = stabilityMilliseconds > 0 ? await this.confirmPlaybackStability(player, stabilityMilliseconds) : true;
        if (stable && this.player === player) this.lastLoadedContent = { contentId, contentType };
        return stable && this.player === player;
      }
      if (status.playerState === "IDLE" && status.idleReason === "ERROR") return false;
      const playing = await this.waitForPlaybackOutcome(player, waitMilliseconds);
      const stable = playing && stabilityMilliseconds > 0
        ? await this.confirmPlaybackStability(player, stabilityMilliseconds)
        : playing;
      if (stable && this.player === player) this.lastLoadedContent = { contentId, contentType };
      return stable && this.player === player;
    } catch (error) {
      if (this.player === player) console.warn(`[cast] load failed (${contentType})`, error);
      return false;
    }
  }

  private async tryDirectCandidates(
    track: CastTrack,
    url: string,
    contentTypes: string[],
    metadata: Record<string, unknown>,
    deliveryMode: CastDeliveryMode,
    startTime: number,
    attempt: string
  ): Promise<boolean> {
    for (const contentType of contentTypes) {
      const loaded = await this.tryLoad(url, contentType, track.durationSeconds, metadata, deliveryMode, 4_000, 1_200, startTime);
      console.info(`[cast] ${attempt} ${contentType} for ${track.id}: ${loaded ? "playing" : "rejected"}`);
      if (loaded) return true;
    }
    return false;
  }

  private async recoverCurrentDevice(reason: string, deviceId = this.state.deviceId): Promise<boolean> {
    if (this.recoveryInProgress || !deviceId) return false;
    this.recoveryInProgress = true;
    console.warn(`[cast] recovering receiver session: ${reason}`);
    try {
      // Close only the sender transport. Explicitly stopping the receiver here
      // produces connection chimes and lets late errors from the old socket race
      // with the replacement session.
      await this.disconnect(false);
      await this.connect(deviceId);
      return true;
    } catch (error) {
      console.warn("[cast] automatic session recovery failed", error);
      return false;
    } finally {
      this.recoveryInProgress = false;
    }
  }

  private rememberDelivery(track: CastTrack, delivery: PreferredCastDelivery): void {
    const deviceId = this.state.deviceId;
    if (!deviceId || !isFlac(track)) return;
    let profile = this.receiverProfiles.get(deviceId);
    if (!profile) {
      profile = new Map();
      this.receiverProfiles.set(deviceId, profile);
    }
    profile.set(deliveryProfileKey(track), delivery);
  }

  private waitForPlaybackOutcome(player: DefaultMediaReceiver, milliseconds: number): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.player !== player) {
        resolve(false);
        return;
      }
      let settled = false;
      const finish = (result: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        player.removeListener("status", onStatus);
        resolve(result);
      };
      const onStatus = (status: CastMediaStatus) => {
        if (status.playerState === "PLAYING") finish(true);
        else if (status.playerState === "IDLE" && status.idleReason === "ERROR") finish(false);
      };
      const timer = setTimeout(() => finish(this.player === player && this.state.playerState === "PLAYING"), milliseconds);
      player.on("status", onStatus);
    });
  }

  private confirmPlaybackStability(player: DefaultMediaReceiver, milliseconds: number): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.player !== player) {
        resolve(false);
        return;
      }
      let settled = false;
      const finish = (result: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        player.removeListener("status", onStatus);
        resolve(result);
      };
      const onStatus = (status: CastMediaStatus) => {
        if (status.playerState === "IDLE" && status.idleReason === "ERROR") finish(false);
      };
      const timer = setTimeout(() => {
        finish(this.player === player && (this.state.playerState !== "IDLE" || this.state.idleReason !== "ERROR"));
      }, milliseconds);
      player.on("status", onStatus);
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

function isFlac(track: CastTrack): boolean {
  return track.fileExtension?.toLowerCase() === ".flac" || track.contentType?.toLowerCase().includes("flac") === true;
}

function compatibleSampleRate(sampleRate: number | undefined): number {
  if (!sampleRate || !Number.isFinite(sampleRate)) return 48_000;
  return Math.max(8_000, Math.min(48_000, Math.round(sampleRate)));
}

function deliveryProfileKey(track: CastTrack): string {
  return `${track.fileExtension?.toLowerCase() ?? track.contentType?.toLowerCase() ?? "unknown"}:${track.bitsPerSample ?? 0}:${track.sampleRate ?? 0}`;
}

function directContentTypes(track: CastTrack): string[] {
  const primary = track.contentType || "application/octet-stream";
  if (isFlac(track)) return ["audio/flac", "audio/x-flac"];
  if (primary === "audio/wav") return ["audio/wav", "audio/x-wav"];
  if (primary === "audio/opus") return ["audio/opus", "audio/ogg"];
  return [primary];
}

function suggestedPreloadTime(track: CastTrack, futureIndex: number): number {
  // Cast treats this as a hint rather than a guarantee. Give larger lossless
  // files a longer runway, while limiting the hint to the bounded warm window.
  if (futureIndex >= 5) return 0;
  const highBandwidth = (track.sampleRate ?? 0) > 48_000 || (track.bitrate ?? 0) > 2_000_000;
  return highBandwidth ? 20 : 12;
}

function createQueueCustomData(track: CastTrack, deliveryMode?: CastDeliveryMode): Record<string, unknown> {
  return {
    trackId: track.id,
    deliveryMode: deliveryMode ?? track.castDeliveryMode,
    deliveryBits: track.castDeliveryBits ?? track.bitsPerSample,
    deliverySampleRate: track.castDeliverySampleRate ?? track.sampleRate
  };
}

function createMetadata(track: CastTrack): Record<string, unknown> {
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
  return metadata;
}

function appendRetryToken(sourceUrl: string): string {
  try {
    const url = new URL(sourceUrl);
    url.searchParams.set("castRetry", Date.now().toString(36));
    return url.toString();
  } catch {
    return sourceUrl;
  }
}

function castRepeatMode(mode: CastQueueRequest["repeatMode"]): string {
  return mode === "single" ? "REPEAT_SINGLE" : mode === "all" ? "REPEAT_ALL" : "REPEAT_OFF";
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
