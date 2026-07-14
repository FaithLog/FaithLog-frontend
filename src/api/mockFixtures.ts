import type {
  AdminCampusChargeSummary,
  AdminCampusMember,
  AdminChargeStatusChangeResponse,
  AdminDashboardSummary,
  AdminMemberChargeList,
  AdminMissingDevotionMember,
  AdminNotificationLogList,
  AdminNotificationResponse,
  AdminPaymentAccount,
  AdminPrayerGroup,
  AdminPrayerSeason,
  ApiEnvelope,
  CampusCreateResponse,
  CampusDetail,
  CampusMembershipSummary,
  ChargeList,
  ChargeSummary,
  CoffeeBrand,
  CoffeeMenu,
  CurrentUser,
  DevotionDailyCheckSaveResponse,
  DevotionMonthlySummary,
  DutyAssignment,
  FcmTokenRegisterResponse,
  LoginResponse,
  MarkChargePaidResponse,
  PaymentAccount,
  PenaltyRule,
  PollComment,
  PollDetail,
  PollResponse,
  PollResults,
  PollSummary,
  PrayerWeekSummary,
  ServiceAdminCampusList,
  ServiceAdminCampusMemberAddResponse,
  ServiceAdminUserDetail,
  ServiceAdminUserList,
  SignupResponse,
  TokenPair,
  WeeklyDevotionSummary,
} from './types';

export const MOCK_TIMESTAMP = '2026-06-25T00:00:00.000Z';

export function createApiEnvelope<T>(
  data: T,
  patch: Partial<ApiEnvelope<T>> = {},
): ApiEnvelope<T> {
  return {
    success: true,
    code: 'SUCCESS',
    message: '요청이 성공했습니다.',
    data,
    timestamp: MOCK_TIMESTAMP,
    ...patch,
  };
}

export function createApiErrorEnvelope(
  code: string,
  message = '요청을 처리하지 못했습니다.',
): ApiEnvelope<null> {
  return {
    success: false,
    code,
    message,
    data: null,
    timestamp: MOCK_TIMESTAMP,
  };
}

export const mockApiErrorFixtures = {
  sessionExpired: {
    status: 401,
    body: createApiErrorEnvelope('UNAUTHORIZED', '세션이 만료되었습니다.'),
  },
  permissionDenied: {
    status: 403,
    body: createApiErrorEnvelope('FORBIDDEN', '권한이 없습니다.'),
  },
  conflict: {
    status: 409,
    body: createApiErrorEnvelope('CONFLICT', '이미 변경된 데이터입니다.'),
  },
  validation: {
    status: 422,
    body: createApiErrorEnvelope('VALIDATION_ERROR', '입력값을 확인해 주세요.'),
  },
  invalidEnvelope: {
    status: 200,
    body: {
      data: {
        reason: 'mock invalid envelope',
      },
    },
  },
} as const;

const tokenPair: TokenPair = {
  accessToken: 'mock-access-token',
  refreshToken: 'mock-refresh-token',
  accessTokenExpiresIn: 3600,
  refreshTokenExpiresIn: 7200,
  tokenType: 'Bearer',
};

const campusMembership: CampusMembershipSummary = {
  membershipId: 10,
  campusId: 1,
  campusName: '샘플 캠퍼스',
  region: '서울',
  campusRole: 'CAMPUS_LEADER',
  status: 'ACTIVE',
};

const currentUser: CurrentUser = {
  id: 7,
  name: '샘플 사용자',
  email: 'faithlog.user@example.test',
  role: 'ADMIN',
  isActive: true,
  lastLoginAt: '2026-06-24T09:00:00.000Z',
  campusMemberships: [campusMembership],
};

const campusDetail: CampusDetail = {
  campusId: 1,
  name: '샘플 캠퍼스',
  region: '서울',
  description: 'Mock fixture 검증용 캠퍼스입니다.',
  isActive: true,
  myCampusRole: 'CAMPUS_LEADER',
  membershipStatus: 'ACTIVE',
  inviteCode: 'SAMPLE123',
};

const weeklyDevotionSummary: WeeklyDevotionSummary = {
  weeklyRecordId: 101,
  campusId: 1,
  campusName: '샘플 캠퍼스',
  region: '서울',
  userId: 7,
  weekStartDate: '2026-06-22',
  weekEndDate: '2026-06-28',
  quietTimeCount: 4,
  prayerCount: 5,
  bibleReadingCount: 3,
  saturdayLateMinutes: 0,
  submittedAt: '2026-06-28T12:00:00.000Z',
  dailyChecks: [
    {
      id: 1001,
      recordDate: '2026-06-22',
      quietTimeChecked: true,
      prayerChecked: true,
      bibleReadingChecked: false,
    },
  ],
};

const chargeList: ChargeList = {
  campusId: 1,
  campusName: '샘플 캠퍼스',
  region: '서울',
  summary: {
    totalAmount: 18000,
    unpaidAmount: 6000,
    paidAmount: 12000,
    waivedAmount: 0,
    canceledAmount: 0,
  },
  items: [
    {
      id: 501,
      paymentCategory: 'PENALTY',
      title: '경건생활 미제출',
      reason: 'Mock fixture',
      amount: 3000,
      status: 'UNPAID',
      dueDate: '2026-06-30',
      paidAt: null,
      account: {
        paymentAccountId: 301,
        bankName: '샘플은행',
        accountNumber: '000-0000-0000',
        accountHolder: '샘플 캠퍼스',
      },
      source: {
        sourceType: 'DEVOTION_RECORD',
        sourceId: 101,
      },
    },
    {
      id: 502,
      paymentCategory: 'PENALTY',
      title: '이전 경건생활 벌금',
      reason: 'Mock fixture paid history',
      amount: 12000,
      status: 'PAID',
      dueDate: '2026-06-23',
      paidAt: '2026-06-24T10:00:00.000Z',
      account: {
        paymentAccountId: 301,
        bankName: '샘플은행',
        accountNumber: '000-0000-0000',
        accountHolder: '샘플 캠퍼스',
      },
      source: {
        sourceType: 'DEVOTION_RECORD',
        sourceId: 99,
      },
    },
    {
      id: 503,
      paymentCategory: 'PENALTY',
      title: '추가 경건생활 미제출',
      reason: 'Mock fixture unpaid history',
      amount: 3000,
      status: 'UNPAID',
      dueDate: '2026-06-30',
      paidAt: null,
      account: {
        paymentAccountId: 301,
        bankName: '샘플은행',
        accountNumber: '000-0000-0000',
        accountHolder: '샘플 캠퍼스',
      },
      source: {
        sourceType: 'DEVOTION_RECORD',
        sourceId: 102,
      },
    },
  ],
};

const pollSummary: PollSummary = {
  id: 701,
  campusId: 1,
  title: '커피 주문 투표',
  pollType: 'COFFEE',
  selectionType: 'SINGLE',
  isAnonymous: false,
  startsAt: '2026-06-29T09:00:00.000Z',
  endsAt: '2026-07-02T09:00:00.000Z',
  status: 'OPEN',
  responded: false,
};

const customPollSummary: PollSummary = {
  id: 702,
  campusId: 1,
  title: '간식 메뉴 투표',
  pollType: 'CUSTOM',
  selectionType: 'MULTIPLE',
  isAnonymous: false,
  startsAt: '2026-06-29T09:00:00.000Z',
  endsAt: '2026-07-03T09:00:00.000Z',
  status: 'OPEN',
  responded: true,
};

const wednesdayPollSummary: PollSummary = {
  id: 703,
  campusId: 1,
  title: '수요예배 참석 투표',
  pollType: 'WEDNESDAY',
  selectionType: 'SINGLE',
  isAnonymous: false,
  startsAt: '2026-06-24T09:00:00.000Z',
  endsAt: '2026-06-28T18:00:00.000Z',
  status: 'CLOSED',
  responded: true,
};

const saturdayPollSummary: PollSummary = {
  id: 704,
  campusId: 1,
  title: '토요 목자모임 참석',
  pollType: 'SATURDAY',
  selectionType: 'SINGLE',
  isAnonymous: false,
  startsAt: '2026-06-29T09:00:00.000Z',
  endsAt: '2026-07-04T09:00:00.000Z',
  status: 'OPEN',
  responded: false,
};

const oldClosedPollSummary: PollSummary = {
  id: 705,
  campusId: 1,
  title: '지난 커스텀 투표',
  pollType: 'CUSTOM',
  selectionType: 'SINGLE',
  isAnonymous: false,
  startsAt: '2026-06-24T09:00:00.000Z',
  endsAt: '2026-06-25T09:00:00.000Z',
  status: 'CLOSED',
  responded: true,
};

const pollDetail: PollDetail = {
  ...pollSummary,
  templateId: 801,
  chargeGenerationType: 'OPTION_PRICE',
  paymentCategory: 'COFFEE',
  paymentAccountId: 301,
  options: [
    {
      id: 901,
      content: '아메리카노',
      composeMenuCode: 'AMERICANO',
      priceAmount: 4500,
      sortOrder: 1,
    },
    {
      id: 902,
      content: '카페라떼',
      composeMenuCode: 'LATTE',
      priceAmount: 5000,
      sortOrder: 2,
    },
  ],
  myResponse: null,
};

const customPollDetail: PollDetail = {
  ...customPollSummary,
  templateId: null,
  chargeGenerationType: 'NONE',
  paymentCategory: null,
  paymentAccountId: null,
  options: [
    {
      id: 911,
      content: '떡볶이',
      composeMenuCode: null,
      priceAmount: 0,
      sortOrder: 1,
    },
    {
      id: 912,
      content: '치킨',
      composeMenuCode: null,
      priceAmount: 0,
      sortOrder: 2,
    },
    {
      id: 913,
      content: '피자',
      composeMenuCode: null,
      priceAmount: 0,
      sortOrder: 3,
    },
  ],
  myResponse: null,
};

const wednesdayPollDetail: PollDetail = {
  ...wednesdayPollSummary,
  templateId: 802,
  chargeGenerationType: 'NONE',
  paymentCategory: null,
  paymentAccountId: null,
  options: [
    {
      id: 921,
      content: '참석',
      composeMenuCode: null,
      priceAmount: 0,
      sortOrder: 1,
    },
    {
      id: 922,
      content: '불참',
      composeMenuCode: null,
      priceAmount: 0,
      sortOrder: 2,
    },
    {
      id: 923,
      content: '미정',
      composeMenuCode: null,
      priceAmount: 0,
      sortOrder: 3,
    },
  ],
  myResponse: {
    responseId: 10003,
    pollId: 703,
    optionIds: [921],
    respondedAt: '2026-06-24T12:00:00.000Z',
  },
};

const saturdayPollDetail: PollDetail = {
  ...saturdayPollSummary,
  templateId: 803,
  chargeGenerationType: 'NONE',
  paymentCategory: null,
  paymentAccountId: null,
  options: [
    {
      id: 931,
      content: '참석',
      composeMenuCode: null,
      priceAmount: 0,
      sortOrder: 1,
    },
    {
      id: 932,
      content: '불참',
      composeMenuCode: null,
      priceAmount: 0,
      sortOrder: 2,
    },
    {
      id: 933,
      content: '지각',
      composeMenuCode: null,
      priceAmount: 0,
      sortOrder: 3,
    },
    {
      id: 934,
      content: '미정',
      composeMenuCode: null,
      priceAmount: 0,
      sortOrder: 4,
    },
  ],
  myResponse: null,
};

const oldClosedPollDetail: PollDetail = {
  ...oldClosedPollSummary,
  templateId: null,
  chargeGenerationType: 'NONE',
  paymentCategory: null,
  paymentAccountId: null,
  options: [
    {
      id: 951,
      content: '찬성',
      composeMenuCode: null,
      priceAmount: 0,
      sortOrder: 1,
    },
    {
      id: 952,
      content: '반대',
      composeMenuCode: null,
      priceAmount: 0,
      sortOrder: 2,
    },
  ],
  myResponse: {
    responseId: 10004,
    pollId: 705,
    optionIds: [951],
    respondedAt: '2026-06-25T08:30:00.000Z',
  },
};

const prayerWeekSummary: PrayerWeekSummary = {
  campusId: 1,
  weekStartDate: '2026-06-22',
  weekEndDate: '2026-06-28',
  status: 'OPEN',
  currentSeason: {
    seasonId: 41,
    name: '샘플 기도 운영 기간',
    startDate: '2026-06-01',
    endDate: null,
    status: 'ACTIVE',
  },
  myGroupId: 401,
  submittedCount: 1,
  targetMemberCount: 2,
  groups: [
    {
      groupId: 401,
      groupName: '샘플 기도조',
      seasonId: 41,
      sortOrder: 1,
      members: [
        {
          userId: 7,
          name: '샘플 사용자',
          email: 'faithlog.user@example.test',
          submissionId: 601,
          content: 'Mock fixture 기도제목입니다.',
          version: 1,
          submittedAt: '2026-06-25T08:30:00.000Z',
          submitted: true,
          editable: true,
        },
        {
          userId: 8,
          name: '샘플 친구',
          email: 'faithlog.friend@example.test',
          submissionId: null,
          content: null,
          version: 0,
          submittedAt: null,
          submitted: false,
          editable: false,
        },
      ],
    },
  ],
};

const adminCampusMember: AdminCampusMember = {
  membershipId: 10,
  campusId: 1,
  userId: 7,
  name: '샘플 사용자',
  email: 'faithlog.user@example.test',
  campusRole: 'CAMPUS_LEADER',
  status: 'ACTIVE',
};

const notificationLogs: AdminNotificationLogList = {
  items: [
    {
      notificationLogId: 9001,
      requestId: 'mock-request-001',
      userId: 7,
      name: '샘플 사용자',
      email: 'faithlog.user@example.test',
      campusId: 1,
      notificationType: 'CUSTOM',
      targetWeekStartDate: '2026-06-22',
      targetId: null,
      title: '샘플 알림',
      body: 'Mock fixture 알림 본문입니다.',
      sendStatus: 'SENT',
      failureReason: null,
      sentAt: '2026-06-25T09:10:00.000Z',
      createdAt: '2026-06-25T09:00:00.000Z',
    },
  ],
  page: 0,
  size: 20,
  totalElements: 1,
  totalPages: 1,
};

export const mockDomainFixtures = {
  auth: {
    tokenPair,
    signup: {
      id: 7,
      name: '샘플 사용자',
      email: 'new.user@example.test',
      role: 'USER',
      isActive: true,
    } satisfies SignupResponse,
    login: {
      ...tokenPair,
      user: currentUser,
    } satisfies LoginResponse,
    currentUser,
  },
  campus: {
    memberships: [campusMembership] satisfies CampusMembershipSummary[],
    detail: campusDetail,
    created: {
      campusId: 2,
      name: '새 샘플 캠퍼스',
      region: '부산',
      description: 'Mock fixture 생성 응답입니다.',
      inviteCode: 'NEWMOCK1',
      myCampusRole: 'CAMPUS_LEADER',
      membershipStatus: 'ACTIVE',
    } satisfies CampusCreateResponse,
    joined: campusMembership,
  },
  devotion: {
    weekly: weeklyDevotionSummary,
    dailySave: {
      weeklyRecordId: 101,
      recordDate: '2026-06-25',
      quietTimeChecked: true,
      prayerChecked: true,
      bibleReadingChecked: true,
      quietTimeCount: 5,
      prayerCount: 6,
      bibleReadingCount: 4,
      submittedAt: null,
    } satisfies DevotionDailyCheckSaveResponse,
    monthly: {
      campusId: 1,
      campusName: '샘플 캠퍼스',
      region: '서울',
      userId: 7,
      name: '샘플 사용자',
      year: 2026,
      month: 6,
      devotion: {
        quietTimeCount: 14,
        prayerCount: 16,
        bibleReadingCount: 12,
        saturdayLateMinutes: 0,
      },
      weeklyRecords: [
        {
          weeklyRecordId: 101,
          weekStartDate: '2026-06-22',
          weekEndDate: '2026-06-28',
          submittedAt: '2026-06-28T12:00:00.000Z',
          quietTimeCount: 4,
          prayerCount: 5,
          bibleReadingCount: 3,
          saturdayLateMinutes: 0,
        },
      ],
    } satisfies DevotionMonthlySummary,
  },
  billing: {
    summary: {
      campusId: 1,
      campusName: '샘플 캠퍼스',
      region: '서울',
      userId: 7,
      name: '샘플 사용자',
      totalPaidAmount: 12000,
      monthlyPaidAmount: 12000,
      monthlyUnpaidAmount: 6000,
      monthlyTotalChargeAmount: 18000,
      monthlyByCategory: [
        {
          paymentCategory: 'PENALTY',
          paidAmount: 12000,
          unpaidAmount: 6000,
          totalAmount: 18000,
        },
      ],
    } satisfies ChargeSummary,
    charges: chargeList,
    paymentAccounts: [
      {
        id: 301,
        accountType: 'PENALTY',
        nickname: '샘플 벌금 계좌',
        bankName: '샘플은행',
        accountNumber: '000-0000-0000',
        accountHolder: '샘플 캠퍼스',
      },
    ] satisfies PaymentAccount[],
    adminPaymentAccount: {
      id: 301,
      campusId: 1,
      accountType: 'PENALTY',
      nickname: '샘플 벌금 계좌',
      bankName: '샘플은행',
      accountNumber: '000-0000-0000',
      accountHolder: '샘플 캠퍼스',
      ownerUserId: null,
      isActive: true,
    } satisfies AdminPaymentAccount,
    penaltyRules: [
      {
        id: 201,
        ruleType: 'QUIET_TIME',
        calculationType: 'MISSING_COUNT',
        requiredCount: 5,
        baseAmount: 0,
        amountPerUnit: 1000,
        isActive: true,
      },
    ] satisfies PenaltyRule[],
    paidCharge: {
      id: 501,
      campusId: 1,
      userId: 7,
      paymentCategory: 'PENALTY',
      title: '경건생활 미제출',
      reason: 'Mock fixture',
      amount: 3000,
      status: 'PAID',
      paidAt: '2026-06-25T10:00:00.000Z',
    } satisfies MarkChargePaidResponse,
    coffeeBrands: [
      {
        id: 1,
        brandCode: 'SAMPLE',
        name: '샘플커피',
        sortOrder: 1,
      },
    ] satisfies CoffeeBrand[],
    coffeeMenus: [
      {
        id: 1,
        brandId: 1,
        menuCode: 'AMERICANO',
        name: '아메리카노',
        priceAmount: 4500,
        category: 'COFFEE',
      },
      {
        id: 2,
        brandId: 1,
        menuCode: 'LATTE',
        name: '카페라떼',
        priceAmount: 5000,
        category: 'COFFEE',
      },
    ] satisfies CoffeeMenu[],
  },
  poll: {
    summaries: [
      wednesdayPollSummary,
      saturdayPollSummary,
      pollSummary,
      customPollSummary,
      oldClosedPollSummary,
    ] satisfies PollSummary[],
    detail: pollDetail,
    details: [
      pollDetail,
      customPollDetail,
      wednesdayPollDetail,
      saturdayPollDetail,
      oldClosedPollDetail,
    ] satisfies PollDetail[],
    response: {
      responseId: 10001,
      pollId: 701,
      optionIds: [901],
      respondedAt: '2026-06-25T09:30:00.000Z',
    } satisfies PollResponse,
    results: {
      pollId: 701,
      campusId: 1,
      title: '커피 주문 투표',
      pollType: 'COFFEE',
      selectionType: 'SINGLE',
      anonymous: false,
      status: 'OPEN',
      startsAt: '2026-06-25T09:00:00.000Z',
      endsAt: '2026-06-26T09:00:00.000Z',
      targetMemberCount: 2,
      respondedCount: 1,
      notRespondedCount: 1,
      optionResults: [
        {
          id: 901,
          content: '아메리카노',
          sortOrder: 1,
          responseCount: 1,
          respondents: [
            {
              userId: 7,
              name: '샘플 사용자',
              email: 'faithlog.user@example.test',
            },
          ],
        },
        {
          id: 902,
          content: '카페라떼',
          sortOrder: 2,
          responseCount: 0,
          respondents: [],
        },
      ],
    } satisfies PollResults,
    resultsByPollId: [
      {
        pollId: 702,
        campusId: 1,
        title: '간식 메뉴 투표',
        pollType: 'CUSTOM',
        selectionType: 'MULTIPLE',
        anonymous: false,
        status: 'OPEN',
        startsAt: '2026-06-25T09:00:00.000Z',
        endsAt: '2026-06-27T09:00:00.000Z',
        targetMemberCount: 25,
        respondedCount: 5,
        notRespondedCount: 20,
        optionResults: [
          {
            id: 911,
            content: '떡볶이',
            sortOrder: 1,
            responseCount: 2,
            respondents: [
              {userId: 7, name: '김민준', email: 'faithlog.user@example.test'},
              {userId: 8, name: '박지훈', email: 'faithlog.member2@example.test'},
            ],
          },
          {
            id: 912,
            content: '치킨',
            sortOrder: 2,
            responseCount: 2,
            respondents: [
              {userId: 9, name: '이승욱', email: 'faithlog.member3@example.test'},
              {userId: 10, name: '최윤서', email: 'faithlog.member4@example.test'},
            ],
          },
          {
            id: 913,
            content: '피자',
            sortOrder: 3,
            responseCount: 1,
            respondents: [
              {userId: 11, name: '정하은', email: 'faithlog.member5@example.test'},
            ],
          },
        ],
      },
      {
        pollId: 703,
        campusId: 1,
        title: '수요예배 참석 투표',
        pollType: 'WEDNESDAY',
        selectionType: 'SINGLE',
        anonymous: false,
        status: 'CLOSED',
        startsAt: '2026-06-24T09:00:00.000Z',
        endsAt: '2026-06-24T18:00:00.000Z',
        targetMemberCount: 25,
        respondedCount: 25,
        notRespondedCount: 0,
        optionResults: [
          {
            id: 921,
            content: '참석',
            sortOrder: 1,
            responseCount: 18,
            respondents: [
              {userId: 7, name: '김민준', email: 'faithlog.user@example.test'},
              {userId: 9, name: '이승욱', email: 'faithlog.member3@example.test'},
              {userId: 11, name: '정하은', email: 'faithlog.member5@example.test'},
              {userId: 10, name: '최윤서', email: 'faithlog.member4@example.test'},
            ],
          },
          {
            id: 922,
            content: '불참',
            sortOrder: 2,
            responseCount: 5,
            respondents: [
              {userId: 8, name: '박지훈', email: 'faithlog.member2@example.test'},
            ],
          },
          {
            id: 923,
            content: '미정',
            sortOrder: 3,
            responseCount: 2,
            respondents: [
              {userId: 12, name: '임도윤', email: 'faithlog.member6@example.test'},
            ],
          },
        ],
      },
    ] satisfies PollResults[],
    comments: [
      {
        commentId: 3001,
        pollId: 701,
        userId: 7,
        name: '샘플 사용자',
        content: 'Mock fixture 댓글입니다.',
        deleted: false,
        createdAt: '2026-06-25T09:20:00.000Z',
        updatedAt: '2026-06-25T09:20:00.000Z',
      },
    ] satisfies PollComment[],
  },
  prayer: {
    week: prayerWeekSummary,
    season: {
      seasonId: 41,
      campusId: 1,
      name: '샘플 기도 시즌',
      startDate: '2026-06-01',
      endDate: null,
      status: 'ACTIVE',
    } satisfies AdminPrayerSeason,
    group: {
      groupId: 401,
      seasonId: 41,
      name: '샘플 기도조',
      sortOrder: 1,
      active: true,
      members: [
        {
          userId: 7,
          name: '샘플 사용자',
          email: 'faithlog.user@example.test',
        },
        {
          userId: 8,
          name: '샘플 친구',
          email: 'faithlog.friend@example.test',
        },
      ],
    } satisfies AdminPrayerGroup,
  },
  notification: {
    fcmRegistration: {
      tokenId: 7001,
      deviceType: 'WEB',
      clientInstanceId: 'mock-client-instance',
      appVersion: '0.1.0',
      isActive: true,
      lastSeenAt: '2026-06-25T09:00:00.000Z',
      lastRefreshedAt: '2026-06-25T09:00:00.000Z',
    } satisfies FcmTokenRegisterResponse,
    sendResponse: {
      notificationRequestId: 'mock-request-001',
      queuedCount: 1,
      skippedCount: 0,
    } satisfies AdminNotificationResponse,
    logs: notificationLogs,
  },
  admin: {
    dashboard: {
      campus: {
        campusId: 1,
        campusName: '샘플 캠퍼스',
        region: '서울',
      },
      members: {
        activeCount: 12,
        inactiveCount: 1,
        adminCount: 2,
      },
      devotion: {
        weekStartDate: '2026-06-22',
        submittedCount: 9,
        missingCount: 3,
        submitRate: 75,
      },
      charges: {
        unpaidAmount: 6000,
        unpaidMemberCount: 2,
        byCategory: [
          {
            paymentCategory: 'PENALTY',
            unpaidAmount: 3000,
          },
        ],
      },
      polls: {
        openCount: 1,
        recentlyClosedCount: 2,
        missingResponseCount: 1,
        recentlyClosedDays: 7,
      },
    } satisfies AdminDashboardSummary,
    members: [adminCampusMember] satisfies AdminCampusMember[],
    campusCharges: {
      campusId: 1,
      campusName: '샘플 캠퍼스',
      region: '서울',
      summary: chargeList.summary,
      members: [
        {
          userId: 7,
          name: '샘플 사용자',
          email: 'faithlog.user@example.test',
          totalAmount: 6000,
          unpaidAmount: 3000,
          paidAmount: 3000,
          waivedAmount: 0,
          canceledAmount: 0,
        },
      ],
    } satisfies AdminCampusChargeSummary,
    memberCharges: {
      ...chargeList,
      userId: 7,
      name: '샘플 사용자',
      email: 'faithlog.user@example.test',
    } satisfies AdminMemberChargeList,
    chargeStatusChange: {
      id: 501,
      campusId: 1,
      userId: 7,
      paymentCategory: 'PENALTY',
      title: '경건생활 미제출',
      reason: 'Mock fixture',
      amount: 3000,
      status: 'WAIVED',
      paidAt: null,
    } satisfies AdminChargeStatusChangeResponse,
    missingDevotionMembers: [
      {
        userId: 8,
        name: '데모 멤버',
        email: 'demo.member@example.test',
        campusMemberId: 11,
        campusName: '샘플 캠퍼스',
        region: '서울',
      },
    ] satisfies AdminMissingDevotionMember[],
    serviceAdminUsers: {
      content: [
        {
          userId: 7,
          name: '샘플 사용자',
          email: 'faithlog.user@example.test',
          role: 'ADMIN',
          campusCount: 1,
          campuses: [
            {
              membershipId: 10,
              campusId: 1,
              campusName: '샘플 캠퍼스',
              region: '서울',
              campusRole: 'CAMPUS_LEADER',
              status: 'ACTIVE',
            },
          ],
        },
      ],
      page: 0,
      size: 20,
      totalElements: 1,
      totalPages: 1,
    } satisfies ServiceAdminUserList,
    serviceAdminUser: {
      userId: 7,
      name: '샘플 사용자',
      email: 'faithlog.user@example.test',
      role: 'ADMIN',
      isActive: true,
      campuses: [
        {
          membershipId: 10,
          campusId: 1,
          campusName: '샘플 캠퍼스',
          region: '서울',
          campusRole: 'CAMPUS_LEADER',
          status: 'ACTIVE',
        },
      ],
    } satisfies ServiceAdminUserDetail,
    serviceAdminCampuses: {
      content: [
        {
          campusId: 1,
          name: '샘플 캠퍼스',
          region: '서울',
          isActive: true,
          status: 'ACTIVE',
          memberCount: 12,
          adminCount: 2,
        },
      ],
      page: 0,
      size: 20,
      totalElements: 1,
      totalPages: 1,
    } satisfies ServiceAdminCampusList,
    addedCampusMember: adminCampusMember satisfies ServiceAdminCampusMemberAddResponse,
    dutyAssignments: [
      {
        assignmentId: 1201,
        campusId: 1,
        userId: 7,
        name: '샘플 사용자',
        email: 'faithlog.user@example.test',
        dutyType: 'COFFEE',
        isActive: true,
        assignedAt: '2026-06-25T09:00:00.000Z',
      },
    ] satisfies DutyAssignment[],
  },
} as const;
