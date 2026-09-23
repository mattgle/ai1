// Tracks at most one open notice handle per id (for example a `Progress`
// from `MessageService.showProgress`), and guards the races an
// asynchronously-opened notice can hit.
//
// Rules:
// - `show` cancels an existing entry of the same id, if any, before it sets
//   the new one as current.
// - `settle` (call once an asynchronously-opened handle is ready) registers
//   it via `show` when `stillWanted` is true; otherwise it cancels the
//   handle at once and leaves the registry as it was -- the "after `await
//   showProgress`, if the model no longer shows the session as blocked (or
//   the id was closed during the await), cancel the new notice at once"
//   rule.
// - `clearIfCurrent` removes an id's entry only when the given handle is
//   still the current one for it, so a stale callback from a handle a
//   newer `show`/`settle` has since replaced (for example an old notice's
//   own `result` promise resolving late) cannot drop that newer handle.
export class NoticeRegistry<H> {
  protected readonly handles = new Map<string, H>();

  constructor(protected readonly cancel: (handle: H) => void) {}

  get(id: string): H | undefined {
    return this.handles.get(id);
  }

  show(id: string, handle: H): void {
    const existing = this.handles.get(id);
    if (existing !== undefined) {
      this.cancel(existing);
    }
    this.handles.set(id, handle);
  }

  settle(id: string, handle: H, stillWanted: boolean): void {
    if (stillWanted) {
      this.show(id, handle);
    } else {
      this.cancel(handle);
    }
  }

  clearIfCurrent(id: string, handle: H): boolean {
    if (this.handles.get(id) === handle) {
      this.handles.delete(id);
      return true;
    }
    return false;
  }

  // Cancels and removes `id`'s entry, if it has one.
  close(id: string): void {
    const existing = this.handles.get(id);
    if (existing !== undefined) {
      this.handles.delete(id);
      this.cancel(existing);
    }
  }

  // Cancels and removes every entry.
  closeAll(): void {
    for (const id of [...this.handles.keys()]) {
      this.close(id);
    }
  }
}
