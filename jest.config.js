/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  verbose: true,
  // Ignore the build output folder
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
};