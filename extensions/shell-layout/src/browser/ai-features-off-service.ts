import { AIActivationService, ENABLE_AI_CONTEXT_KEY } from "@theia/ai-core/lib/browser/ai-activation-service";
import { Emitter, Event } from "@theia/core";
import { FrontendApplicationContribution } from "@theia/core/lib/browser";
import { ContextKeyService } from "@theia/core/lib/browser/context-key-service";
import { inject, injectable } from "@theia/core/shared/inversify";
import { AI_FEATURES_OFF } from "./ai-features-off-state";

// AI1 shows no Theia AI user interface. The VS Code extension host depends on
// @theia/ai-core, so that package loads. Its default activation service is
// always active, and no preference controls it. This service replaces it with
// one that is always off.
@injectable()
export class AiFeaturesOffService implements AIActivationService, FrontendApplicationContribution {
  @inject(ContextKeyService)
  protected readonly contextKeyService!: ContextKeyService;

  readonly isActive = AI_FEATURES_OFF.isActive;
  readonly canRun = AI_FEATURES_OFF.canRun;

  protected readonly activeStatusEmitter = new Emitter<boolean>();
  protected readonly canRunEmitter = new Emitter<boolean>();

  get onDidChangeActiveStatus(): Event<boolean> {
    return this.activeStatusEmitter.event;
  }

  get onDidChangeCanRun(): Event<boolean> {
    return this.canRunEmitter.event;
  }

  initialize(): void {
    this.contextKeyService.createKey(ENABLE_AI_CONTEXT_KEY, false);
  }
}
