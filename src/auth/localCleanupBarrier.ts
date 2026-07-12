const cleanupInFlight = new Set<Promise<void>>();
let restartRequired = false;

export function trackLocalSessionCleanup<T>(
  operation: Promise<T>,
  options: {isCancellation?: (error: unknown) => boolean} = {},
) {
  const barrier = operation.then(
    () => undefined,
    (error) => {
      if (!options.isCancellation?.(error)) restartRequired = true;
    },
  ).finally(() => {
    cleanupInFlight.delete(barrier);
  });
  cleanupInFlight.add(barrier);
  return operation;
}

export async function waitForLocalSessionCleanup(timeoutMs: number) {
  if (restartRequired) return false;
  const deadline = Date.now() + timeoutMs;

  while (cleanupInFlight.size > 0) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      restartRequired = true;
      return false;
    }
    const cleanup = [...cleanupInFlight];
    let timeoutId: ReturnType<typeof setTimeout>;
    const completed = await Promise.race([
      Promise.all(cleanup).then(() => true),
      new Promise<false>((resolve) => {
        timeoutId = setTimeout(() => resolve(false), remainingMs);
      }),
    ]).finally(() => clearTimeout(timeoutId!));
    if (!completed) {
      restartRequired = true;
      return false;
    }
    if (restartRequired) return false;
  }

  return !restartRequired;
}

export function resetLocalCleanupBarrierForTests() {
  cleanupInFlight.clear();
  restartRequired = false;
}
