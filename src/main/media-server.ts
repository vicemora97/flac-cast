import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { networkInterfaces } from "node:os";
import { extname } from "node:path";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { MediaAccess } from "../shared/contracts.js";

type MediaEntry = {
  filePath: string;
  immutable: boolean;
  size?: number;
  mtimeMs?: number;
};

const MIME_TYPES: Record<string, string> = {
  ".flac": "audio/flac",
  ".wav": "audio/wav",
  ".wave": "audio/wav",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".alac": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".opus": "audio/opus",
  ".aif": "audio/aiff",
  ".aiff": "audio/aiff"
};

export class MediaServer {
  private readonly token = randomBytes(24).toString("hex");
  private readonly files = new Map<string, MediaEntry>();
  private readonly fileIds = new Map<string, string>();
  private readonly artwork = new Map<string, { filePath: string; contentType: string }>();
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
        void this.serveArtwork(artworkMatch[2], request.method === "HEAD", response);
        return;
      }

      const mediaMatch = /^\/media\/([a-f0-9]+)\/([a-f0-9-]+)$/.exec(url.pathname);
      if (!mediaMatch || mediaMatch[1] !== this.token) {
        response.writeHead(404).end();
        return;
      }

      const entry = this.files.get(mediaMatch[2]);
      if (!entry || !MIME_TYPES[extname(entry.filePath).toLowerCase()]) {
        response.writeHead(404).end();
        return;
      }

      void this.streamFile(
        request.headers.range,
        request.headers["if-none-match"],
        request.method === "HEAD",
        entry,
        response,
        request.socket.remoteAddress,
        request.method
      );
    });

    this.server.keepAliveTimeout = 30_000;
    this.server.headersTimeout = 35_000;

    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(0, "0.0.0.0", () => resolve());
    });

    const address = this.server.address();
    if (!address || typeof address === "string") throw new Error("No se pudo iniciar el servidor de audio");
    this.port = address.port;
  }

  register(filePath: string, receiverAddress?: string, options?: { immutable?: boolean }): { id: string; localUrl: string; castUrl?: string } {
    if (!this.port) throw new Error("El servidor de audio no está iniciado");
    let id = this.fileIds.get(filePath);
    if (!id) {
      id = randomUUID();
      this.fileIds.set(filePath, id);
      this.files.set(id, { filePath, immutable: options?.immutable === true });
    } else if (options?.immutable) {
      const entry = this.files.get(id);
      if (entry) entry.immutable = true;
    }
    const route = `/media/${this.token}/${id}`;
    const lanAddress = getLanIpv4(receiverAddress);

    return {
      id,
      localUrl: `http://127.0.0.1:${this.port}${route}`,
      castUrl: lanAddress ? `http://${lanAddress}:${this.port}${route}` : undefined
    };
  }

  routeForReceiver(sourceUrl: string | undefined, receiverAddress: string | undefined): string | undefined {
    if (!sourceUrl) return undefined;
    const lanAddress = getLanIpv4(receiverAddress);
    if (!lanAddress) return undefined;
    try {
      const routed = new URL(sourceUrl);
      routed.hostname = lanAddress;
      return routed.toString();
    } catch {
      return undefined;
    }
  }

  resolveFile(castUrl: string): string | undefined {
    try {
      const match = /^\/media\/[a-f0-9]+\/([a-f0-9-]+)$/.exec(new URL(castUrl).pathname);
      return match ? this.files.get(match[1])?.filePath : undefined;
    } catch {
      return undefined;
    }
  }

  registerArtworkFile(filePath: string, contentType: string): { localUrl: string; castUrl?: string } {
    if (!this.port) throw new Error("El servidor de audio no está iniciado");
    const id = createArtworkId(filePath);
    if (!this.artwork.has(id)) this.artwork.set(id, { filePath, contentType });
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

  private async serveArtwork(id: string, headOnly: boolean, response: import("node:http").ServerResponse): Promise<void> {
    const item = this.artwork.get(id);
    if (!item) {
      response.writeHead(404).end();
      return;
    }
    let size: number;
    try {
      size = (await stat(item.filePath)).size;
    } catch {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      "Cache-Control": "private, max-age=3600",
      "Content-Length": size,
      "Content-Type": item.contentType
    });
    if (headOnly) response.end();
    else createReadStream(item.filePath).on("error", () => response.destroy()).pipe(response);
  }

  private async streamFile(
    range: string | undefined,
    ifNoneMatch: string | string[] | undefined,
    headOnly: boolean,
    entry: MediaEntry,
    response: import("node:http").ServerResponse,
    clientAddress?: string,
    method?: string
  ): Promise<void> {
    const startedAt = Date.now();
    let size: number;
    let mtimeMs: number;
    try {
      if (entry.immutable && entry.size != null && entry.mtimeMs != null) {
        size = entry.size;
        mtimeMs = entry.mtimeMs;
      } else {
        const fileStat = await stat(entry.filePath);
        size = fileStat.size;
        mtimeMs = fileStat.mtimeMs;
        if (entry.immutable) {
          entry.size = size;
          entry.mtimeMs = mtimeMs;
        }
      }
    } catch {
      this.recordAccess(clientAddress, method, range, 404, undefined, entry.immutable, Date.now() - startedAt);
      response.writeHead(404).end();
      return;
    }
    const contentType = MIME_TYPES[extname(entry.filePath).toLowerCase()];
    const etag = `"${size.toString(16)}-${Math.round(mtimeMs).toString(16)}"`;
    response.setHeader("Accept-Ranges", "bytes");
    response.setHeader("Cache-Control", entry.immutable ? "private, max-age=3600, immutable" : "private, no-cache");
    response.setHeader("Content-Encoding", "identity");
    response.setHeader("Content-Type", contentType);
    response.setHeader("ETag", etag);

    if (!range && ifNoneMatch === etag) {
      this.recordAccess(clientAddress, method, range, 304, 0, entry.immutable, Date.now() - startedAt);
      response.writeHead(304).end();
      return;
    }

    if (!range) {
      this.recordAccess(clientAddress, method, range, 200, size, entry.immutable, Date.now() - startedAt);
      response.writeHead(200, { "Content-Length": size });
      if (headOnly) response.end();
      else createReadStream(entry.filePath).on("error", () => response.destroy()).pipe(response);
      return;
    }

    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!match) {
      this.recordAccess(clientAddress, method, range, 416, undefined, entry.immutable, Date.now() - startedAt);
      response.writeHead(416, { "Content-Range": `bytes */${size}` }).end();
      return;
    }

    let start: number;
    let end: number;
    if (!match[1] && match[2]) {
      // `bytes=-N` solicita los últimos N bytes, no los primeros N.
      const suffixLength = Number(match[2]);
      if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
        this.recordAccess(clientAddress, method, range, 416, undefined, entry.immutable, Date.now() - startedAt);
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
      this.recordAccess(clientAddress, method, range, 416, undefined, entry.immutable, Date.now() - startedAt);
      response.writeHead(416, { "Content-Range": `bytes */${size}` }).end();
      return;
    }

    const responseBytes = end - start + 1;
    this.recordAccess(clientAddress, method, range, 206, responseBytes, entry.immutable, Date.now() - startedAt);
    response.writeHead(206, {
      "Content-Length": responseBytes,
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Encoding": "identity"
    });
    if (headOnly) response.end();
    else createReadStream(entry.filePath, { start, end }).on("error", () => response.destroy()).pipe(response);
  }

  private recordAccess(
    clientAddress: string | undefined,
    method: string | undefined,
    range: string | undefined,
    status: number,
    bytes?: number,
    cacheable?: boolean,
    responseMilliseconds?: number
  ): void {
    this.lastMediaAccess = {
      timestamp: Date.now(),
      clientAddress: clientAddress?.replace(/^::ffff:/, ""),
      method,
      range,
      status,
      bytes,
      cacheable,
      responseMilliseconds
    };
  }
}

function createArtworkId(filePath: string): string {
  return createHash("sha256").update(filePath).digest("hex");
}

function getLanIpv4(receiverAddress?: string): string | undefined {
  const candidates = Object.entries(networkInterfaces()).flatMap(([name, addresses]) =>
    (addresses ?? [])
      .filter((address) => address.family === "IPv4" && !address.internal && !address.address.startsWith("169.254."))
      .map((address) => ({ name, address: address.address, netmask: address.netmask }))
  );

  if (receiverAddress) {
    const receiver = ipv4ToNumber(receiverAddress);
    if (receiver !== undefined) {
      const sameSubnet = candidates.find((candidate) => {
        const local = ipv4ToNumber(candidate.address);
        const mask = ipv4ToNumber(candidate.netmask);
        return local !== undefined && mask !== undefined && (local & mask) === (receiver & mask);
      });
      if (sameSubnet) return sameSubnet.address;
    }
  }

  return candidates.find((candidate) => !isVirtualInterface(candidate.name))?.address ?? candidates[0]?.address;
}

function ipv4ToNumber(value: string): number | undefined {
  const parts = value.split(".");
  if (parts.length !== 4) return undefined;
  const bytes = parts.map(Number);
  if (bytes.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return undefined;
  return bytes.reduce((result, part) => ((result << 8) | part) >>> 0, 0);
}

function isVirtualInterface(name: string): boolean {
  return /(?:vethernet|hyper-v|wsl|docker|virtualbox|vmware|tailscale|zerotier|vpn)/i.test(name);
}
