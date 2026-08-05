import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, it} from 'vitest';

const root = process.cwd();

describe('weekly material notification production wiring', () => {
  it('passes the notification week and Sunday highlight into the actual screen', () => {
    const source = fs.readFileSync(path.join(root, 'src/root/FaithLogApp.tsx'), 'utf8');
    expect(source).toContain("target.route === 'weeklyMaterials'");
    expect(source).toContain('initialWeekStartDate={notificationWeeklyMaterialTarget?.weekStartDate}');
    expect(source).toContain('highlightedType={notificationWeeklyMaterialTarget?.highlight ?? null}');
    expect(source).toContain('clearAllPrivateDocumentCaches()');
  });
});
