export const ICON_BASE_CLASS = "ai1-mi";

export function iconClass(iconId: string): string {
  return `${ICON_BASE_CLASS}-${iconId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

// Builds the style sheet of the icon theme. Each icon is a background image on
// the `::before` element, which is how Theia's own icon themes draw file icons.
export function buildStyleSheet(
  iconDefinitions: Record<string, { iconPath: string }>,
  urlOf: (iconPath: string) => string,
): string {
  const rules = [
    `.${ICON_BASE_CLASS}::before {`,
    "  content: ' ';",
    "  display: inline-block;",
    "  width: 16px;",
    "  height: 16px;",
    "  vertical-align: middle;",
    "  background-size: 16px;",
    "  background-position: left center;",
    "  background-repeat: no-repeat;",
    "}",
  ];
  for (const [iconId, definition] of Object.entries(iconDefinitions)) {
    rules.push(`.${iconClass(iconId)}::before { background-image: url('${urlOf(definition.iconPath)}'); }`);
  }
  return rules.join("\n");
}
