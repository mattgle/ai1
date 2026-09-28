import {
  ApplicationShell,
  codicon,
  FrontendApplicationContribution,
  KeybindingContribution,
  KeybindingRegistry,
  QuickInputService,
} from "@theia/core/lib/browser";
import { Command, CommandContribution, CommandRegistry, MessageService } from "@theia/core/lib/common";
import { QuickInputButton, QuickPickItem, QuickPickService } from "@theia/core/lib/common/quick-pick-service";
import { inject, injectable } from "@theia/core/shared/inversify";
import { dayLabel, HistoryEntry } from "../common/history";
import { DEFAULT_PROFILE_ID, Profile } from "../common/profiles";
import { BrowserShortcut } from "../common/shortcuts";
import { browserApi } from "./browser-api";
import { BrowserTabs } from "./browser-tabs";
import { BROWSER_FIND_FOCUS_CONTEXT, BROWSER_FOCUS_CONTEXT, BrowserWidget } from "./browser-widget";

export const BrowserCommands = {
  NEW_TAB: { id: "ai1.browser.newTab", label: "Browser: New Tab" },
  NEW_TAB_IN_PROFILE: { id: "ai1.browser.newTabInProfile", label: "Browser: New Tab in Profile…" },
  MANAGE_PROFILES: { id: "ai1.browser.manageProfiles", label: "Browser: Manage Profiles" },
  FIND: { id: "ai1.browser.find", label: "Browser: Find in Page" },
  FIND_NEXT: { id: "ai1.browser.findNext" },
  FIND_PREVIOUS: { id: "ai1.browser.findPrevious" },
  FOCUS_ADDRESS: { id: "ai1.browser.focusAddress" },
  CLOSE_FIND: { id: "ai1.browser.closeFind" },
  ZOOM_IN: { id: "ai1.browser.zoomIn", label: "Browser: Zoom In" },
  ZOOM_OUT: { id: "ai1.browser.zoomOut", label: "Browser: Zoom Out" },
  ZOOM_RESET: { id: "ai1.browser.zoomReset", label: "Browser: Reset Zoom" },
  SET_VIEWPORT: { id: "ai1.browser.setViewport", label: "Browser: Set Viewport…" },
  SHOW_HISTORY: { id: "ai1.browser.showHistory", label: "Browser: Show History" },
  CLEAR_HISTORY: { id: "ai1.browser.clearHistory", label: "Browser: Clear History…" },
  REOPEN_CLOSED_TAB: { id: "ai1.browser.reopenClosedTab", label: "Browser: Reopen Closed Tab" },
} satisfies Record<string, Command>;

// The shortcuts that are also Theia keybindings. They work when the focus
// is on the toolbar or the find bar of a browser tab. When the page has the
// focus, the main process catches the keys (see `GuestPolicies`). The
// `when` context keys are local keys of the tab, which give these
// keybindings priority (see `BROWSER_FOCUS_CONTEXT`). Later tasks add their
// shortcuts to this list.
//
// The zoom keybindings include all keys of the Theia window zoom
// (`view.zoomIn`, `view.zoomOut`, and `view.resetZoom`), so the Theia
// window zoom does not run while a browser tab has the focus. "+" needs
// Shift on many keyboards, so ⇧⌘= also zooms in.
const SHORTCUT_COMMANDS: {
  command: Command;
  shortcut: BrowserShortcut;
  keybindings: string[];
  when: string;
}[] = [
  {
    command: BrowserCommands.FIND,
    shortcut: "find",
    keybindings: ["ctrlcmd+f"],
    when: BROWSER_FOCUS_CONTEXT,
  },
  {
    command: BrowserCommands.FIND_NEXT,
    shortcut: "findNext",
    keybindings: ["ctrlcmd+g"],
    when: BROWSER_FOCUS_CONTEXT,
  },
  {
    command: BrowserCommands.FIND_PREVIOUS,
    shortcut: "findPrevious",
    keybindings: ["ctrlcmd+shift+g"],
    when: BROWSER_FOCUS_CONTEXT,
  },
  {
    command: BrowserCommands.FOCUS_ADDRESS,
    shortcut: "focusAddress",
    keybindings: ["ctrlcmd+l"],
    when: BROWSER_FOCUS_CONTEXT,
  },
  {
    command: BrowserCommands.CLOSE_FIND,
    shortcut: "closeFind",
    keybindings: ["esc"],
    when: BROWSER_FIND_FOCUS_CONTEXT,
  },
  {
    command: BrowserCommands.ZOOM_IN,
    shortcut: "zoomIn",
    keybindings: ["ctrlcmd+=", "ctrlcmd+shift+=", "ctrlcmd+add"],
    when: BROWSER_FOCUS_CONTEXT,
  },
  {
    command: BrowserCommands.ZOOM_OUT,
    shortcut: "zoomOut",
    keybindings: ["ctrlcmd+-", "ctrlcmd+subtract"],
    when: BROWSER_FOCUS_CONTEXT,
  },
  {
    command: BrowserCommands.ZOOM_RESET,
    shortcut: "zoomReset",
    keybindings: ["ctrlcmd+0"],
    when: BROWSER_FOCUS_CONTEXT,
  },
];

interface HistoryItem extends QuickPickItem {
  url: string;
}

// When the owner types a search text, the Monaco quick pick sorts the
// matches by their label. The history must stay newest first. Theia 1.75
// does not give `sortByLabel` in its `QuickPick`, so set it on the Monaco
// quick pick that the Theia object holds. Without that object, the matches
// stay sorted by label.
function keepItemOrder(pick: object): void {
  const wrapped = (pick as { wrapped?: { sortByLabel?: boolean } }).wrapped;
  if (wrapped && typeof wrapped.sortByLabel === "boolean") {
    wrapped.sortByLabel = false;
  }
}

const OPEN_IN_NEW_TAB: QuickInputButton = { iconClass: codicon("link-external"), tooltip: "Open in New Tab" };

// Removes the prefix that Electron adds to an error from `ipcMain.handle`.
function errorText(error: unknown): string {
  return String(error instanceof Error ? error.message : error).replace(
    /^Error invoking remote method '[^']+': (Error: )?/,
    "",
  );
}

@injectable()
export class BrowserContribution
  implements CommandContribution, KeybindingContribution, FrontendApplicationContribution
{
  @inject(BrowserTabs)
  protected readonly tabs!: BrowserTabs;

  @inject(ApplicationShell)
  protected readonly shell!: ApplicationShell;

  @inject(QuickPickService)
  protected readonly quickPick!: QuickPickService;

  @inject(QuickInputService)
  protected readonly quickInput!: QuickInputService;

  @inject(MessageService)
  protected readonly messages!: MessageService;

  async onStart(): Promise<void> {
    const api = browserApi();
    api.onProfilesChanged((profiles) => this.tabs.applyProfiles(profiles));
    api.onOpenTab((request) => void this.tabs.open(request.url, request.profileId));
    api.onNotice((text) => void this.messages.info(text));
    api.onShortcut((event) => this.tabs.byTabId(event.tabId)?.runShortcut(event.shortcut));
    await this.tabs.refreshProfiles();
  }

  registerCommands(registry: CommandRegistry): void {
    registry.registerCommand(BrowserCommands.NEW_TAB, {
      execute: async () => (await this.tabs.open("about:blank", DEFAULT_PROFILE_ID)).focusAddress(),
    });
    registry.registerCommand(BrowserCommands.NEW_TAB_IN_PROFILE, {
      execute: async () => {
        const profile = await this.pickProfile("Open a new tab in which profile?", this.tabs.profiles());
        if (profile) {
          (await this.tabs.open("about:blank", profile.id)).focusAddress();
        }
      },
    });
    registry.registerCommand(BrowserCommands.MANAGE_PROFILES, { execute: () => this.manageProfiles() });
    registry.registerCommand(BrowserCommands.SET_VIEWPORT, {
      isEnabled: () => this.currentBrowser()?.agentConnected === false,
      execute: () => this.setViewport(),
    });
    registry.registerCommand(BrowserCommands.SHOW_HISTORY, { execute: () => this.showHistory() });
    registry.registerCommand(BrowserCommands.CLEAR_HISTORY, { execute: () => this.clearHistory() });
    // Not in `SHORTCUT_COMMANDS`: this command reopens a tab that no longer
    // exists, so it does not depend on a current browser tab, unlike the
    // shortcuts that act on the current tab.
    registry.registerCommand(BrowserCommands.REOPEN_CLOSED_TAB, {
      execute: () => this.tabs.reopenClosed(),
    });
    for (const { command, shortcut } of SHORTCUT_COMMANDS) {
      registry.registerCommand(command, {
        isEnabled: () => this.currentBrowser() !== undefined,
        execute: () => this.currentBrowser()?.runShortcut(shortcut),
      });
    }
  }

  registerKeybindings(keybindings: KeybindingRegistry): void {
    for (const { command, keybindings: keys, when } of SHORTCUT_COMMANDS) {
      for (const keybinding of keys) {
        keybindings.registerKeybinding({ command: command.id, keybinding, when });
      }
    }
    // Theia's own "Reopen Closed Editor" uses the same keys
    // (`ctrlcmd+shift+t`). The local context key gives this binding
    // priority while a browser tab has the focus (see `BROWSER_FOCUS_CONTEXT`).
    keybindings.registerKeybinding({
      command: BrowserCommands.REOPEN_CLOSED_TAB.id,
      keybinding: "ctrlcmd+shift+t",
      when: BROWSER_FOCUS_CONTEXT,
    });
  }

  // The browser tab that has the focus, or else the current tab of the main
  // area when it is a browser tab (for example while the command palette is
  // open).
  protected currentBrowser(): BrowserWidget | undefined {
    const active = this.shell.activeWidget;
    if (active instanceof BrowserWidget) {
      return active;
    }
    const current = this.shell.currentWidget;
    return current instanceof BrowserWidget ? current : undefined;
  }

  // The history of the profile of the current browser tab, or of Default.
  // Enter opens the page in the current browser tab, or in a new tab when
  // there is no current browser tab (or an agent is connected to it). The
  // item button opens the page in a new tab. Theia's quick pick has no hook
  // for ⌘Enter, so the button replaces it.
  protected async showHistory(): Promise<void> {
    const browser = this.currentBrowser();
    const profileId = browser?.profileId ?? DEFAULT_PROFILE_ID;
    let entries: HistoryEntry[];
    try {
      entries = await browserApi().listHistory(profileId);
    } catch (error) {
      await this.messages.error(errorText(error));
      return;
    }
    const now = Date.now();
    const pick = this.quickInput.createQuickPick<HistoryItem>();
    pick.placeholder = "Type to search the history by title or address";
    pick.matchOnDescription = true;
    keepItemOrder(pick);
    pick.items = entries.map((entry) => ({
      label: entry.title || entry.url,
      description: entry.url,
      detail: dayLabel(entry.time, now),
      url: entry.url,
      buttons: [OPEN_IN_NEW_TAB],
    }));
    pick.onDidAccept(() => {
      const item = pick.selectedItems[0] ?? pick.activeItems[0];
      pick.hide();
      if (!item) {
        return;
      }
      if (browser && !browser.agentConnected && browser.isAttached) {
        browser.navigate(item.url);
        void this.shell.activateWidget(browser.id);
      } else {
        void this.tabs.open(item.url, profileId);
      }
    });
    pick.onDidTriggerItemButton(({ item }) => {
      pick.hide();
      void this.tabs.open((item as HistoryItem).url, profileId);
    });
    pick.onDidHide(() => pick.dispose());
    pick.show();
  }

  protected async clearHistory(): Promise<void> {
    const profileId = this.currentBrowser()?.profileId ?? DEFAULT_PROFILE_ID;
    const name = this.tabs.profiles().find((profile) => profile.id === profileId)?.name ?? profileId;
    const answer = await this.messages.warn(
      `Clear the browsing history of the profile "${name}"?`,
      "Clear History",
    );
    if (answer !== "Clear History") {
      return;
    }
    try {
      await browserApi().clearHistory(profileId);
    } catch (error) {
      await this.messages.error(errorText(error));
    }
  }

  // The same entries as the viewport menu of the tab, as a quick pick.
  protected async setViewport(): Promise<void> {
    const browser = this.currentBrowser();
    if (!browser || browser.agentConnected) {
      return;
    }
    const entries = browser.viewportEntries().filter((entry) => entry.enabled);
    const picked = await this.quickPick.show(
      entries.map((entry) => ({
        id: entry.id,
        label: entry.label,
        description: entry.checked ? "Current" : undefined,
      })),
      { placeholder: "Choose the viewport size of this tab" },
    );
    if (picked) {
      await browser.chooseViewportEntry(picked.id);
    }
  }

  protected async pickProfile(placeholder: string, profiles: Profile[]): Promise<Profile | undefined> {
    const picked = await this.quickPick.show(
      profiles.map((profile) => ({ label: profile.name, id: profile.id })),
      { placeholder },
    );
    return profiles.find((profile) => profile.id === picked?.id);
  }

  protected async manageProfiles(): Promise<void> {
    const action = await this.quickPick.show(
      [
        { id: "add", label: "Add Profile…" },
        { id: "rename", label: "Rename Profile…" },
        { id: "importCookies", label: "Import Cookies…" },
        { id: "delete", label: "Delete Profile…" },
      ],
      { placeholder: "Manage the browser profiles" },
    );
    try {
      if (action?.id === "add") {
        const name = await this.quickInput.input({ prompt: "Name of the new profile" });
        if (name !== undefined) {
          await browserApi().addProfile(name);
        }
      } else if (action?.id === "rename") {
        const profile = await this.pickProfile("Rename which profile?", this.tabs.profiles());
        const name = profile && (await this.quickInput.input({ prompt: "New name", value: profile.name }));
        if (profile && name !== undefined) {
          await browserApi().renameProfile(profile.id, name);
        }
      } else if (action?.id === "delete") {
        const deletable = this.tabs
          .profiles()
          .filter((profile) => profile.id !== "default" && profile.id !== "agent");
        const profile = await this.pickProfile("Delete which profile?", deletable);
        if (profile) {
          const answer = await this.messages.warn(
            `Delete the profile "${profile.name}"? Its logins, cookies, and storage are removed.`,
            "Delete",
          );
          if (answer === "Delete") {
            await browserApi().deleteProfile(profile.id);
          }
        }
      } else if (action?.id === "importCookies") {
        await this.importCookiesIntoProfile();
      }
    } catch (error) {
      await this.messages.error(errorText(error));
    }
  }

  protected async importCookiesIntoProfile(): Promise<void> {
    const sources = await browserApi().listCookieImportSources();
    if (sources.length === 0) {
      await this.messages.info("AI1 did not find Chrome, Arc, or Brave profiles on this Mac.");
      return;
    }
    const target = await this.pickProfile("Import cookies into which AI1 profile?", this.tabs.profiles());
    if (!target) {
      return;
    }
    const selected = await this.quickPick.show(
      sources.map((source, index) => ({
        id: String(index),
        label: `${source.browserName} · ${source.profileName}`,
      })),
      { placeholder: "Import cookies from which browser profile?" },
    );
    const source = selected ? sources[Number(selected.id)] : undefined;
    if (!source) {
      return;
    }
    const answer = await this.messages.warn(
      `Import login cookies from ${source.browserName} (${source.profileName}) into "${target.name}"? Imported cookies can give sites access to your accounts. Existing cookies with the same site, name, and path will be replaced.`,
      "Import",
    );
    if (answer !== "Import") {
      return;
    }
    const result = await browserApi().importCookies(source, target.id);
    await this.messages.info(
      `Imported ${result.imported} cookies from ${result.browserName} (${result.browserProfile}) into "${result.targetProfile}". ${result.skipped} cookies were skipped.`,
    );
  }
}
