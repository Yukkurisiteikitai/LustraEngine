const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './',
});

const customJestConfig = {
  testEnvironment: 'jest-environment-jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/components/(.*)$': '<rootDir>/components/$1',
    '^@/types/(.*)$': '<rootDir>/types/$1',
    '^@/lib/(.*)$': '<rootDir>/lib/$1',
    '^@/core/(.*)$': '<rootDir>/src/core/$1',
    '^@/application/(.*)$': '<rootDir>/src/application/$1',
    '^@/infrastructure/(.*)$': '<rootDir>/src/infrastructure/$1',
    '^@/container/(.*)$': '<rootDir>/src/container/$1',
    '^@/(.*)$': '<rootDir>/$1',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
  },
  modulePathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/.open-next/', '<rootDir>/.claude/'],
  testPathIgnorePatterns: ['/node_modules/', '/.next/', '/.open-next/', '/.claude/'],
};

module.exports = createJestConfig(customJestConfig);
