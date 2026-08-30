import { appendFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const MAX_DIAGNOSTIC_BYTES = 1_000_000;

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
