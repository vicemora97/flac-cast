import type { AudioEnvelope } from "../shared/contracts.js";
import { t } from "./i18n.js";

type RGB = [number, number, number];
type Settings = { mode: "off" | "static" | "animated"; intensity: number; seconds: number; reactive: boolean };
type Snapshot = { url?: string; artwork?: string; playing: boolean; time: number };
const FALLBACK: RGB = [199, 243, 107];
const KEY = "flac-cast-player-colors";

export function normalizeColors(value: Partial<Settings> | null): Settings {
  const bounded = (v: unknown, min: number, max: number, fallback: number) => typeof v === "number" && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
  return { mode: value?.mode === "off" || value?.mode === "animated" ? value.mode : "static",
    intensity: bounded(value?.intensity, 0, 100, 35), seconds: bounded(value?.seconds, 6, 60, 24), reactive: value?.reactive === true };
}

export function paletteFromPixels(pixels: Uint8ClampedArray): RGB[] {
  const buckets = new Map<string, { sum: RGB; weight: number }>();
  for (let i = 0; i < pixels.length; i += 4) {
    const rgb: RGB = [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!];
    if (pixels[i + 3]! < 180 || Math.max(...rgb) < 24) continue;
    const weight = 1 + (Math.max(...rgb) - Math.min(...rgb)) / 80;
    const key = rgb.map((v) => Math.floor(v / 32)).join(",");
    const bucket = buckets.get(key) ?? { sum: [0, 0, 0], weight: 0 };
    rgb.forEach((v, j) => { bucket.sum[j]! += v * weight; });
    bucket.weight += weight;
    buckets.set(key, bucket);
  }
  const palette: RGB[] = [];
  for (const bucket of [...buckets.values()].sort((a, b) => b.weight - a.weight)) {
    const rgb = bucket.sum.map((v) => v / bucket.weight) as RGB;
    if (palette.some((existing) => existing.reduce((sum, v, j) => sum + (v - rgb[j]!) ** 2, 0) < 2500)) continue;
    palette.push(rgb);
    if (palette.length === 3) break;
  }
  if (!palette.length) return [FALLBACK, FALLBACK, FALLBACK];
  return Array.from({ length: 3 }, (_, i) => {
    const rgb = palette[i % palette.length]!;
    const mix = Math.max(...rgb) < 115 ? .38 : .12;
    return rgb.map((v) => Math.round(v * (1 - mix) + 255 * mix)) as RGB;
  });
}

export function cycleColor(palette: RGB[], phase: number): RGB {
  const position = ((phase % 1 + 1) % 1) * 3;
  const i = Math.floor(position);
  const mix = (1 - Math.cos((position - i) * Math.PI)) / 2;
  return palette[i]!.map((v, channel) => Math.round(v + (palette[(i + 1) % 3]![channel]! - v) * mix)) as RGB;
}

export class PlayerColors {
  private settings: Settings;
  private palette: RGB[] = [FALLBACK, FALLBACK, FALLBACK];
  private paletteCache = new Map<string, Promise<RGB[]>>();
  private artwork?: string;
  private url?: string;
  private envelope?: AudioEnvelope;
  private analysis: "idle" | "working" | "ready" | "unavailable" = "idle";
  private generation = 0;
  private timer?: number;
  private frame?: number;
  private phase = 0;
  private last = 0;
  private level = 0;
  private nativeVisible = true;
  private reduced = matchMedia("(prefers-reduced-motion: reduce)");
  private dialog = document.querySelector<HTMLDialogElement>("#color-dialog")!;
  private mode = document.querySelector<HTMLSelectElement>("#color-mode")!;
  private intensity = document.querySelector<HTMLInputElement>("#color-intensity")!;
  private speed = document.querySelector<HTMLInputElement>("#color-speed")!;
  private reactive = document.querySelector<HTMLInputElement>("#color-reactive")!;
  private status = document.querySelector<HTMLElement>("#color-status")!;
  private surfaces = Array.from(document.querySelectorAll<HTMLElement>(".transport-player, #playback-quality"));

  constructor(private snapshot: () => Snapshot) {
    try { this.settings = normalizeColors(JSON.parse(localStorage.getItem(KEY) ?? "null")); }
    catch { this.settings = normalizeColors(null); }
    this.mode.value = this.settings.mode;
    this.intensity.value = String(this.settings.intensity);
    this.speed.value = String(this.settings.seconds);
    this.reactive.checked = this.settings.reactive;
    document.querySelector("#player-colors")!.addEventListener("click", () => { this.controls(); this.dialog.showModal(); });
    document.querySelector("#color-close")!.addEventListener("click", () => this.dialog.close());
    for (const control of [this.mode, this.intensity, this.speed, this.reactive]) control.addEventListener("input", () => {
      const previous = this.settings;
      this.settings = normalizeColors({ mode: this.mode.value as Settings["mode"], intensity: Number(this.intensity.value), seconds: Number(this.speed.value), reactive: this.reactive.checked });
      try { localStorage.setItem(KEY, JSON.stringify(this.settings)); } catch { /* In-memory settings still work. */ }
      if (previous.reactive !== this.settings.reactive || previous.mode !== this.settings.mode) this.cancelAnalysis();
      this.controls(); this.sync();
    });
    document.addEventListener("visibilitychange", () => this.sync());
    window.hires.onPlayerVisualVisibility((visible) => { this.nativeVisible = visible; this.sync(); });
    this.reduced.addEventListener("change", () => this.sync());
    this.controls();
  }

  private controls(): void {
    const off = this.settings.mode === "off";
    this.intensity.disabled = off;
    this.speed.disabled = this.settings.mode !== "animated" || this.reduced.matches;
    this.reactive.disabled = off || this.reduced.matches;
    document.querySelector("#color-intensity-value")!.textContent = `${this.settings.intensity}%`;
    document.querySelector("#color-speed-value")!.textContent = `${this.settings.seconds} s`;
    this.status.textContent = this.reduced.matches ? t("colorReduced") : this.analysis === "working" ? t("colorAnalyzing") : this.analysis === "ready" ? t("colorReady") : this.analysis === "unavailable" ? t("colorUnavailable") : "";
  }

  sync(): void {
    const state = this.snapshot();
    if (state.url !== this.url) { this.cancelAnalysis(); this.url = state.url; this.envelope = undefined; this.phase = 0; }
    if (state.artwork !== this.artwork) {
      this.artwork = state.artwork;
      this.palette = [FALLBACK, FALLBACK, FALLBACK];
      if (state.artwork) {
        const url = state.artwork;
        let pending = this.paletteCache.get(url);
        if (!pending) { pending = this.extract(url); this.paletteCache.set(url, pending); }
        while (this.paletteCache.size > 32) this.paletteCache.delete(this.paletteCache.keys().next().value!);
        void pending.then((palette) => { if (this.artwork === url) { this.palette = palette; this.paint(); } });
      }
    }
    const active = this.nativeVisible && !document.hidden && state.playing && this.settings.mode !== "off" && !this.reduced.matches;
    if (!active && this.analysis === "working") this.cancelAnalysis();
    if (active && this.settings.reactive && state.url && this.analysis === "idle") {
      if (this.envelope) this.analysis = "ready";
      else {
        const generation = ++this.generation;
        this.analysis = "working";
        this.timer = window.setTimeout(() => {
          this.timer = undefined;
          void window.hires.analyzeAudio(state.url!).then((result) => {
            if (generation !== this.generation) return;
            this.envelope = result;
            this.analysis = result ? "ready" : "unavailable";
            this.controls();
          }).catch(() => { if (generation === this.generation) { this.analysis = "unavailable"; this.controls(); } });
        }, 2500);
      }
    }
    const animate = active && (this.settings.mode === "animated" || this.settings.reactive);
    if (!animate && this.frame !== undefined) { cancelAnimationFrame(this.frame); this.frame = undefined; }
    if (animate && this.frame === undefined) { this.last = performance.now(); this.frame = requestAnimationFrame((now) => this.tick(now)); }
    this.paint();
    if (this.dialog.open) this.controls();
  }

  private cancelAnalysis(): void {
    this.generation++;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.analysis === "working") void window.hires.cancelAudioAnalysis().catch(() => undefined);
    this.analysis = "idle";
  }

  private tick(now: number): void {
    // 20 visual updates/second, scoped to small controls rather than the whole UI.
    if (now - this.last >= 50) {
      if (this.settings.mode === "animated") this.phase += Math.min(now - this.last, 100) / (this.settings.seconds * 1000);
      this.last = now;
      this.paint();
    }
    this.frame = requestAnimationFrame((time) => this.tick(time));
  }

  private paint(): void {
    const state = this.snapshot();
    const off = this.settings.mode === "off";
    const moving = !this.reduced.matches && this.settings.mode === "animated";
    const rgb = off ? [177, 185, 175] : moving ? cycleColor(this.palette, this.phase) : this.palette[0]!;
    const index = Math.max(0, state.time / (this.envelope?.step ?? .1));
    const bins = this.envelope?.levels;
    const lower = Math.floor(index);
    const energy = bins && lower < bins.length ? bins[lower]! + ((bins[lower + 1] ?? bins[lower]!) - bins[lower]!) * (index - lower) : 0;
    const target = this.nativeVisible && !document.hidden && state.playing && this.settings.reactive && !this.reduced.matches ? energy : 0;
    this.level += (target - this.level) * .18;
    const amount = off ? 0 : this.settings.intensity / 100;
    for (const surface of this.surfaces) {
      surface.dataset.colorMode = this.settings.mode;
      surface.style.setProperty("--player-accent", `rgb(${rgb.join(" ")})`);
      surface.style.setProperty("--color-wash", `${amount * (20 + 32 * this.level)}%`);
      surface.style.setProperty("--color-border", `${amount * (50 + 45 * this.level)}%`);
    }
  }

  private extract(url: string): Promise<RGB[]> {
    return new Promise((resolve) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      const fallback = () => resolve([FALLBACK, FALLBACK, FALLBACK]);
      image.onerror = fallback;
      image.onload = () => {
        try {
          const canvas = document.createElement("canvas"); canvas.width = canvas.height = 32;
          const context = canvas.getContext("2d", { willReadFrequently: true });
          if (!context) { fallback(); return; }
          context.drawImage(image, 0, 0, 32, 32);
          resolve(paletteFromPixels(context.getImageData(0, 0, 32, 32).data));
        } catch { fallback(); }
      };
      image.src = url;
    });
  }
}
