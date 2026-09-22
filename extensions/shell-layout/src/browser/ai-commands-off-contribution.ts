import { ENABLE_AI_CONTEXT_KEY } from "@theia/ai-core/lib/browser/ai-activation-service";
import { CommandRegistry } from "@theia/core";
import { FrontendApplicationContribution } from "@theia/core/lib/browser";
import { QuickCommandService } from "@theia/core/lib/browser/quick-input/quick-command-service";
import { inject, injectable } from "@theia/core/shared/inversify";
import { isAiCommand } from "./ai-command-filter";

// The AI packages register their commands in the command palette. AI1 has
// no AI user interface, so each of those commands gets a `when` clause on
// the AI context key, which is false in AI1.
@injectable()
export class AiCommandsOffContribution implements FrontendApplicationContribution {
  @inject(CommandRegistry)
  protected readonly commands!: CommandRegistry;

  @inject(QuickCommandService)
  protected readonly palette!: QuickCommandService;

  onStart(): void {
    for (const command of this.commands.commands) {
      if (isAiCommand(command)) {
        this.palette.pushCommandContext(command.id, ENABLE_AI_CONTEXT_KEY);
      }
    }
  }
}
