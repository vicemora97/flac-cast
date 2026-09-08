import type { FileHandle } from "node:fs/promises";

// A small replacement metadata prefix followed by the ORIGINAL encoded frames.
// No encoder, full-file copy, or growing-file Content-Length is involved.
export type FlacView = { prefix: Buffer; audioOffset: number; sourceSize: number; mtimeMs: number; size: number };

export async function inspectFlacView(file: FileHandle, sourceSize: number, mtimeMs: number): Promise<FlacView> {
  const read = async (position: number, length: number) => {
    const data = Buffer.alloc(length);
    let offset = 0;
    while (offset < length) {
      const result = await file.read(data, offset, length - offset, position + offset);
      if (!result.bytesRead) throw new Error("Truncated FLAC metadata");
      offset += result.bytesRead;
    }
    return data;
  };
  if ((await read(0, 4)).toString("ascii") !== "fLaC") throw new Error("Invalid FLAC signature");
  const blocks: Buffer[] = [];
  let position = 4;
  let keptBytes = 4;
  let last = false;
  for (let count = 0; count < 128 && !last; count++) {
    const header = await read(position, 4);
    const type = header[0] & 127;
    const length = header.readUIntBE(1, 3);
    last = Boolean(header[0] & 128);
    if ((count === 0 && (type !== 0 || length !== 34)) || (count > 0 && type === 0) || type === 127) {
      throw new Error("Invalid FLAC metadata block");
    }
    if (position + 4 + length > sourceSize) throw new Error("FLAC metadata exceeds file size");
    // Preserve streaminfo, seek table, comments (including channel mapping),
    // and other metadata. Seek offsets are relative to the first audio frame.
    if (type !== 1 && type !== 6) {
      keptBytes += 4 + length;
      if (keptBytes > 128 * 1024) throw new Error("FLAC metadata requires full repacking");
      header[0] = type;
      blocks.push(Buffer.concat([header, await read(position + 4, length)]));
    }
    position += 4 + length;
  }
  if (!last || position >= sourceSize) throw new Error("FLAC has no valid audio payload");
  blocks[blocks.length - 1]![0] |= 128;
  const prefix = Buffer.concat([Buffer.from("fLaC"), ...blocks]);
  return { prefix, audioOffset: position, sourceSize, mtimeMs, size: prefix.length + sourceSize - position };
}

export async function* readFlacRange(file: FileHandle, view: FlacView, start: number, end: number): AsyncGenerator<Buffer> {
  if (start < view.prefix.length) yield view.prefix.subarray(start, Math.min(end + 1, view.prefix.length));
  let position = view.audioOffset + Math.max(0, start - view.prefix.length);
  const sourceEnd = view.audioOffset + end - view.prefix.length;
  while (position <= sourceEnd) {
    const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, sourceEnd - position + 1));
    const { bytesRead } = await file.read(buffer, 0, buffer.length, position);
    if (!bytesRead) throw new Error("FLAC audio changed or was truncated during transfer");
    position += bytesRead;
    yield buffer.subarray(0, bytesRead);
  }
}
