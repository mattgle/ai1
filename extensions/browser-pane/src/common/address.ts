export const ADDRESS_HINT = "Type a full address, for example localhost:3000 or example.com";

export type AddressResult = { ok: true; url: string } | { ok: false; message: string };

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const LOCAL_HOST = /^(localhost|\d{1,3}(\.\d{1,3}){3}|\[[0-9a-f:]+\])$/i;

// The address bar accepts a full http or https address, `about:blank`, or a
// host with an optional port and path. It adds `http://` to a local host and
// `https://` to a host name with a dot. AI1 has no search engine, so other
// text gets the hint.
export function normalizeAddress(input: string): AddressResult {
  const text = input.trim();
  if (text === "about:blank") {
    return { ok: true, url: text };
  }
  if (SCHEME.test(text) && !/^[^:/]+:\d/.test(text)) {
    return isAllowedGuestUrl(text) && text !== "about:blank"
      ? { ok: true, url: new URL(text).toString() }
      : { ok: false, message: "AI1 Browser opens only http and https addresses." };
  }
  if (text === "" || /\s/.test(text)) {
    return { ok: false, message: ADDRESS_HINT };
  }
  const host = hostOf(text);
  let candidate: string;
  if (LOCAL_HOST.test(host)) {
    candidate = `http://${text}`;
  } else if (host.includes(".")) {
    candidate = `https://${text}`;
  } else {
    return { ok: false, message: ADDRESS_HINT };
  }
  try {
    return { ok: true, url: new URL(candidate).toString() };
  } catch {
    return { ok: false, message: ADDRESS_HINT };
  }
}

// The host part of an address without a scheme: before the first `/`, and
// without the port. An IPv6 host keeps its brackets.
function hostOf(text: string): string {
  const beforePath = text.split("/")[0];
  if (beforePath.startsWith("[")) {
    return beforePath.slice(0, beforePath.indexOf("]") + 1);
  }
  return beforePath.split(":")[0];
}

export function isAllowedGuestUrl(url: string): boolean {
  if (url === "about:blank") {
    return true;
  }
  try {
    const protocol = new URL(url).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}
