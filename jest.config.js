const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './',
});

const customJestConfig = {
  testEnvironment: 'jest-environment-jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
  },
  modulePathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/.open-next/', '<rootDir>/.claude/'],
  testPathIgnorePatterns: ['/node_modules/', '/.next/', '/.open-next/', '/.claude/'],
};

module.exports = createJestConfig(customJestConfig);
