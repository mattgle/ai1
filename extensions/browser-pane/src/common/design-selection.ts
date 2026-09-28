export const DESIGN_SELECTION_LIMITS = {
  title: 300,
  url: 2000,
  tagName: 40,
  selector: 500,
  text: 1500,
  html: 3000,
  styleValue: 120,
} as const;

export interface DesignSelection {
  pageUrl: string;
  pageTitle: string;
  tagName: string;
  selector: string;
  text: string;
  html: string;
  styles: Record<string, string>;
  rect: { x: number; y: number; width: number; height: number };
  screenshot?: string;
}

const STYLE_NAMES = new Set([
  "display",
  "position",
  "width",
  "height",
  "margin",
  "padding",
  "color",
  "background-color",
  "border",
  "border-radius",
  "font-family",
  "font-size",
  "font-weight",
  "line-height",
  "text-align",
]);

function boundedString(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.slice(0, maxLength) : "";
}

function safeUrl(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "";
    }
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString().slice(0, DESIGN_SELECTION_LIMITS.url);
  } catch {
    return "";
  }
}

function safeHtml(value: unknown): string {
  return boundedString(value, DESIGN_SELECTION_LIMITS.html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "")
    .replace(
      /\s(?:on[a-z]+|srcdoc|value|(?:data-)?(?:password|token|secret|authorization))\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
      "",
    );
}

function safeStyles(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") {
    return {};
  }
  const output: Record<string, string> = {};
  for (const [name, raw] of Object.entries(value)) {
    if (!STYLE_NAMES.has(name) || typeof raw !== "string") {
      continue;
    }
    output[name] = raw.slice(0, DESIGN_SELECTION_LIMITS.styleValue);
  }
  return output;
}

export function sanitizeDesignSelection(value: unknown): DesignSelection | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const input = value as Record<string, unknown>;
  const rect = input.rect as Record<string, unknown> | null;
  if (!rect || typeof rect !== "object") {
    return undefined;
  }
  const numbers = [rect.x, rect.y, rect.width, rect.height];
  if (!numbers.every((number) => typeof number === "number" && Number.isFinite(number))) {
    return undefined;
  }
  const screenshot =
    typeof input.screenshot === "string" &&
    input.screenshot.length <= 5_000_000 &&
    input.screenshot.startsWith("data:image/png;base64,")
      ? input.screenshot
      : undefined;
  return {
    pageUrl: safeUrl(input.pageUrl),
    pageTitle: boundedString(input.pageTitle, DESIGN_SELECTION_LIMITS.title),
    tagName: boundedString(input.tagName, DESIGN_SELECTION_LIMITS.tagName).toLowerCase(),
    selector: boundedString(input.selector, DESIGN_SELECTION_LIMITS.selector),
    text: boundedString(input.text, DESIGN_SELECTION_LIMITS.text),
    html: safeHtml(input.html),
    styles: safeStyles(input.styles),
    rect: {
      x: rect.x as number,
      y: rect.y as number,
      width: Math.max(0, rect.width as number),
      height: Math.max(0, rect.height as number),
    },
    screenshot,
  };
}
