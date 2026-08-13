import {describe, expect, it, vi} from 'vitest';

import {
  buildTossRemittanceUrl,
  createTossRemittanceOpener,
  runTossRemittanceWithCopyFallback,
} from './tossRemittance';

describe('Toss remittance', () => {
  it('builds an encoded URL from the exact charge bank, digit-only account, and amount', () => {
    expect(buildTossRemittanceUrl({
      accountNumber: '3333-3704-25901',
      amount: 1000,
      bankName: '카카오뱅크',
    })).toBe(
      'supertoss://send?bank=%EC%B9%B4%EC%B9%B4%EC%98%A4%EB%B1%85%ED%81%AC&accountNo=3333370425901&amount=1000',
    );
  });

  it('rejects directly entered banks, invalid accounts, and invalid amounts', () => {
    expect(buildTossRemittanceUrl({bankName: '부산은행', accountNumber: '123', amount: 1000}))
      .toBeNull();
    expect(buildTossRemittanceUrl({bankName: '신한은행', accountNumber: '---', amount: 1000}))
      .toBeNull();
    expect(buildTossRemittanceUrl({bankName: '신한은행', accountNumber: '123', amount: 0}))
      .toBeNull();
    expect(buildTossRemittanceUrl({bankName: '신한은행', accountNumber: '123', amount: 1.5}))
      .toBeNull();
  });

  it('opens Toss once for rapid duplicate taps and never marks a charge paid', async () => {
    const canOpenURL = vi.fn().mockResolvedValue(true);
    const openURL = vi.fn().mockResolvedValue(undefined);
    const opener = createTossRemittanceOpener({canOpenURL, openURL});
    const input = {bankName: '신한은행', accountNumber: '110-123', amount: 8000};

    const [first, second] = await Promise.all([opener.open(input), opener.open(input)]);

    expect(first).toEqual({status: 'opened'});
    expect(second).toEqual({status: 'busy'});
    expect(canOpenURL).toHaveBeenCalledOnce();
    expect(openURL).toHaveBeenCalledOnce();
  });

  it('returns safe fallback states when Toss is unavailable or opening fails', async () => {
    const unavailable = createTossRemittanceOpener({
      canOpenURL: vi.fn().mockResolvedValue(false),
      openURL: vi.fn(),
    });
    await expect(unavailable.open({bankName: '우리은행', accountNumber: '123', amount: 1000}))
      .resolves.toEqual({status: 'unavailable'});

    const failed = createTossRemittanceOpener({
      canOpenURL: vi.fn().mockResolvedValue(true),
      openURL: vi.fn().mockRejectedValue(new Error('private OS error')),
    });
    await expect(failed.open({bankName: '우리은행', accountNumber: '123', amount: 1000}))
      .resolves.toEqual({status: 'failed'});
  });

  it('copies the exact account only when Toss cannot be opened', async () => {
    const copyFallback = vi.fn().mockResolvedValue(true);
    const input = {bankName: '카카오뱅크', accountNumber: '3333-1', amount: 1000};
    await expect(runTossRemittanceWithCopyFallback({
      copyFallback,
      input,
      opener: {open: vi.fn().mockResolvedValue({status: 'opened'})},
    })).resolves.toEqual({copied: false, status: 'opened'});
    expect(copyFallback).not.toHaveBeenCalled();

    await expect(runTossRemittanceWithCopyFallback({
      copyFallback,
      input,
      opener: {open: vi.fn().mockResolvedValue({status: 'unavailable'})},
    })).resolves.toEqual({copied: true, status: 'unavailable'});
    expect(copyFallback).toHaveBeenCalledOnce();
  });

  it('does not open or copy a second charge while a remittance is already running', async () => {
    const copyFallback = vi.fn().mockResolvedValue(true);

    await expect(runTossRemittanceWithCopyFallback({
      copyFallback,
      input: {bankName: '카카오뱅크', accountNumber: '3333-1', amount: 1000},
      opener: {open: vi.fn().mockResolvedValue({status: 'busy'})},
    })).resolves.toEqual({copied: false, status: 'busy'});
    expect(copyFallback).not.toHaveBeenCalled();
  });
});
