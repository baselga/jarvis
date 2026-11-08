import { z } from 'zod';

// Variables de entorno de la API. Si falta alguna obligatoria o tiene un valor
// inválido, la app no arranca: mejor fallar al inicio que a mitad de una petición.
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Configuración de entorno inválida:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
