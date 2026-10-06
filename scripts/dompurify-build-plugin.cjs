const path = require("node:path");
const fs = require("node:fs");

function dompurifyBuildPlugin(sanitizerPath, onTransform) {
  sanitizerPath = path.resolve(sanitizerPath);
  return {
    name: "ai1-monaco-dompurify",
    setup(build) {
      build.onLoad(
        {
          filter:
            /[\\/]@theia[\\/]monaco-editor-core[\\/]esm[\\/]vs[\\/]base[\\/]browser[\\/]dompurify[\\/]dompurify\.js$/,
        },
        (args) => {
          const relative = path.relative(path.dirname(args.path), sanitizerPath).split(path.sep).join("/");
          const specifier = relative.startsWith("../") ? relative : `./${relative}`;
          const contents = `import createDOMPurify from ${JSON.stringify(specifier)};\nexport default createDOMPurify();`;
          if (onTransform)
            onTransform({
              path: args.path,
              original: fs.readFileSync(args.path),
              contents,
              replacementPath: sanitizerPath,
              replacement: fs.readFileSync(sanitizerPath),
            });
          return { contents, loader: "js", resolveDir: path.dirname(args.path) };
        },
      );
    },
  };
}

module.exports = { dompurifyBuildPlugin };
