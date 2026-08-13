export const BANK_OPTIONS = [
  '카카오뱅크',
  '토스뱅크',
  'KB국민은행',
  '신한은행',
  '우리은행',
  '하나은행',
  'NH농협은행',
  'IBK기업은행',
  '케이뱅크',
] as const;

export type PresetBankName = (typeof BANK_OPTIONS)[number];

export function normalizeAccountNumber(value: string) {
  return value.replace(/\D/g, '');
}

export function normalizeBankName(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

export function isPresetBankName(value: string): value is PresetBankName {
  const normalized = normalizeBankName(value);
  return BANK_OPTIONS.some((bankName) => bankName === normalized);
}

export function preparePaymentAccountFields({
  accountHolder,
  accountNumber,
  bankName,
  nickname,
}: {
  accountHolder: string;
  accountNumber: string;
  bankName: string;
  nickname: string;
}) {
  return {
    accountHolder: accountHolder.trim(),
    accountNumber: normalizeAccountNumber(accountNumber),
    bankName: normalizeBankName(bankName),
    nickname: nickname.trim(),
  };
}
