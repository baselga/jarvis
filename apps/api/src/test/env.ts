// Salvaguarda de la BD de test: los tests la vacían sin preguntar, así que solo
// aceptamos una BD cuyo nombre termine en `_test`. Un despiste de configuración
// se convierte en un error ruidoso en vez de en datos de desarrollo perdidos.
// El mismo regex hace seguro interpolar el nombre en `CREATE DATABASE`.
const TEST_DB_NAME = /^[a-z0-9_]+_test$/;

export function assertTestDatabaseUrl(url: string | undefined): string {
  if (!url) {
    throw new Error(
      'Falta TEST_DATABASE_URL: añádela al .env (ver .env.example) o al entorno del contenedor.',
    );
  }
  const dbName = testDatabaseName(url);
  if (!TEST_DB_NAME.test(dbName)) {
    throw new Error(
      `TEST_DATABASE_URL debe apuntar a una BD cuyo nombre termine en _test (es "${dbName}").`,
    );
  }
  return url;
}

// Nombre de la BD de una URL de Postgres (su pathname sin la `/`).
export function testDatabaseName(url: string): string {
  return new URL(url).pathname.slice(1);
}

export const testDatabaseUrl = () => assertTestDatabaseUrl(process.env.TEST_DATABASE_URL);
