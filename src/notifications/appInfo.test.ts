import {describe, expect, it} from 'vitest';

import appConfig from '../../app.json';
import {APP_VERSION} from './appInfo';

describe('app info', () => {
  it('uses the native Expo app version for FCM metadata', () => {
    expect(APP_VERSION).toBe('1.2.4');
    expect(APP_VERSION).toBe(appConfig.expo.version);
  });
});
