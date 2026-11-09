import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['**/dist/', '**/coverage/']),
  js.configs.recommended,
  // Reglas con información de tipos: detectan p. ej. promesas sin await.
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Los plugins de rutas son `async` por contrato de Fastify (FastifyPluginAsyncZod)
    // aunque solo registren rutas sin esperar nada.
    files: ['apps/api/src/routes/**/*.ts'],
    rules: { '@typescript-eslint/require-await': 'off' },
  },
  {
    // Archivos de configuración en JS: fuera de los tsconfig, sin reglas de tipos.
    files: ['**/*.js', '**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  // Siempre al final: desactiva las reglas de estilo que ya cubre Prettier.
  prettier,
);
