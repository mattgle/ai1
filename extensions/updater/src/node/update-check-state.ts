import * as fs from "node:fs";
import * as path from "node:path";

export interface UpdateCheckState {
  lastCompletedCheckAt?: number;
}

export class UpdateCheckStateStore {
  constructor(protected readonly filePath: string) {}

  read(): UpdateCheckState {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8")) as UpdateCheckState;
      return parsed &&
        typeof parsed === "object" &&
        (parsed.lastCompletedCheckAt === undefined ||
          (typeof parsed.lastCompletedCheckAt === "number" && Number.isFinite(parsed.lastCompletedCheckAt)))
        ? parsed
        : {};
    } catch {
      return {};
    }
  }

  write(state: UpdateCheckState): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(state), { mode: 0o600 });
    fs.renameSync(temporaryPath, this.filePath);
  }
}
