import * as assert from "node:assert";
import { downloadDoneText, downloadHost, e2eSetting, formatBytes, ProgressThrottle } from "./downloads";

describe("ProgressThrottle", () => {
  function throttle(): { throttle: ProgressThrottle; advance(ms: number): void } {
    let time = 1000;
    return {
      throttle: new ProgressThrottle(500, () => time),
      advance: (ms) => {
        time += ms;
      },
    };
  }

  it("sends the first call, not a call 100 ms later, and a call 500 ms later", () => {
    const { throttle: subject, advance } = throttle();
    assert.strictEqual(subject.shouldSend("a"), true);
    advance(100);
    assert.strictEqual(subject.shouldSend("a"), false);
    advance(400);
    assert.strictEqual(subject.shouldSend("a"), true);
  });

  it("keeps a separate time for each download", () => {
    const { throttle: subject, advance } = throttle();
    assert.strictEqual(subject.shouldSend("a"), true);
    advance(100);
    assert.strictEqual(subject.shouldSend("b"), true);
    assert.strictEqual(subject.shouldSend("a"), false);
  });

  it("sends again at once after forget", () => {
    const { throttle: subject, advance } = throttle();
    assert.strictEqual(subject.shouldSend("a"), true);
    advance(100);
    subject.forget("a");
    assert.strictEqual(subject.shouldSend("a"), true);
  });
});

describe("e2eSetting", () => {
  it("gives the value only when AI1_E2E_BACKGROUND is 1", () => {
    const env = { AI1_E2E_BACKGROUND: "1", AI1_E2E_DOWNLOADS_DIR: "/tmp/test-downloads" };
    assert.strictEqual(e2eSetting(env, "AI1_E2E_DOWNLOADS_DIR"), "/tmp/test-downloads");
  });

  it("ignores the value in a normal start", () => {
    assert.strictEqual(e2eSetting({ AI1_E2E_DOWNLOADS_DIR: "/tmp/x" }, "AI1_E2E_DOWNLOADS_DIR"), undefined);
    assert.strictEqual(
      e2eSetting({ AI1_E2E_BACKGROUND: "0", AI1_E2E_DOWNLOADS_DIR: "/tmp/x" }, "AI1_E2E_DOWNLOADS_DIR"),
      undefined,
    );
  });

  it("ignores an empty value", () => {
    assert.strictEqual(
      e2eSetting({ AI1_E2E_BACKGROUND: "1", AI1_E2E_SHELL_LOG: "" }, "AI1_E2E_SHELL_LOG"),
      undefined,
    );
    assert.strictEqual(e2eSetting({ AI1_E2E_BACKGROUND: "1" }, "AI1_E2E_SHELL_LOG"), undefined);
  });
});

describe("downloadHost", () => {
  it("gives the host of a web address", () => {
    assert.strictEqual(downloadHost("https://example.com:8443/files/a.zip"), "example.com");
  });

  it("gives an empty text for an address with no host", () => {
    assert.strictEqual(downloadHost("data:text/plain,hello"), "");
    assert.strictEqual(downloadHost("not an address"), "");
  });
});

describe("formatBytes", () => {
  it("uses the largest unit that gives at least 1", () => {
    assert.strictEqual(formatBytes(0), "0 B");
    assert.strictEqual(formatBytes(512), "512 B");
    assert.strictEqual(formatBytes(1536), "1.5 KB");
    assert.strictEqual(formatBytes(5 * 1024 * 1024), "5.0 MB");
    assert.strictEqual(formatBytes(3 * 1024 * 1024 * 1024), "3.0 GB");
  });
});

describe("downloadDoneText", () => {
  it("gives a separate text for each end state", () => {
    const text = (state: "completed" | "cancelled" | "failed") =>
      downloadDoneText({ id: "a", fileName: "report.pdf", state });
    assert.strictEqual(text("completed"), "Downloaded report.pdf to the Downloads folder.");
    assert.strictEqual(text("cancelled"), "The download of report.pdf was cancelled.");
    assert.strictEqual(text("failed"), "The download of report.pdf did not complete.");
  });
});
