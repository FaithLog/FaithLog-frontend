import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {describe, expect, it} from 'vitest';

const directory = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(directory, 'PaymentScreen.tsx'), 'utf8');

describe('payment Toss remittance wiring', () => {
  it('offers remittance on each unpaid charge card using that charge account and amount', () => {
    expect(source).toContain('createTossRemittanceOpener');
    expect(source).toMatch(/onSendWithToss=\{\(\) => void sendWithToss\(charge\)\}/);
    expect(source).toContain('const account = charge.account');
    expect(source).toMatch(/accountNumber: account\.accountNumber/);
    expect(source).toMatch(/bankName: account\.bankName/);
    expect(source).toMatch(/amount: charge\.amount/);
  });

  it('keeps remittance separate from the existing explicit paid confirmation', () => {
    expect(source).toContain('onSendWithToss');
    expect(source).toContain('onMarkPaid');
    expect(source).toContain("? '토스로 송금' : '계좌 복사'");
    expect(source).toContain("? '입금했어요' : '완료'");
    expect(source).toContain("? '입금했어요' : '처리 완료'");
    expect(source).not.toContain("? '납부 완료' :");
  });
});
