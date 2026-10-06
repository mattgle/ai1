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

test("language-server supplements preserve the source license and extension notice bytes", () => {
  const license = fs.readFileSync(
    path.join(application, "resources/third-party/generated/vscode-language-servers/LICENSE.txt"),
  );
  expect(createHash("sha256").update(license).digest("hex")).toBe(
    "9480271317925265e806a9a196aaa33410a962fa9d4d1e248a4a5187bc8c9df9",
  );
  for (const name of ["css", "html", "json"]) {
    const folder = path.join(application, `plugins/vscode.${name}-language-features/extension`);
    const extension = JSON.parse(fs.readFileSync(path.join(folder, "package.json"), "utf8"));
    expect(extension.version).toBe("1.95.3");
    const notice = fs.readFileSync(path.join(folder, "LICENSE-vscode.txt"));
    expect(createHash("sha256").update(notice).digest("hex")).toBe(
      "cce33203a80863c22499035b1cfb6aba5df5f02e4ea2669cf5bc5730c1864236",
    );
    expect(notice.toString().replace(/\r\n/g, "\n")).toBe(license.toString());
  }
});
