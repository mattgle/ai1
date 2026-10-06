module.exports = async function afterPack(context) {
  const path = require("node:path");
  const root = path.resolve(__dirname, "../../..");
  const fs = require("node:fs");
  const { Arch } = require("builder-util");
  const { preparePackagedFfmpeg } = await import(path.join(root, "scripts/prepare-packaged-ffmpeg.mjs"));
  const { prepareElectronNotices } = await import(path.join(root, "scripts/prepare-electron-notices.mjs"));
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
  const ffmpeg = await preparePackagedFfmpeg({
    appRoot: app,
    platform: context.electronPlatformName,
    arch: Arch[context.arch],
    electronVersion: context.packager.config.electronVersion,
  });
  const release = path.join(path.dirname(resources), "release");
  fs.mkdirSync(release, { recursive: true });
  fs.writeFileSync(path.join(release, "ffmpeg.json"), JSON.stringify(ffmpeg, null, 2) + "\n");
  console.log(`Packaged FFmpeg: ${ffmpeg.library.codecs.length} codecs; H.264 and AAC are absent.`);
  const runtimeNotices = prepareElectronNotices({
    payload: path.dirname(path.dirname(resources)),
    electronVersion: context.packager.config.electronVersion,
  });
  fs.writeFileSync(
    path.join(release, "electron-notices.json"),
    JSON.stringify(runtimeNotices, null, 2) + "\n",
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
