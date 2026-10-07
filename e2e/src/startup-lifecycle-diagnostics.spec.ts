import { expect, test } from "@playwright/test";
import {
  assertStartupExit,
  createStartupOutputObserver,
  type StartupLifecycleRecord,
} from "./startup-lifecycle-diagnostics";

function record(): StartupLifecycleRecord {
  return {
    launch: 1,
    phase: "closed",
    exitCode: 0,
    signal: null,
    stdoutBytes: 0,
    stderrBytes: 0,
    errorMarkers: [],
    stackSymbols: [],
  };
}

test("lifecycle diagnostics retain fixed markers from both output streams without raw output", () => {
  const current = record();
  const observe = createStartupOutputObserver(current);
  observe("stdout", Buffer.from("private fixture output FATAL "));
  observe("stdout", Buffer.from("ERROR\n  at NativeWatcher.close (/private/fixture/path:1:2)\n"));
  observe("stderr", Buffer.from("napi_fatal_error\nprivate fixture argument\n"));
  expect(current.errorMarkers).toEqual(["FATAL ERROR", "napi_fatal_error"]);
  expect(current.stackSymbols).toEqual(["NativeWatcher.close"]);
  expect(current.stdoutBytes).toBeGreaterThan(0);
  expect(current.stderrBytes).toBeGreaterThan(0);
  expect(JSON.stringify(current)).not.toContain("private fixture");
  expect(JSON.stringify(current)).not.toContain("/private/");
});

test("lifecycle exit checks reject fatal backend output despite a zero main-process exit", () => {
  for (const marker of ["FATAL ERROR", "napi_fatal_error", "Cannot create a handle without a HandleScope"]) {
    const current = record();
    current.errorMarkers = [marker];
    expect(() => assertStartupExit(current, "forked")).toThrow("Native fatal markers");
  }
});

test("lifecycle exit checks preserve the documented shared exit code and reject signals", () => {
  const current = record();
  expect(() => assertStartupExit(current, "forked")).not.toThrow();
  current.exitCode = 1;
  expect(() => assertStartupExit(current, "shared")).not.toThrow();
  expect(() => assertStartupExit(current, "forked")).toThrow("normal exit");
  current.signal = "SIGABRT";
  expect(() => assertStartupExit(current, "shared")).toThrow("normal exit");
  current.signal = null;
  current.exitCode = undefined;
  expect(() => assertStartupExit(current, "shared")).toThrow("normal exit");
  current.exitCode = 0;
  current.phase = "first-window";
  expect(() => assertStartupExit(current, "forked")).toThrow("normal exit");
});

test("lifecycle observers keep launches and output streams separate and bound stack symbols", () => {
  const first = record();
  const second = record();
  const observe = createStartupOutputObserver(first);
  observe("stdout", Buffer.from("FATAL "));
  observe("stderr", Buffer.from("ERROR"));
  expect(first.errorMarkers).toEqual([]);
  const other = createStartupOutputObserver(second);
  other("stdout", Buffer.from("ERROR"));
  expect(second.errorMarkers).toEqual([]);
  for (let index = 0; index < 100; index++)
    observe("stderr", Buffer.from(`\n  at Symbol${index} (fixture)\n`));
  expect(first.stackSymbols).toHaveLength(30);
  expect(second.stackSymbols).toEqual([]);
});

test("lifecycle diagnostics detect a fatal marker before a large output chunk is trimmed", () => {
  const current = record();
  const observe = createStartupOutputObserver(current);
  observe("stderr", Buffer.from(`FATAL ERROR\n${"private fixture data ".repeat(1000)}`));
  expect(current.errorMarkers).toEqual(["FATAL ERROR"]);
  expect(JSON.stringify(current)).not.toContain("private fixture data");
  expect(() => assertStartupExit(current, "forked")).toThrow("Native fatal markers");
});
