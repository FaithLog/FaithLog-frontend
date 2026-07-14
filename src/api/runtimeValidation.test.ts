import {describe, expect, it} from 'vitest';

import {mockDomainFixtures} from './mockFixtures';
import * as responseParsers from './runtimeValidation';
import {
  parseAdminDashboardSummary,
  parseAdminMemberChargeList,
  parseAdminChargeStatusChangeResponse,
  parseAdminNotificationResponse,
  parseCampusDetail,
  parseCampusMembershipSummaries,
  parseCampusMembershipSummary,
  parseChargeList,
  parseCurrentUser,
  parseFcmTokenRegisterResponse,
  parseLoginResponse,
  parseNullResponse,
  parsePollDetail,
  parsePollSummaryList,
  parsePrayerWeekSummary,
  parseSignupResponse,
  parseTokenPair,
  parseWeeklyDevotionSummary,
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

const VALID_DELETE_ACCOUNT_RESPONSE = {
  deletedAt: '2026-07-10T09:30:00.000+09:00',
};

const VALID_MY_DUTY_ASSIGNMENT = {
  userId: 7,
  campusId: 1,
  dutyType: 'COFFEE',
  isActive: true,
};

const VALID_PRAYER_ASSIGNABLE_MEMBERS = [
  {
    userId: 8,
    name: '샘플 친구',
    email: 'faithlog.friend@example.test',
    assignedGroupId: null,
    assignedGroupName: null,
    assignable: true,
  },
];

// This mirrors createMockAdminPollTemplate so that the runtime contract also
// exercises the HH:mm values returned by the local mock adapter.
const VALID_ADMIN_POLL_TEMPLATE = {
  ...mockDomainFixtures.poll.detail,
  id: 801,
  pollType: 'COFFEE',
  selectionType: 'SINGLE',
  autoCreateEnabled: true,
  startDayOfWeek: 3,
  startTime: '09:00',
  endDayOfWeek: 4,
  endTime: '09:00',
  isDefault: true,
  isActive: true,
};

const VALID_CREATED_ADMIN_POLL_TEMPLATE = {
  ...VALID_ADMIN_POLL_TEMPLATE,
  id: 900,
  title: '반복 투표',
  startDayOfWeek: 1,
  startTime: '09:00',
  endDayOfWeek: 2,
  endTime: '18:00',
  isDefault: false,
  options: [
    {
      id: 90_001,
      content: '아메리카노',
      composeMenuCode: 'AMERICANO',
      priceAmount: 4_500,
      sortOrder: 1,
    },
  ],
};

const VALID_ADMIN_POLL = {
  ...mockDomainFixtures.poll.detail,
  allowUserOptionAdd: true,
};

const VALID_ADMIN_POLL_MISSING_MEMBERS = [
  {
    userId: 8,
    name: '샘플 친구',
    email: 'faithlog.friend@example.test',
  },
];

const VALID_PARSER_PAYLOADS = {
  parseNullResponse: undefined,
  parseTokenPair: mockDomainFixtures.auth.tokenPair,
  parseLoginResponse: mockDomainFixtures.auth.login,
  parseSignupResponse: mockDomainFixtures.auth.signup,
  parseDeleteAccountResponse: VALID_DELETE_ACCOUNT_RESPONSE,
  parseFcmTokenRegisterResponse: mockDomainFixtures.notification.fcmRegistration,
  parseCurrentUser: mockDomainFixtures.auth.currentUser,
  parseCampusMembershipSummary: mockDomainFixtures.campus.memberships[0],
  parseCampusMembershipSummaries: mockDomainFixtures.campus.memberships,
  parseCampusCreateResponse: mockDomainFixtures.campus.created,
  parseCampusDetail: mockDomainFixtures.campus.detail,
  parseWeeklyDevotionSummary: mockDomainFixtures.devotion.weekly,
  parseDevotionDailyCheckSaveResponse: mockDomainFixtures.devotion.dailySave,
  parseDevotionMonthlySummary: mockDomainFixtures.devotion.monthly,
  parseChargeSummary: mockDomainFixtures.billing.summary,
  parseChargeList: mockDomainFixtures.billing.charges,
  parsePaymentAccounts: mockDomainFixtures.billing.paymentAccounts,
  parseMyDutyAssignment: VALID_MY_DUTY_ASSIGNMENT,
  parseAdminPaymentAccount: mockDomainFixtures.billing.adminPaymentAccount,
  parsePenaltyRules: mockDomainFixtures.billing.penaltyRules,
  parsePenaltyRule: mockDomainFixtures.billing.penaltyRules[0],
  parseMarkChargePaidResponse: mockDomainFixtures.billing.paidCharge,
  parseCoffeeBrands: mockDomainFixtures.billing.coffeeBrands,
  parseCoffeeMenus: mockDomainFixtures.billing.coffeeMenus,
  parsePollSummaryList: mockDomainFixtures.poll.summaries,
  parsePollDetail: mockDomainFixtures.poll.detail,
  parsePollResponse: mockDomainFixtures.poll.response,
  parsePollOption: mockDomainFixtures.poll.detail.options[0],
  parsePollResults: mockDomainFixtures.poll.results,
  parsePollComments: mockDomainFixtures.poll.comments,
  parsePollComment: mockDomainFixtures.poll.comments[0],
  parsePrayerWeekSummary: mockDomainFixtures.prayer.week,
  parseAdminPrayerSeason: mockDomainFixtures.prayer.season,
  parseNullableAdminPrayerSeason: null,
  parseAdminPrayerGroups: [mockDomainFixtures.prayer.group],
  parseAdminPrayerGroup: mockDomainFixtures.prayer.group,
  parseAdminPrayerAssignableMembers: VALID_PRAYER_ASSIGNABLE_MEMBERS,
  parseAdminDashboardSummary: mockDomainFixtures.admin.dashboard,
  parseAdminCampusMembers: mockDomainFixtures.admin.members,
  parseAdminCampusMember: mockDomainFixtures.admin.members[0],
  parseAdminCampusChargeSummary: mockDomainFixtures.admin.campusCharges,
  parseAdminMemberChargeList: mockDomainFixtures.admin.memberCharges,
  parseAdminChargeStatusChangeResponse:
    mockDomainFixtures.admin.chargeStatusChange,
  parseAdminMissingDevotionMembers:
    mockDomainFixtures.admin.missingDevotionMembers,
  parseAdminNotificationLogList: mockDomainFixtures.notification.logs,
  parseAdminNotificationResponse: mockDomainFixtures.notification.sendResponse,
  parseServiceAdminUserList: mockDomainFixtures.admin.serviceAdminUsers,
  parseServiceAdminUserDetail: mockDomainFixtures.admin.serviceAdminUser,
  parseServiceAdminCampusList: mockDomainFixtures.admin.serviceAdminCampuses,
  parseServiceAdminCampusMemberAddResponse:
    mockDomainFixtures.admin.addedCampusMember,
  parseDutyAssignments: mockDomainFixtures.admin.dutyAssignments,
  parseDutyAssignment: mockDomainFixtures.admin.dutyAssignments[0],
  parseAdminPollTemplates: [VALID_ADMIN_POLL_TEMPLATE],
  parseAdminPollTemplate: VALID_ADMIN_POLL_TEMPLATE,
  parseAdminPoll: VALID_ADMIN_POLL,
  parseAdminPollMissingMembers: VALID_ADMIN_POLL_MISSING_MEMBERS,
} satisfies Record<keyof typeof responseParsers, unknown>;

const VALID_PARSER_CASES = Object.entries(VALID_PARSER_PAYLOADS) as Array<
  [keyof typeof responseParsers, unknown]
>;

describe('coffee poll ownership metadata', () => {
  it('preserves createdByUserId and manageableByMe from poll list responses', () => {
    const parsed = parsePollSummaryList([{
      ...mockDomainFixtures.poll.summaries.find((poll) => poll.pollType === 'COFFEE'),
      createdByUserId: 7,
      manageableByMe: false,
    }]);

    expect(parsed[0]).toMatchObject({createdByUserId: 7, manageableByMe: false});
  });

  it('rejects malformed ownership metadata', () => {
    const coffeePoll = mockDomainFixtures.poll.summaries.find((poll) => poll.pollType === 'COFFEE');
    expect(() => parsePollSummaryList([{...coffeePoll, createdByUserId: 0, manageableByMe: true}]))
      .toThrow('Invalid API response.');
    expect(() => parsePollSummaryList([{...coffeePoll, createdByUserId: 7, manageableByMe: 'yes'}]))
      .toThrow('Invalid API response.');
  });
});

describe('runtime API response validation', () => {
  it('keeps the valid-response smoke matrix in lockstep with all parser exports', () => {
    expect(Object.keys(VALID_PARSER_PAYLOADS).sort()).toEqual(
      Object.keys(responseParsers).sort(),
    );
    expect(VALID_PARSER_CASES).toHaveLength(56);
  });

  it.each(VALID_PARSER_CASES)(
    '%s accepts a representative production response',
    (parserName, payload) => {
      const parser = responseParsers[parserName] as (
        value: unknown,
      ) => unknown;
      let parsed: unknown;

      expect(() => {
        parsed = parser(payload);
      }).not.toThrow();
      expect(parsed).not.toBeUndefined();
    },
  );

  it.each([
    ['GET detail', VALID_ADMIN_POLL_TEMPLATE],
    ['POST', VALID_CREATED_ADMIN_POLL_TEMPLATE],
    [
      'PATCH',
      {...VALID_CREATED_ADMIN_POLL_TEMPLATE, title: '수정된 반복 투표'},
    ],
    ['DELETE', {...VALID_ADMIN_POLL_TEMPLATE, isActive: false}],
  ])('accepts the mock adapter admin poll template returned by %s', (_route, value) => {
    expect(() => responseParsers.parseAdminPollTemplate(value)).not.toThrow();
  });

  it('normalizes minute-precision template times for a valid update round trip', () => {
    const parsed = responseParsers.parseAdminPollTemplate(
      VALID_ADMIN_POLL_TEMPLATE,
    );

    expect(parsed.startTime).toBe('09:00:00');
    expect(parsed.endTime).toBe('09:00:00');
  });

  it('keeps representative nested collections intact', () => {
    expect(
      responseParsers.parsePaymentAccounts(
        mockDomainFixtures.billing.paymentAccounts,
      )[0],
    ).toMatchObject({id: 301, accountType: 'PENALTY'});
    expect(
      responseParsers.parsePollResults(mockDomainFixtures.poll.results)
        .optionResults[0]?.respondents[0],
    ).toEqual({
      userId: 7,
      name: '샘플 사용자',
      email: 'faithlog.user@example.test',
    });
    expect(
      responseParsers.parsePollComments(mockDomainFixtures.poll.comments)[0],
    ).toMatchObject({commentId: 3001, pollId: 701});
    expect(
      responseParsers.parseAdminNotificationLogList(
        mockDomainFixtures.notification.logs,
      ).items[0],
    ).toMatchObject({notificationLogId: 9001, sendStatus: 'SENT'});
    expect(
      responseParsers.parseServiceAdminUserList(
        mockDomainFixtures.admin.serviceAdminUsers,
      ).content[0]?.campuses[0],
    ).toMatchObject({membershipId: 10, campusId: 1});
    expect(
      responseParsers.parseServiceAdminCampusList(
        mockDomainFixtures.admin.serviceAdminCampuses,
      ).content[0],
    ).toMatchObject({campusId: 1, status: 'ACTIVE'});
  });

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

  it('parses representative bounded domain responses without retaining unknown fields', () => {
    expect(parseCampusDetail({...mockDomainFixtures.campus.detail, ignored: true})).toEqual(
      mockDomainFixtures.campus.detail,
    );
    expect(parseWeeklyDevotionSummary(mockDomainFixtures.devotion.weekly)).toEqual(
      mockDomainFixtures.devotion.weekly,
    );
    expect(parseChargeList(mockDomainFixtures.billing.charges)).toEqual(
      mockDomainFixtures.billing.charges,
    );
    expect(parsePollDetail(mockDomainFixtures.poll.detail)).toEqual(
      mockDomainFixtures.poll.detail,
    );
    expect(parsePrayerWeekSummary(mockDomainFixtures.prayer.week)).toEqual(
      mockDomainFixtures.prayer.week,
    );
    expect(parseAdminDashboardSummary(mockDomainFixtures.admin.dashboard)).toEqual(
      mockDomainFixtures.admin.dashboard,
    );
    expect(
      parseAdminNotificationResponse(mockDomainFixtures.notification.sendResponse),
    ).toEqual(mockDomainFixtures.notification.sendResponse);
  });

  it('accepts the backend MEAL poll option order starting at zero', () => {
    const detail = mockDomainFixtures.poll.detail;
    const parsed = parsePollDetail({
      ...detail,
      pollType: 'MEAL',
      templateId: null,
      chargeGenerationType: 'NONE',
      paymentCategory: null,
      paymentAccountId: null,
      options: detail.options.map((option, index) => ({
        ...option,
        composeMenuCode: null,
        priceAmount: 0,
        sortOrder: index,
      })),
    });

    expect(parsed.options.map((option) => option.sortOrder)).toEqual([0, 1]);
  });

  it('accepts MEAL charges in the canonical member list and paid-response contract', () => {
    const mealCharge = {
      ...mockDomainFixtures.billing.charges.items[0],
      id: 9_001,
      paymentCategory: 'MEAL',
      title: '점심 투표 청구',
      reason: '제육볶음',
      source: {sourceId: 902, sourceType: 'POLL_RESPONSE'},
    };
    const parsedList = parseChargeList({
      ...mockDomainFixtures.billing.charges,
      items: [mealCharge],
    });
    const parsedPaid = responseParsers.parseMarkChargePaidResponse({
      ...mealCharge,
      account: undefined,
      campusId: 1,
      dueDate: undefined,
      paidAt: '2026-07-14T03:00:00.000Z',
      source: undefined,
      status: 'PAID',
      userId: 8,
    });

    expect(parsedList.items[0]).toMatchObject({
      paymentCategory: 'MEAL',
      source: {sourceType: 'POLL_RESPONSE'},
    });
    expect(parsedPaid).toMatchObject({paymentCategory: 'MEAL', status: 'PAID', userId: 8});
  });

  it('normalizes a null campus invite code to an omitted optional field', () => {
    const parsed = parseCampusDetail({
      ...mockDomainFixtures.campus.detail,
      inviteCode: null,
    });

    expect(parsed).toEqual({
      campusId: mockDomainFixtures.campus.detail.campusId,
      name: mockDomainFixtures.campus.detail.name,
      region: mockDomainFixtures.campus.detail.region,
      description: mockDomainFixtures.campus.detail.description,
      isActive: mockDomainFixtures.campus.detail.isActive,
      myCampusRole: mockDomainFixtures.campus.detail.myCampusRole,
      membershipStatus: mockDomainFixtures.campus.detail.membershipStatus,
    });
    expect(parsed).not.toHaveProperty('inviteCode');
  });

  it.each([
    ['zero campus ID', parseCampusDetail, {...mockDomainFixtures.campus.detail, campusId: 0}],
    [
      'invalid calendar date',
      parseWeeklyDevotionSummary,
      {...mockDomainFixtures.devotion.weekly, weekStartDate: '2026-02-31'},
    ],
    [
      'invalid calendar date-time',
      parsePollDetail,
      {...mockDomainFixtures.poll.detail, endsAt: '2026-02-31T00:00:00Z'},
    ],
    [
      'object instead of daily-check array',
      parseWeeklyDevotionSummary,
      {...mockDomainFixtures.devotion.weekly, dailyChecks: {}},
    ],
    [
      'negative charge amount',
      parseChargeList,
      {
        ...mockDomainFixtures.billing.charges,
        items: [{...mockDomainFixtures.billing.charges.items[0], amount: -1}],
      },
    ],
    [
      'unknown closed charge status',
      parseChargeList,
      {
        ...mockDomainFixtures.billing.charges,
        items: [{...mockDomainFixtures.billing.charges.items[0], status: 'UNKNOWN'}],
      },
    ],
    [
      'string poll boolean',
      parsePollSummaryList,
      [{...mockDomainFixtures.poll.summaries[0], isAnonymous: 'false'}],
    ],
    [
      'object instead of prayer groups',
      parsePrayerWeekSummary,
      {...mockDomainFixtures.prayer.week, groups: {}},
    ],
    [
      'out-of-range submit rate',
      parseAdminDashboardSummary,
      {
        ...mockDomainFixtures.admin.dashboard,
        devotion: {...mockDomainFixtures.admin.dashboard.devotion, submitRate: 101},
      },
    ],
    [
      'negative notification count',
      parseAdminNotificationResponse,
      {...mockDomainFixtures.notification.sendResponse, skippedCount: -1},
    ],
  ] as const)('rejects malformed %s', (_label, parser, value) => {
    expect(() => parser(value)).toThrow(INVALID_RESPONSE);
  });

  it.each([{}, [], false, 0])(
    'accepts only explicit null for a no-content response: %j',
    (value) => {
      expect(() => parseNullResponse(value)).toThrow(INVALID_RESPONSE);
    },
  );

  it('normalizes explicit null or omitted no-content data to null', () => {
    expect(parseNullResponse(null)).toBeNull();
    expect(parseNullResponse(undefined)).toBeNull();
  });

  it('requires paidAt when an admin charge response reports PAID', () => {
    const paidResponse = {
      ...mockDomainFixtures.admin.chargeStatusChange,
      status: 'PAID',
      paidAt: '2026-07-13T12:00:00.000Z',
    };

    expect(parseAdminChargeStatusChangeResponse(paidResponse)).toEqual(paidResponse);
    expect(() =>
      parseAdminChargeStatusChangeResponse({...paidResponse, paidAt: null}),
    ).toThrow(INVALID_RESPONSE);
  });

  it('rejects MEAL charges at generic admin list and status boundaries', () => {
    expect(() => parseAdminMemberChargeList({
      ...mockDomainFixtures.admin.memberCharges,
      items: [{
        ...mockDomainFixtures.admin.memberCharges.items[0],
        paymentCategory: 'MEAL',
      }],
    })).toThrow(INVALID_RESPONSE);
    expect(() => parseAdminChargeStatusChangeResponse({
      ...mockDomainFixtures.admin.chargeStatusChange,
      paymentCategory: 'MEAL',
    })).toThrow(INVALID_RESPONSE);
  });

  it.each([
    ['omitted', {}],
    ['explicit null', {reason: null}],
  ] as const)('accepts a REST Docs-shaped %s charge reason in list and mutation responses', (_label, reasonPatch) => {
    const listItem = {...mockDomainFixtures.billing.charges.items[0], ...reasonPatch};
    if (!('reason' in reasonPatch)) {
      delete (listItem as {reason?: unknown}).reason;
    }
    const mutation = {...mockDomainFixtures.admin.chargeStatusChange, ...reasonPatch};
    if (!('reason' in reasonPatch)) {
      delete (mutation as {reason?: unknown}).reason;
    }

    const parsedList = parseChargeList({
      ...mockDomainFixtures.billing.charges,
      items: [listItem],
    });
    const parsedMutation = parseAdminChargeStatusChangeResponse(mutation);

    if ('reason' in reasonPatch) {
      expect(parsedList.items[0]).toHaveProperty('reason', null);
      expect(parsedMutation).toHaveProperty('reason', null);
    } else {
      expect(parsedList.items[0]).not.toHaveProperty('reason');
      expect(parsedMutation).not.toHaveProperty('reason');
    }
  });

  it.each([
    ['empty', ''],
    ['non-string', 7],
    ['oversized', 'r'.repeat(8_193)],
  ] as const)('rejects a malformed %s optional charge reason', (_label, reason) => {
    expect(() => parseAdminChargeStatusChangeResponse({
      ...mockDomainFixtures.admin.chargeStatusChange,
      reason,
    })).toThrow(INVALID_RESPONSE);
  });

  it('accepts bounded backend-defined open status strings', () => {
    expect(
      parseCampusMembershipSummary({...VALID_MEMBERSHIP, status: 'SUSPENDED'})
        .status,
    ).toBe('SUSPENDED');
    expect(
      parsePollSummaryList([
        {...mockDomainFixtures.poll.summaries[0], status: 'SCHEDULED'},
      ])[0]?.status,
    ).toBe('SCHEDULED');
    expect(
      parsePrayerWeekSummary({...mockDomainFixtures.prayer.week, status: 'LOCKED'})
        .status,
    ).toBe('LOCKED');
  });

  it('rejects oversized response collections', () => {
    expect(() =>
      parseCampusMembershipSummaries(
        Array.from({length: 1_001}, () => VALID_MEMBERSHIP),
      ),
    ).toThrow(INVALID_RESPONSE);
  });

  it('does not accept a user-owned MEAL account through generic account parsers', () => {
    const genericAccount = mockDomainFixtures.billing.paymentAccounts[0];

    expect(() => responseParsers.parsePaymentAccounts([
      {...genericAccount, accountType: 'MEAL'},
    ])).toThrow(INVALID_RESPONSE);
  });
});
