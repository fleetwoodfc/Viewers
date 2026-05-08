const base = require('../../jest.config.base.js');
const pkg = require('./package');

module.exports = {
  ...base,
  displayName: pkg.name,
  testMatch: [...base.testMatch, '<rootDir>/src/**/*.test.tsx'],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/globalSetup.js'],
  // rootDir: "../.."
  // testMatch: [
  //   //`<rootDir>/platform/${pack.name}/**/*.spec.js`
  //   "<rootDir>/platform/app/**/*.test.js"
  // ]
};
