import { expect, type Locator } from "@playwright/test";

// Theia shows a hover (a `.theia-hover` popover) next to the element under
// the mouse after a delay, and keeps it open while the mouse is on the hover
// itself. A hover that a previous step left open, or that opens just before
// a click, can cover the tab or the view next to it and catch the click.
// A move to a point outside the page leaves no element under the mouse, so
// Theia closes any open hover (about 200 ms later) and cannot open a new one.
//
// The helper also moves the mouse away after the click. The click itself
// asks for a hover of the tab (on `mouseenter`). Theia cancels a pending
// hover on `mousedown`, but Lumino's tab bar calls `preventDefault()` on the
// `pointerdown` of a left press, so the browser sends no `mousedown`. If the
// mouse stays on the tab, the hover opens below the tab after the delay
// (1.5 s on macOS), over the top of the view, and catches the next click.
export async function clickTab(tab: Locator, options?: { button?: "left" | "right" }): Promise<void> {
  const page = tab.page();
  await page.mouse.move(-1, -1);
  await expect(page.locator(".theia-hover")).toHaveCount(0);
  await tab.click(options);
  await page.mouse.move(-1, -1);
}
