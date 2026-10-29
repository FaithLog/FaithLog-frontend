import {describe, expect, it} from 'vitest';
import {getNotificationFailureCopy} from './notificationFailureCopy';

describe('notification failure copy', () => {
  it('explains missing receivers without claiming the user turned notifications off', () => {
    const message = getNotificationFailureCopy('NO_ACTIVE_FCM_TOKEN');
    expect(message).toContain('기기가 등록');
    expect(message).toContain('해당 멤버');
    expect(message).not.toContain('꺼');
    expect(message).not.toContain('TOKEN');
  });
  it.each(['SQL private user@example.test', 'constructor', '__proto__', 'SECRET_TOKEN'])('never displays unrecognized reason %s', (reason) => {
    expect(getNotificationFailureCopy(reason)).not.toContain(reason);
    expect(getNotificationFailureCopy(reason)).toContain('관리자');
  });
  it('distinguishes an absent reason, duplicates and completed delivery', () => {
    expect(getNotificationFailureCopy(null)).toContain('기록되지');
    expect(getNotificationFailureCopy('DUPLICATE')).toContain('중복');
    expect(getNotificationFailureCopy(null, 'SENT')).toContain('없습니다');
  });
});
