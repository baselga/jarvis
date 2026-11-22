import postgres from 'postgres';

import { runMigrations } from '../db/run-migrations.js';
import { testDatabaseName, testDatabaseUrl } from './env.js';

// Vitest globalSetup: corre una vez por ejecución, antes de cualquier archivo de test.
// Deja la BD de test creada y con las migraciones al día.
export default async function setup() {
  const url = testDatabaseUrl();
  const dbName = testDatabaseName(url);

  // `CREATE DATABASE` no puede ejecutarse conectado a la BD que se crea: usamos
  // la BD `postgres` del mismo servidor, que siempre existe.
  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const admin = postgres(adminUrl.toString(), { max: 1, connect_timeout: 5 });
  try {
    const existing = await admin`select 1 from pg_database where datname = ${dbName}`;
    if (existing.length === 0) {
      // El nombre ya pasó el regex de `assertTestDatabaseUrl`: es seguro interpolarlo.
      await admin.unsafe(`create database "${dbName}"`);
    }
  } finally {
    await admin.end({ timeout: 5 });
  }

  await runMigrations(url);
}
