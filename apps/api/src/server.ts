import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDb } from './db/client.js';

const config = loadConfig();
const { db, close: closeDb } = createDb(config.DATABASE_URL);
const app = buildApp({
  logger: { level: config.LOG_LEVEL },
  db,
  cookieSecure: config.NODE_ENV === 'production',
});

// Al cerrar la app (tras terminar las peticiones en curso) cerramos el pool de BD.
app.addHook('onClose', closeDb);

// Docker envía SIGTERM al parar el contenedor: cerramos ordenadamente.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, 'Parando la API');
    void app.close().then(() => process.exit(0));
  });
}

await app.listen({ host: config.HOST, port: config.PORT });
