import { MessageService, Progress } from "@theia/core";
import { FrontendApplicationContribution } from "@theia/core/lib/browser";
import { PreferenceService } from "@theia/core/lib/common/preferences";
import { inject, injectable } from "@theia/core/shared/inversify";
import { SessionSummary } from "../common/agents-protocol";
import { notifierDecision } from "../common/notifier-decision";
import { AgentsModel } from "./agents-model";
import { NOTIFY_ON_BLOCKED } from "./agents-preferences";
import { AgentsTerminals } from "./agents-terminals";

// Shows one notification per blocked session, with a button that opens its
// terminal. The notification closes when the session is not blocked any
// more, or when the session is removed while its notice is still open
// (`AgentsModel.onDidRemoveSession`), so a deleted session's notice does not
// linger.
@injectable()
export class BlockedNotifier implements FrontendApplicationContribution {
  @inject(AgentsModel)
  protected readonly model!: AgentsModel;

  @inject(AgentsTerminals)
  protected readonly terminals!: AgentsTerminals;

  @inject(MessageService)
  protected readonly messages!: MessageService;

  @inject(PreferenceService)
  protected readonly preferences!: PreferenceService;

  protected readonly open = new Map<string, Progress>();

  onStart(): void {
    this.model.onDidChangeStatus(({ session, previous }) => {
      const decision = notifierDecision(
        session.status,
        previous,
        this.preferences.get(NOTIFY_ON_BLOCKED, true),
      );
      if (decision === "show") {
        void this.show(session);
      } else if (decision === "close") {
        this.close(session.id);
      }
    });
    this.model.onDidRemoveSession((id) => this.close(id));
  }

  protected async show(session: SessionSummary): Promise<void> {
    const progress = await this.messages.showProgress({
      text: `The agent "${session.title}" waits for a permission.`,
      actions: ["Open"],
      options: { cancelable: true },
    });
    this.open.set(session.id, progress);
    void progress.result.then((action) => {
      if (action === "Open") {
        void this.terminals.openSession(session);
      }
      this.open.delete(session.id);
    });
  }

  protected close(id: string): void {
    this.open.get(id)?.cancel();
    this.open.delete(id);
  }
}
