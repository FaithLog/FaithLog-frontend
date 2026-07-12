import {describe, expect, it, vi} from 'vitest';
import {createNotificationOperationCoordinator} from './notificationOperationCoordinator';

describe('notification operation coordinator', () => {
  it('does not forward the Pressable event as a generation', () => {
    const coordinator = createNotificationOperationCoordinator(() => true);
    const inspect = vi.fn(async () => {});
    const onPress = coordinator.createInspectPressHandler(inspect);
    (onPress as (event: unknown) => void)({nativeEvent: {}});
    expect(inspect).toHaveBeenCalledWith();
  });

  it('applies only the latest same-generation deferred operation', async () => {
    const coordinator = createNotificationOperationCoordinator(() => true);
    coordinator.setup();
    const first = coordinator.start(4);
    let finishFirst!: () => void;
    const firstResult = new Promise<void>((resolve) => { finishFirst = resolve; });
    const applied = vi.fn();
    const firstApply = firstResult.then(() => {
      if (coordinator.isCurrent(first)) applied('first');
    });

    const second = coordinator.start(4);
    expect(coordinator.isCurrent(first)).toBe(false);
    expect(coordinator.isCurrent(second)).toBe(true);
    finishFirst();
    await firstApply;
    expect(applied).not.toHaveBeenCalled();
  });

  it('blocks deferred error application after unmount', async () => {
    const coordinator = createNotificationOperationCoordinator(() => true);
    coordinator.setup();
    const first = coordinator.start(7);
    let rejectOperation!: (error: Error) => void;
    const applyError = vi.fn();
    const operation = new Promise<void>((_, reject) => { rejectOperation = reject; })
      .catch(() => {
        if (coordinator.isCurrent(first)) applyError();
      });
    coordinator.cleanup();
    rejectOperation(new Error('offline'));
    await operation;
    expect(applyError).not.toHaveBeenCalled();
  });

  it('restores mounted operation checks after StrictMode setup-cleanup-setup', () => {
    const coordinator = createNotificationOperationCoordinator(() => true);
    coordinator.setup();
    const first = coordinator.start(7);
    coordinator.cleanup();
    expect(coordinator.isCurrent(first)).toBe(false);
    coordinator.setup();
    const second = coordinator.start(7);
    expect(coordinator.isCurrent(second)).toBe(true);
  });
});
