// Entry point of the Electron app. It tells Theia where the bundled VS Code
// extensions are, then it starts the generated Theia main module. The plugins
// folder has the same relative position in development and in the packaged app.
const path = require("path");

process.env.THEIA_DEFAULT_PLUGINS = `local-dir:${path.resolve(__dirname, "..", "plugins")}`;

require("../lib/backend/electron-main.js");
