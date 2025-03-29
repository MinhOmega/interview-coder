module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended'
  ],
  env: {
    node: true,
    browser: true,
    es2020: true
  },
  rules: {
    'no-console': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { 
      'argsIgnorePattern': '^_',
      'varsIgnorePattern': '^_' 
    }]
  },
  overrides: [
    {
      files: ['src/main/**/*.ts'],
      env: {
        node: true,
        browser: false
      }
    },
    {
      files: ['src/renderer/**/*.ts'],
      env: {
        browser: true,
        node: false
      }
    }
  ]
}; 