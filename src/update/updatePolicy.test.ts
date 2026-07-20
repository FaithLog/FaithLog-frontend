import {describe, expect, it} from 'vitest';

import {
  evaluateUpdatePolicy,
  parseMinimumBuild,
  parseNativeBuild,
  validateStoreUrl,
} from './updatePolicy';

describe('parseNativeBuild', () => {
  it.each(['35', '36', '9007199254740991'])(
    'accepts a strict positive safe integer: %s',
    (value) => {
      expect(parseNativeBuild(value)).toBe(Number(value));
    },
  );

  it.each([
    null,
    undefined,
    '',
    ' ',
    '0',
    '-1',
    '1.5',
    'NaN',
    'Infinity',
    '35build',
    '9007199254740992',
  ])('rejects an invalid native build: %s', (value) => {
    expect(parseNativeBuild(value)).toBeNull();
  });
});

describe('parseMinimumBuild', () => {
  it.each(['0', '35', '36', '9007199254740991'])(
    'accepts a strict non-negative safe integer: %s',
    (value) => {
      expect(parseMinimumBuild(value)).toBe(Number(value));
    },
  );

  it.each([
    null,
    undefined,
    '',
    ' ',
    '-1',
    '1.5',
    'NaN',
    'Infinity',
    'minimum36',
    '9007199254740992',
  ])('rejects malformed Remote Config minimum: %s', (value) => {
    expect(parseMinimumBuild(value)).toBeNull();
  });
});

describe('evaluateUpdatePolicy', () => {
  it.each([
    {currentBuild: '35', minimumBuild: '36', required: true},
    {currentBuild: '36', minimumBuild: '36', required: false},
    {currentBuild: '37', minimumBuild: '36', required: false},
    {currentBuild: '35', minimumBuild: '0', required: false},
  ])('compares current=$currentBuild to minimum=$minimumBuild', ({currentBuild, minimumBuild, required}) => {
    expect(evaluateUpdatePolicy({
      platform: 'android',
      currentBuild,
      androidMinimumBuild: minimumBuild,
      iosMinimumBuild: '999',
    }).required).toBe(required);
  });

  it('uses the Android minimum independently from iOS', () => {
    expect(evaluateUpdatePolicy({
      platform: 'android',
      currentBuild: '35',
      androidMinimumBuild: '36',
      iosMinimumBuild: '13',
    }).required).toBe(true);
  });

  it('uses the iOS minimum independently from Android', () => {
    expect(evaluateUpdatePolicy({
      platform: 'ios',
      currentBuild: '13',
      androidMinimumBuild: '35',
      iosMinimumBuild: '14',
    }).required).toBe(true);
  });

  it.each([null, '', ' ', '-1', '1.5', 'NaN', 'Infinity', 'not-a-build', '9007199254740992'])(
    'fails open for malformed minimum value: %s',
    (minimumBuild) => {
      expect(evaluateUpdatePolicy({
        platform: 'ios',
        currentBuild: '13',
        androidMinimumBuild: '36',
        iosMinimumBuild: minimumBuild,
      })).toEqual({required: false, reason: 'invalid-minimum'});
    },
  );

  it('fails open when native build is missing or malformed', () => {
    expect(evaluateUpdatePolicy({
      platform: 'android',
      currentBuild: null,
      androidMinimumBuild: '36',
      iosMinimumBuild: '14',
    })).toEqual({required: false, reason: 'invalid-current'});
  });

  it('fails open on unsupported platforms', () => {
    expect(evaluateUpdatePolicy({
      platform: 'web',
      currentBuild: '1',
      androidMinimumBuild: '36',
      iosMinimumBuild: '14',
    })).toEqual({required: false, reason: 'unsupported-platform'});
  });
});

describe('validateStoreUrl', () => {
  it('accepts only the matching official store host', () => {
    expect(validateStoreUrl('android', 'https://play.google.com/store/apps/details?id=com.faithlog.app')).toBe(
      'https://play.google.com/store/apps/details?id=com.faithlog.app',
    );
    expect(validateStoreUrl('ios', 'https://apps.apple.com/app/id6784053598')).toBe(
      'https://apps.apple.com/app/id6784053598',
    );
  });

  it.each([
    ['android', ''],
    ['android', 'javascript:alert(1)'],
    ['android', 'http://play.google.com/store/apps/details?id=com.faithlog.app'],
    ['android', 'https://apps.apple.com/app/id6784053598'],
    ['ios', 'https://play.google.com/store/apps/details?id=com.faithlog.app'],
    ['ios', 'https://apps.apple.com.evil.example/app/id6784053598'],
  ] as const)('rejects unsafe or platform-mismatched URL: %s %s', (platform, url) => {
    expect(validateStoreUrl(platform, url)).toBeNull();
  });
});
