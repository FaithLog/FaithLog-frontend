import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

import {describe, expect, it} from 'vitest';

const sourcePath = fileURLToPath(new URL('./PollScreen.tsx', import.meta.url));
const source = readFileSync(sourcePath, 'utf8');
const responsePanelSource = source.slice(
  source.indexOf('function ResponsePanel('),
  source.indexOf('function CoffeeCatalogPanel('),
);

describe('poll respondent privacy', () => {
  it('does not render respondent names in option rows for any poll type', () => {
    expect(responsePanelSource).not.toContain('respondentPreview');
    expect(responsePanelSource).not.toContain('respondents');
    expect(responsePanelSource).toContain('optionResult.responseCount');
  });

  it('right-aligns the add-option and response-submit actions', () => {
    expect(responsePanelSource).toContain('style={styles.responseSubmitRow}');
    expect(source).toMatch(/addOptionButton:\s*\{[\s\S]*?alignSelf: 'flex-end'/);
    expect(source).toMatch(/responseSubmitRow:\s*\{[\s\S]*?alignItems: 'flex-end'/);
  });
});
