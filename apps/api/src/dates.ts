import type { DateString } from '@jarvis/schemas';

// Zona de casa si no se configura `HOME_TZ` (la usan `config.ts` y `buildApp`).
export const DEFAULT_HOME_TZ = 'Europe/Madrid';

// ¿Es `timeZone` una zona IANA que entiende `Intl`? (`Europa/Madrid` → no).
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone });
    return true;
  } catch {
    return false;
  }
}

// El día de `now` en `timeZone` como `YYYY-MM-DD`. El servidor suele ir en UTC:
// a las 00:30 en Madrid aún es «ayer» en UTC, así que no vale `toISOString()`.
// `now` se inyecta para que los tests fijen el instante.
export function todayIn(timeZone: string, now = new Date()): DateString {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
