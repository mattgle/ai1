// The zoom levels of Chrome, in percent.
export const ZOOM_STEPS = [25, 33, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400, 500];

export const MIN_ZOOM = ZOOM_STEPS[0];
export const MAX_ZOOM = ZOOM_STEPS[ZOOM_STEPS.length - 1];

// The next step up (1) or down (-1) from `percent`. A value between two
// steps goes to the nearest step in that direction. At the ends, the value
// stays at the end.
export function nextZoom(percent: number, direction: 1 | -1): number {
  if (direction === 1) {
    return ZOOM_STEPS.find((step) => step > percent) ?? MAX_ZOOM;
  }
  return [...ZOOM_STEPS].reverse().find((step) => step < percent) ?? MIN_ZOOM;
}

// The key of the saved zoom level of a page: the profile and the host with
// its port, for example "default localhost:3000". A page with no http or
// https host (`about:blank`, `data:`) has no key, so it has no saved level.
export function zoomKey(profileId: string, url: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.host === "") {
    return undefined;
  }
  return `${profileId} ${parsed.host}`;
}

// True for a level that the zoom store can keep.
export function isValidZoom(percent: unknown): percent is number {
  return (
    typeof percent === "number" && Number.isFinite(percent) && percent >= MIN_ZOOM && percent <= MAX_ZOOM
  );
}
