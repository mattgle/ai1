import { AI1_BROWSER_API, Ai1BrowserApi } from "../common/browser-ipc";

// The preload API of the main process (see `src/electron-browser/preload.ts`).
export function browserApi(): Ai1BrowserApi {
  const api = (window as unknown as Record<string, Ai1BrowserApi | undefined>)[AI1_BROWSER_API];
  if (!api) {
    throw new Error("The AI1 browser API is missing. AI1 Browser works only in the desktop app.");
  }
  return api;
}
