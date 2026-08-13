import type { HiresApi } from "../shared/contracts.js";

declare global {
  interface Window {
    hires: HiresApi;
  }
}

export {};

