import { appendFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const MAX_DIAGNOSTIC_BYTES = 1_000_000;

export type CastTiming = {
  trackId: string;
  preparationId: string;
  report: (event: string, data: Record<string, unknown>) => void;
};

export async function timeCastStage<T>(timing: CastTiming | undefined, stage: string, operation: () => Promise<T>): Promise<T> {
  if (!timing) return operation();
  const started = performance.now();
  const data = { trackId: timing.trackId, preparationId: timing.preparationId, stage };
  timing.report("cast-stage-start", data);
  try {
    const result = await operation();
    timing.report("cast-stage-end", { ...data, outcome: "completed", elapsedMilliseconds: Math.round(performance.now() - started) });
    return result;
  } catch (error) {
    // Error messages may contain private file paths; record only a code here.
    timing.report("cast-stage-end", { ...data, outcome: "failed", elapsedMilliseconds: Math.round(performance.now() - started),
      errorCode: (error as NodeJS.ErrnoException)?.code });
    throw error;
  }
}

export function diagnosticMediaId(url: string): string | undefined {
  try {
    return /^\/media\/[a-f0-9]+\/([a-f0-9-]+)$/.exec(new URL(url).pathname)?.[1];
  } catch { return undefined; }
}

export class CastDiagnostics {
  readonly filePath: string;
  private pending = Promise.resolve();

  constructor(userDataFolder: string) {
    this.filePath = join(userDataFolder, "cast-diagnostics.log");
  }

  record(source: "main" | "renderer", event: string, data: Record<string, unknown> = {}): void {
    const line = `${JSON.stringify({ at: new Date().toISOString(), ...data, source, event })}\n`;
    this.pending = this.pending.then(async () => {
      const size = await stat(this.filePath).then((value) => value.size).catch(() => 0);
      if (size + Buffer.byteLength(line) > MAX_DIAGNOSTIC_BYTES) {
        await writeFile(this.filePath, "", "utf8");
      }
      await appendFile(this.filePath, line, "utf8");
    }).catch(() => {
      // Diagnostics must never affect playback.
    });
  }
}
