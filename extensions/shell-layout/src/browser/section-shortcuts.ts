import {
  ApplicationShell,
  FrontendApplicationContribution,
  KeybindingRegistry,
  Widget,
} from "@theia/core/lib/browser";
import { AbstractViewContribution } from "@theia/core/lib/browser/shell/view-contribution";
import {
  CommandContribution,
  ContributionProvider,
  Disposable,
  DisposableCollection,
} from "@theia/core/lib/common";
import { inject, injectable, named } from "@theia/core/shared/inversify";

@injectable()
export class SectionShortcuts implements FrontendApplicationContribution {
  @inject(ApplicationShell) protected readonly shell!: ApplicationShell;
  @inject(KeybindingRegistry) protected readonly keybindings!: KeybindingRegistry;
  @inject(ContributionProvider)
  @named(CommandContribution)
  protected readonly contributions!: ContributionProvider<CommandContribution>;
  protected readonly toDispose = new DisposableCollection();
  protected readonly observed = new WeakSet<Widget>();

  onStart(): void {
    this.toDispose.push(this.shell.onDidAddWidget(() => this.update()));
    this.toDispose.push(this.keybindings.onKeybindingsChanged(() => this.update()));
    this.update();
  }

  onDidInitializeLayout(): void {
    this.update();
  }

  onStop(): void {
    this.toDispose.dispose();
  }

  protected update(): void {
    const views = this.contributions
      .getContributions()
      .filter(
        (contribution): contribution is AbstractViewContribution<Widget> =>
          contribution instanceof AbstractViewContribution,
      );
    for (const panel of [this.shell.leftPanelHandler, this.shell.rightPanelHandler]) {
      for (const title of panel.tabBar.titles) {
        if (!this.observed.has(title.owner)) {
          this.observed.add(title.owner);
          const update = () => this.update();
          title.changed.connect(update);
          this.toDispose.push(Disposable.create(() => title.changed.disconnect(update)));
        }
        const view = views.find(
          (candidate) =>
            candidate.effectiveWidgetId === title.owner.id || candidate.viewLabel === title.label,
        );
        const command =
          title.owner.id === "ai1-agents"
            ? "ai1.agents.focus"
            : title.owner.id === "ai1-changes"
              ? "ai1.changes.focus"
              : title.owner.id === "search-view-container"
                ? "search-in-workspace.open"
                : view?.toggleCommand?.id;
        const bindings = command ? this.keybindings.getKeybindingsForCommand(command) : [];
        const binding =
          bindings.find((candidate) => candidate.scope > 0) ??
          (title.owner.id === "explorer-view-container"
            ? bindings.find((candidate) => candidate.keybinding === "ctrlcmd+shift+e")
            : undefined) ??
          bindings.find((candidate) => !candidate.when && !candidate.context);
        const keys = binding ? this.keybindings.acceleratorFor(binding, "+", true).join(" ") : undefined;
        title.caption = keys ? `${title.label} (${keys})` : title.label;
      }
    }
  }
}
