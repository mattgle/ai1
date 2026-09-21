import { BackendApplicationContribution } from "@theia/core/lib/node/backend-application";
import { ContainerModule } from "@theia/core/shared/inversify";
import { MaterialIconsBackendContribution } from "./material-icons-backend-contribution";

export default new ContainerModule((bind) => {
  bind(MaterialIconsBackendContribution).toSelf().inSingletonScope();
  bind(BackendApplicationContribution).toService(MaterialIconsBackendContribution);
});
