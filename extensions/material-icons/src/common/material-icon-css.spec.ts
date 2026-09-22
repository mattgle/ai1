import * as assert from "node:assert";
import { buildStyleSheet, iconClass, ICON_BASE_CLASS } from "./material-icon-css";

describe("iconClass", () => {
  it("adds the prefix to the icon id", () => {
    assert.strictEqual(iconClass("folder-src-open"), "ai1-mi-folder-src-open");
  });

  it("replaces characters that are not safe in a CSS class", () => {
    assert.strictEqual(iconClass("c++.v2"), "ai1-mi-c___v2");
  });
});

describe("buildStyleSheet", () => {
  const css = buildStyleSheet(
    { typescript: { iconPath: "./../icons/typescript.svg" }, file: { iconPath: "./../icons/file.svg" } },
    (iconPath) => `http://host/base/${iconPath.replace("./../", "")}`,
  );

  it("writes one rule for each icon definition", () => {
    assert.ok(
      css.includes(
        ".ai1-mi-typescript::before { background-image: url('http://host/base/icons/typescript.svg'); }",
      ),
    );
    assert.ok(
      css.includes(".ai1-mi-file::before { background-image: url('http://host/base/icons/file.svg'); }"),
    );
  });

  it("writes the shared rule one time", () => {
    assert.strictEqual(css.split(`.${ICON_BASE_CLASS}::before {`).length - 1, 1);
  });

  it("keeps a space between the icon and the file name", () => {
    assert.ok(css.includes("padding-right: var(--theia-ui-padding);"));
  });
});
