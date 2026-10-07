import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { expect, test } from "@playwright/test";

const application =
  process.env.AI1_PACKAGED_RESOURCES ?? path.resolve(__dirname, "../../applications/electron");

test("packaging excludes only unused Fast URI benchmarks and retains the runtime license", () => {
  test.skip(!process.env.AI1_PACKAGED_RESOURCES, "This check requires a packaged dependency tree.");
  const require = createRequire(path.join(application, "package.json"));
  const directory = path.dirname(require.resolve("fast-uri/package.json"));
  expect(fs.existsSync(path.join(directory, "benchmark"))).toBe(false);
  expect(fs.statSync(path.join(directory, "index.js")).isFile()).toBe(true);
  expect(fs.readFileSync(path.join(directory, "LICENSE"), "utf8")).toContain("The Fastify team");
  const uri = require("fast-uri") as { parse: (value: string) => { host?: string } };
  expect(uri.parse("https://example.invalid/path").host).toBe("example.invalid");
  const report = JSON.parse(
    fs.readFileSync(path.join(application, "resources/release/build-inputs.json"), "utf8"),
  ) as {
    builds: { inputs: { path: string }[] }[];
  };
  for (const build of report.builds)
    expect(build.inputs.filter((input) => input.path.includes("/fast-uri/benchmark/"))).toEqual([]);
});

test("the signed packaged runtime excludes H.264 and AAC", () => {
  test.skip(!process.env.AI1_PACKAGED_RESOURCES, "This check requires a packaged runtime.");
  const report = JSON.parse(
    fs.readFileSync(path.join(application, "resources/release/ffmpeg.json"), "utf8"),
  ) as {
    schemaVersion: number;
    electronVersion: string;
    platform: string;
    arch: string;
    source: { file: string; sha256: string; url: string };
    library: { path: string; codecs: string[]; sha256: string; bytes: number };
    scope: string;
  };
  expect(report.schemaVersion).toBe(1);
  expect(report.electronVersion).toBe("42.11.8");
  expect(report.platform).toBe(process.platform);
  expect(report.arch).toBe(process.arch);
  const archive = `ffmpeg-v42.11.8-${process.platform}-${process.arch}.zip`;
  expect(report.source.file).toBe(archive);
  expect(report.source.url).toBe(
    `https://github.com/electron/electron/releases/download/v42.11.8/${archive}`,
  );
  expect(report.source.sha256).toBe(
    process.platform === "darwin"
      ? "ac0ee66fa9416ff93b06124a2ea89868b393d1388276ce963a9706889c142a21"
      : "c6585e86f3980291c1b598a47c338439ea400bce5f5198149f9706962caa4b7b",
  );
  expect(report.library.path).toBe(
    process.platform === "darwin"
      ? "Frameworks/Electron Framework.framework/Libraries/libffmpeg.dylib"
      : "libffmpeg.so",
  );
  const inspect = createRequire(__filename)("@theia/ffmpeg").getFfmpegCodecs as (
    file: string,
  ) => { name: string }[];
  const names = inspect(path.resolve(application, "../..", report.library.path))
    .map((codec) => codec.name.toLowerCase())
    .sort();
  expect(names.length).toBeGreaterThan(0);
  expect(names).not.toContain("h264");
  expect(names).not.toContain("aac");
  expect(names).toEqual(report.library.codecs);
  expect(report.library.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(report.library.bytes).toBeGreaterThan(0);
  expect(report.scope).toContain("before signing");
});

test("packaged runtime notices preserve the complete Electron, Chromium, and FFmpeg texts", () => {
  test.skip(!process.env.AI1_PACKAGED_RESOURCES, "This check requires packaged runtime notices.");
  const report = JSON.parse(
    fs.readFileSync(path.join(application, "resources/release/electron-notices.json"), "utf8"),
  ) as {
    schemaVersion: number;
    electronVersion: string;
    notices: { path: string; bytes: number; sha256: string }[];
  };
  const manifest = JSON.parse(
    fs.readFileSync(path.join(application, "resources/notices/manifest.json"), "utf8"),
  ) as {
    notices: { path: string; text: string; sha256: string }[];
  };
  expect(report.schemaVersion).toBe(1);
  expect(report.electronVersion).toBe("42.11.8");
  expect(report.notices).toHaveLength(2);
  for (const [name, checksum, length] of [
    ["LICENSE", "5154e165bd6c2cc0cfbcd8916498c7abab0497923bafcd5cb07673fe8480087d", 1096],
    ["LICENSES.chromium.html", "ca0a3f71df977796bf39a99472783c1ce9378bf4d8f4142a95048c3843980415", 20008860],
  ] as const) {
    const file = `resources/third-party/electron/${name}`;
    const entry = report.notices.find((notice) => notice.path === file);
    expect(entry?.sha256).toBe(checksum);
    expect(entry?.bytes).toBe(length);
    const bytes = fs.readFileSync(path.join(application, file));
    expect(bytes.length).toBe(length);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(checksum);
    const notice = manifest.notices.find((notice) => notice.path.endsWith("/" + file));
    expect(notice?.sha256).toBe(checksum);
    expect(fs.readFileSync(path.join(application, "resources/notices", notice!.text)).equals(bytes)).toBe(
      true,
    );
    if (name === "LICENSES.chromium.html") {
      const block = bytes
        .toString()
        .match(/<span class="title">ffmpeg<\/span>[\s\S]*?<pre>([\s\S]*?)<\/pre>/);
      expect(block).not.toBeNull();
      const decode = createRequire(__filename)("entities").decodeHTML as (value: string) => string;
      expect(createHash("sha256").update(decode(block![1])).digest("hex")).toBe(
        "a4f057d42d8a93077a37d2381a8ebf47e9e0ce2a80336d6ba1534767634ce0d1",
      );
    }
  }
});

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

test("build evidence retains input source hashes and the fixed backend proxy dependency", () => {
  const report = JSON.parse(
    fs.readFileSync(path.join(application, "resources/release/build-inputs.json"), "utf8"),
  ) as {
    sourceHashScope: string;
    builds: {
      name: string;
      inputs: {
        path: string;
        package?: { name: string; version: string };
        source: { status: string; bytes?: number; sha256?: string; reason?: string };
      }[];
      outputs: { inputs: { path: string; bytesInOutput: number }[] }[];
    }[];
  };
  expect(report.sourceHashScope).toContain("report time");
  for (const build of report.builds) {
    for (const input of build.inputs) {
      expect(["on-disk", "not-captured"]).toContain(input.source.status);
      if (input.source.status === "on-disk") {
        expect(input.source.sha256).toMatch(/^[a-f0-9]{64}$/);
        expect(input.source.bytes).toBeGreaterThanOrEqual(0);
      } else {
        expect(input.path).toMatch(/^virtual\//);
        expect(input.source.reason).toContain("Virtual input");
        expect(input.source.sha256).toBeUndefined();
      }
    }
  }
  const backend = report.builds.find((build) => build.name === "node")!;
  const proxy = backend.inputs.find((input) => input.path === "node_modules/proxy-addr/index.js")!;
  expect(proxy.package?.version).toBe("2.0.8");
  expect(
    backend.outputs.some((output) =>
      output.inputs.some((input) => input.path === proxy.path && input.bytesInOutput > 0),
    ),
  ).toBe(true);
  if (process.env.AI1_PACKAGED_RESOURCES) {
    const bytes = fs.readFileSync(path.join(application, proxy.path));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(proxy.source.sha256);
    expect(bytes.length).toBe(proxy.source.bytes);
  }
});

test("build evidence captures polyfill and native plugin results separately from disk sources", () => {
  const report = JSON.parse(
    fs.readFileSync(path.join(application, "resources/release/build-inputs.json"), "utf8"),
  ) as {
    loadedSourceScope: string;
    builds: {
      name: string;
      inputs: {
        path: string;
        bytes: number;
        source: { status: string; sha256?: string };
        loadedSource: {
          status: string;
          bytes: number;
          sha256: string;
          plugin?: string;
          generator?: { path: string; sha256: string };
          dependencyScope?: string;
        };
      }[];
    }[];
  };
  expect(report.loadedSourceScope).toContain("nested generator dependencies");
  const browser = report.builds.find((build) => build.name === "browser")!;
  const polyfills = browser.inputs.filter((input) => input.path.startsWith("virtual/node-modules-polyfills"));
  expect(polyfills.length).toBeGreaterThan(0);
  const backend = report.builds.find((build) => build.name === "node")!;
  const wrappers = backend.inputs.filter((input) => input.path.startsWith("virtual/node-file/"));
  expect(wrappers.length).toBeGreaterThan(0);
  for (const [inputs, plugin, generator] of [
    [polyfills, "node-modules-polyfills", "node_modules/esbuild-plugins-node-modules-polyfill/dist/index.js"],
    [wrappers, "@theia/esbuild-plugin", "node_modules/@theia/bundle-plugin/lib/esbuild-plugin.js"],
  ] as const) {
    for (const input of inputs) {
      expect(input.loadedSource.status, input.path).toBe("captured-plugin-load");
      expect(input.loadedSource.bytes, input.path).toBe(input.bytes);
      expect(input.loadedSource.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(input.loadedSource.plugin).toBe(plugin);
      expect(input.loadedSource.generator?.path).toBe(generator);
      expect(input.loadedSource.generator?.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(input.loadedSource.dependencyScope).toContain("not captured");
    }
  }
  // Native wrapper JavaScript and the referenced native binary have separate hashes.
  for (const input of wrappers) {
    expect(input.source.status).toBe("on-disk");
    expect(input.loadedSource.sha256).not.toBe(input.source.sha256);
  }
  for (const file of [
    "bindings/bindings.js",
    "@stroncium/procfs/lib/parsers.js",
    "node-pty/lib/utils.js",
    "@vscode/ripgrep/lib/index.js",
  ]) {
    const input = backend.inputs.find((candidate) => candidate.path === `node_modules/${file}`)!;
    expect(input.loadedSource.status, file).toBe("captured-plugin-load");
    expect(input.loadedSource.sha256, file).not.toBe(input.source.sha256);
  }
});

test("packaged MCP uses the compatible fixed SDK without removing the Theia extension", () => {
  test.skip(!process.env.AI1_PACKAGED_RESOURCES, "This check requires a packaged dependency tree.");
  const sdk = JSON.parse(
    fs.readFileSync(path.join(application, "node_modules/@modelcontextprotocol/sdk/package.json"), "utf8"),
  ) as { version: string };
  expect(sdk.version).toBe("1.31.0");
  const startup = fs.readFileSync(path.join(application, "src-gen/backend/server.js"), "utf8");
  expect(startup).toContain("@theia/ai-mcp/lib/node/mcp-backend-module");
});

test("app preserves the complete pinned Theia upstream notice", () => {
  const bytes = fs.readFileSync(path.join(application, "resources/third-party/theia/NOTICE.md"));
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(
    "9911a1d6c0777777f94c100c1760f85a313f7fe15b95c4a66e552a74b60a7d5d",
  );
});

test("the copied File Icons font retains its exact source bytes and ISC notice", () => {
  const directory = path.join(application, "resources/third-party");
  const fonts = JSON.parse(fs.readFileSync(path.join(directory, "font-sources.json"), "utf8")) as {
    schemaVersion: number;
    fonts: {
      package: string;
      version: string;
      path: string;
      sha256: string;
      revision: string;
      url: string;
      licenseSource: string;
    }[];
  };
  const supplements = JSON.parse(fs.readFileSync(path.join(directory, "supplements.json"), "utf8")) as {
    sources: Record<string, { text: string; license: string; revision: string; sha256: string }>;
  };
  expect(fonts.schemaVersion).toBe(1);
  expect(fonts.fonts).toHaveLength(1);
  const font = fonts.fonts[0];
  expect(font.package).toBe("file-icons-js");
  expect(font.version).toBe("1.0.3");
  expect(font.path).toBe("node_modules/file-icons-js/fonts/file-icons.woff2");
  expect(font.sha256).toBe("6f75c29f3206c61d1c3217f31693e8c071578a30f4c832a476ae951d51ec48ae");
  expect(font.revision).toBe("1733e5a1db30ae00d63a285676b0c51d12262033");
  expect(font.url).toContain(`/${font.revision}/dist/file-icons.woff2`);
  const bytes = fs.readFileSync(path.join(application, font.path));
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(font.sha256);
  const source = supplements.sources[font.licenseSource];
  expect(source.license).toBe("ISC");
  expect(source.revision).toBe(font.revision);
  expect(source.sha256).toBe("1ab89e3af343bb0239ce4ca74802e335b33b0181569f753bddb7a7534e09396e");
  const notice = fs.readFileSync(path.join(directory, source.text));
  expect(createHash("sha256").update(notice).digest("hex")).toBe(source.sha256);
  expect(notice.toString()).toContain("Copyright (c) 2016, John Gardner");
});

test("Codicons retains its unchanged font, attribution, and complete upstream legal notices", () => {
  const directory = path.join(application, "resources/third-party");
  const readme = fs.readFileSync(path.join(directory, "generated/codicons/NOTICE-README.md"));
  expect(createHash("sha256").update(readme).digest("hex")).toBe(
    "940627a4abfb7b8616b495fbdda353ea4401b154c890b1327b7e180dddf69294",
  );
  expect(readme.toString()).toContain(
    "The licenses for this project do not grant you rights to use any Microsoft names, logos, or trademarks.",
  );
  const attribution = fs.readFileSync(path.join(directory, "NOTICE-ATTRIBUTION.md"), "utf8");
  expect(attribution).toContain("Microsoft Corporation and its contributors");
  expect(attribution).toContain("https://creativecommons.org/licenses/by/4.0/legalcode");
  expect(attribution).toContain("does not claim endorsement");
  const font = fs.readFileSync(path.join(application, "node_modules/@vscode/codicons/dist/codicon.ttf"));
  expect(createHash("sha256").update(font).digest("hex")).toBe(
    "2bb558cb693451e73c28c33fe64aa89bc19b1a4b70f95948322c243f93476920",
  );
  for (const file of ["LICENSE", "LICENSE-CODE"])
    expect(fs.statSync(path.join(application, "node_modules/@vscode/codicons", file)).isFile()).toBe(true);
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

test("copied material icons match the shipped package and retain its license", () => {
  const source = path.join(application, "node_modules/material-icon-theme");
  const copied = path.join(application, "resources/material-icons");
  const files = (directory: string): string[] =>
    fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const file = path.join(directory, entry.name);
      expect(entry.isSymbolicLink(), file).toBe(false);
      return entry.isDirectory() ? files(file) : [file];
    });
  const sourceFiles = [path.join(source, "dist/material-icons.json"), ...files(path.join(source, "icons"))];
  const relative = sourceFiles.map((file) => path.relative(source, file)).sort();
  expect(
    files(copied)
      .map((file) => path.relative(copied, file))
      .sort(),
  ).toEqual(relative);
  expect(relative).toHaveLength(1252);
  for (const file of relative)
    expect(
      fs.readFileSync(path.join(copied, file)).equals(fs.readFileSync(path.join(source, file))),
      file,
    ).toBe(true);
  const metadata = JSON.parse(fs.readFileSync(path.join(source, "package.json"), "utf8"));
  expect(metadata.version).toBe("5.38.1");
  expect(metadata.license).toBe("MIT");
  const license = fs.readFileSync(path.join(source, "LICENSE"));
  const hash = createHash("sha256").update(license).digest("hex");
  expect(hash).toBe("cdab3014d4f69b49dde2b85e81792208c72de613aa6aed7f7a9b5c6609b89670");
  const manifest = JSON.parse(
    fs.readFileSync(path.join(application, "resources/notices/manifest.json"), "utf8"),
  ) as {
    notices: { path: string; sha256: string; text: string }[];
  };
  const notice = manifest.notices.find((entry) =>
    entry.path.endsWith("/node_modules/material-icon-theme/LICENSE"),
  );
  expect(notice?.sha256).toBe(hash);
  expect(fs.readFileSync(path.join(application, "resources/notices", notice!.text)).equals(license)).toBe(
    true,
  );
});

test("Monaco sanitizer evidence preserves the exact replacement module and selected source hashes", () => {
  type Evidence = {
    path: string;
    original: { bytes: number; sha256: string };
    transformed: { bytes: number; sha256: string; contents: string };
    replacement: { path: string; bytes: number; sha256: string; package: { name: string; version: string } };
  };
  const report = JSON.parse(
    fs.readFileSync(path.join(application, "resources/release/build-inputs.json"), "utf8"),
  ) as {
    builds: {
      name: string;
      transformations: Evidence[];
      inputs: { path: string; bytes: number }[];
      outputs: { inputs: { path: string; bytesInOutput: number }[] }[];
    }[];
  };
  const browser = report.builds.find((build) => build.name === "browser")!;
  expect(browser.transformations).toHaveLength(1);
  for (const build of report.builds.filter((build) => build.name !== "browser"))
    expect(build.transformations).toEqual([]);
  const record = browser.transformations[0];
  expect(record.path).toBe(
    "node_modules/@theia/monaco-editor-core/esm/vs/base/browser/dompurify/dompurify.js",
  );
  expect(record.replacement.path).toBe("node_modules/dompurify/dist/purify.cjs.js");
  expect(record.replacement.package.name).toBe("dompurify");
  expect(record.replacement.package.version).toBe("3.4.16");
  for (const [file, evidence] of [
    [record.path, record.original],
    [record.replacement.path, record.replacement],
  ] as const) {
    const bytes = fs.readFileSync(path.join(application, file));
    expect(bytes.length).toBe(evidence.bytes);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(evidence.sha256);
    expect(
      browser.outputs.some((output) =>
        output.inputs.some((input) => input.path === file && input.bytesInOutput > 0),
      ),
    ).toBe(true);
  }
  const relative = path.posix.relative(path.posix.dirname(record.path), record.replacement.path);
  expect(record.transformed.contents).toBe(
    `import createDOMPurify from ${JSON.stringify(relative)};\nexport default createDOMPurify();`,
  );
  const transformed = Buffer.from(record.transformed.contents);
  expect(transformed.length).toBe(record.transformed.bytes);
  expect(createHash("sha256").update(transformed).digest("hex")).toBe(record.transformed.sha256);
  expect(browser.inputs.find((input) => input.path === record.path)?.bytes).toBe(transformed.length);
});
