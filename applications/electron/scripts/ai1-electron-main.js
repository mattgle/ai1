// Entry point of the Electron app. It tells Theia where the bundled VS Code
// extensions and the Material icon files are, then it starts the generated
// Theia main module. Both folders have the same relative position in
// development and in the packaged app.
const path = require("path");
const { app, systemPreferences } = require("electron");

process.env.THEIA_DEFAULT_PLUGINS = `local-dir:${path.resolve(__dirname, "..", "plugins")}`;
process.env.AI1_MATERIAL_ICONS_DIR = path.resolve(__dirname, "..", "resources", "material-icons");

if (process.platform === "darwin") {
  app.whenReady().then(() => {
    const updateDockIcon = () => {
      // Read macOS appearance because Theia sets Electron's theme from the editor.
      const dark = systemPreferences.getUserDefault("AppleInterfaceStyle", "string") === "Dark";
      app.dock.setIcon(
        path.resolve(__dirname, "..", "resources", "branding", `icon-${dark ? "dark" : "light"}.png`),
      );
    };
    updateDockIcon();
    const subscription = systemPreferences.subscribeNotification(
      "AppleInterfaceThemeChangedNotification",
      updateDockIcon,
    );
    app.once("will-quit", () => systemPreferences.unsubscribeNotification(subscription));
  });
}

require("../lib/backend/electron-main.js");
