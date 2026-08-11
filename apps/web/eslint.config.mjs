import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

/*
  Flat config, loaded by the ESLint CLI directly.

  There was no config file here at all before, which is why CI failed on every
  push: with nothing to read, `next lint` fell through to its interactive
  "How would you like to configure ESLint?" prompt, and a runner with no TTY
  answers that with EOF and a non-zero exit. The failure had nothing to do with
  the code being pushed.

  `eslint-config-next` is still published in eslintrc form, so FlatCompat
  translates it rather than us restating its rules.
*/
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

export default [
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', 'public/**'],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // The codebase leans on inference for locals and only annotates public
      // APIs; the default here would flag every one of those.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
];
