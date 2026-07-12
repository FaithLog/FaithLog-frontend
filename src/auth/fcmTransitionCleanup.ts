import {
  clearFcmRemoteCleanupPending,
  getFcmRemoteCleanupObligations,
  markFcmRemoteCleanupPending,
} from '../api/tokenStorage';
import type {FcmRemoteCleanupObligation} from '../notifications/fcmRegistration';
const cleanupInFlight = new Set<Promise<void>>();
let restartRequired = false;
type CleanupCapture = {
  barrier: Promise<void>;
  settlement: Promise<FcmRemoteCleanupObligation[]>;
  hasPendingOperations: boolean;
  obligations?: FcmRemoteCleanupObligation[];
};
let captureCleanup = (_generation?: number): CleanupCapture => ({
  barrier: Promise.resolve(), settlement: Promise.resolve([]), hasPendingOperations: false,
});
let compensateCleanup: (obligations: FcmRemoteCleanupObligation[]) => Promise<unknown> =
  async () => undefined;

export function configureFcmTransitionCleanup(options: {
  capture: (generation?: number) => CleanupCapture;
  compensate: (obligations: FcmRemoteCleanupObligation[]) => Promise<unknown>;
}) {
  captureCleanup = options.capture;
  compensateCleanup = options.compensate;
}

export function beginFcmTransitionCleanup(generation?: number) {
  const captured = captureCleanup(generation);
  if (!captured.hasPendingOperations) return Promise.resolve();
  const operation = (async () => {
    await markFcmRemoteCleanupPending(captured.obligations ?? []);
    await captured.barrier;
    const obligations = await captured.settlement;
    await compensateCleanup(obligations);
  })();
  const tracked = operation.then(
    () => undefined,
    async (error) => {
      restartRequired = true;
      await markFcmRemoteCleanupPending().catch(() => undefined);
      throw error;
    },
  ).finally(async () => {
    cleanupInFlight.delete(tracked);
    if (!restartRequired && cleanupInFlight.size === 0) {
      await clearFcmRemoteCleanupPending();
    }
  });
  cleanupInFlight.add(tracked);
  void tracked.catch(() => undefined);
  return tracked;
}

export async function requireFcmRemoteCleanupRestart(
  obligations: FcmRemoteCleanupObligation[] = [],
) {
  restartRequired = true;
  await markFcmRemoteCleanupPending(obligations);
}

export async function clearFcmRemoteCleanupGateIfIdle() {
  if (!restartRequired && cleanupInFlight.size === 0) {
    await clearFcmRemoteCleanupPending();
  }
}

export async function waitForFcmTransitionCleanup(timeoutMs: number) {
  if (restartRequired) return false;
  if (cleanupInFlight.size === 0) {
    const durable = await getFcmRemoteCleanupObligations();
    if (durable) {
      if (durable.length === 0) return false;
      try {
        await compensateCleanup(durable.map((obligation) => ({
          ...obligation, state: 'mayHaveSent' as const,
        })));
        await clearFcmRemoteCleanupPending();
      } catch {
        restartRequired = true;
        return false;
      }
    }
  }
  const deadline = Date.now() + timeoutMs;
  while (cleanupInFlight.size > 0) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      await requireFcmRemoteCleanupRestart();
      return false;
    }
    let timeoutId: ReturnType<typeof setTimeout>;
    let completed: boolean;
    try {
      completed = await Promise.race([
        Promise.all([...cleanupInFlight]).then(() => true),
        new Promise<false>((resolve) => {
          timeoutId = setTimeout(() => resolve(false), remainingMs);
        }),
      ]).finally(() => clearTimeout(timeoutId!));
    } catch {
      restartRequired = true;
      return false;
    }
    if (!completed) {
      await requireFcmRemoteCleanupRestart();
      return false;
    }
    if (restartRequired) return false;
  }
  return !(restartRequired || (await getFcmRemoteCleanupObligations()) !== null);
}

export function resetFcmTransitionCleanupForTests() {
  cleanupInFlight.clear();
  restartRequired = false;
}
