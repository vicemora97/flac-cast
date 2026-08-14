import { packageMac } from "./mac-build.mjs";

const paths = await packageMac();
console.log(`Aplicación empaquetada en:\n${paths.join("\n")}`);
