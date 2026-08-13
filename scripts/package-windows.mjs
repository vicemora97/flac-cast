import { packageWindows } from "./windows-build.mjs";

const paths = await packageWindows();
console.log(`Aplicación empaquetada en:\n${paths.join("\n")}`);
