import { Command, CommandRegistry, MessageService, QuickInputService, QuickPickService } from "@theia/core";
import { isOSX } from "@theia/core/lib/common";
import {
  AbstractViewContribution,
  codicon,
  FrontendApplicationContribution,
  KeybindingRegistry,
  Widget,
} from "@theia/core/lib/browser";
import {
  TabBarToolbarContribution,
  TabBarToolbarRegistry,
} from "@theia/core/lib/browser/shell/tab-bar-toolbar";
import { inject, injectable } from "@theia/core/shared/inversify";
import { PreferenceScope, PreferenceService } from "@theia/core/lib/common/preferences";
import { WorkspaceService } from "@theia/workspace/lib/browser/workspace-service";
import {
  normalizeScanDepth,
  parseScanDepth,
  REPOSITORY_SCAN_DEPTH,
  scanDepthLabel,
} from "../common/repository-scan-depth";
import { CHANGES_REFRESH_MODE, normalizeRefreshMode } from "../common/changes-refresh-mode";
import { ChangesWidget } from "./changes-widget";

export const ChangesCommands = {
  REFRESH: { id: "ai1.changes.refresh", label: "Changes: Refresh", iconClass: codicon("refresh") },
  EXPAND_ALL: { id: "ai1.changes.expandAll", label: "Changes: Expand All", iconClass: codicon("expand-all") },
  COLLAPSE_ALL: {
    id: "ai1.changes.collapseAll",
    label: "Changes: Collapse All",
    iconClass: codicon("collapse-all"),
  },
  SETTINGS: { id: "ai1.changes.settings", label: "Changes: Settings", iconClass: codicon("settings-gear") },
} satisfies Record<string, Command>;

@injectable()
export class ChangesContribution
  extends AbstractViewContribution<ChangesWidget>
  implements FrontendApplicationContribution, TabBarToolbarContribution
{
  @inject(PreferenceService)
  protected readonly preferences!: PreferenceService;

  @inject(QuickPickService)
  protected readonly quickPick!: QuickPickService;

  @inject(QuickInputService)
  protected readonly quickInput!: QuickInputService;

  @inject(WorkspaceService)
  protected readonly workspace!: WorkspaceService;

  @inject(MessageService)
  protected readonly messages!: MessageService;

  constructor() {
    super({
      widgetId: ChangesWidget.ID,
      widgetName: ChangesWidget.LABEL,
      defaultWidgetOptions: { area: "right", rank: 100 },
      toggleCommandId: "ai1.changes.toggle",
    });
  }

  // Theia calls this only when no saved layout exists. So the view opens on
  // the right on the first start, and later manual changes stay.
  async initializeLayout(): Promise<void> {
    await this.openView({ reveal: true });
  }

  override registerCommands(commands: CommandRegistry): void {
    super.registerCommands(commands);
    commands.registerCommand(
      { id: "ai1.changes.focus", label: "Changes: Focus" },
      {
        execute: () => this.openView({ activate: true }),
      },
    );
    const forChanges = (run: (widget: ChangesWidget) => void | Promise<void>) => ({
      execute: (widget?: Widget) => this.withChangesWidget(widget, run),
      isEnabled: (widget?: Widget) => widget instanceof ChangesWidget,
      isVisible: (widget?: Widget) => widget instanceof ChangesWidget,
    });
    commands.registerCommand(
      ChangesCommands.REFRESH,
      forChanges((widget) => widget.scheduleRefresh(0)),
    );
    commands.registerCommand(
      ChangesCommands.EXPAND_ALL,
      forChanges((widget) => widget.expandAll()),
    );
    commands.registerCommand(
      ChangesCommands.COLLAPSE_ALL,
      forChanges((widget) => widget.collapseAll()),
    );
    commands.registerCommand(ChangesCommands.SETTINGS, {
      execute: () => this.configureSettings(),
    });
  }

  registerToolbarItems(toolbar: TabBarToolbarRegistry): void {
    const items: [Command, string, number][] = [
      [ChangesCommands.REFRESH, "Refresh", 0],
      [ChangesCommands.EXPAND_ALL, "Expand All", 1],
      [ChangesCommands.COLLAPSE_ALL, "Collapse All", 2],
      [ChangesCommands.SETTINGS, "Changes settings", 3],
    ];
    for (const [command, tooltip, priority] of items) {
      toolbar.registerItem({
        id: command.id,
        command: command.id,
        tooltip,
        priority,
        isVisible: (widget) => widget instanceof ChangesWidget,
      });
    }
  }

  override registerKeybindings(keybindings: KeybindingRegistry): void {
    super.registerKeybindings(keybindings);
    keybindings.registerKeybinding({
      command: "ai1.changes.focus",
      keybinding: isOSX ? "meta+ctrl+c" : "ctrl+shift+c",
    });
  }

  protected async configureSettings(): Promise<void> {
    try {
      await this.preferences.ready;
      const setting = await this.quickPick.show(
        [
          { label: "Repository search depth", preference: REPOSITORY_SCAN_DEPTH },
          { label: "Refresh mode", preference: CHANGES_REFRESH_MODE },
        ],
        { placeholder: "Changes settings" },
      );
      if (!setting) return;
      const profileValue = this.preferences.inspectInScope(setting.preference, PreferenceScope.User);
      const overrideValue = this.preferences.inspectInScope(setting.preference, PreferenceScope.Workspace);
      const label = (value: unknown): string =>
        setting.preference === REPOSITORY_SCAN_DEPTH
          ? scanDepthLabel(normalizeScanDepth(value))
          : normalizeRefreshMode(value) === "automatic"
            ? "Automatic"
            : "Manual";
      const scopes = [
        {
          label: "App profile",
          description: `${label(profileValue)} · Default for all workspaces`,
          scope: PreferenceScope.User,
        },
      ];
      if (this.workspace.opened) {
        scopes.push({
          label: "This workspace",
          description:
            overrideValue === undefined
              ? `Uses app profile: ${label(profileValue)}`
              : `${label(overrideValue)} · Overrides the app profile`,
          scope: PreferenceScope.Workspace,
        });
      }
      const selectedScope = await this.quickPick.show(scopes, { placeholder: "Changes settings scope" });
      if (!selectedScope) return;
      if (setting.preference === CHANGES_REFRESH_MODE) {
        const choices: { label: string; description: string; value?: string }[] = [
          {
            label: "Automatic",
            description: "Refresh affected repositories when files change. Pause while Changes is hidden.",
            value: "automatic",
          },
          {
            label: "Manual",
            description: "Scan on workspace open and when you press Refresh.",
            value: "manual",
          },
        ];
        if (selectedScope.scope === PreferenceScope.Workspace)
          choices.push({
            label: "Use app profile",
            description: `Remove the workspace override · ${label(profileValue)}`,
          });
        const inherited = selectedScope.scope === PreferenceScope.Workspace && overrideValue === undefined;
        const current = normalizeRefreshMode(
          selectedScope.scope === PreferenceScope.User ? profileValue : (overrideValue ?? profileValue),
        );
        const activeItem = choices.find((choice) =>
          inherited ? choice.value === undefined : choice.value === current,
        );
        const selected = await this.quickPick.show(choices, {
          placeholder: "Changes refresh mode",
          activeItem,
        });
        if (selected) await this.preferences.set(CHANGES_REFRESH_MODE, selected.value, selectedScope.scope);
        return;
      }
      const profile = normalizeScanDepth(profileValue);
      const override = overrideValue === undefined ? undefined : normalizeScanDepth(overrideValue);
      const current =
        selectedScope.scope === PreferenceScope.User ? profile : normalizeScanDepth(override ?? profile);
      const choices: {
        label: string;
        description: string;
        depth?: number;
        custom?: boolean;
        inherit?: boolean;
      }[] = [
        { label: "All levels", description: "Search at every folder level", depth: -1 },
        { label: "Current folder only", description: "Depth 0 · Each workspace root itself", depth: 0 },
        {
          label: "Direct children",
          description: "Depth 1 · Workspace roots and their direct children",
          depth: 1,
        },
        { label: "Custom depth…", description: "Enter a non-negative whole number", custom: true },
      ];
      if (selectedScope.scope === PreferenceScope.Workspace) {
        choices.push({
          label: "Use app profile",
          description: `Remove the workspace override · ${scanDepthLabel(profile)}`,
          inherit: true,
        });
      }
      const activeItem = choices.find((choice) =>
        override === undefined && selectedScope.scope === PreferenceScope.Workspace
          ? choice.inherit
          : choice.depth === current || (choice.custom && current > 1),
      );
      const selected = await this.quickPick.show(choices, {
        placeholder: "Repository search depth",
        activeItem,
      });
      if (!selected) return;
      let depth = selected.depth;
      if (selected.custom) {
        const input = await this.quickInput.input({
          placeHolder: "Custom repository search depth",
          prompt: "Enter a non-negative whole number.",
          value: String(current >= 0 ? current : 2),
          validateInput: async (value) =>
            parseScanDepth(value) === undefined ? "Enter a non-negative whole number." : undefined,
        });
        if (input === undefined) return;
        depth = parseScanDepth(input);
        if (depth === undefined) return;
      }
      await this.preferences.set(REPOSITORY_SCAN_DEPTH, depth, selectedScope.scope);
    } catch (error) {
      this.messages.error(
        `Cannot save Changes settings: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  protected withChangesWidget(
    widget: Widget | undefined,
    run: (widget: ChangesWidget) => void | Promise<void>,
  ): void | Promise<void> {
    if (widget instanceof ChangesWidget) {
      return run(widget);
    }
  }
}
