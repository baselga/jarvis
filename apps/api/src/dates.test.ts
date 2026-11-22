import { describe, expect, it } from 'vitest';

import { todayIn } from './dates.js';

describe('todayIn', () => {
  // 23:30 UTC del 1 de marzo = 00:30 del 2 de marzo en Madrid.
  const lateNightUtc = new Date('2026-03-01T23:30:00Z');

  it('da el día en la zona indicada, no en UTC', () => {
    expect(todayIn('Europe/Madrid', lateNightUtc)).toBe('2026-03-02');
    expect(todayIn('UTC', lateNightUtc)).toBe('2026-03-01');
  });

  it('en una zona al oeste puede ser el día anterior', () => {
    expect(todayIn('Pacific/Pago_Pago', new Date('2026-03-01T05:00:00Z'))).toBe('2026-02-28');
  });

  it('rellena con ceros el mes y el día', () => {
    expect(todayIn('UTC', new Date('2026-01-05T12:00:00Z'))).toBe('2026-01-05');
  });
});
