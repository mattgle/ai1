export type UpdateSource = "homebrew" | "open-vsx" | "git";

export interface UpdateRecord {
  id: string;
  name: string;
  source: UpdateSource;
  current?: string;
  available?: string;
  updateAvailable: boolean;
  canApply: boolean;
  error?: string;
}

export interface UpdateReport {
  checkedAt: number;
  records: UpdateRecord[];
}

export function compareVersions(current: string, available: string): number | undefined {
  const parse = (value: string): { numbers: number[]; suffix: string } | undefined => {
    const match = /^v?(\d+(?:\.\d+)*)(.*)$/i.exec(value.trim());
    if (!match) {
      return undefined;
    }
    const numbers = match[1].split(".").map(Number);
    if (numbers.some((part) => !Number.isSafeInteger(part))) {
      return undefined;
    }
    return { numbers, suffix: match[2].toLowerCase() };
  };
  const left = parse(current);
  const right = parse(available);
  if (!left || !right) {
    return undefined;
  }
  const count = Math.max(left.numbers.length, right.numbers.length);
  for (let index = 0; index < count; index += 1) {
    const difference = (left.numbers[index] ?? 0) - (right.numbers[index] ?? 0);
    if (difference !== 0) {
      return Math.sign(difference);
    }
  }
  if (left.suffix === right.suffix) {
    return 0;
  }
  if (!left.suffix) {
    return 1;
  }
  if (!right.suffix) {
    return -1;
  }
  const leftParts = left.suffix.match(/\d+|[a-z]+/gi) ?? [];
  const rightParts = right.suffix.match(/\d+|[a-z]+/gi) ?? [];
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const leftPart = leftParts[index];
    const rightPart = rightParts[index];
    if (leftPart === undefined) {
      return -1;
    }
    if (rightPart === undefined) {
      return 1;
    }
    const leftNumber = /^\d+$/.test(leftPart) ? Number(leftPart) : undefined;
    const rightNumber = /^\d+$/.test(rightPart) ? Number(rightPart) : undefined;
    if (leftNumber !== undefined && rightNumber !== undefined) {
      if (leftNumber !== rightNumber) {
        return Math.sign(leftNumber - rightNumber);
      }
    } else if (leftNumber !== undefined) {
      return -1;
    } else if (rightNumber !== undefined) {
      return 1;
    } else if (leftPart !== rightPart) {
      return leftPart.localeCompare(rightPart);
    }
  }
  return 0;
}

export function isCheckDue(lastCheckedAt: number | undefined, now: number, intervalMs: number): boolean {
  return lastCheckedAt === undefined || !Number.isFinite(lastCheckedAt) || now - lastCheckedAt >= intervalMs;
}

export function updateSummary(report: UpdateReport): string {
  if (report.records.length === 0) {
    return "AI1 did not find any update sources to check.";
  }
  return report.records
    .map((record) => {
      if (record.error) {
        return `${record.name}: ${record.error}`;
      }
      if (!record.current || !record.available) {
        return `${record.name}: update status is not available.`;
      }
      if (!record.updateAvailable) {
        return `${record.name}: up to date (${record.current}).`;
      }
      const action = record.canApply ? "Update available" : "Update available; update by hand";
      return `${record.name}: ${action} (${record.current} → ${record.available}).`;
    })
    .join("\n");
}
