import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";

const application =
  process.env.AI1_PACKAGED_RESOURCES ?? path.resolve(__dirname, "../../applications/electron");

test("app build evidence matches the generated output bytes without local absolute paths", () => {
  const text = fs.readFileSync(path.join(application, "resources/release/build-inputs.json"), "utf8");
  expect(text).not.toContain("/Users/");
  expect(text).not.toContain("/private/var/");
  const report = JSON.parse(text) as {
    schemaVersion: number;
    builds: { name: string; outputs: { path: string; bytes: number; sha256: string }[] }[];
  };
  expect(report.schemaVersion).toBe(1);
  expect(report.builds.map((build) => build.name)).toEqual(["browser", "node", "electron"]);
  for (const build of report.builds) {
    expect(build.outputs.length).toBeGreaterThan(0);
    for (const output of build.outputs) {
      expect(output.path).toMatch(/^applications\/electron\//);
      const relative = output.path.slice("applications/electron/".length);
      expect(relative.split("/")).not.toContain("..");
      const bytes = fs.readFileSync(path.join(application, relative));
      expect(bytes.length, output.path).toBe(output.bytes);
      expect(createHash("sha256").update(bytes).digest("hex"), output.path).toBe(output.sha256);
    }
  }
});

test("app preserves the complete pinned Theia upstream notice", () => {
  const bytes = fs.readFileSync(path.join(application, "resources/third-party/theia/NOTICE.md"));
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(
    "9911a1d6c0777777f94c100c1760f85a313f7fe15b95c4a66e552a74b60a7d5d",
  );
});

test("app preserves the pinned TypeScript license and third-party notices", () => {
  for (const [name, hash] of [
    ["LICENSE.txt", "a7d00bfd54525bc694b6e32f64c7ebcf5e6b7ae3657be5cc12767bce74654a47"],
    ["NOTICE-TypeScript.txt", "1af3c68039c57e539422da82a4faada506ce6d0ea6f90e0b699d02dbcdb7a90c"],
  ]) {
    const bytes = fs.readFileSync(path.join(application, "resources/third-party/typescript", name));
    expect(createHash("sha256").update(bytes).digest("hex"), name).toBe(hash);
  }
});

test("app preserves every prepared license asset and exact package mapping", () => {
  const directory = path.join(application, "resources/third-party");
  const config = JSON.parse(fs.readFileSync(path.join(directory, "supplements.json"), "utf8")) as {
    sources: Record<string, { download?: boolean; text: string; sha256: string }>;
    packages: { name: string; version: string; source: string }[];
  };
  const manifest = JSON.parse(
    fs.readFileSync(path.join(application, "resources/notices/manifest.json"), "utf8"),
  ) as {
    packages: { name: string; version: string; notices: string[]; licenseSupplement?: { sha256: string } }[];
  };
  for (const [id, source] of Object.entries(config.sources)) {
    if (!source.download) continue;
    const bytes = fs.readFileSync(path.join(directory, source.text));
    expect(createHash("sha256").update(bytes).digest("hex"), id).toBe(source.sha256);
    for (const entry of config.packages.filter((entry) => entry.source === id)) {
      const packages = manifest.packages.filter(
        (item) => item.name === entry.name && item.version === entry.version,
      );
      expect(packages.length, entry.name).toBeGreaterThan(0);
      for (const item of packages.filter((item) => item.licenseSupplement)) {
        expect(item.licenseSupplement?.sha256, entry.name).toBe(source.sha256);
        expect(
          item.notices.some((notice) => notice.endsWith(source.text)),
          entry.name,
        ).toBe(true);
      }
    }
  }
});
