const nextVitals = require('eslint-config-next/core-web-vitals')

module.exports = [
  ...nextVitals,
  {
    ignores: [
      '.next/**',
      'coverage/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
      'next.config.js',
      'postcss.config.js',
      'tailwind.config.ts',
    ],
  },
  {
    rules: {
      'react-hooks/immutability': 'off',
      'react-hooks/incompatible-library': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/static-components': 'off',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/lib/json-response.ts', '**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error', {
        selector: 'CallExpression[callee.object.name=/^(NextResponse|Response)$/][callee.property.name="json"]',
        message: 'Use jsonResponse from @/lib/json-response so nested BigInt fields are serialized safely.',
      }],
    },
  },
]
