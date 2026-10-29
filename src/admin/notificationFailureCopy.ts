const REASONS: Readonly<Record<string, string>> = {
  NO_ACTIVE_FCM_TOKEN: '알림을 받을 수 있는 기기가 등록되어 있지 않습니다. 해당 멤버가 앱에 로그인한 뒤 알림 설정에서 권한과 연결 상태를 확인해야 합니다.',
  DUPLICATE: '같은 알림이 이미 처리되어 중복 발송에서 제외되었습니다.',
  ALREADY_SENT: '이미 발송된 알림이라 중복 발송에서 제외되었습니다.',
  UNREGISTERED: '등록된 기기의 알림 연결이 만료되었습니다. 해당 멤버가 앱을 열고 알림 설정에서 다시 연결해야 합니다.',
  INVALID_ARGUMENT: '등록된 알림 수신 정보가 유효하지 않습니다. 해당 멤버가 앱의 알림 설정에서 연결 상태를 다시 확인해야 합니다.',
};

export function getNotificationFailureCopy(reason: string | null | undefined, status: string = 'SKIPPED') {
  if (status === 'SENT') return '실패 또는 제외 사유가 없습니다.';
  if (!reason) return status === 'SKIPPED' ? '제외 사유가 기록되지 않았습니다.' : '발송 상태를 다시 확인해 주세요.';
  const code = reason.trim().toUpperCase().replace(/^MESSAGING\//, '').replace(/-/g, '_');
  if (Object.hasOwn(REASONS, code)) return REASONS[code]!;
  if (code.includes('DUPLICATE') || code.includes('ALREADY') || code.includes('LOCK')) return REASONS.DUPLICATE!;
  if (code.includes('PERMISSION') || code === '403') return '알림 발송 권한을 확인해야 합니다. 관리자에게 발송 설정 확인을 요청해 주세요.';
  return '알림을 전달하지 못했거나 발송 대상에서 제외되었습니다. 관리자에게 발송 기록 확인을 요청해 주세요.';
}
