import { ColorContribution } from "@theia/core/lib/browser/color-application-contribution";
import { ColorRegistry } from "@theia/core/lib/browser/color-registry";
import { injectable } from "@theia/core/shared/inversify";

@injectable()
export class WorkspaceColors implements ColorContribution {
  registerColors(colors: ColorRegistry): void {
    colors.register(
      {
        id: "ai1.frameBackground",
        description: "Background of the workspace frame.",
        defaults: {
          dark: "#181818",
          light: "titleBar.activeBackground",
          hcDark: "titleBar.activeBackground",
          hcLight: "titleBar.activeBackground",
        },
      },
      {
        id: "ai1.sidePanelBackground",
        description: "Background of grouped side panels and activity bars.",
        defaults: {
          dark: "#181818",
          light: "sideBar.background",
          hcDark: "sideBar.background",
          hcLight: "sideBar.background",
        },
      },
      {
        id: "ai1.panelBorder",
        description: "Border of workspace panels.",
        defaults: {
          dark: "#2b2b2b",
          light: "editorGroup.border",
          hcDark: "contrastBorder",
          hcLight: "contrastBorder",
        },
      },
      {
        id: "ai1.activitySelectionBackground",
        description: "Background of a selected activity button.",
        defaults: { dark: "#ffffff22", light: "#00000014", hcDark: "#00000000", hcLight: "#00000000" },
      },
      {
        id: "ai1.activityHoverBackground",
        description: "Background of an activity button under the pointer.",
        defaults: { dark: "#ffffff11", light: "#0000000a", hcDark: "#00000000", hcLight: "#00000000" },
      },
    );
  }
}
