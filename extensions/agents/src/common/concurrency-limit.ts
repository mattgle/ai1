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
