/// <reference types="vitest/config" />

import { getViteConfig } from "astro/config";

export default getViteConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // Populate the content data store before any test imports `astro:content`.
    // See scripts/sync-content-store.mjs for why this is needed at all.
    globalSetup: ["./scripts/sync-content-store.mjs"],
    // Run unit tests in a negative-offset timezone so `formatDate`'s
    // UTC guarantee is actually exercised, not just incidentally satisfied.
    env: { TZ: "America/New_York" },
  },
});
