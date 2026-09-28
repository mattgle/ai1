import { FrontendApplicationContribution } from "@theia/core/lib/browser";
import { CommandContribution } from "@theia/core/lib/common";
import { ContainerModule } from "@theia/core/shared/inversify";
import { AI1_UPDATER_API, UpdaterService, UpdaterServiceToken } from "../common/updater-protocol";
import { UpdaterContribution } from "./updater-contribution";

export default new ContainerModule((bind) => {
  bind(UpdaterServiceToken).toConstantValue(
    (globalThis as typeof globalThis & Record<typeof AI1_UPDATER_API, UpdaterService>)[AI1_UPDATER_API],
  );
  bind(UpdaterContribution).toSelf().inSingletonScope();
  bind(CommandContribution).toService(UpdaterContribution);
  bind(FrontendApplicationContribution).toService(UpdaterContribution);
});
