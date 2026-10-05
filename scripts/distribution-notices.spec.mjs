import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { generateDistributionNotices } from "./distribution-notices.mjs";
import { createHash } from "node:crypto";
import { URL } from "node:url";

test("all checked-in license supplements preserve their reviewed source bytes", () => {
  const resources = new URL("../applications/electron/resources/third-party/", import.meta.url);
  const config = JSON.parse(fs.readFileSync(new URL("supplements.json", resources), "utf8"));
  for (const [id, source] of Object.entries(config.sources)) {
    const actual = createHash("sha256")
      .update(fs.readFileSync(new URL(source.text, resources)))
      .digest("hex");
    assert.equal(actual, source.sha256, id);
  }
});

test("Theia supplements keep the pinned EPL bytes and source statement", () => {
  const resources = new URL("../applications/electron/resources/third-party/", import.meta.url);
  const config = JSON.parse(fs.readFileSync(new URL("supplements.json", resources), "utf8"));
  const entries = config.packages.filter((entry) => entry.name.startsWith("@theia/"));
  assert.equal(entries.length, 41);
  for (const entry of entries) {
    assert.equal(entry.version, "1.75.0");
    const source = config.sources[entry.source];
    assert.equal(source.revision, "52f32db6e32d1f88dbbbbde08c8a01ad75c53e11");
    assert.equal(source.text, "theia/LICENSE-EPL");
    assert.equal(source.sha256, "8c349f80764d0648e645f41ef23772a70c995a0924b5235f735f4a3d09df127c");
    assert.equal(
      createHash("sha256")
        .update(fs.readFileSync(new URL(source.text, resources)))
        .digest("hex"),
      source.sha256,
    );
    const legacy = entry.name === "@theia/notebook" || entry.name === "@theia/test";
    assert.equal(
      source.license,
      legacy
        ? "EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0"
        : "EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0",
    );
  }
  const statement = fs.readFileSync(new URL("theia/SOURCE.txt", resources), "utf8");
  assert.match(statement, /source code is available under the Eclipse Public\nLicense 2\.0/);
  assert.match(statement, /archive\/52f32db6e32d1f88dbbbbde08c8a01ad75c53e11\.tar\.gz/);
  assert.match(statement, /does not complete the source-duty review/);
});

test("notices preserve text bytes and use only relative paths", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-notices-"));
  try {
    const payload = path.join(root, "app");
    const dependency = path.join(payload, "node_modules/example");
    fs.mkdirSync(dependency, { recursive: true });
    fs.writeFileSync(
      path.join(dependency, "package.json"),
      JSON.stringify({ name: "example", version: "1.0.0", license: "MIT" }),
    );
    fs.writeFileSync(path.join(dependency, "LICENSE"), "Original copyright\r\nOriginal license\r\n");
    const own = path.join(root, "LICENSE");
    fs.writeFileSync(own, "AI1 license\n");
    const output = path.join(payload, "notices");
    const manifest = generateDistributionNotices(payload, output, own);
    assert.equal(manifest.packages.length, 1);
    assert.equal(manifest.unresolved.length, 0);
    assert.equal(JSON.stringify(manifest).includes(root), false);
    assert.equal(
      fs.readFileSync(path.join(output, manifest.notices[0].text), "utf8"),
      "Original copyright\r\nOriginal license\r\n",
    );
    assert.deepEqual(generateDistributionNotices(payload, output, own), manifest);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("missing metadata and notice texts stay unresolved", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-notices-"));
  try {
    const payload = path.join(root, "app");
    fs.mkdirSync(payload);
    fs.writeFileSync(
      path.join(payload, "package.json"),
      JSON.stringify({ name: "example", version: "1.0.0" }),
    );
    const own = path.join(root, "LICENSE");
    fs.writeFileSync(own, "AI1 license\n");
    const manifest = generateDistributionNotices(payload, path.join(root, "notices"), own);
    assert.equal(manifest.unresolved.length, 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("internal module folders use license evidence from the exact same package", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-notices-parent-"));
  try {
    const payload = path.join(root, "app");
    const folder = path.join(payload, "node_modules/example");
    for (const relative of ["build/esm", "build/other", "node_modules/example"]) {
      const child = path.join(folder, relative);
      fs.mkdirSync(child, { recursive: true });
      fs.writeFileSync(
        path.join(child, "package.json"),
        JSON.stringify({ name: relative === "build/other" ? "other" : "example", version: "1.0.0" }),
      );
    }
    fs.writeFileSync(
      path.join(folder, "package.json"),
      JSON.stringify({ name: "example", version: "1.0.0", license: "MIT" }),
    );
    fs.writeFileSync(path.join(folder, "LICENSE"), "Original license\n");
    const own = path.join(root, "LICENSE");
    fs.writeFileSync(own, "AI1 license\n");
    const manifest = generateDistributionNotices(payload, path.join(root, "notices"), own);
    const internal = manifest.packages.find((entry) => entry.path.includes("build/esm"));
    assert.equal(internal.license, "MIT");
    assert.equal(internal.parentPackage, "node_modules/example/package.json");
    assert.deepEqual(internal.notices, ["node_modules/example/LICENSE"]);
    assert.equal(manifest.unresolved.filter((entry) => entry.path.includes("build/esm")).length, 0);
    assert.equal(manifest.unresolved.filter((entry) => entry.path.includes("build/other")).length, 2);
    assert.equal(
      manifest.unresolved.filter((entry) => entry.path.includes("node_modules/example/node_modules")).length,
      2,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function supplementFixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-notice-supplement-"));
  try {
    const payload = path.join(root, "app");
    const folder = path.join(payload, "node_modules/example");
    const resources = path.join(payload, "resources/third-party");
    fs.mkdirSync(folder, { recursive: true });
    fs.mkdirSync(resources, { recursive: true });
    fs.writeFileSync(
      path.join(folder, "package.json"),
      JSON.stringify({ name: "example", version: "1.0.0", license: "BSD-3-Clause" }),
    );
    const bytes = "Original upstream copyright\r\nOriginal license\r\n";
    fs.writeFileSync(path.join(resources, "LICENSE.txt"), bytes);
    const own = path.join(root, "LICENSE");
    fs.writeFileSync(own, "AI1 license\n");
    const config = {
      schemaVersion: 1,
      sources: {
        reviewed: {
          license: "BSD-3-Clause",
          text: "LICENSE.txt",
          sha256: createHash("sha256").update(bytes).digest("hex"),
          revision: "a".repeat(40),
          url: `https://example.invalid/${"a".repeat(40)}/LICENSE`,
        },
      },
      packages: [{ name: "example", version: "1.0.0", source: "reviewed" }],
    };
    const supplementFile = path.join(resources, "supplements.json");
    const output = path.join(payload, "resources/notices");
    const generate = () => {
      fs.writeFileSync(supplementFile, JSON.stringify(config));
      return generateDistributionNotices(payload, output, own, supplementFile);
    };
    run({ root, payload, resources, bytes, config, output, generate });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("reviewed supplements preserve upstream bytes and record exact version evidence", () => {
  supplementFixture(({ bytes, output, generate }) => {
    const manifest = generate();
    assert.equal(manifest.unresolved.length, 0);
    assert.deepEqual(manifest.packages[0].notices, ["resources/third-party/LICENSE.txt"]);
    assert.equal(manifest.packages[0].licenseSupplement.revision, "a".repeat(40));
    const notice = manifest.notices.find((entry) => entry.path === "resources/third-party/LICENSE.txt");
    assert.equal(fs.readFileSync(path.join(output, notice.text), "utf8"), bytes);
    assert.deepEqual(generate(), manifest);
  });
});

test("unreviewed package names, versions, and licenses stay unresolved", () => {
  for (const field of ["name", "version", "license"]) {
    supplementFixture(({ config, generate }) => {
      if (field === "license") config.sources.reviewed.license = "MIT";
      else config.packages[0][field] = "unreviewed";
      assert.equal(generate().unresolved.length, 1);
    });
  }
});

test("supplements reject changed license bytes and duplicate review entries", () => {
  supplementFixture(({ resources, generate }) => {
    fs.writeFileSync(path.join(resources, "LICENSE.txt"), "Changed text");
    assert.throws(generate, /hash mismatch/);
  });
  supplementFixture(({ config, generate }) => {
    config.packages.push({ ...config.packages[0] });
    assert.throws(generate, /Duplicate license supplement/);
  });
});

test("supplements reject paths and links outside the app and generated output", () => {
  for (const linked of [false, true]) {
    supplementFixture(({ root, resources, config, generate }) => {
      const external = path.join(root, "LICENSE.txt");
      fs.copyFileSync(path.join(resources, "LICENSE.txt"), external);
      if (linked) fs.symlinkSync(external, path.join(resources, "linked-LICENSE.txt"));
      config.sources.reviewed.text = linked ? "linked-LICENSE.txt" : "../../../LICENSE.txt";
      assert.throws(generate, /escapes the app payload/);
    });
  }
  supplementFixture(({ output, resources, config, generate }) => {
    fs.mkdirSync(output, { recursive: true });
    fs.copyFileSync(path.join(resources, "LICENSE.txt"), path.join(output, "LICENSE.txt"));
    config.sources.reviewed.text = "../notices/LICENSE.txt";
    assert.throws(generate, /generated notice output/);
  });
});
