import { injectable } from "@theia/core/shared/inversify";

// Which browser tab of which Theia window shows which guest web contents.
// A tab registers its guest when the guest is ready, and again after a
// profile change gives it a new guest.
@injectable()
export class GuestRegistry {
  protected readonly entries = new Map<number, { tabId: string; windowId: number }>();

  register(guestId: number, tabId: string, windowId: number): void {
    for (const [existingId, existing] of this.entries) {
      if (existing.tabId === tabId && existing.windowId === windowId) {
        this.entries.delete(existingId);
      }
    }
    this.entries.set(guestId, { tabId, windowId });
  }

  forget(guestId: number): void {
    this.entries.delete(guestId);
  }

  entry(guestId: number): { tabId: string; windowId: number } | undefined {
    return this.entries.get(guestId);
  }

  guestOf(windowId: number, tabId: string): number | undefined {
    for (const [guestId, entry] of this.entries) {
      if (entry.windowId === windowId && entry.tabId === tabId) {
        return guestId;
      }
    }
    return undefined;
  }

  tabsOf(windowId: number): { guestId: number; tabId: string }[] {
    return [...this.entries]
      .filter(([, entry]) => entry.windowId === windowId)
      .map(([guestId, entry]) => ({ guestId, tabId: entry.tabId }));
  }
}
