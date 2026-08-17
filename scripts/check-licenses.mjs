import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8"));
const lock = JSON.parse(await readFile(join(projectRoot, "package-lock.json"), "utf8"));

if (packageJson.license !== "GPL-3.0-or-later") {
  throw new Error("package.json must declare GPL-3.0-or-later");
}

const allowed = new Set([
  "Apache-2.0",
  "BlueOak-1.0.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "GPL-3.0-or-later",
  "ISC",
  "MIT"
]);

// parse-cache-control@1.0.1 omits a modern SPDX field from its package
// metadata, but ships a three-clause BSD LICENSE file in the npm package.
const reviewedOverrides = new Map([
  ["parse-cache-control@1.0.1", "BSD-3-Clause"]
]);

const packages = Object.entries(lock.packages ?? {})
  .filter(([path]) => path.startsWith("node_modules/"))
  .map(([path, metadata]) => {
    const name = path.slice("node_modules/".length);
    const key = `${name}@${metadata.version ?? "unknown"}`;
    return { key, license: metadata.license ?? reviewedOverrides.get(key) ?? "UNKNOWN" };
  });

const rejected = packages.filter(({ license }) => !allowed.has(license));
if (rejected.length > 0) {
  const details = rejected.map(({ key, license }) => `- ${key}: ${license}`).join("\n");
  throw new Error(`Unreviewed or incompatible dependency licenses:\n${details}`);
}

const summary = new Map();
for (const { license } of packages) summary.set(license, (summary.get(license) ?? 0) + 1);
console.log(`Checked ${packages.length} locked packages.`);
for (const [license, count] of [...summary].sort(([left], [right]) => left.localeCompare(right))) {
  console.log(`${license}: ${count}`);
}
