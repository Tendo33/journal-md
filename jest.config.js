module.exports = {
  // DOM 解析（DOMParser、XML 命名空间）依赖 jsdom
  testEnvironment: 'jsdom',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  transform: {
    '^.+\\.js$': ['babel-jest', {
      babelrc: false,
      configFile: false,
      presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
    }],
  },
  moduleNameMapper: {
    '^@core/(.*)$': '<rootDir>/src/core/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@config/(.*)$': '<rootDir>/src/config/$1',
    '^@pdf-core/(.*)$': '<rootDir>/vendor/pdf-parse-core/src/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
