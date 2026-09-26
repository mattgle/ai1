import * as assert from "node:assert";
import { guardTheiaSender, isTheiaWindowSender, TheiaSenderEvent, THEIA_SENDER_ERROR } from "./theia-sender";

interface FakeContents {
  readonly id: number;
  getType(): string;
}

const THEIA_URL = "file:///app/lib/frontend/index.html?port=3000#/workspace";

function event(
  change: {
    type?: string;
    id?: number;
    frame?: { parent: unknown; url: string } | null;
  } = {},
): TheiaSenderEvent<FakeContents> {
  const type = change.type ?? "window";
  return {
    sender: { id: change.id ?? 1, getType: () => type },
    senderFrame: change.frame === undefined ? { parent: null, url: THEIA_URL } : change.frame,
  };
}

const noAi1Page = (): boolean => false;

describe("isTheiaWindowSender", () => {
  it("accepts the main frame of a Theia window that loads its front end from a file", () => {
    assert.strictEqual(isTheiaWindowSender(event(), noAi1Page), true);
  });

  it("refuses a sender that is not a window", () => {
    assert.strictEqual(isTheiaWindowSender(event({ type: "webview" }), noAi1Page), false);
  });

  it("refuses an AI1 page, also a popup window of an AI1 page", () => {
    const ai1Page = (contents: FakeContents): boolean => contents.id === 5;
    assert.strictEqual(isTheiaWindowSender(event({ id: 5 }), ai1Page), false);
    assert.strictEqual(isTheiaWindowSender(event({ id: 6 }), ai1Page), true);
  });

  it("refuses a sub-frame of a Theia window", () => {
    const frame = { parent: { url: THEIA_URL }, url: THEIA_URL };
    assert.strictEqual(isTheiaWindowSender(event({ frame }), noAi1Page), false);
  });

  it("refuses a frame whose address is not a file", () => {
    for (const url of ["https://example.com/", "http://localhost:3000/", "about:blank", "", "data:,x"]) {
      assert.strictEqual(isTheiaWindowSender(event({ frame: { parent: null, url } }), noAi1Page), false, url);
    }
  });

  it("refuses an event with no sender frame", () => {
    assert.strictEqual(isTheiaWindowSender(event({ frame: null }), noAi1Page), false);
  });

  it("refuses a frame that throws when it is read", () => {
    const frame = {
      parent: null,
      get url(): string {
        throw new Error("The frame is gone.");
      },
    };
    assert.strictEqual(isTheiaWindowSender(event({ frame }), noAi1Page), false);
  });
});

describe("guardTheiaSender", () => {
  it("runs the handler with the event and the arguments for a Theia window", async () => {
    const seen: unknown[] = [];
    const guarded = guardTheiaSender(
      noAi1Page,
      (sender: TheiaSenderEvent<FakeContents>, id: string, count: number) => {
        seen.push(sender.sender.id, id, count);
        return "done";
      },
    );
    assert.strictEqual(await guarded(event(), "a", 2), "done");
    assert.deepStrictEqual(seen, [1, "a", 2]);
  });

  it("throws the refusal and does not run the handler for another sender", () => {
    let calls = 0;
    const guarded = guardTheiaSender(noAi1Page, () => {
      calls++;
    });
    assert.throws(() => guarded(event({ type: "webview" })), { message: THEIA_SENDER_ERROR });
    assert.strictEqual(calls, 0);
  });
});
