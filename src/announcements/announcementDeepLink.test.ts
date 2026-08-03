import {describe, expect, it, vi} from 'vitest';

import {
  createAnnouncementDeepLinkCommitQueue,
  createCampusNavigationIntentCoordinator,
  handleInitialAnnouncementNotificationOpen,
  resolveAnnouncementDeepLinkCampus,
} from './announcementDeepLink';

describe('announcement cross-campus deep links', () => {
  it('keeps the current campus without an unnecessary membership refresh', async () => {
    const refreshCampus = vi.fn();

    await expect(resolveAnnouncementDeepLinkCampus({
      currentCampusId: 7,
      refreshCampus,
      targetCampusId: 7,
    })).resolves.toEqual({status: 'ready', campusId: 7, switched: false});
    expect(refreshCampus).not.toHaveBeenCalled();
  });

  it('switches only when refreshed ACTIVE membership selects the target campus', async () => {
    const refreshCampus = vi.fn().mockResolvedValue(9);

    await expect(resolveAnnouncementDeepLinkCampus({
      currentCampusId: 7,
      refreshCampus,
      targetCampusId: 9,
    })).resolves.toEqual({status: 'ready', campusId: 9, switched: true});
    expect(refreshCampus).toHaveBeenCalledWith(9);
  });

  it.each([null, 7, 10])(
    'fails closed when refreshed membership does not select the requested campus (%s)',
    async (selectedCampusId) => {
      await expect(resolveAnnouncementDeepLinkCampus({
        currentCampusId: 7,
        refreshCampus: vi.fn().mockResolvedValue(selectedCampusId),
        targetCampusId: 9,
      })).resolves.toEqual({status: 'unavailable'});
    },
  );

  it('serializes persistence and applies only the latest cross-campus notification', async () => {
    const queue = createAnnouncementDeepLinkCommitQueue();
    const firstPersistence = deferred<void>();
    const persisted: number[] = [];
    const applied: number[] = [];
    let latestSequence = 1;

    const first = queue.enqueue({
      apply: () => applied.push(7),
      isLatest: () => latestSequence === 1,
      isSessionCurrent: () => true,
      persist: async () => {
        await firstPersistence.promise;
        persisted.push(7);
      },
    });
    await Promise.resolve();

    latestSequence = 2;
    const second = queue.enqueue({
      apply: () => applied.push(9),
      isLatest: () => latestSequence === 2,
      isSessionCurrent: () => true,
      persist: async () => {
        persisted.push(9);
      },
    });
    firstPersistence.resolve();

    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(persisted).toEqual([7, 9]);
    expect(applied).toEqual([7, 9]);
  });

  it('finishes persistence and apply atomically after a valid commit has started', async () => {
    const queue = createAnnouncementDeepLinkCommitQueue();
    const persistence = deferred<void>();
    const persisted: number[] = [];
    const applied: number[] = [];
    let latestSequence = 1;

    const committing = queue.enqueue({
      apply: () => applied.push(7),
      isLatest: () => latestSequence === 1,
      isSessionCurrent: () => true,
      persist: async () => {
        await persistence.promise;
        persisted.push(7);
      },
    });
    await Promise.resolve();
    latestSequence = 2;
    persistence.resolve();

    await expect(committing).resolves.toBe(true);
    expect(persisted).toEqual([7]);
    expect(applied).toEqual([7]);
  });

  it('does not begin a stale queued commit or apply after the auth session changes', async () => {
    const queue = createAnnouncementDeepLinkCommitQueue();
    const blocker = deferred<void>();
    let sessionCurrent = true;
    const persist = vi.fn(async () => undefined);
    const apply = vi.fn();
    const first = queue.enqueue({
      apply: vi.fn(),
      isLatest: () => true,
      isSessionCurrent: () => true,
      persist: () => blocker.promise,
    });
    const stale = queue.enqueue({
      apply,
      isLatest: () => true,
      isSessionCurrent: () => sessionCurrent,
      persist,
    });
    sessionCurrent = false;
    blocker.resolve();

    await expect(Promise.all([first, stale])).resolves.toEqual([true, false]);
    expect(persist).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it('discards a deferred initial notification after a newer live ingress begins', async () => {
    const initialPayload = deferred<unknown>();
    const handled: string[] = [];
    let ingressSequence = 0;
    const initial = handleInitialAnnouncementNotificationOpen({
      getPayload: () => initialPayload.promise,
      handlePayload: async () => {
        ingressSequence += 1;
        handled.push('initial');
      },
      isActive: () => true,
      readSequence: () => ingressSequence,
    });

    ingressSequence += 1;
    handled.push('live');
    initialPayload.resolve({announcementId: 'older-initial'});

    await expect(initial).resolves.toBe(false);
    expect(handled).toEqual(['live']);
  });

  it('discards a deferred initial notification after a manual campus intent begins', async () => {
    const coordinator = createCampusNavigationIntentCoordinator();
    const initialPayload = deferred<unknown>();
    const initialIntent = coordinator.begin();
    const handlePayload = vi.fn(async () => undefined);
    const initial = handleInitialAnnouncementNotificationOpen({
      getPayload: () => initialPayload.promise,
      handlePayload,
      isActive: () => true,
      isCurrent: () => coordinator.isCurrent(initialIntent),
      readSequence: () => 0,
    });

    const manualIntent = coordinator.begin();
    await coordinator.enqueue({
      apply: vi.fn(),
      intent: manualIntent,
      isSessionCurrent: () => true,
      persist: async () => undefined,
    });
    initialPayload.resolve({announcementId: 'older-initial'});

    await expect(initial).resolves.toBe(false);
    expect(handlePayload).not.toHaveBeenCalled();
  });

  it('keeps a newer manual campus selection over an older deferred notification', async () => {
    const coordinator = createCampusNavigationIntentCoordinator();
    const notificationRefresh = deferred<void>();
    const applied: number[] = [];
    const persisted: number[] = [];
    const notificationIntent = coordinator.begin();
    const notification = (async () => {
      await notificationRefresh.promise;
      return coordinator.enqueue({
        apply: () => applied.push(2),
        intent: notificationIntent,
        isSessionCurrent: () => true,
        persist: async () => { persisted.push(2); },
      });
    })();

    const manualIntent = coordinator.begin();
    await expect(coordinator.enqueue({
      apply: () => applied.push(3),
      intent: manualIntent,
      isSessionCurrent: () => true,
      persist: async () => { persisted.push(3); },
    })).resolves.toBe(true);
    notificationRefresh.resolve();

    await expect(notification).resolves.toBe(false);
    expect(persisted).toEqual([3]);
    expect(applied).toEqual([3]);
  });

  it('keeps a newer notification over an older deferred campus-sheet refresh', async () => {
    const coordinator = createCampusNavigationIntentCoordinator();
    const sheetRefresh = deferred<void>();
    const applied: number[] = [];
    const persisted: number[] = [];
    const refreshIntent = coordinator.begin();
    const refresh = (async () => {
      await sheetRefresh.promise;
      return coordinator.enqueue({
        apply: () => applied.push(1),
        intent: refreshIntent,
        isSessionCurrent: () => true,
        persist: async () => { persisted.push(1); },
      });
    })();

    const notificationIntent = coordinator.begin();
    await expect(coordinator.enqueue({
      apply: () => applied.push(2),
      intent: notificationIntent,
      isSessionCurrent: () => true,
      persist: async () => { persisted.push(2); },
    })).resolves.toBe(true);
    sheetRefresh.resolve();

    await expect(refresh).resolves.toBe(false);
    expect(persisted).toEqual([2]);
    expect(applied).toEqual([2]);
  });

  it('commits a same-current manual selection after an older notification commit already started', async () => {
    const coordinator = createCampusNavigationIntentCoordinator();
    const notificationPersistence = deferred<void>();
    const applied: number[] = [];
    const persisted: number[] = [];
    const notificationIntent = coordinator.begin();
    const notification = coordinator.enqueue({
      apply: () => applied.push(2),
      intent: notificationIntent,
      isSessionCurrent: () => true,
      persist: async () => {
        await notificationPersistence.promise;
        persisted.push(2);
      },
    });
    await Promise.resolve();

    const manualIntent = coordinator.begin();
    const manual = coordinator.enqueue({
      apply: () => applied.push(1),
      intent: manualIntent,
      isSessionCurrent: () => true,
      persist: async () => { persisted.push(1); },
    });
    notificationPersistence.resolve();

    await expect(Promise.all([notification, manual])).resolves.toEqual([true, true]);
    expect(persisted).toEqual([2, 1]);
    expect(applied).toEqual([2, 1]);
    expect(persisted.at(-1)).toBe(1);
    expect(applied.at(-1)).toBe(1);
  });

  it('lets a newer sheet refresh restore its campus and route after a notification commit started', async () => {
    const coordinator = createCampusNavigationIntentCoordinator();
    const notificationPersistence = deferred<void>();
    let state = {announcementId: null as number | null, campusId: 1, route: 'profile'};
    const notificationIntent = coordinator.begin();
    const notification = coordinator.enqueue({
      apply: () => { state = {announcementId: 77, campusId: 2, route: 'announcements'}; },
      intent: notificationIntent,
      isSessionCurrent: () => true,
      persist: () => notificationPersistence.promise,
    });
    await Promise.resolve();

    const refreshIntent = coordinator.begin();
    const refresh = coordinator.enqueue({
      apply: () => { state = {announcementId: null, campusId: 1, route: 'profile'}; },
      intent: refreshIntent,
      isSessionCurrent: () => true,
      persist: async () => undefined,
    });
    notificationPersistence.resolve();

    await expect(Promise.all([notification, refresh])).resolves.toEqual([true, true]);
    expect(state).toEqual({announcementId: null, campusId: 1, route: 'profile'});
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return {promise, resolve};
}
