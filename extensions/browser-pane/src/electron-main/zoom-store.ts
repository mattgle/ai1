import * as fs from "node:fs";
import * as path from "node:path";
import { isValidZoom } from "../common/zoom";

// The zoom level of each profile and host (see `zoomKey`), kept in one JSON
// file in Electron's user data folder. A level of 100 has no entry. The
// levels change rarely, so each change writes the file at once. It has no
// `electron` import, so plain mocha tests it.
export class ZoomStore {
  protected levels = new Map<string, number>();

  constructor(protected readonly filePath: string) {}

  load(): void {
    this.levels = new Map();
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8")) as { levels?: unknown };
      if (typeof parsed.levels === "object" && parsed.levels !== null) {
        for (const [key, percent] of Object.entries(parsed.levels)) {
          if (isValidZoom(percent) && percent !== 100) {
            this.levels.set(key, percent);
          }
        }
      }
    } catch {
      this.levels = new Map();
    }
  }

  get(key: string): number {
    return this.levels.get(key) ?? 100;
  }

  set(key: string, percent: number): void {
    if (!isValidZoom(percent)) {
      throw new Error(`The zoom level ${percent} is not between 25 and 500 percent.`);
    }
    if (percent === 100) {
      this.levels.delete(key);
    } else {
      this.levels.set(key, percent);
    }
    this.save();
  }

  // Writes a temporary file and renames it, so a crash cannot leave half a
  // file.
  protected save(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify({ levels: Object.fromEntries(this.levels) }, undefined, 2));
    fs.renameSync(temporary, this.filePath);
  }
}
