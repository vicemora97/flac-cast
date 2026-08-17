import { packageLinux } from "./linux-build.mjs";

const paths = await packageLinux();
console.log(`Aplicación empaquetada en:\n${paths.join("\n")}`);
