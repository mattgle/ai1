import {
  ApplicationShell,
  FrontendApplicationContribution,
  KeybindingContribution,
  KeybindingRegistry,
  QuickInputService,
} from "@theia/core/lib/browser";
import { ContextKeyService } from "@theia/core/lib/browser/context-key-service";
import { Command, CommandContribution, CommandRegistry, MessageService } from "@theia/core/lib/common";
import { QuickPickService } from "@theia/core/lib/common/quick-pick-service";
import { inject, injectable } from "@theia/core/shared/inversify";
import { DEFAULT_PROFILE_ID, Profile } from "../common/profiles";
import { BrowserShortcut } from "../common/shortcuts";
import { browserApi } from "./browser-api";
import { BrowserTabs } from "./browser-tabs";
import { BrowserWidget } from "./browser-widget";

export const BrowserCommands = {
  NEW_TAB: { id: "ai1.browser.newTab", label: "Browser: New Tab" },
  NEW_TAB_IN_PROFILE: { id: "ai1.browser.newTabInProfile", label: "Browser: New Tab in Profile…" },
  MANAGE_PROFILES: { id: "ai1.browser.manageProfiles", label: "Browser: Manage Profiles" },
  FIND: { id: "ai1.browser.find", label: "Browser: Find in Page" },
  FIND_NEXT: { id: "ai1.browser.findNext" },
  FIND_PREVIOUS: { id: "ai1.browser.findPrevious" },
  FOCUS_ADDRESS: { id: "ai1.browser.focusAddress" },
} satisfies Record<string, Command>;

// The context key that is true while a browser tab has the focus.
export const BROWSER_FOCUS_CONTEXT = "ai1BrowserFocus";

// The shortcuts that are also Theia keybindings. They work when the focus
// is on the toolbar or the find bar of a browser tab. When the page has the
// focus, the main process catches the keys (see `GuestPolicies`).
const SHORTCUT_COMMANDS: { command: Command; shortcut: BrowserShortcut; keybinding: string }[] = [
  { command: BrowserCommands.FIND, shortcut: "find", keybinding: "ctrlcmd+f" },
  { command: BrowserCommands.FIND_NEXT, shortcut: "findNext", keybinding: "ctrlcmd+g" },
  { command: BrowserCommands.FIND_PREVIOUS, shortcut: "findPrevious", keybinding: "ctrlcmd+shift+g" },
  { command: BrowserCommands.FOCUS_ADDRESS, shortcut: "focusAddress", keybinding: "ctrlcmd+l" },
];

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

  @inject(ContextKeyService)
  protected readonly contextKeys!: ContextKeyService;

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
    const browserFocus = this.contextKeys.createKey<boolean>(BROWSER_FOCUS_CONTEXT, false);
    const updateFocus = (): void => browserFocus.set(this.shell.activeWidget instanceof BrowserWidget);
    this.shell.onDidChangeActiveWidget(updateFocus);
    updateFocus();
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
    for (const { command, shortcut } of SHORTCUT_COMMANDS) {
      registry.registerCommand(command, {
        isEnabled: () => this.currentBrowser() !== undefined,
        execute: () => this.currentBrowser()?.runShortcut(shortcut),
      });
    }
  }

  registerKeybindings(keybindings: KeybindingRegistry): void {
    for (const { command, keybinding } of SHORTCUT_COMMANDS) {
      keybindings.registerKeybinding({ command: command.id, keybinding, when: BROWSER_FOCUS_CONTEXT });
    }
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
      }
    } catch (error) {
      await this.messages.error(errorText(error));
    }
  }
}
