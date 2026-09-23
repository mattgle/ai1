import { MessageService, Progress } from "@theia/core";
import { FrontendApplicationContribution } from "@theia/core/lib/browser";
import { PreferenceService } from "@theia/core/lib/common/preferences";
import { inject, injectable } from "@theia/core/shared/inversify";
import { SessionSummary } from "../common/agents-protocol";
import { NoticeRegistry } from "../common/notice-registry";
import { notifierDecision } from "../common/notifier-decision";
import { AgentsModel } from "./agents-model";
import { NOTIFY_ON_BLOCKED } from "./agents-preferences";
import { AgentsTerminals } from "./agents-terminals";

// Shows one notification per blocked session, with a button that opens its
// terminal. The notification closes when the session is not blocked any
// more, or when the session is removed while its notice is still open
// (`AgentsModel.onDidRemoveSession`), so a deleted session's notice does not
// linger.
//
// `MessageService.showProgress` is the API used, not `MessageService.info`
// or `.warn`, because it is the only one that returns a handle (`Progress`,
// with `.cancel()`) this class can hold onto and use later to close a
// notice programmatically once the session it is for stops being blocked;
// a plain info/warning message has no such handle. The "Open" action stays
// on it for the same reason `showProgress` was picked: it already supports
// actions and a cancel affordance in one call.
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

  protected readonly notices = new NoticeRegistry<Progress>((progress) => progress.cancel());

  onStart(): void {
    this.model.onDidChangeStatus(({ session, previous }) => {
      const decision = notifierDecision(session.status, previous, this.notifyOnBlocked());
      if (decision === "show") {
        void this.show(session);
      } else if (decision === "close") {
        this.notices.close(session.id);
      }
    });
    this.model.onDidRemoveSession((id) => this.notices.close(id));
    this.preferences.onPreferenceChanged((change) => {
      if (change.preferenceName !== NOTIFY_ON_BLOCKED) {
        return;
      }
      if (this.notifyOnBlocked()) {
        // Sessions that are blocked right now get a notice each, except
        // one that already has one: normally none of them do yet (`show`
        // was never reached for them while the preference was off), but a
        // session already showing one must not get a needless
        // cancel-and-show flash from a second `show` call for it.
        for (const session of this.model.sessionsWithStatus("blocked")) {
          if (this.notices.get(session.id) === undefined) {
            void this.show(session);
          }
        }
      } else {
        this.notices.closeAll();
      }
    });
  }

  protected notifyOnBlocked(): boolean {
    return this.preferences.get(NOTIFY_ON_BLOCKED, true);
  }

  protected async show(session: SessionSummary): Promise<void> {
    const progress = await this.messages.showProgress({
      text: `The agent "${session.title}" waits for a permission.`,
      actions: ["Open"],
      options: { cancelable: true },
    });
    // The session's status, and the preference, can both have moved on
    // while this call awaited: the session may not be blocked any more, or
    // another `show`/close may already have run for it. `settle` cancels
    // this notice at once instead of registering it when either happened.
    const stillWanted =
      this.notifyOnBlocked() && this.model.sessionsWithStatus("blocked").some((s) => s.id === session.id);
    this.notices.settle(session.id, progress, stillWanted);
    if (!stillWanted) {
      return;
    }
    void progress.result.then((action) => {
      if (action === "Open") {
        void this.terminals.openSession(session);
      }
      this.notices.clearIfCurrent(session.id, progress);
    });
  }
}
