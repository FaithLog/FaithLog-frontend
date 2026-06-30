import * as Clipboard from 'expo-clipboard';

export type ClipboardCopyResult =
  | {status: 'copied'}
  | {status: 'unsupported'; message: string}
  | {status: 'failed'; message: string};

export function formatAccountClipboardText({
  accountNumber,
  bankName,
}: {
  accountNumber: string;
  bankName?: string | null;
}) {
  const normalizedBankName = bankName?.trim() ?? '';
  const normalizedAccountNumber = accountNumber.trim();

  return normalizedBankName
    ? `${normalizedBankName} ${normalizedAccountNumber}`
    : normalizedAccountNumber;
}

export async function copyTextToClipboard(text: string): Promise<ClipboardCopyResult> {
  const value = text.trim();

  if (!value) {
    return {status: 'failed', message: '복사할 계좌번호가 없습니다.'};
  }

  try {
    await Clipboard.setStringAsync(value);
    return {status: 'copied'};
  } catch {
    return {status: 'failed', message: '클립보드 권한 또는 앱 상태를 확인해 주세요.'};
  }
}
