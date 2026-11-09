import { afterAll, beforeEach } from 'vitest';
import { closeTestDb, resetDb } from './helpers.js';

// Vitest setupFiles: corre dentro de cada archivo de test.
// Cada test empieza con las tablas vacías, así el orden de los tests no importa.
beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await closeTestDb();
});
