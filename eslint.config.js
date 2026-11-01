// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/out/**', '**/dist/**', '**/release/**', '**/coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['apps/desktop/src/renderer/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: globals.browser },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: [
      'apps/desktop/src/main/**/*.ts',
      'apps/desktop/src/preload/**/*.ts',
      '**/*.config.{js,ts,mts}',
      'scripts/**',
    ],
    languageOptions: { globals: globals.node },
  },
  {
    // packages/core must stay pure: no Electron, Node or DOM.
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ['electron', 'fs', 'path', 'os', 'child_process', 'serialport'].map((name) => ({
            name,
            message: 'packages/core must stay pure TypeScript (no Electron/Node APIs).',
          })),
          patterns: [
            {
              group: ['node:*', 'fs/*'],
              message: 'packages/core must stay pure TypeScript (no Electron/Node APIs).',
            },
          ],
        },
      ],
    },
  },
  prettier,
);
