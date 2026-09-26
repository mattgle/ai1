import { AGENT_PROFILE_ID } from "./profiles";

// One visit in the browsing history of a profile. `time` is in milliseconds
// since the epoch.
export interface HistoryEntry {
  url: string;
  title: string;
  time: number;
}

// The history keeps only `http:` and `https:` pages, and never the pages of
// the Agent profile.
export function shouldRecord(url: string, profileId: string): boolean {
  if (profileId === AGENT_PROFILE_ID) {
    return false;
  }
  try {
    const protocol = new URL(url).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function sameDay(first: Date, second: Date): boolean {
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

// "Today", "Yesterday", or a date such as "Sep 23, 2026", in local time.
export function dayLabel(time: number, now: number): string {
  const day = new Date(time);
  const today = new Date(now);
  if (sameDay(day, today)) {
    return "Today";
  }
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (sameDay(day, yesterday)) {
    return "Yesterday";
  }
  return day.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
