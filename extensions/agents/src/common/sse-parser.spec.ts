import * as assert from "node:assert";
import { SseParser } from "./sse-parser";

describe("SseParser", () => {
  it("emits one event per blank-line-terminated block", () => {
    const events: { event: string; data: string }[] = [];
    const parser = new SseParser((event) => events.push(event));
    parser.push('event: message\ndata: {"type":"a"}\n\n');
    parser.push('data: {"type":"b"}\n\n');
    assert.deepStrictEqual(events, [
      { event: "message", data: '{"type":"a"}' },
      { event: "message", data: '{"type":"b"}' },
    ]);
  });

  it("joins a block that arrives in two chunks", () => {
    const events: { event: string; data: string }[] = [];
    const parser = new SseParser((event) => events.push(event));
    parser.push('data: {"ty');
    assert.strictEqual(events.length, 0);
    parser.push('pe":"a"}\n\n');
    assert.deepStrictEqual(events, [{ event: "message", data: '{"type":"a"}' }]);
  });

  it("joins multi-line data with newlines and ignores comments and ids", () => {
    const events: { event: string; data: string }[] = [];
    const parser = new SseParser((event) => events.push(event));
    parser.push(": keep-alive\nid: 7\ndata: one\ndata: two\n\n");
    assert.deepStrictEqual(events, [{ event: "message", data: "one\ntwo" }]);
  });

  it("accepts CRLF line ends", () => {
    const events: { event: string; data: string }[] = [];
    const parser = new SseParser((event) => events.push(event));
    parser.push("data: x\r\n\r\n");
    assert.strictEqual(events[0].data, "x");
  });

  it("joins a CRLF that arrives split across two chunks", () => {
    const events: { event: string; data: string }[] = [];
    const parser = new SseParser((event) => events.push(event));
    parser.push("data: x\r");
    parser.push("\n\r\n");
    assert.deepStrictEqual(events, [{ event: "message", data: "x" }]);
  });
});
