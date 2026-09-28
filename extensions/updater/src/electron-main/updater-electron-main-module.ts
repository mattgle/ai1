import { ElectronMainApplicationContribution } from "@theia/core/lib/electron-main/electron-main-application";
import { ContainerModule } from "@theia/core/shared/inversify";
import { UpdaterMainContribution } from "./updater-main-contribution";

export default new ContainerModule((bind) => {
  bind(UpdaterMainContribution).toSelf().inSingletonScope();
  bind(ElectronMainApplicationContribution).toService(UpdaterMainContribution);
});
