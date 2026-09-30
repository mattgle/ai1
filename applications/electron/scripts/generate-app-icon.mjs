import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";

const branding = fileURLToPath(new URL("../resources/branding/", import.meta.url));
const temporary = await mkdtemp(path.join(os.tmpdir(), "ai1-icon-"));
const iconset = path.join(temporary, "AI1.iconset");

try {
  execFileSync(
    "xcrun",
    ["swift", fileURLToPath(new URL("./render-app-icons.swift", import.meta.url)), branding],
    {
      stdio: "inherit",
    },
  );
  await mkdir(iconset);
  for (const size of [16, 32, 128, 256, 512]) {
    for (const scale of [1, 2]) {
      const pixels = String(size * scale);
      const name = `icon_${size}x${size}${scale === 2 ? "@2x" : ""}.png`;
      execFileSync(
        "sips",
        ["-z", pixels, pixels, path.join(branding, "icon-dark.png"), "--out", path.join(iconset, name)],
        { stdio: "pipe" },
      );
    }
  }
  const output = path.join(branding, "AI1.icns");
  execFileSync("iconutil", ["-c", "icns", iconset, "-o", output], { stdio: "inherit" });
  console.log(`App icon: ${output}`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
