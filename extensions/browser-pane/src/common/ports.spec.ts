import * as assert from "node:assert";
import { findRepositories, groupPorts, parseLsofCwd, parseLsofListen } from "./ports";

describe("parseLsofListen", () => {
  it("reads the process, the program, and the port of each listening socket", () => {
    const output = [
      "p501",
      "cnode",
      "f23",
      "n*:5173",
      "p777",
      "cControlCenter",
      "f9",
      "n127.0.0.1:7000",
      "",
    ].join("\n");
    assert.deepStrictEqual(parseLsofListen(output), [
      { pid: 501, program: "node", port: 5173 },
      { pid: 777, program: "ControlCenter", port: 7000 },
    ]);
  });

  it("reads IPv6 addresses and keeps one row when a process listens on IPv4 and IPv6", () => {
    const output = [
      "p42",
      "cvite",
      "f20",
      "n127.0.0.1:3000",
      "f21",
      "n[::1]:3000",
      "f22",
      "n[::]:3001",
      "",
    ].join("\n");
    assert.deepStrictEqual(parseLsofListen(output), [
      { pid: 42, program: "vite", port: 3000 },
      { pid: 42, program: "vite", port: 3001 },
    ]);
  });

  it("gives an empty list for empty output", () => {
    assert.deepStrictEqual(parseLsofListen(""), []);
  });
});

describe("parseLsofCwd", () => {
  it("maps each process to its working folder", () => {
    const output = ["p42", "fcwd", "n/work/meta/web", "p501", "fcwd", "n/work/other", ""].join("\n");
    assert.deepStrictEqual(
      parseLsofCwd(output),
      new Map([
        [42, "/work/meta/web"],
        [501, "/work/other"],
      ]),
    );
  });
});

describe("findRepositories", () => {
  it("finds a root that is a repository and the repositories directly under a root", () => {
    const repos = new Set(["/work/single", "/work/meta/web", "/work/meta/api"]);
    const children: Record<string, string[]> = {
      "/work/meta": ["/work/meta/web", "/work/meta/api", "/work/meta/docs"],
    };
    assert.deepStrictEqual(
      findRepositories(
        ["/work/single", "/work/meta"],
        (dir) => repos.has(dir),
        (dir) => children[dir] ?? [],
      ),
      ["/work/single", "/work/meta/api", "/work/meta/web"],
    );
  });
});

describe("groupPorts", () => {
  const ports = [
    { pid: 42, program: "vite", port: 5173 },
    { pid: 43, program: "node", port: 3000 },
    { pid: 777, program: "ControlCenter", port: 7000 },
    { pid: 44, program: "node", port: 4000 },
  ];
  const cwds = new Map([
    [42, "/work/meta/web"],
    [43, "/work/meta/web/server"],
    [777, "/"],
    [44, "/work/meta/webapp"],
  ]);

  it("groups ports by the repository that holds the working folder, and puts the rest in Other", () => {
    const result = groupPorts(ports, cwds, ["/work/meta/web", "/work/meta/api"]);
    assert.deepStrictEqual(result.groups, [
      {
        name: "web",
        path: "/work/meta/web",
        rows: [
          { pid: 43, program: "node", port: 3000, cwd: "/work/meta/web/server" },
          { pid: 42, program: "vite", port: 5173, cwd: "/work/meta/web" },
        ],
      },
    ]);
    assert.deepStrictEqual(
      result.other.map((row) => row.port),
      [4000, 7000],
    );
  });

  it("puts a port whose working folder is unknown in Other", () => {
    const result = groupPorts([{ pid: 9, program: "x", port: 1 }], new Map(), ["/work/meta/web"]);
    assert.deepStrictEqual(result, { groups: [], other: [{ pid: 9, program: "x", port: 1 }] });
  });
});
