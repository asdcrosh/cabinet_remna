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
]
