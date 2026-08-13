import { createReadStream, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { networkInterfaces } from "node:os";
import { extname } from "node:path";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { MediaAccess } from "../shared/contracts.js";

const MIME_TYPES: Record<string, string> = {
  ".flac": "audio/flac",
  ".wav": "audio/wav"
};

export class MediaServer {
  private readonly token = randomBytes(24).toString("hex");
  private readonly files = new Map<string, string>();
  private readonly fileIds = new Map<string, string>();
  private readonly artwork = new Map<string, { data: Buffer; contentType: string }>();
  private server?: Server;
  private port?: number;
  private lastMediaAccess?: MediaAccess;

  async start(): Promise<void> {
    if (this.server) return;

    this.server = createServer((request, response) => {
      response.setHeader("Access-Control-Allow-Origin", "*");
      response.setHeader("Access-Control-Allow-Headers", "Range");
      response.setHeader("Access-Control-Expose-Headers", "Accept-Ranges, Content-Length, Content-Range");

      if (request.method === "OPTIONS") {
        response.writeHead(204).end();
        return;
      }

      const url = new URL(request.url ?? "/", "http://localhost");
      const artworkMatch = /^\/art\/([a-f0-9]+)\/([a-f0-9]+)$/.exec(url.pathname);
      if (artworkMatch?.[1] === this.token) {
        this.serveArtwork(artworkMatch[2], request.method === "HEAD", response);
        return;
      }

      const mediaMatch = /^\/media\/([a-f0-9]+)\/([a-f0-9-]+)$/.exec(url.pathname);
      if (!mediaMatch || mediaMatch[1] !== this.token) {
        response.writeHead(404).end();
        return;
      }

      const filePath = this.files.get(mediaMatch[2]);
      if (!filePath || !MIME_TYPES[extname(filePath).toLowerCase()]) {
        response.writeHead(404).end();
        return;
      }

      this.streamFile(request.headers.range, request.method === "HEAD", filePath, response, request.socket.remoteAddress, request.method);
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(0, "0.0.0.0", () => resolve());
    });

    const address = this.server.address();
    if (!address || typeof address === "string") throw new Error("No se pudo iniciar el servidor de audio");
    this.port = address.port;
  }

  register(filePath: string): { id: string; localUrl: string; castUrl?: string } {
    if (!this.port) throw new Error("El servidor de audio no está iniciado");
    let id = this.fileIds.get(filePath);
    if (!id) {
      id = randomUUID();
      this.fileIds.set(filePath, id);
      this.files.set(id, filePath);
    }
    const route = `/media/${this.token}/${id}`;
    const lanAddress = getLanIpv4();

    return {
      id,
      localUrl: `http://127.0.0.1:${this.port}${route}`,
      castUrl: lanAddress ? `http://${lanAddress}:${this.port}${route}` : undefined
    };
  }

  resolveFile(castUrl: string): string | undefined {
    try {
      const match = /^\/media\/[a-f0-9]+\/([a-f0-9-]+)$/.exec(new URL(castUrl).pathname);
      return match ? this.files.get(match[1]) : undefined;
    } catch {
      return undefined;
    }
  }

  registerArtwork(data: Uint8Array, contentType: string): { localUrl: string; castUrl?: string } {
    if (!this.port) throw new Error("El servidor de audio no está iniciado");
    const buffer = Buffer.from(data);
    const id = createArtworkId(buffer);
    if (!this.artwork.has(id)) this.artwork.set(id, { data: buffer, contentType });
    const route = `/art/${this.token}/${id}`;
    const lanAddress = getLanIpv4();
    return {
      localUrl: `http://127.0.0.1:${this.port}${route}`,
      castUrl: lanAddress ? `http://${lanAddress}:${this.port}${route}` : undefined
    };
  }

  getLastMediaAccess(): MediaAccess | undefined {
    return this.lastMediaAccess ? { ...this.lastMediaAccess } : undefined;
  }

  stop(): void {
    this.server?.close();
    this.server = undefined;
    this.files.clear();
    this.fileIds.clear();
    this.artwork.clear();
  }

  private serveArtwork(id: string, headOnly: boolean, response: import("node:http").ServerResponse): void {
    const item = this.artwork.get(id);
    if (!item) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      "Cache-Control": "private, max-age=3600",
      "Content-Length": item.data.length,
      "Content-Type": item.contentType
    });
    response.end(headOnly ? undefined : item.data);
  }

  private streamFile(
    range: string | undefined,
    headOnly: boolean,
    filePath: string,
    response: import("node:http").ServerResponse,
    clientAddress?: string,
    method?: string
  ): void {
    let size: number;
    try {
      size = statSync(filePath).size;
    } catch {
      this.recordAccess(clientAddress, method, range, 404);
      response.writeHead(404).end();
      return;
    }
    const contentType = MIME_TYPES[extname(filePath).toLowerCase()];
    response.setHeader("Accept-Ranges", "bytes");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Encoding", "identity");
    response.setHeader("Content-Type", contentType);

    if (!range) {
      this.recordAccess(clientAddress, method, range, 200, size);
      response.writeHead(200, { "Content-Length": size });
      if (headOnly) response.end();
      else createReadStream(filePath).pipe(response);
      return;
    }

    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!match) {
      this.recordAccess(clientAddress, method, range, 416);
      response.writeHead(416, { "Content-Range": `bytes */${size}` }).end();
      return;
    }

    let start: number;
    let end: number;
    if (!match[1] && match[2]) {
      // `bytes=-N` solicita los últimos N bytes, no los primeros N.
      const suffixLength = Number(match[2]);
      if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
        this.recordAccess(clientAddress, method, range, 416);
        response.writeHead(416, { "Content-Range": `bytes */${size}` }).end();
        return;
      }
      start = Math.max(0, size - suffixLength);
      end = size - 1;
    } else {
      start = Number(match[1]);
      end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    }
    if (start > end || start >= size) {
      this.recordAccess(clientAddress, method, range, 416);
      response.writeHead(416, { "Content-Range": `bytes */${size}` }).end();
      return;
    }

    const responseBytes = end - start + 1;
    this.recordAccess(clientAddress, method, range, 206, responseBytes);
    response.writeHead(206, {
      "Cache-Control": "no-store",
      "Content-Length": responseBytes,
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Encoding": "identity"
    });
    if (headOnly) response.end();
    else createReadStream(filePath, { start, end }).pipe(response);
  }

  private recordAccess(clientAddress: string | undefined, method: string | undefined, range: string | undefined, status: number, bytes?: number): void {
    this.lastMediaAccess = {
      timestamp: Date.now(),
      clientAddress: clientAddress?.replace(/^::ffff:/, ""),
      method,
      range,
      status,
      bytes
    };
  }
}

function createArtworkId(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function getLanIpv4(): string | undefined {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal && !address.address.startsWith("169.254.")) {
        return address.address;
      }
    }
  }
  return undefined;
}
