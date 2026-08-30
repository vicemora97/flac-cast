import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { deflateSync } from "node:zlib";

const run = promisify(execFile);

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outputFolder = join(root, "assets");
const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const icoImages = icoSizes.map((size) => createPng(size));
const applicationIcon = createPng(512);

await mkdir(outputFolder, { recursive: true });
await Promise.all([
  writeIfChanged(join(outputFolder, "icon.png"), applicationIcon),
  writeIfChanged(join(outputFolder, "icon.ico"), createIco(icoImages, icoSizes)),
  writeIfChanged(join(outputFolder, "thumbar-previous.png"), createPng(32, glyphColor("previous"))),
  writeIfChanged(join(outputFolder, "thumbar-play.png"), createPng(32, glyphColor("play"))),
  writeIfChanged(join(outputFolder, "thumbar-pause.png"), createPng(32, glyphColor("pause"))),
  writeIfChanged(join(outputFolder, "thumbar-next.png"), createPng(32, glyphColor("next")))
]);

if (process.platform === "darwin") await writeIcns(outputFolder);

async function writeIcns(outputFolder) {
  const iconset = join(outputFolder, "icon.iconset");
  await rm(iconset, { recursive: true, force: true });
  await mkdir(iconset, { recursive: true });
  await Promise.all(
    [16, 32, 128, 256, 512].flatMap((size) => [
      writeFile(join(iconset, `icon_${size}x${size}.png`), createPng(size)),
      writeFile(join(iconset, `icon_${size}x${size}@2x.png`), createPng(size * 2))
    ])
  );
  await run("iconutil", ["-c", "icns", iconset, "-o", join(outputFolder, "icon.icns")]);
  await rm(iconset, { recursive: true, force: true });
}

async function writeIfChanged(path, content) {
  try {
    if ((await readFile(path)).equals(content)) return;
  } catch {
    // El recurso todavía no existe.
  }
  await writeFile(path, content);
}

function createPng(size, painter = iconColor) {
  const pixels = Buffer.alloc(size * (size * 4 + 1));
  const samples = size <= 32 ? 4 : 3;
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    pixels[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const color = samplePixel(x, y, size, samples, painter);
      const offset = row + 1 + x * 4;
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
      pixels[offset + 3] = color[3];
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(pixels, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function samplePixel(x, y, size, samples, painter) {
  let red = 0;
  let green = 0;
  let blue = 0;
  let alpha = 0;
  const count = samples * samples;
  for (let sy = 0; sy < samples; sy += 1) {
    for (let sx = 0; sx < samples; sx += 1) {
      const px = (x + (sx + 0.5) / samples) / size;
      const py = (y + (sy + 0.5) / samples) / size;
      const color = painter(px, py);
      const a = color[3] / 255;
      red += color[0] * a;
      green += color[1] * a;
      blue += color[2] * a;
      alpha += a;
    }
  }
  if (alpha === 0) return [0, 0, 0, 0];
  return [
    Math.round(red / alpha),
    Math.round(green / alpha),
    Math.round(blue / alpha),
    Math.round(255 * alpha / count)
  ];
}

function glyphColor(glyph) {
  return (x, y) => {
    const white = [255, 255, 255, 255];
    const bar = (left, top, right, bottom) => x >= left && x <= right && y >= top && y <= bottom;
    if (glyph === "play") {
      return insideTriangle(x, y, [0.31, 0.2], [0.31, 0.8], [0.78, 0.5]) ? white : [0, 0, 0, 0];
    }
    if (glyph === "pause") {
      return bar(0.27, 0.2, 0.42, 0.8) || bar(0.58, 0.2, 0.73, 0.8) ? white : [0, 0, 0, 0];
    }
    const previous = glyph === "previous";
    const vertical = previous ? bar(0.2, 0.2, 0.33, 0.8) : bar(0.67, 0.2, 0.8, 0.8);
    const triangle = previous
      ? insideTriangle(x, y, [0.72, 0.2], [0.72, 0.8], [0.3, 0.5])
      : insideTriangle(x, y, [0.28, 0.2], [0.28, 0.8], [0.7, 0.5]);
    return vertical || triangle ? white : [0, 0, 0, 0];
  };
}

function insideTriangle(x, y, a, b, c) {
  const area = (p1, p2, p3) => (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1]);
  const d1 = area([x, y], a, b);
  const d2 = area([x, y], b, c);
  const d3 = area([x, y], c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

function iconColor(x, y) {
  if (!insideRoundedRect(x, y, 0.045, 0.045, 0.955, 0.955, 0.205)) return [0, 0, 0, 0];
  const bars = [
    [0.235, 0.37],
    [0.365, 0.58],
    [0.495, 0.76],
    [0.625, 0.54],
    [0.755, 0.34]
  ];
  for (const [center, height] of bars) {
    const halfWidth = 0.044;
    if (insideRoundedRect(x, y, center - halfWidth, 0.5 - height / 2, center + halfWidth, 0.5 + height / 2, halfWidth)) {
      const light = Math.max(0, 1 - Math.hypot(x - 0.35, y - 0.28));
      return [198 + Math.round(light * 10), 243 + Math.round(light * 8), 107 + Math.round(light * 7), 255];
    }
  }
  const shade = Math.round(9 * (1 - y));
  return [16 + shade, 19 + shade, 16 + shade, 255];
}

function insideRoundedRect(x, y, left, top, right, bottom, radius) {
  const nearestX = Math.max(left + radius, Math.min(right - radius, x));
  const nearestY = Math.max(top + radius, Math.min(bottom - radius, y));
  return (x - nearestX) ** 2 + (y - nearestY) ** 2 <= radius ** 2;
}

function pngChunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  name.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return chunk;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createIco(pngs, iconSizes) {
  const headerSize = 6 + pngs.length * 16;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = headerSize;
  pngs.forEach((png, index) => {
    const position = 6 + index * 16;
    const size = iconSizes[index];
    header[position] = size === 256 ? 0 : size;
    header[position + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, position + 4);
    header.writeUInt16LE(32, position + 6);
    header.writeUInt32LE(png.length, position + 8);
    header.writeUInt32LE(offset, position + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...pngs]);
}
