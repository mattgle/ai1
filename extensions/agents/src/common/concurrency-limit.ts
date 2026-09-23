// Runs `items` through `task`, at most `limit` at a time, and gives the
// results in the same order as `items` (regardless of which task settles
// first). A plain `Promise.all(items.map(task))` starts every task at
// once; this caps how many run concurrently, so a workspace with many
// repositories does not fire one HTTP request per repository all at once.
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await task(items[index]);
    }
  }
  const workerCount = Math.max(0, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

// Like `mapLimit`, but every per-item error is caught (never propagated):
// an item whose `task` rejects gets `fallback(item)` in its place, the
// same as `mapLimit` callers already do with their own `.catch(...)`. The
// difference is `isFatal`: once one item's error matches it, this stops
// *starting* any further item -- everything not yet started gets
// `fallback(item)` at once, with no call to `task` at all. An item
// already in flight at that moment is not cancelled; it still settles on
// its own, with its own real result (success) or its own `fallback`
// (any error, fatal or not).
//
// Built for `AgentsServiceImpl`'s message-count phase: a single hung
// request (a client-side request timeout, `isFatal`'s only match there)
// must not make the whole phase cost `items.length / limit` timeouts --
// once the first one is seen, the rest of a large session list is not
// worth waiting on one timeout at a time for. An ordinary per-item error
// (a 404, a 500) is not fatal: it must not stop sessions after it from
// still getting their own real answer.
export async function mapLimitUntilFatal<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
  isFatal: (error: unknown) => boolean,
  fallback: (item: T) => R,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  let stopped = false;
  async function worker(): Promise<void> {
    while (next < items.length) {
      if (stopped) {
        // Drains every remaining item with the fallback, no `task` call.
        // No `await` runs in this loop, so this finishes in one turn --
        // no other worker can interleave and touch the same indices.
        while (next < items.length) {
          const index = next;
          next += 1;
          results[index] = fallback(items[index]);
        }
        return;
      }
      const index = next;
      next += 1;
      try {
        results[index] = await task(items[index]);
      } catch (error) {
        if (isFatal(error)) {
          stopped = true;
        }
        results[index] = fallback(items[index]);
      }
    }
  }
  const workerCount = Math.max(0, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
