import { strict as assert } from "node:assert";
import { sanitizeDesignSelection } from "./design-selection";

describe("sanitizeDesignSelection", () => {
  it("rejects data without finite element bounds", () => {
    assert.equal(sanitizeDesignSelection({ rect: { x: 0, y: 0, width: Infinity, height: 2 } }), undefined);
  });

  it("removes URL query data, unsafe HTML attributes, and unknown styles", () => {
    const result = sanitizeDesignSelection({
      pageUrl: "https://example.test/page?token=secret#section",
      pageTitle: "Title",
      tagName: "BUTTON",
      selector: "button.primary",
      text: "Save",
      html: '<button onclick="run()" value="secret" data-token="secret">Save</button>',
      styles: { color: "rgb(1, 2, 3)", position: "static", "background-image": "url(secret)" },
      rect: { x: 1, y: 2, width: 30, height: 20 },
      screenshot: "data:image/png;base64,cG5n",
    });
    assert.equal(result?.pageUrl, "https://example.test/page");
    assert.equal(result?.html, "<button>Save</button>");
    assert.deepEqual(result?.styles, { color: "rgb(1, 2, 3)", position: "static" });
    assert.equal(result?.screenshot, "data:image/png;base64,cG5n");
  });

  it("bounds fields and refuses non-PNG screenshots", () => {
    const result = sanitizeDesignSelection({
      pageUrl: "file:///private/page",
      pageTitle: "t".repeat(500),
      tagName: "A".repeat(60),
      selector: "s".repeat(800),
      text: "x".repeat(2000),
      html: "<p>" + "h".repeat(5000),
      styles: {},
      rect: { x: 0, y: 0, width: 2, height: 2 },
      screenshot: "data:text/html,bad",
    });
    assert.equal(result?.pageUrl, "");
    assert.equal(result?.pageTitle.length, 300);
    assert.equal(result?.selector.length, 500);
    assert.equal(result?.text.length, 1500);
    assert.equal(result?.html.length, 3000);
    assert.equal(result?.screenshot, undefined);
  });

  it("removes URL credentials and refuses an oversized screenshot", () => {
    const result = sanitizeDesignSelection({
      pageUrl: "https://user:password@example.test/page",
      rect: { x: 0, y: 0, width: 2, height: 2 },
      screenshot: `data:image/png;base64,${"a".repeat(5_000_000)}`,
    });
    assert.equal(result?.pageUrl, "https://example.test/page");
    assert.equal(result?.screenshot, undefined);
  });
});
