import {isPresetBankName, normalizeAccountNumber, normalizeBankName} from './paymentAccountInput';

export type TossRemittanceInput = {
  accountNumber: string;
  amount: number;
  bankName: string;
};

type RemittanceLinking = {
  canOpenURL(url: string): Promise<boolean>;
  openURL(url: string): Promise<unknown>;
};

export type TossRemittanceResult =
  | {status: 'opened'}
  | {status: 'busy'}
  | {status: 'invalid'}
  | {status: 'unavailable'}
  | {status: 'failed'};

type TossRemittanceOpener = {
  open(input: TossRemittanceInput): Promise<TossRemittanceResult>;
};

export function buildTossRemittanceUrl(input: TossRemittanceInput) {
  const bankName = normalizeBankName(input.bankName);
  const accountNumber = normalizeAccountNumber(input.accountNumber);
  if (
    !isPresetBankName(bankName) ||
    accountNumber.length === 0 ||
    !Number.isSafeInteger(input.amount) ||
    input.amount <= 0
  ) {
    return null;
  }

  return `supertoss://send?bank=${encodeURIComponent(bankName)}` +
    `&accountNo=${encodeURIComponent(accountNumber)}` +
    `&amount=${encodeURIComponent(String(input.amount))}`;
}

export function createTossRemittanceOpener(linking: RemittanceLinking) {
  let inFlight: Promise<TossRemittanceResult> | null = null;

  return {
    open(input: TossRemittanceInput): Promise<TossRemittanceResult> {
      if (inFlight) return Promise.resolve({status: 'busy'});
      const url = buildTossRemittanceUrl(input);
      if (!url) return Promise.resolve({status: 'invalid'});

      inFlight = (async () => {
        try {
          if (!(await linking.canOpenURL(url))) return {status: 'unavailable'};
          await linking.openURL(url);
          return {status: 'opened'};
        } catch {
          return {status: 'failed'};
        } finally {
          inFlight = null;
        }
      })();
      return inFlight;
    },
  };
}

export async function runTossRemittanceWithCopyFallback({
  copyFallback,
  input,
  opener,
}: {
  copyFallback: () => Promise<boolean>;
  input: TossRemittanceInput;
  opener: TossRemittanceOpener;
}) {
  const result = await opener.open(input);
  if (result.status === 'opened' || result.status === 'busy') {
    return {copied: false, status: result.status} as const;
  }
  return {copied: await copyFallback(), status: result.status} as const;
}
