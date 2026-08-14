import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import { basename } from "node:path";

export async function writeSha256(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const input = createReadStream(filePath);
    input.on("data", (chunk) => hash.update(chunk));
    input.on("end", resolve);
    input.on("error", reject);
  });
  const checksumPath = `${filePath}.sha256`;
  await writeFile(checksumPath, `${hash.digest("hex")}  ${basename(filePath)}\n`, "utf8");
  return checksumPath;
}
