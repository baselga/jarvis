import { z } from 'zod';

// Día de calendario sin hora (`2026-11-15`): préstamos y lecturas.
export const DateSchema = z.iso.date();

export type DateString = z.infer<typeof DateSchema>;
