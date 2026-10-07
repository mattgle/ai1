import { expect, test } from "@playwright/test";
import { findLeftoverPluginHosts, getPluginHostPath, parsePsOutput } from "./plugin-host-leftovers";

const pluginHostPath = "/repo/applications/electron/lib/backend/plugin-host";

test("packaged cleanup selects the packaged plugin host and excludes development and installed apps", () => {
  const development = "/repo/applications/electron";
  const packaged = "/repo/applications/electron/dist/mac-arm64/AI1.app/Contents/Resources/app";
  const selected = getPluginHostPath(development, packaged);
  expect(selected).toBe(`${packaged}/lib/backend/plugin-host`);
  const suiteStartMs = new Date(2026, 9, 7, 14, 0, 0).getTime();
  const host = {
    pid: 500,
    ppid: 1,
    startMs: suiteStartMs,
    command: `node ${packaged}/lib/backend/plugin-host.js`,
  };
  const processes = [
    host,
    { ...host, pid: 501, command: `node ${development}/lib/backend/plugin-host.js` },
    {
      ...host,
      pid: 502,
      command: "node /Applications/AI1.app/Contents/Resources/app/lib/backend/plugin-host.js",
    },
    { ...host, pid: 503, startMs: suiteStartMs - 1000 },
  ];
  expect(findLeftoverPluginHosts(processes, { suiteStartMs, pluginHostPath: selected })).toEqual([host]);
  expect(getPluginHostPath(development)).toBe(pluginHostPath);
});

test("parsePsOutput reads the pid, the parent pid, the start time, and the command", () => {
  const output = [
    "  501     1 Wed Sep 23 14:13:05 2026     /repo/Electron /repo/applications/electron/lib/backend/plugin-host.js",
    "12345   500 Thu Jan  1 09:05:00 2026     /bin/zsh -l",
    "",
  ].join("\n");
  expect(parsePsOutput(output)).toEqual([
    {
      pid: 501,
      ppid: 1,
      startMs: new Date(2026, 8, 23, 14, 13, 5).getTime(),
      command: "/repo/Electron /repo/applications/electron/lib/backend/plugin-host.js",
    },
    { pid: 12345, ppid: 500, startMs: new Date(2026, 0, 1, 9, 5, 0).getTime(), command: "/bin/zsh -l" },
  ]);
});

test("findLeftoverPluginHosts keeps only an orphan plugin host of this app that started in the suite", () => {
  const suiteStartMs = new Date(2026, 8, 23, 14, 0, 0).getTime();
  const inSuite = new Date(2026, 8, 23, 14, 10, 0).getTime();
  const beforeSuite = new Date(2026, 8, 23, 13, 59, 59).getTime();
  const leftover = { pid: 1, ppid: 1, startMs: inSuite, command: `node ${pluginHostPath}.js` };
  const processes = [
    leftover,
    { pid: 2, ppid: 1, startMs: beforeSuite, command: `node ${pluginHostPath}.js` },
    { pid: 3, ppid: 900, startMs: inSuite, command: `node ${pluginHostPath}.js` },
    { pid: 4, ppid: 1, startMs: inSuite, command: "node /Applications/AI1.app/lib/backend/plugin-host.js" },
    { pid: 5, ppid: 1, startMs: inSuite, command: "/bin/zsh -l" },
  ];
  expect(findLeftoverPluginHosts(processes, { suiteStartMs, pluginHostPath })).toEqual([leftover]);
});

test("findLeftoverPluginHosts counts a plugin host that started in the same second as the suite", () => {
  const suiteStartMs = new Date(2026, 8, 23, 14, 0, 0, 700).getTime();
  const sameSecond = new Date(2026, 8, 23, 14, 0, 0).getTime();
  const host = { pid: 1, ppid: 1, startMs: sameSecond, command: `node ${pluginHostPath}.js` };
  expect(findLeftoverPluginHosts([host], { suiteStartMs, pluginHostPath })).toEqual([host]);
});
