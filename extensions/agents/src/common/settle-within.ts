// Waits for `task` to settle, but never longer than `ms`. It never rejects.
// A shutdown step uses it, so a back end that does not answer cannot keep
// the window open.
export async function settleWithin(task: Promise<unknown>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  try {
    await Promise.race([task.then(noop, noop), limit]);
  } finally {
    clearTimeout(timer);
  }
}

function noop(): void {
  // Nothing: the caller only needs the task to be over.
}
