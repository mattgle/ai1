import type { WebContents } from "@theia/core/electron-shared/electron";
import { shouldRecord } from "../common/history";
import { profileIdFromStoragePath } from "../common/guest-policy";

// The parts of `HistoryStore` that the recorder uses.
export interface HistorySink {
  visit(profileId: string, url: string, title: string): void;
  setTitle(profileId: string, url: string, title: string): void;
}

// Puts the navigations of an AI1 page into the history of its profile. It
// records nothing while an agent is connected to the page.
export class HistoryRecorder {
  constructor(
    protected readonly history: HistorySink,
    protected readonly agentConnected: (guestId: number) => boolean,
  ) {}

  attach(contents: WebContents): void {
    const profileId = profileIdFromStoragePath(contents.session.storagePath);
    if (profileId === undefined) {
      return;
    }
    const allowed = (url: string): boolean =>
      shouldRecord(url, profileId) && !this.agentConnected(contents.id);
    // A new document often has no title yet. `page-title-updated` gives it.
    contents.on("did-navigate", (_event, url) => {
      if (allowed(url)) {
        this.history.visit(profileId, url, "");
      }
    });
    // An in-page navigation keeps the document and its title.
    contents.on("did-navigate-in-page", (_event, url, isMainFrame) => {
      if (isMainFrame && allowed(url)) {
        this.history.visit(profileId, url, contents.getTitle());
      }
    });
    contents.on("page-title-updated", (_event, title) => {
      const url = contents.getURL();
      if (allowed(url)) {
        this.history.setTitle(profileId, url, title);
      }
    });
  }
}
