import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { _electron as electron, expect, test } from "@playwright/test";
import { TheiaApp, TheiaWorkspace } from "@theia/playwright";
import { FakeOpenCodeServer } from "../../extensions/agents/lib/node/fake-opencode-server";
import { removeTempDir } from "./remove-temp-dir";
const { dompurifyBuildPlugin } = createRequire(__filename)("../../scripts/dompurify-build-plugin.cjs");

let root: string;
let server: FakeOpenCodeServer;
let running: Awaited<ReturnType<typeof electron.launch>>;
let app: TheiaApp;
const application =
  process.env.AI1_PACKAGED_RESOURCES ?? path.resolve(__dirname, "../../applications/electron");
const dependency = createRequire(path.join(application, "package.json"));

test.beforeAll(async () => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ai1-markdown-security-")));
  const workspace = path.join(root, "workspace");
  fs.mkdirSync(workspace, { recursive: true });
  fs.mkdirSync(path.join(root, "config"));
  fs.mkdirSync(path.join(root, "state/opencode"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "config/settings.json"),
    JSON.stringify({ "ai1.welcome.startup": "never" }),
  );
  fs.writeFileSync(
    path.join(workspace, "hover.ts"),
    "/** Hover fixture with **bold** documentation. */\nexport const fixtureValue = 7;\n\nfixtureValue;\n",
  );
  server = new FakeOpenCodeServer();
  server.sessions = [];
  await server.start();
  fs.writeFileSync(
    path.join(root, "state/opencode/service.json"),
    JSON.stringify({ url: server.baseUrl, password: server.password }),
  );
  running = await electron.launch({
    executablePath: process.env.AI1_E2E_EXECUTABLE,
    args: [
      ...(process.env.AI1_E2E_EXECUTABLE ? [] : [application]),
      "--no-sandbox",
      "--no-cluster",
      `--app-project-path=${application}`,
      `--user-data-dir=${root}/userdata`,
      `--electronUserData=${root}/userdata`,
      workspace,
    ],
    env: {
      ...process.env,
      THEIA_CONFIG_DIR: path.join(root, "config"),
      XDG_STATE_HOME: path.join(root, "state"),
    },
  });
  app = new TheiaApp(await running.firstWindow(), new TheiaWorkspace(), true);
  await app.waitForShellAndInitialized();
  const monaco = path.dirname(dependency.resolve("@theia/monaco-editor-core/package.json"));
  const result = await build({
    stdin: {
      contents: `import purify from ${JSON.stringify(dependency.resolve("dompurify"))};
        import monacoPurify from ${JSON.stringify(path.join(monaco, "esm/vs/base/browser/dompurify/dompurify.js"))};
        import { sanitizeHtml } from ${JSON.stringify(path.join(monaco, "esm/vs/base/browser/domSanitize.js"))};
        import { renderMarkdown } from ${JSON.stringify(path.join(monaco, "esm/vs/base/browser/markdownRenderer.js"))};
        export { purify, monacoPurify, sanitizeHtml, renderMarkdown };`,
      resolveDir: application,
    },
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    globalName: "sanitizerFixture",
    plugins: [dompurifyBuildPlugin(dependency.resolve("dompurify"))],
  });
  await app.page.addScriptTag({ content: result.outputFiles[0].text });
});

test.afterAll(async () => {
  await running?.close();
  await server?.stop();
  if (root) await removeTempDir(root);
});

test("both sanitizer paths neutralize descendants detached by after-sanitize hooks", async () => {
  const result = await app.page.evaluate(() => {
    type Purifier = {
      version: string;
      addHook: (name: string, hook: (node: Element) => void) => void;
      removeAllHooks: () => void;
      sanitize: (node: Element, options: object) => unknown;
    };
    const fixture = (window as unknown as { sanitizerFixture: { purify: Purifier; monacoPurify: Purifier } })
      .sanitizerFixture;
    return Object.entries(fixture)
      .filter(([name]) => name === "purify" || name === "monacoPurify")
      .flatMap(([name, purifier]) => {
        return ["afterSanitizeElements", "afterSanitizeAttributes"].map((hook) => {
          const host = document.createElement("div");
          host.innerHTML = '<section id="wrap"><img onerror="ATTACKER()"></section>';
          document.body.append(host);
          const image = host.querySelector("img")!;
          purifier.addHook(hook, (node) => {
            if (node.id === "wrap") node.remove();
          });
          try {
            purifier.sanitize(host, { IN_PLACE: true });
            return { name, version: purifier.version, hook, handler: image.hasAttribute("onerror") };
          } finally {
            purifier.removeAllHooks();
            host.remove();
          }
        });
      });
  });
  expect(result).toHaveLength(4);
  expect(result.filter((item) => item.handler)).toEqual([]);
  for (const item of result) expect(item.version).toBe("3.4.16");
});

test("generated app frontends use the fixed sanitizer instead of the embedded copy", () => {
  for (const name of ["bundle.js", "secondary-window.js"]) {
    const source = fs.readFileSync(path.join(application, "lib/frontend", name), "utf8");
    expect(source).toMatch(/\.version\s*=\s*["']3\.4\.16["']/);
    expect(source).not.toMatch(/\.version\s*=\s*["']3\.2\.7["']/);
  }
});

test("Monaco rejects executable HTML and keeps normal Markdown content", async () => {
  const result = await app.page.evaluate(() => {
    const fixture = (
      window as unknown as {
        sanitizerFixture: {
          sanitizeHtml: (value: string) => DocumentFragment;
          renderMarkdown: (markdown: { value: string; supportHtml: boolean }) => {
            element: HTMLElement;
            dispose: () => void;
          };
        };
      }
    ).sanitizerFixture;
    const html = fixture.sanitizeHtml(
      '<strong>Safe text</strong><script>ATTACKER()</script><img onerror="ATTACKER()"><a href="javascript:ATTACKER()">unsafe</a>',
    );
    const host = document.createElement("div");
    host.append(html);
    const markdown = fixture.renderMarkdown({
      value:
        '**Bold fixture** and `code`\n\n[Safe link](https://example.invalid/)\n\n<img onerror="ATTACKER()">',
      supportHtml: true,
    });
    try {
      return {
        dangerousHtml: host.querySelectorAll('script,[onerror],[href^="javascript:"]').length,
        text: host.textContent,
        bold: markdown.element.querySelector("strong")?.textContent,
        code: markdown.element.querySelector("code")?.textContent,
        link: markdown.element.querySelector("a")?.getAttribute("data-href"),
        dangerousMarkdown: markdown.element.querySelectorAll('script,[onerror],[href^="javascript:"]').length,
      };
    } finally {
      markdown.dispose();
    }
  });
  expect(result.dangerousHtml).toBe(0);
  expect(result.text).toContain("Safe text");
  expect(result.bold).toBe("Bold fixture");
  expect(result.code).toBe("code");
  expect(result.link).toContain("https://example.invalid/");
  expect(result.dangerousMarkdown).toBe(0);
});

test("the app core Markdown renderer keeps normal formatting", async () => {
  const result = await app.page.evaluate(() => {
    type Renderer = {
      render: (markdown: { value: string }) => { element: HTMLElement; dispose: () => void };
    };
    const container = (
      window as unknown as {
        theia: {
          container: { _bindingDictionary: { _map: Map<symbol, unknown> }; get: (key: symbol) => Renderer };
        };
      }
    ).theia.container;
    const key = Array.from(container._bindingDictionary._map.keys()).find(
      (key) => key.description === "CoreMarkdownRenderer",
    )!;
    const rendered = container.get(key).render({
      value:
        "**Core fixture** and `code`\n\n[Safe link](https://example.invalid/)\n\n<script>ATTACKER()</script>",
    });
    try {
      return {
        bold: rendered.element.querySelector("strong")?.textContent,
        code: rendered.element.querySelector("code")?.textContent,
        link: rendered.element.querySelector("a")?.getAttribute("href"),
        scripts: rendered.element.querySelectorAll("script").length,
      };
    } finally {
      rendered.dispose();
    }
  });
  expect(result).toEqual({
    bold: "Core fixture",
    code: "code",
    link: "https://example.invalid/",
    scripts: 0,
  });
});

test("Monaco hook cleanup does not remove the core sanitizer's hooks", async () => {
  const isolated = await app.page.evaluate(() => {
    type Purifier = {
      addHook: (name: string, hook: (node: Element) => void) => void;
      removeAllHooks: () => void;
      sanitize: (value: string) => string;
    };
    const fixture = (window as unknown as { sanitizerFixture: { purify: Purifier; monacoPurify: Purifier } })
      .sanitizerFixture;
    let calls = 0;
    fixture.purify.addHook("afterSanitizeAttributes", () => {
      calls++;
    });
    try {
      fixture.monacoPurify.removeAllHooks();
      fixture.purify.sanitize("<strong>Hook fixture</strong>");
      return fixture.purify !== fixture.monacoPurify && calls > 0;
    } finally {
      fixture.purify.removeAllHooks();
    }
  });
  expect(isolated).toBe(true);
});

test("the packaged editor shows TypeScript documentation in a hover", async () => {
  await app.page.locator("#files .theia-TreeNode", { hasText: "hover.ts" }).dblclick();
  const line = app.page.locator(".monaco-editor:visible .view-line").filter({ hasText: /^fixtureValue;/ });
  await expect(line).toBeVisible();
  const token = line.locator("span").filter({ hasText: "fixtureValue" }).last();
  const state = () =>
    app.page.evaluate(() => {
      type Model = { getLanguageId: () => string };
      type Control = {
        getModel: () => Model;
        _languageFeaturesService?: { hoverProvider: { has: (model: Model) => boolean } };
      };
      type Manager = { currentEditor?: { editor: { getControl: () => Control } } };
      const container = (
        window as unknown as {
          theia: {
            container: {
              _bindingDictionary: { _map: Map<unknown, unknown> };
              get: (key: unknown) => Manager;
            };
          };
        }
      ).theia.container;
      const key = [...container._bindingDictionary._map.keys()].find(
        (key) =>
          (typeof key === "function" && key.name === "EditorManager") ||
          (typeof key === "symbol" && key.description === "EditorManager"),
      );
      const editor = key ? container.get(key).currentEditor?.editor.getControl() : undefined;
      const model = editor?.getModel();
      return {
        documentFocused: document.hasFocus(),
        language: model?.getLanguageId() ?? null,
        hoverProviderReady:
          model && editor?._languageFeaturesService
            ? editor._languageFeaturesService.hoverProvider.has(model)
            : null,
        visibleHoverCount: Array.from(document.querySelectorAll<HTMLElement>(".monaco-hover")).filter(
          (node) => node.offsetWidth > 0 && node.offsetHeight > 0,
        ).length,
      };
    });
  const records = {
    before: await state(),
    tokenBounds: await token.boundingBox(),
    after: null as Awaited<ReturnType<typeof state>> | null,
  };
  await token.hover();
  const hover = app.page.locator(".monaco-hover:visible");
  try {
    await expect(hover).toContainText("Hover fixture with bold documentation.");
    await expect(hover.locator("strong")).toHaveText("bold");
  } finally {
    records.after = await state();
    await test.info().attach("TypeScript hover state", {
      body: JSON.stringify(records, null, 2),
      contentType: "application/json",
    });
  }
});
