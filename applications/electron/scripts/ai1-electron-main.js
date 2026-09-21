// Entry point of the Electron app. It tells Theia where the bundled VS Code
// extensions and the Material icon files are, then it starts the generated
// Theia main module. Both folders have the same relative position in
// development and in the packaged app.
const path = require("path");

process.env.THEIA_DEFAULT_PLUGINS = `local-dir:${path.resolve(__dirname, "..", "plugins")}`;
process.env.AI1_MATERIAL_ICONS_DIR = path.resolve(__dirname, "..", "resources", "material-icons");

require("../lib/backend/electron-main.js");
