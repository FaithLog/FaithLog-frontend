import type {ApiError} from './types';

const LABELS: Readonly<Record<string, string>> = {
  email: '이메일', password: '비밀번호', currentPassword: '현재 비밀번호', newPassword: '새 비밀번호',
  name: '이름', nickname: '별칭', bankName: '은행명', accountNumber: '계좌번호', accountHolder: '예금주',
  amount: '금액', enteredAmount: '청구 금액', priceAmount: '금액', baseAmount: '기본 금액', amountPerUnit: '단위당 금액',
  region: '지역', description: '설명', inviteCode: '초대코드', code: '인증번호', confirmText: '확인 문구',
  title: '제목', body: '내용', content: '내용', memo: '메모', note: '메모', notice: '안내문',
  requiredCount: '필수 횟수', saturdayLateMinutes: '지각 시간', weekStartDate: '주차 시작일', recordDate: '체크 날짜',
  accountType: '계좌 유형', ownerUserId: '계좌 담당자', dailyChecks: '날짜별 경건 체크',
  optionIds: '투표 선택지', userIds: '대상 멤버', targetUserIds: '알림 대상',
  startsAt: '시작 시각', endsAt: '종료 시각', smallGroupMeetingCount: '목장모임 참여 인원',
  holyWaveCount: '홀리웨이브 참여 인원', otherWorshipCount: '타예배 참여 인원',
};

export function parseValidationFieldErrors(status: number | undefined, code: string | undefined, data: unknown, legacyMessage: string): Record<string, string> {
  if ((status !== 400 && status !== 422) || code !== 'GLOBAL_VALIDATION_FAILED') return {};
  const result: Record<string, string> = {};
  const record = data && typeof data === 'object' ? data as Record<string, unknown> : null;
  if (Array.isArray(record?.fieldErrors)) {
    for (const item of record.fieldErrors.slice(0, 40)) {
      if (!item || typeof item !== 'object') continue;
      const {field, code: constraint} = item as Record<string, unknown>;
      if (typeof field !== 'string' || typeof constraint !== 'string' || field.length > 120) continue;
      const leaf = field.split('.').at(-1)?.replace(/\[\d+\]$/, '') ?? '';
      if (!Object.hasOwn(LABELS, leaf) || Object.hasOwn(result, field)) continue;
      result[field] = fieldMessage(LABELS[leaf]!, constraint);
    }
  }
  // Compatibility with older servers: use only a known field name and infer a
  // constraint. Never reuse the raw server message as UI copy.
  if (Object.keys(result).length === 0) {
    const match = /^([A-Za-z][A-Za-z0-9]*):\s*(.{0,300})$/s.exec(legacyMessage);
    if (match && Object.hasOwn(LABELS, match[1]!)) {
      const constraint = /공백|필수|비어|must not be (blank|null|empty)/i.test(match[2]!) ? 'NotBlank' : 'Invalid';
      result[match[1]!] = fieldMessage(LABELS[match[1]!]!, constraint);
    }
  }
  return result;
}

function fieldMessage(label: string, constraint: string) {
  if (['NotBlank', 'NotEmpty', 'NotNull'].includes(constraint)) return `${label}를 입력해 주세요.`;
  if (constraint === 'Email') return '이메일 형식을 확인해 주세요.';
  if (constraint === 'Positive') return `${label}은 0보다 큰 값으로 입력해 주세요.`;
  if (constraint === 'PositiveOrZero') return `${label}은 0 이상으로 입력해 주세요.`;
  if (constraint === 'Size' || constraint === 'Length') return `${label}의 길이 또는 선택 개수를 확인해 주세요.`;
  if (['Min', 'Max', 'DecimalMin', 'DecimalMax', 'Range'].includes(constraint)) return `${label}을 안내된 범위 안으로 입력해 주세요.`;
  if (constraint === 'Pattern') return `${label}의 입력 형식을 확인해 주세요.`;
  return `${label} 항목을 확인해 주세요.`;
}

export function pickValidationFieldErrors(error: ApiError, fields: readonly string[]) {
  const result: Record<string, string> = {};
  for (const field of fields) {
    if (error.fieldErrors && Object.hasOwn(error.fieldErrors, field)) result[field] = error.fieldErrors[field]!;
  }
  return result;
}
