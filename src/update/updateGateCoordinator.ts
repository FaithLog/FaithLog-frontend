import type {NativeUpdatePlatform} from './updatePolicy';
import {validateStoreUrl} from './updatePolicy';

export function createForegroundUpdateCoordinator<Result>(check: () => Promise<Result>) {
  let cycle = 0;
  let checkedCycle = -1;
  let inFlight: Promise<Result> | null = null;

  return {
    beginForegroundCycle() {
      cycle += 1;
      inFlight = null;
    },
    checkCurrentCycle() {
      if (inFlight && checkedCycle === cycle) return inFlight;
      checkedCycle = cycle;
      inFlight = check();
      return inFlight;
    },
    isCurrent(promise: Promise<Result>) {
      return checkedCycle === cycle && inFlight === promise;
    },
  };
}

type StoreLinking = {
  canOpenURL(url: string): Promise<boolean>;
  openURL(url: string): Promise<unknown>;
};

export function createStoreUrlOpener(linking: StoreLinking) {
  let inFlight: Promise<{ok: boolean}> | null = null;

  return {
    open(platform: NativeUpdatePlatform, untrustedUrl: string | null) {
      if (inFlight) return inFlight;

      const url = validateStoreUrl(platform, untrustedUrl);
      if (!url) return Promise.resolve({ok: false});

      inFlight = (async () => {
        try {
          if (!(await linking.canOpenURL(url))) return {ok: false};
          await linking.openURL(url);
          return {ok: true};
        } catch {
          return {ok: false};
        } finally {
          inFlight = null;
        }
      })();
      return inFlight;
    },
  };
}
