import { ViewportChoice } from "./viewport";

// One browser tab that the owner closed: enough to open it again at its
// old place, with its old profile and viewport.
export interface ClosedTab {
  url: string;
  profileId: string;
  viewport: ViewportChoice;
  previousTabId: string | undefined;
}

const LIMIT = 20;

// The closed tabs of one window, newest last. `pop` gives the newest tab
// first (last in, first out). The list does not stay after a restart.
export class ClosedTabs {
  private readonly entries: ClosedTab[] = [];

  push(tab: ClosedTab): void {
    this.entries.push(tab);
    if (this.entries.length > LIMIT) {
      this.entries.shift();
    }
  }

  pop(): ClosedTab | undefined {
    return this.entries.pop();
  }
}
