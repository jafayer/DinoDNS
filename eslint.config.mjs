import tseslint from 'typescript-eslint';
import prettier from 'eslint-plugin-prettier';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    files: ['src/**/*.ts'],
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      prettier,
    },

    languageOptions: {
      parser: tsParser,
      ecmaVersion: 5,
      sourceType: 'module',

      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: '/home/josh/Projects/ts-dns-server',
      },
    },

    rules: {
      'prettier/prettier': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
    },
  },
];

// export default tseslint.config(
//     eslint.configs.recommended,
//     ...tseslint.configs.recommended,
//     {
//         files: ['src/**/*.ts'],
//         languageOptions: {
//             parser: tsParser,
//             ecmaVersion: 5,
//             sourceType: "module",
//             parserOptions: {
//                 project: "./tsconfig.eslint.json",
//                 tsconfigRootDir: "/home/josh/Projects/ts-dns-server",
//             },
//         },
//     }
// )
