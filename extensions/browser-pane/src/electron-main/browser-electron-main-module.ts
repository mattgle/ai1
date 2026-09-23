import {
  ElectronMainApplication,
  ElectronMainApplicationContribution,
} from "@theia/core/lib/electron-main/electron-main-application";
import { ContainerModule } from "@theia/core/shared/inversify";
import { Ai1ElectronMainApplication } from "./ai1-electron-main-application";
import { BrowserMainContribution } from "./browser-main-contribution";
import { GuestPolicies } from "./guest-policies";

export default new ContainerModule((bind, _unbind, _isBound, rebind) => {
  bind(GuestPolicies).toSelf().inSingletonScope();
  bind(Ai1ElectronMainApplication).toSelf().inSingletonScope();
  rebind(ElectronMainApplication).toService(Ai1ElectronMainApplication);
  bind(BrowserMainContribution).toSelf().inSingletonScope();
  bind(ElectronMainApplicationContribution).toService(BrowserMainContribution);
});
