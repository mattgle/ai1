import { ElectronMainApplicationContribution } from "@theia/core/lib/electron-main/electron-main-application";
import { ContainerModule } from "@theia/core/shared/inversify";
import { BackgroundWindowContribution } from "./background-window";

export default new ContainerModule((bind) => {
  bind(BackgroundWindowContribution).toSelf().inSingletonScope();
  bind(ElectronMainApplicationContribution).toService(BackgroundWindowContribution);
});
