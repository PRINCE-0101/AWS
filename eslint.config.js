module.exports = [
  { ignores: ['node_modules/**', 'coverage/**'] },
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs' },
    rules: { 'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }], 'no-undef': 'error', 'semi': ['error', 'always'] }
  }
];
