import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globals: true,
    environment: 'node',
    testTimeout: 40000,   // 40s for e2e pipeline tests
    hookTimeout: 10000,
    reporters: ['verbose'],
    // Run unit tests first (no external deps), then integration
    sequence: {
      shuffle: false,
    },
  },
});
