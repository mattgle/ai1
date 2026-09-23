import { Emitter, Event } from "@theia/core";
import { Title, Widget } from "@theia/core/lib/browser";
import { TabBarDecorator } from "@theia/core/lib/browser/shell/tab-bar-decorator";
import { WidgetDecoration } from "@theia/core/lib/browser/widget-decoration";
import { inject, injectable, postConstruct } from "@theia/core/shared/inversify";
import { badgeDecorations } from "../common/badge-decoration";
import { AgentsModel } from "./agents-model";
import { AgentsWidget } from "./agents-widget";

// The Agents tab shows the number of blocked sessions.
@injectable()
export class AgentsBadgeDecorator implements TabBarDecorator {
  readonly id = "ai1-agents-badge";

  @inject(AgentsModel)
  protected readonly model!: AgentsModel;

  protected readonly onDidChangeDecorationsEmitter = new Emitter<void>();
  readonly onDidChangeDecorations: Event<void> = this.onDidChangeDecorationsEmitter.event;

  @postConstruct()
  protected init(): void {
    this.model.onDidChange(() => this.onDidChangeDecorationsEmitter.fire());
  }

  decorate(title: Title<Widget>): WidgetDecoration.Data[] {
    if (title.owner.id !== AgentsWidget.ID) {
      return [];
    }
    return badgeDecorations(this.model.sessionsWithStatus("blocked").length);
  }
}
