import next from 'eslint-config-next'

const config = Array.isArray(next) ? next : [next]

export default [
  {
    ignores: [
      'src/generated/**',
      '.next/**',
      'src/.next/**',
      'node_modules/**',
    ],
  },
  ...config,
]
