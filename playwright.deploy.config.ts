import { defineConfig, devices } from "@playwright/test";

// Exercises the built site the way GitHub Pages serves it: from a sub-path
// (`https://<owner>.github.io/<repo>/`). `webServer.env` sets `PUBLIC_BASE_URL`
// for both the build and `astro preview`, so the test drives the real
// deployable output rather than a root-only dev server.
export default defineConfig({
  testDir: "./e2e-deploy",
  use: {
    baseURL: "http://127.0.0.1:4323",
    testIdAttribute: "data-test",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "pnpm build && pnpm preview --host 127.0.0.1 --port 4323 --ignore-lock",
    url: "http://127.0.0.1:4323/print/",
    env: { PUBLIC_BASE_URL: "print" },
    reuseExistingServer: !process.env.CI,
  },
});
