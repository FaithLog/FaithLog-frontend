const cleanupInFlight = new Set<Promise<void>>();
let restartRequired = false;

export function trackLocalSessionCleanup<T>(operation: Promise<T>) {
  const barrier = operation.then(() => undefined, () => undefined).finally(() => {
    cleanupInFlight.delete(barrier);
  });
  cleanupInFlight.add(barrier);
  return operation;
}

export async function waitForLocalSessionCleanup(timeoutMs: number) {
  if (restartRequired) return false;
  const cleanup = [...cleanupInFlight];
  if (cleanup.length === 0) return true;
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeout = new Promise<false>((resolve) => {
    timeoutId = setTimeout(() => resolve(false), timeoutMs);
  });
  try {
    const completed = await Promise.race([Promise.all(cleanup).then(() => true), timeout]);
    if (!completed) restartRequired = true;
    return completed;
  } finally {
    clearTimeout(timeoutId!);
  }
}

export function resetLocalCleanupBarrierForTests() {
  cleanupInFlight.clear();
  restartRequired = false;
}
