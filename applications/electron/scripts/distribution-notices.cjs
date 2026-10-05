module.exports = async function afterPack(context) {
  const path = require("node:path");
  const root = path.resolve(__dirname, "../../..");
  const { generateDistributionNotices } = await import(path.join(root, "scripts/distribution-notices.mjs"));
  const app =
    context.electronPlatformName === "darwin"
      ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, "Contents")
      : context.appOutDir;
  const resources = path.join(
    app,
    context.electronPlatformName === "darwin" ? "Resources" : "resources",
    "app",
    "resources",
    "notices",
  );
  const manifest = generateDistributionNotices(
    app,
    resources,
    undefined,
    path.join(path.dirname(resources), "third-party", "supplements.json"),
  );
  console.log(
    `Distribution notices: ${manifest.notices.length} files; ${manifest.unresolved.length} entries require review.`,
  );
};
