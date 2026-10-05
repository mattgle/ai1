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
