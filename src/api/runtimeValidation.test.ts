import {describe, expect, it} from 'vitest';

import {
  parseCampusMembershipSummaries,
  parseCampusMembershipSummary,
  parseCurrentUser,
  parseFcmTokenRegisterResponse,
  parseLoginResponse,
  parseSignupResponse,
  parseTokenPair,
} from './runtimeValidation';

const VALID_MEMBERSHIP = {
  membershipId: 10,
  campusId: 20,
  campusName: '서울 캠퍼스',
  region: '서울',
  campusRole: 'CAMPUS_LEADER',
  status: 'ACTIVE',
};

const VALID_USER_MEMBERSHIP = {
  campusId: 20,
  campusName: '서울 캠퍼스',
  region: '서울',
  campusRole: 'CAMPUS_LEADER',
  status: 'ACTIVE',
};

const VALID_USER = {
  id: 7,
  name: '테스트 사용자',
  email: 'user@example.test',
  role: 'ADMIN',
  isActive: true,
  lastLoginAt: '2026-07-10T09:30:00.000+09:00',
  campusMemberships: [VALID_USER_MEMBERSHIP],
};

const VALID_TOKEN_PAIR = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  accessTokenExpiresIn: 3_600,
  refreshTokenExpiresIn: 7_200,
  tokenType: 'Bearer',
};

const INVALID_RESPONSE = 'Invalid API response.';

describe('runtime API response validation', () => {
  it('parses and sanitizes a valid token pair', () => {
    expect(parseTokenPair({...VALID_TOKEN_PAIR, ignored: 'field'})).toEqual(
      VALID_TOKEN_PAIR,
    );
  });

  it('rejects non-finite or negative token expiries', () => {
    expect(() =>
      parseTokenPair({...VALID_TOKEN_PAIR, accessTokenExpiresIn: Number.NaN}),
    ).toThrow(INVALID_RESPONSE);
    expect(() =>
      parseTokenPair({...VALID_TOKEN_PAIR, refreshTokenExpiresIn: -1}),
    ).toThrow(INVALID_RESPONSE);
    expect(() =>
      parseTokenPair({...VALID_TOKEN_PAIR, accessTokenExpiresIn: Infinity}),
    ).toThrow(INVALID_RESPONSE);
  });

  it('parses a valid login response including its user and memberships', () => {
    expect(
      parseLoginResponse({...VALID_TOKEN_PAIR, user: VALID_USER}),
    ).toEqual({...VALID_TOKEN_PAIR, user: VALID_USER});
  });

  it('accepts a null last-login timestamp and rejects a malformed timestamp', () => {
    expect(parseCurrentUser({...VALID_USER, lastLoginAt: null}).lastLoginAt).toBe(
      null,
    );
    expect(() =>
      parseCurrentUser({...VALID_USER, lastLoginAt: 'definitely-not-a-date'}),
    ).toThrow(INVALID_RESPONSE);
  });

  it('parses the current-user membership shape without a membership ID', () => {
    expect(parseCurrentUser(VALID_USER).campusMemberships).toEqual([
      VALID_USER_MEMBERSHIP,
    ]);
    expect(
      parseCurrentUser({
        ...VALID_USER,
        campusMemberships: [{...VALID_USER_MEMBERSHIP, membershipId: 10}],
      }).campusMemberships,
    ).toEqual([{...VALID_USER_MEMBERSHIP, membershipId: 10}]);
    expect(() =>
      parseCurrentUser({
        ...VALID_USER,
        campusMemberships: [{...VALID_USER_MEMBERSHIP, membershipId: 0}],
      }),
    ).toThrow(INVALID_RESPONSE);
    expect(() =>
      parseCurrentUser({
        ...VALID_USER,
        campusMemberships: [{...VALID_USER_MEMBERSHIP, campusId: undefined}],
      }),
    ).toThrow(INVALID_RESPONSE);
  });

  it('rejects invalid IDs, booleans, and user roles', () => {
    expect(() => parseCurrentUser({...VALID_USER, id: 0})).toThrow(
      INVALID_RESPONSE,
    );
    expect(() => parseCurrentUser({...VALID_USER, isActive: 1})).toThrow(
      INVALID_RESPONSE,
    );
    expect(() => parseCurrentUser({...VALID_USER, role: 'SUPER_ADMIN'})).toThrow(
      INVALID_RESPONSE,
    );
  });

  it('parses one campus membership and a membership array', () => {
    expect(parseCampusMembershipSummary(VALID_MEMBERSHIP)).toEqual(
      VALID_MEMBERSHIP,
    );
    expect(parseCampusMembershipSummaries([VALID_MEMBERSHIP])).toEqual([
      VALID_MEMBERSHIP,
    ]);
  });

  it('rejects malformed membership collections and campus roles', () => {
    expect(() => parseCampusMembershipSummaries({0: VALID_MEMBERSHIP})).toThrow(
      INVALID_RESPONSE,
    );
    expect(() =>
      parseCampusMembershipSummary(VALID_USER_MEMBERSHIP),
    ).toThrow(INVALID_RESPONSE);
    expect(() =>
      parseCampusMembershipSummary({...VALID_MEMBERSHIP, campusRole: 'OWNER'}),
    ).toThrow(INVALID_RESPONSE);
    expect(() =>
      parseCampusMembershipSummary({...VALID_MEMBERSHIP, campusName: ' '.repeat(8)}),
    ).toThrow(INVALID_RESPONSE);
  });

  it('parses a valid FCM registration for every declared device type', () => {
    const baseRegistration = {
      tokenId: 7001,
      clientInstanceId: 'client-instance-id',
      appVersion: '1.0.0',
      isActive: true,
      lastSeenAt: '2026-07-10T00:00:00.000Z',
      lastRefreshedAt: '2026-07-10T01:00:00+00:00',
    };

    for (const deviceType of ['ANDROID', 'IOS', 'WEB'] as const) {
      expect(
        parseFcmTokenRegisterResponse({...baseRegistration, deviceType}),
      ).toEqual({...baseRegistration, deviceType});
    }
  });

  it('rejects unrecognized FCM devices and malformed FCM dates', () => {
    const registration = {
      tokenId: 7001,
      deviceType: 'DESKTOP',
      clientInstanceId: 'client-instance-id',
      appVersion: '1.0.0',
      isActive: true,
      lastSeenAt: '2026-07-10T00:00:00.000Z',
      lastRefreshedAt: 'not-a-date',
    };

    expect(() => parseFcmTokenRegisterResponse(registration)).toThrow(
      INVALID_RESPONSE,
    );
    expect(() =>
      parseFcmTokenRegisterResponse({
        ...registration,
        deviceType: 'IOS',
      }),
    ).toThrow(INVALID_RESPONSE);
  });

  it('parses a valid signup response and rejects an oversized field', () => {
    const signup = {
      id: 7,
      name: '새 사용자',
      email: 'new.user@example.test',
      role: 'USER',
      isActive: true,
    };

    expect(parseSignupResponse(signup)).toEqual(signup);
    expect(() =>
      parseSignupResponse({...signup, email: 'a'.repeat(321)}),
    ).toThrow(INVALID_RESPONSE);
  });

  it('does not leak malicious getter errors or values', () => {
    const malicious = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(malicious, 'accessToken', {
      get() {
        throw new Error('secret-access-token-from-attacker');
      },
    });

    let error: unknown;
    try {
      parseTokenPair(malicious);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(INVALID_RESPONSE);
    expect((error as Error).message).not.toContain('secret-access-token');
  });

  it('rejects objects with an unexpected prototype', () => {
    class CraftedResponse {}

    expect(() => parseTokenPair(new CraftedResponse())).toThrow(
      INVALID_RESPONSE,
    );
  });
});
