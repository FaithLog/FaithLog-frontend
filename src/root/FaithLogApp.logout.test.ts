import {describe, expect, it, vi} from 'vitest';

const invalidatePaymentContextCache = vi.hoisted(() => vi.fn());

vi.mock('react-native', () => ({
  Platform: {OS: 'ios'},
  StyleSheet: {create: <T>(styles: T) => styles},
}));

vi.mock('../api/client', () => ({}));
vi.mock('../api/errorPolicy', () => ({}));
vi.mock('../api/tokenStorage', () => ({}));
vi.mock('../admin/AdminScreen', () => ({}));
vi.mock('../admin/ServiceAdminScreen', () => ({}));
vi.mock('../auth/authForms', () => ({}));
vi.mock('../auth/authGate', () => ({}));
vi.mock('../auth/session', () => ({}));
vi.mock('../campus/campusForms', () => ({}));
vi.mock('../components/ui', () => ({}));
vi.mock('../components/IconexIcon', () => ({}));
vi.mock('../navigation/shellRoutes', () => ({}));
vi.mock('../navigation/shellLayout', () => ({}));
vi.mock('../devotion/DevotionScreen', () => ({}));
vi.mock('../devotion/MonthlyCalendarScreen', () => ({}));
vi.mock('../coffee/CoffeeDutyScreen', () => ({}));
vi.mock('../notifications/fcmRegistration', () => ({}));
vi.mock('../notifications/fcmEnvironment', () => ({}));
vi.mock('../notifications/nativeFirebaseMessaging', () => ({}));
vi.mock('../notifications/notificationAdapter', () => ({}));
vi.mock('../notifications/pushNavigation', () => ({}));
vi.mock('../payments/PaymentScreen', () => ({}));
vi.mock('../payments/paymentContextCache', () => ({invalidatePaymentContextCache}));
vi.mock('../polls/PollScreen', () => ({}));
vi.mock('../prayers/PrayerScreen', () => ({}));
vi.mock('../theme', () => ({
  colors: new Proxy({}, {get: () => '#000000'}),
  spacing: new Proxy({}, {get: () => 8}),
}));
vi.mock('../utils/money', () => ({}));

import {beginLogoutAuthTransition, purgePaymentContextForAuthState} from './FaithLogApp';

describe('logout UI transition', () => {
  it('clears payment context immediately on logout teardown', async () => {
    await beginLogoutAuthTransition(42, async () => ({
      completeRemoteLogout: async () => ({status: 'signedOut'}),
    }));
    expect(invalidatePaymentContextCache).toHaveBeenCalledWith();
  });

  it.each(['signedOut', 'sessionExpired'] as const)(
    'clears payment context for %s teardown',
    (status) => {
      const invalidate = vi.fn();
      purgePaymentContextForAuthState(status, invalidate);
      expect(invalidate).toHaveBeenCalledOnce();
    },
  );
  it('closes protected UI with a visible warning when local invalidation fails', async () => {
    const prepareLogout = vi.fn(async (_userId?: number) => {
      throw new Error('secure storage unavailable');
    });

    const transition = await beginLogoutAuthTransition(42, prepareLogout);

    expect(prepareLogout).toHaveBeenCalledWith(42);
    expect(transition).toEqual({
      initialState: {
        status: 'signedOut',
        warning:
          '보호된 화면은 닫았지만 기기의 로그인 정보를 완전히 삭제하지 못했습니다. 앱을 다시 열면 로그인 상태가 복원될 수 있으니 이 기기 사용을 중단하고 고객지원에 문의해 주세요.',
      },
      remoteState: null,
    });
  });

  it('closes protected UI before the remote logout result arrives', async () => {
    let finishRemoteLogout!: (result: {
      status: 'signedOutWithRemoteWarning';
      message: string;
    }) => void;
    const remoteLogout = new Promise<{
      status: 'signedOutWithRemoteWarning';
      message: string;
    }>((resolve) => {
      finishRemoteLogout = resolve;
    });
    const prepareLogout = vi.fn(async () => ({
      completeRemoteLogout: () => remoteLogout,
    }));

    const transition = await beginLogoutAuthTransition(42, prepareLogout);

    expect(transition.initialState).toEqual({status: 'signedOut'});
    expect(transition.remoteState).not.toBeNull();
    finishRemoteLogout({
      status: 'signedOutWithRemoteWarning',
      message: '서버 로그아웃을 확인하지 못했습니다.',
    });
    await expect(transition.remoteState).resolves.toEqual({
      status: 'signedOut',
      warning: '서버 로그아웃을 확인하지 못했습니다.',
    });
  });

  it('turns a rejected remote logout into a signed-out warning', async () => {
    const prepareLogout = vi.fn(async () => ({
      completeRemoteLogout: async () => {
        throw new Error('network unavailable');
      },
    }));

    const transition = await beginLogoutAuthTransition(42, prepareLogout);

    expect(transition.initialState).toEqual({status: 'signedOut'});
    await expect(transition.remoteState).resolves.toEqual({
      status: 'signedOut',
      warning: '이 기기에서는 로그아웃했지만 서버 로그아웃 확인은 완료하지 못했습니다.',
    });
  });
});
