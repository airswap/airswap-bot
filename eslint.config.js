// eslint-disable-next-line @typescript-eslint/no-require-imports
const typescriptEslint = require('@typescript-eslint/eslint-plugin')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const typescriptParser = require('@typescript-eslint/parser')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const prettier = require('eslint-plugin-prettier')

module.exports = [
  {
    ignores: ['node_modules/', 'build/'],
  },
  {
    files: ['**/*.{js,ts}'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 2017,
        sourceType: 'script',
        ecmaFeatures: {
          modules: true,
        },
      },
      globals: {
        web3: true,
        fetch: true,
        console: true,
        process: true,
        Buffer: true,
        __dirname: true,
        __filename: true,
        module: true,
        require: true,
        exports: true,
        global: true,
      },
    },
    plugins: {
      '@typescript-eslint': typescriptEslint,
      prettier: prettier,
    },
    rules: {
      ...typescriptEslint.configs.recommended.rules,
      ...prettier.configs.recommended.rules,
      '@typescript-eslint/explicit-member-accessibility': 1,
      '@typescript-eslint/member-ordering': 1,
      '@typescript-eslint/no-explicit-any': 0,
      '@typescript-eslint/camelcase': 0,
      '@typescript-eslint/explicit-function-return-type': 0,
      '@typescript-eslint/no-var-requires': 0,
      '@typescript-eslint/ban-ts-comment': 0,
      'prefer-const': 1,
    },
  },
]
