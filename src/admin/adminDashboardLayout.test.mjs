import fs from 'node:fs';
import path from 'node:path';

import {describe, expect, it} from 'vitest';

const source = fs.readFileSync(path.join(import.meta.dirname, 'AdminScreen.tsx'), 'utf8');

describe('admin dashboard layout', () => {
  it('uses a dashboard-only three-column metric grid', () => {
    expect(source).toContain('<View style={styles.adminDashboardMetricGrid}>');
    expect(source.match(/<Metric\s+compact(?:\s|>)/g)).toHaveLength(6);
    expect(source).toContain("adminDashboardMetric: {");
    expect(source).toContain("flexBasis: '30%',");
    expect(source).toContain('minWidth: 0,');
  });

  it('keeps the shared metric grid for non-dashboard screens', () => {
    expect(source.match(/<View style={styles.metricGrid}>/g)?.length).toBeGreaterThan(0);
  });
});
