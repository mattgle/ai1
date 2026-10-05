const path = require("node:path");

function dompurifyBuildPlugin(sanitizerPath) {
  return {
    name: "ai1-monaco-dompurify",
    setup(build) {
      build.onLoad(
        {
          filter:
            /[\\/]@theia[\\/]monaco-editor-core[\\/]esm[\\/]vs[\\/]base[\\/]browser[\\/]dompurify[\\/]dompurify\.js$/,
        },
        () => ({
          contents: `import createDOMPurify from ${JSON.stringify(sanitizerPath)};
          export default createDOMPurify();`,
          loader: "js",
          resolveDir: path.dirname(sanitizerPath),
        }),
      );
    },
  };
}

module.exports = { dompurifyBuildPlugin };
