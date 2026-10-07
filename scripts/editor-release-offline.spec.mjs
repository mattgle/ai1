import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { setTimeout, clearTimeout } from "node:timers";
import { test } from "node:test";
import { ESLint } from "eslint";

const require = createRequire(import.meta.url);
const repository = path.resolve(import.meta.dirname, "..");
const compilers = [
  ["workspace", require.resolve("typescript")],
  [
    "development plugin",
    path.join(
      repository,
      "applications/electron/plugins/vscode.typescript-language-features/extension/deps/typescript/lib/typescript.js",
    ),
  ],
];
if (process.env.AI1_PACKAGED_RESOURCES) {
  compilers.push([
    "packaged plugin",
    path.join(
      process.env.AI1_PACKAGED_RESOURCES,
      "plugins/vscode.typescript-language-features/extension/deps/typescript/lib/typescript.js",
    ),
  ]);
}

function write(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof content === "string" ? content : JSON.stringify(content));
  return file;
}

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ai1-editor-release-offline-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  write(root, "tsconfig.base.json", {
    compilerOptions: {
      strict: true,
      target: "ES2020",
      lib: ["ES2020", "DOM"],
      noEmit: true,
      skipLibCheck: false,
    },
  });
  const projects = ["code/team/web", "code/team/mobile"];
  for (const relative of projects) {
    write(root, `${relative}/tsconfig.json`, {
      extends: "../../../tsconfig.base.json",
      compilerOptions: {
        module: "NodeNext",
        moduleResolution: "NodeNext",
        jsx: "react-jsx",
        types: ["react"],
        baseUrl: ".",
        paths: { "@domain/*": ["src/domain/*"] },
      },
      include: ["src"],
    });
    const project = path.join(root, relative);
    fs.mkdirSync(path.join(project, "node_modules"));
    for (const name of ["react", "@types", "csstype"]) {
      fs.symlinkSync(
        path.join(repository, "node_modules", name),
        path.join(project, "node_modules", name),
        "dir",
      );
    }
    write(
      root,
      `${relative}/src/domain/record.ts`,
      "export const record = { id: 'fixture', active: true };\n",
    );
    write(
      root,
      `${relative}/src/request.ts`,
      [
        "import { record } from '@domain/record';",
        "export async function request(): Promise<typeof record> {",
        "  if (!record.active) throw new Error('inactive');",
        "  return record;",
        "}",
        "request();",
      ].join("\n"),
    );
    write(root, `${relative}/src/errors.ts`, "export const realError: number = 'not a number';\n");
  }
  write(
    root,
    "code/team/web/src/App.tsx",
    [
      "import { useState } from 'react';",
      "import { record } from '@domain/record';",
      "export function App() {",
      "  const [count, setCount] = useState(0);",
      "  return <button onClick={() => setCount(value => value + 1)}>{record.id}: {count}</button>;",
      "}",
    ].join("\n"),
  );
  write(root, "code/team/mobile/node_modules/react-native/package.json", {
    name: "react-native",
    version: "0.0.0-fixture",
    exports: { ".": { types: "./index.d.ts" } },
  });
  write(
    root,
    "code/team/mobile/node_modules/react-native/index.d.ts",
    [
      "import type { ReactElement, ReactNode } from 'react';",
      "export interface ViewProps { accessible?: boolean; children?: ReactNode; }",
      "export function View(props: ViewProps): ReactElement;",
    ].join("\n"),
  );
  write(
    root,
    "code/team/mobile/src/App.tsx",
    [
      "import { View } from 'react-native';",
      "import { record } from '@domain/record';",
      "export function App() { return <View accessible={record.active} />; }",
    ].join("\n"),
  );
  return { root, projects: projects.map((relative) => path.join(root, relative)) };
}

function config(ts, project) {
  const file = path.join(project, "tsconfig.json");
  const read = ts.readConfigFile(file, ts.sys.readFile);
  assert.equal(read.error, undefined);
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, project, undefined, file);
  assert.deepEqual(parsed.errors, []);
  return parsed;
}

function diagnostics(ts, parsed) {
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  return { program, errors: ts.getPreEmitDiagnostics(program) };
}

function serverClient(t, compiler, root) {
  const child = spawn(
    process.execPath,
    [path.join(path.dirname(compiler), "tsserver.js"), "--disableAutomaticTypingAcquisition"],
    {
      cwd: root,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  const pending = new Map();
  let buffer = Buffer.alloc(0);
  let sequence = 0;
  let stderr = "";
  t.after(async () => {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
    await new Promise((resolve) => {
      child.once("exit", resolve);
      child.kill();
    });
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  child.on("error", (error) => {
    for (const entry of pending.values()) entry.reject(error);
  });
  child.on("exit", (code) => {
    for (const entry of pending.values())
      entry.reject(new Error(`TypeScript server exits with ${code}: ${stderr}`));
  });
  child.stdout.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (true) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) break;
      const match = /Content-Length: (\d+)/.exec(buffer.subarray(0, headerEnd).toString());
      assert.ok(match, "TypeScript server uses its standard response framing.");
      const end = headerEnd + 4 + Number(match[1]);
      if (buffer.length < end) break;
      const response = JSON.parse(buffer.subarray(headerEnd + 4, end).toString());
      buffer = buffer.subarray(end);
      if (response.type !== "response") continue;
      const entry = pending.get(response.request_seq);
      if (!entry) continue;
      pending.delete(response.request_seq);
      if (response.success) entry.resolve(response.body);
      else entry.reject(new Error(response.message));
    }
  });
  return (command, args) => {
    const seq = ++sequence;
    const message = `${JSON.stringify({ seq, type: "request", command, arguments: args })}\n`;
    // TypeScript 5.4 does not send a response to the open notification.
    if (command === "open") {
      child.stdin.write(message);
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(seq);
        reject(new Error(`TypeScript server does not answer ${command}: ${stderr}`));
      }, 15000);
      pending.set(seq, {
        resolve: (body) => {
          clearTimeout(timer);
          resolve(body);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      child.stdin.write(message);
    });
  };
}

for (const [name, compiler] of compilers) {
  test(`${name}: TypeScript server selects each nested configuration and an inferred project`, async (t) => {
    const { root, projects } = fixture(t);
    const request = serverClient(t, compiler, root);
    for (const project of projects) {
      const file = path.join(project, "src/errors.ts");
      await request("open", { file, projectRootPath: root });
      const info = await request("projectInfo", { file, needFileNameList: true });
      assert.equal(info.configFileName, path.join(project, "tsconfig.json"));
      assert.ok(info.fileNames.some((name) => name === path.join(path.dirname(compiler), "lib.es2020.d.ts")));
      assert.equal(
        info.fileNames.some((name) => name.includes(projects.find((other) => other !== project))),
        false,
      );
      const errors = await request("semanticDiagnosticsSync", { file });
      assert.deepEqual(
        errors.map((error) => error.code),
        [2322],
      );
    }
    const loose = write(root, "loose/file.ts", "export const realError: number = 'not a number';\n");
    await request("open", { file: loose, projectRootPath: root });
    const info = await request("projectInfo", { file: loose, needFileNameList: true });
    assert.match(info.configFileName, /inferredProject/);
    assert.equal(
      info.fileNames.some((name) => projects.some((project) => name.startsWith(project))),
      false,
    );
    const errors = await request("semanticDiagnosticsSync", { file: loose });
    assert.deepEqual(
      errors.map((error) => error.code),
      [2322],
    );
  });

  test(`${name}: nested React JSX and mobile contracts retain real diagnostics`, (t) => {
    const ts = require(compiler);
    const { projects } = fixture(t);
    for (const project of projects) {
      const parsed = config(ts, project);
      const { program, errors } = diagnostics(ts, parsed);
      assert.deepEqual(
        errors.map((error) => [error.code, path.basename(error.file?.fileName ?? "")]),
        [[2322, "errors.ts"]],
      );
      assert.ok(program.getSourceFiles().some((file) => file.fileName.includes("@types/react/index.d.ts")));
      assert.ok(program.getSourceFiles().some((file) => file.fileName.endsWith("lib.es2020.d.ts")));
      assert.ok(program.getSourceFile(path.join(project, "src/domain/record.ts")));
      assert.equal(
        program
          .getSourceFiles()
          .some((file) => file.fileName.includes(projects.find((other) => other !== project))),
        false,
      );
    }

    const component = path.join(projects[0], "src/App.tsx");
    fs.writeFileSync(
      component,
      fs.readFileSync(component, "utf8").replace("setCount(value => value + 1)", "setCount('wrong')"),
    );
    assert.deepEqual(
      diagnostics(ts, config(ts, projects[0])).errors.map((error) => [
        error.code,
        path.basename(error.file?.fileName ?? ""),
      ]),
      [
        [2345, "App.tsx"],
        [2322, "errors.ts"],
      ],
    );

    const mobileComponent = path.join(projects[1], "src/App.tsx");
    const mobileSource = fs.readFileSync(mobileComponent, "utf8");
    fs.writeFileSync(
      mobileComponent,
      mobileSource.replace("accessible={record.active}", "accessible='wrong'"),
    );
    assert.deepEqual(
      diagnostics(ts, config(ts, projects[1])).errors.map((error) => [
        error.code,
        path.basename(error.file?.fileName ?? ""),
      ]),
      [
        [2322, "App.tsx"],
        [2322, "errors.ts"],
      ],
    );
    fs.writeFileSync(mobileComponent, mobileSource);

    // Remove only the temporary declaration to verify missing-module diagnostics.
    const dependency = path.join(projects[1], "node_modules/react-native");
    fs.renameSync(dependency, `${dependency}-hidden`);
    const missing = diagnostics(ts, config(ts, projects[1])).errors;
    assert.deepEqual(missing.map((error) => error.code).sort(), [2307, 2322]);
    assert.ok(
      missing.some((error) =>
        ts.flattenDiagnosticMessageText(error.messageText, "\n").includes("react-native"),
      ),
    );
  });

  test(`${name}: nested language service resolves hover, definitions, completion, and edits`, (t) => {
    const ts = require(compiler);
    const { projects } = fixture(t);
    for (const project of projects) {
      const parsed = config(ts, project);
      const versions = new Map();
      const host = {
        ...ts.sys,
        getCompilationSettings: () => parsed.options,
        getScriptFileNames: () => parsed.fileNames,
        getScriptVersion: (file) => String(versions.get(file) ?? 0),
        getScriptSnapshot: (file) => {
          const text = ts.sys.readFile(file);
          return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
        },
        getCurrentDirectory: () => project,
        getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
      };
      const service = ts.createLanguageService(host);
      try {
        const file = path.join(project, "src/request.ts");
        const text = fs.readFileSync(file, "utf8");
        const hover = service.getQuickInfoAtPosition(file, text.lastIndexOf("request();") + 1);
        assert.match(ts.displayPartsToString(hover?.displayParts), /Promise<typeof record>/);
        const recordHover = service.getQuickInfoAtPosition(file, text.indexOf("record.active") + 1);
        assert.match(ts.displayPartsToString(recordHover?.displayParts), /id: string/);
        const definitions = service.getDefinitionAtPosition(file, text.indexOf("record.active") + 1);
        assert.ok(
          definitions?.some((entry) => entry.fileName === path.join(project, "src/domain/record.ts")),
        );
        const errorDefinition = service.getDefinitionAtPosition(file, text.indexOf("Error(") + 1);
        assert.ok(errorDefinition?.some((entry) => entry.fileName.endsWith("lib.es5.d.ts")));

        // Keep the service open while a saved dependency changes type.
        const dependency = path.join(project, "src/domain/record.ts");
        fs.writeFileSync(dependency, "export const record = { id: 42, active: true };\n");
        versions.set(dependency, 1);
        const changed = service.getQuickInfoAtPosition(file, text.indexOf("record.active") + 1);
        assert.match(ts.displayPartsToString(changed?.displayParts), /id: number/);

        const completionText = `${text}\nrecord.`;
        fs.writeFileSync(file, completionText);
        versions.set(file, 1);
        const completion = service.getCompletionsAtPosition(file, completionText.length, {});
        assert.ok(completion?.entries.some((entry) => entry.name === "active"));
        assert.ok(completion?.entries.some((entry) => entry.name === "id"));
        assert.deepEqual(
          service.getSemanticDiagnostics(path.join(project, "src/errors.ts")).map((error) => error.code),
          [2322],
        );
        fs.writeFileSync(path.join(project, "src/errors.ts"), "export const realError: number = 42;\n");
        versions.set(path.join(project, "src/errors.ts"), 1);
        assert.deepEqual(service.getSemanticDiagnostics(path.join(project, "src/errors.ts")), []);
      } finally {
        service.dispose();
      }
    }
  });
}

test("nested ESLint configurations apply separate fixes and preserve non-fixable errors", async (t) => {
  const { projects } = fixture(t);
  for (const [index, project] of projects.entries()) {
    const quote = index === 0 ? "single" : "double";
    write(
      project,
      "eslint.config.cjs",
      `module.exports = [{ files: ['**/*.js'], rules: { quotes: ['error', '${quote}'], semi: ['error', 'always'], eqeqeq: ['error', 'always'] } }];\n`,
    );
    const file = write(
      project,
      "src/save.js",
      "export const label = `fixture`\nexport const realError = label == 'other'\n",
    );
    const eslint = new ESLint({ cwd: project, fix: true });
    const [result] = await eslint.lintFiles([file]);
    assert.ok(result.output);
    assert.deepEqual(
      result.messages.map((message) => message.ruleId),
      ["eqeqeq"],
    );
    await ESLint.outputFixes([result]);
    const saved = fs.readFileSync(file, "utf8");
    assert.match(saved, quote === "single" ? /label = 'fixture';/ : /label = "fixture";/);
    const [again] = await eslint.lintFiles([file]);
    assert.equal(again.output, undefined);
    assert.deepEqual(
      again.messages.map((message) => message.ruleId),
      ["eqeqeq"],
    );
  }
});
