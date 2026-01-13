// Suppress ioredis connection warnings during unit tests
// These warnings occur because some tests may try to connect to Redis
// but we're using mocks, so the connections are never actually used
const originalConsoleError = console.error;

console.error = (...args: any[]) => {
  // Filter out ioredis unhandled error event warnings
  if (
    typeof args[0] === 'string' &&
    args[0].includes('[ioredis] Unhandled error event')
  ) {
    return;
  }
  originalConsoleError.apply(console, args);
};
