import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createRequire } from "node:module";
import { expect, test } from "@playwright/test";
import type * as TypeScript from "typescript";
import { Registry, parseRawGrammar, INITIAL } from "vscode-textmate";
import { loadWASM, OnigScanner, OnigString } from "vscode-oniguruma";
import { removeTempDir } from "./remove-temp-dir";

const application = path.resolve(__dirname, "../../applications/electron");
const packaged = process.env.AI1_PACKAGED_RESOURCES;
const requireModule = createRequire(__filename);
let root: string;

test.beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ai1-language-resources-"));
  const project = path.join(root, "workspace", "nested-repo");
  fs.mkdirSync(path.join(project, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "workspace", "tsconfig.base.json"),
    JSON.stringify({
      compilerOptions: { strict: true, target: "ES2020", lib: ["ES2020", "DOM"], types: [], noEmit: true },
    }),
  );
  fs.writeFileSync(
    path.join(project, "tsconfig.json"),
    JSON.stringify({
      extends: "../tsconfig.base.json",
      include: ["src"],
    }),
  );
  fs.writeFileSync(
    path.join(project, "src", "blocked-address.tsx"),
    [
      "export async function request(): Promise<string> {",
      "  throw new Error('test failure');",
      "}",
      "export const realError: number = 'not a number';",
    ].join("\n"),
  );
});

test.afterAll(async () => {
  await removeTempDir(root);
});

for (const [name, directory] of [
  ["development", application],
  ["packaged", packaged],
] as const) {
  test(`${name} SCSS registers its language and tokenizes variables and selectors`, async () => {
    test.skip(!directory, "Set AI1_PACKAGED_RESOURCES to the packaged app resource directory.");
    type GrammarEntry = { scopeName: string; path: string };
    const extension = path.join(directory!, "plugins/vscode.scss/extension");
    const manifest = JSON.parse(fs.readFileSync(path.join(extension, "package.json"), "utf8"));
    expect(manifest.contributes.languages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "scss", extensions: expect.arrayContaining([".scss"]) }),
      ]),
    );
    const grammars: GrammarEntry[] = [];
    for (const plugin of ["vscode.scss", "vscode.css"]) {
      const folder = path.join(directory!, "plugins", plugin, "extension");
      const entries: GrammarEntry[] = JSON.parse(fs.readFileSync(path.join(folder, "package.json"), "utf8"))
        .contributes.grammars;
      grammars.push(...entries.map((entry) => ({ ...entry, path: path.resolve(folder, entry.path) })));
    }
    const wasm = fs.readFileSync(requireModule.resolve("vscode-oniguruma/release/onig.wasm"));
    await loadWASM(Uint8Array.from(wasm).buffer);
    const registry = new Registry({
      onigLib: Promise.resolve({
        createOnigScanner: (patterns) => new OnigScanner(patterns),
        createOnigString: (text) => new OnigString(text),
      }),
      loadGrammar: async (scope) => {
        const grammar = grammars.find((entry) => entry.scopeName === scope);
        return grammar ? parseRawGrammar(fs.readFileSync(grammar.path, "utf8"), grammar.path) : null;
      },
    });
    try {
      const grammar = await registry.loadGrammar("source.css.scss");
      expect(grammar).not.toBeNull();
      let state = INITIAL;
      const scopes: string[] = [];
      for (const line of ["@use 'styles';", "$color: #fff;", ".page {", "  color: $color;", "}"]) {
        const result = grammar!.tokenizeLine(line, state);
        state = result.ruleStack;
        scopes.push(...result.tokens.flatMap((token) => token.scopes));
      }
      expect(scopes.some((scope) => scope.includes("variable"))).toBe(true);
      expect(scopes.some((scope) => scope.includes("entity.other.attribute-name"))).toBe(true);
      expect(scopes.some((scope) => scope.includes("support.type.property-name"))).toBe(true);
    } finally {
      registry.dispose();
    }
  });
  test(`${name} TypeScript resolves standard libraries and keeps real diagnostics`, () => {
    test.skip(!directory, "Set AI1_PACKAGED_RESOURCES to the packaged app resource directory.");
    const compilerPath = path.join(
      directory!,
      "plugins/vscode.typescript-language-features/extension/deps/typescript/lib/typescript.js",
    );
    const ts = requireModule(compilerPath) as typeof TypeScript;
    const configPath = path.join(root, "workspace", "nested-repo", "tsconfig.json");
    const read = ts.readConfigFile(configPath, ts.sys.readFile);
    expect(read.error).toBeUndefined();
    const config = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(configPath));
    expect(config.errors).toEqual([]);
    const program = ts.createProgram(config.fileNames, config.options);
    const diagnostics = ts.getPreEmitDiagnostics(program).map((diagnostic) => ({
      code: diagnostic.code,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    }));
    expect(diagnostics).toEqual([
      { code: 2322, message: "Type 'string' is not assignable to type 'number'." },
    ]);
  });
}
