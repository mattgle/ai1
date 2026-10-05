import { ApplicationShell, FrontendApplicationContribution, WidgetManager } from "@theia/core/lib/browser";
import { CommonMenus } from "@theia/core/lib/browser/common-frontend-contribution";
import {
  CommandContribution,
  CommandRegistry,
  MenuContribution,
  MenuModelRegistry,
} from "@theia/core/lib/common";
import { PreferenceService } from "@theia/core/lib/common/preferences";
import { PreferenceScope } from "@theia/core/lib/common/preferences/preference-scope";
import { inject, injectable } from "@theia/core/shared/inversify";
import { WelcomeWidget } from "./welcome-widget";

@injectable()
export class WelcomeContribution
  implements FrontendApplicationContribution, CommandContribution, MenuContribution
{
  @inject(ApplicationShell) protected readonly shell!: ApplicationShell;
  @inject(WidgetManager) protected readonly widgets!: WidgetManager;
  @inject(PreferenceService) protected readonly preferences!: PreferenceService;

  registerCommands(commands: CommandRegistry): void {
    commands.registerCommand(
      { id: "ai1.welcome.open", label: "Welcome to AI1" },
      { execute: () => this.open() },
    );
  }

  registerMenus(menus: MenuModelRegistry): void {
    menus.registerMenuAction(CommonMenus.HELP, { commandId: "ai1.welcome.open", order: "0" });
  }

  async onDidInitializeLayout(): Promise<void> {
    await this.preferences.ready;
    const mode = this.preferences.get<string>("ai1.welcome.startup", "firstStart");
    if (mode === "never") return;
    if (mode === "always" || !this.preferences.get<boolean>("ai1.welcome.completed", false)) {
      await this.open();
      await this.preferences.set("ai1.welcome.completed", true, PreferenceScope.User);
    }
  }

  protected async open(): Promise<void> {
    const widget = await this.widgets.getOrCreateWidget<WelcomeWidget>(WelcomeWidget.ID);
    if (!widget.isAttached)
      this.shell.addWidget(widget, {
        area: "main",
        mode: "tab-after",
        ref: this.shell.mainPanel.currentTitle?.owner,
      });
    await this.shell.activateWidget(widget.id);
  }
}
