// The sender check for every IPC handler of the AI1 browser (Electron
// security checklist: "Validate the sender of all IPC messages"). The pages
// of the AI1 browser are not trusted. Only the Theia window is trusted. This
// file has no `electron` import, so plain mocha tests it.

export const THEIA_SENDER_ERROR = "AI1 refused this request. It did not come from an AI1 window.";

// The parts of an `IpcMainInvokeEvent` that the check uses.
export interface TheiaSenderEvent<C> {
  readonly sender: C;
  readonly senderFrame: { readonly parent: unknown; readonly url: string } | null;
}

// True only for the main frame of a Theia window. Theia loads its front end
// from a file (`THEIA_FRONTEND_HTML_PATH`), in development and in the
// packaged app. Every AI1 profile session blocks `file:`, so an AI1 page
// cannot have a `file:` address. A popup of an AI1 page is also of the type
// "window", so `isAi1Page` must refuse it.
export function isTheiaWindowSender<C extends { getType(): string }>(
  event: TheiaSenderEvent<C>,
  isAi1Page: (contents: C) => boolean,
): boolean {
  try {
    if (event.sender.getType() !== "window" || isAi1Page(event.sender)) {
      return false;
    }
    const frame = event.senderFrame;
    if (frame === null || frame === undefined || frame.parent !== null) {
      return false;
    }
    return new URL(frame.url).protocol === "file:";
  } catch {
    // A frame that is gone, or an address that is not correct.
    return false;
  }
}

// Gives a handler that runs `handler` only for a Theia window. For all other
// senders it throws the refusal.
export function guardTheiaSender<
  C extends { getType(): string },
  E extends TheiaSenderEvent<C>,
  A extends unknown[],
  R,
>(isAi1Page: (contents: C) => boolean, handler: (event: E, ...args: A) => R): (event: E, ...args: A) => R {
  return (event, ...args) => {
    if (!isTheiaWindowSender(event, isAi1Page)) {
      throw new Error(THEIA_SENDER_ERROR);
    }
    return handler(event, ...args);
  };
}
