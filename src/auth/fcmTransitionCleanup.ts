import {
  clearFcmRemoteCleanupObligations,
  getFcmRemoteCleanupObligations,
  markFcmRemoteCleanupPending,
} from '../api/tokenStorage';
import type {FcmRemoteCleanupObligation} from '../notifications/fcmRegistration';
const cleanupInFlight = new Set<Promise<void>>();
const cleanupByGeneration = new Map<number, Promise<void>>();
let reconciliationInFlight: Promise<boolean> | null = null;
let restartRequired = false;
type CleanupCapture = {
  barrier: Promise<void>;
  settlement: Promise<FcmRemoteCleanupObligation[]>;
  hasPendingOperations: boolean;
  hasPendingContexts?: boolean;
  obligations?: FcmRemoteCleanupObligation[];
};
let captureCleanup = (_generation?: number): CleanupCapture => ({
  barrier: Promise.resolve(), settlement: Promise.resolve([]), hasPendingOperations: false,
});
let compensateCleanup: (
  obligations: FcmRemoteCleanupObligation[],
) => Promise<FcmRemoteCleanupObligation[]> = async (obligations) => obligations;

export function configureFcmTransitionCleanup(options: {
  capture: (generation?: number) => CleanupCapture;
  compensate: (
    obligations: FcmRemoteCleanupObligation[],
  ) => Promise<FcmRemoteCleanupObligation[]>;
}) {
  captureCleanup = options.capture;
  compensateCleanup = options.compensate;
}

export function beginFcmTransitionCleanup(generation?: number) {
  const key = generation ?? -1;
  const existing = cleanupByGeneration.get(key);
  if (existing) return existing;
  const captured = captureCleanup(generation);
  if (!(captured.hasPendingContexts ?? captured.hasPendingOperations)) return Promise.resolve();
  const initialObligations = [...(captured.obligations ?? [])];
  const operation = (async () => {
    if (initialObligations.length > 0) {
      await markFcmRemoteCleanupPending(initialObligations);
    }
    await captured.barrier;
    const obligations = await captured.settlement;
    const prepared = obligations.filter((obligation) => obligation.state === 'prepared');
    const dispatched = obligations.filter((obligation) => obligation.state !== 'prepared');
    if (dispatched.length > 0) {
      await markFcmRemoteCleanupPending(dispatched);
    }
    if (prepared.length > 0) {
      await clearFcmRemoteCleanupObligations(prepared);
    }
    if (dispatched.length === 0) {
      await clearFcmRemoteCleanupObligations([...initialObligations, ...obligations]);
      return;
    }
    const processed = await compensateCleanup(dispatched);
    await clearFcmRemoteCleanupObligations([
      ...initialObligations,
      ...obligations,
      ...processed,
    ]);
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
    if (cleanupByGeneration.get(key) === tracked) cleanupByGeneration.delete(key);
  });
  cleanupInFlight.add(tracked);
  cleanupByGeneration.set(key, tracked);
  void tracked.catch(() => undefined);
  return tracked;
}

export function trackFcmTransitionBarrier(operation: Promise<void>) {
  const tracked = operation.then(
    () => undefined,
    (error) => {
      restartRequired = true;
      throw error;
    },
  ).finally(() => {
    cleanupInFlight.delete(tracked);
  });
  cleanupInFlight.add(tracked);
  void tracked.catch(() => undefined);
  return operation;
}

export async function requireFcmRemoteCleanupRestart(
  obligations: FcmRemoteCleanupObligation[] = [],
) {
  restartRequired = true;
  await markFcmRemoteCleanupPending(obligations);
}

export async function clearFcmRemoteCleanupGateIfIdle(
  obligations: FcmRemoteCleanupObligation[] = [],
) {
  if (!restartRequired) {
    await clearFcmRemoteCleanupObligations(obligations);
  }
}

export async function waitForFcmTransitionCleanup(timeoutMs: number) {
  if (restartRequired) return false;
  const deadline = Date.now() + timeoutMs;
  if (cleanupInFlight.size === 0) {
    reconciliationInFlight ??= reconcileDurableCleanup(deadline).finally(() => {
      reconciliationInFlight = null;
    });
    try {
      if (!(await runBeforeDeadline(reconciliationInFlight, deadline))) return false;
    } catch {
      restartRequired = true;
      return false;
    }
    if (restartRequired) return false;
  }
  while (cleanupInFlight.size > 0) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      await requireFcmRemoteCleanupRestart().catch(() => undefined);
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
      await requireFcmRemoteCleanupRestart().catch(() => undefined);
      return false;
    }
    if (restartRequired) return false;
  }
  if (restartRequired) return false;
  reconciliationInFlight ??= reconcileDurableCleanup(deadline).finally(() => {
    reconciliationInFlight = null;
  });
  try {
    return await runBeforeDeadline(reconciliationInFlight, deadline);
  } catch {
    restartRequired = true;
    return false;
  }
}

async function reconcileDurableCleanup(deadline: number) {
  try {
    const durable = await runBeforeDeadline(getFcmRemoteCleanupObligations(), deadline);
    if (durable === null) return true;
    if (durable.length === 0) return false;
    const processed = await runBeforeDeadline(compensateCleanup(durable.map((obligation) => ({
      ...obligation, state: 'mayHaveSent' as const,
    }))), deadline);
    await runBeforeDeadline(
      clearFcmRemoteCleanupObligations([...durable, ...processed]),
      deadline,
    );
    return true;
  } catch {
    restartRequired = true;
    return false;
  }
}

function runBeforeDeadline<T>(promise: Promise<T>, deadline: number): Promise<T> {
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) return Promise.reject(new Error('FCM cleanup deadline exceeded.'));
  let timeoutId: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error('FCM cleanup deadline exceeded.')),
        remainingMs,
      );
    }),
  ]).finally(() => clearTimeout(timeoutId!));
}

export function resetFcmTransitionCleanupForTests() {
  cleanupInFlight.clear();
  cleanupByGeneration.clear();
  reconciliationInFlight = null;
  restartRequired = false;
}
