import { describe, expect, it } from 'vitest';

import { containsPattern } from './search.js';

describe('containsPattern', () => {
  it('envuelve el texto en % para «contiene»', () => {
    expect(containsPattern('tolkien')).toBe('%tolkien%');
  });

  it('escapa \\, % y _ para que no actúen como comodines', () => {
    expect(containsPattern('100%_a\\b')).toBe('%100\\%\\_a\\\\b%');
  });
});
