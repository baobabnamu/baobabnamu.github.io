/**
 * Make `astro:content` work inside unit tests.
 *
 * Unit tests import `getCollection` while running under Vitest, which Astro
 * treats as a dev-mode process. In dev mode the content layer reads
 * `.astro/data-store.json` — a file that only `astro dev` writes — while
 * `astro sync`, `astro check`, and `astro build` all write the same store to
 * `node_modules/.astro/` instead (the build-mode cache directory). A fresh CI
 * checkout therefore has no store at all, every collection reads as empty, and
 * tests like `hasTranslation` fail with misleading "does not exist" warnings.
 *
 * This global setup runs `astro sync` and copies the resulting store into the
 * dev-mode location before any test imports `astro:content`.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const astroCli = path.join(root, "node_modules", "astro", "bin", "astro.mjs");
const buildStore = path.join(root, "node_modules", ".astro", "data-store.json");
const devStore = path.join(root, ".astro", "data-store.json");

export default function setup() {
  const sync = spawnSync(process.execPath, [astroCli, "sync"], { cwd: root });
  if (sync.status !== 0) {
    // Let vitest show the sync output so a failure is debuggable.
    process.stdout.write(sync.stdout?.toString() ?? "");
    process.stderr.write(sync.stderr?.toString() ?? "");
    throw new Error(`astro sync failed with exit code ${sync.status}`);
  }

  if (!existsSync(buildStore)) {
    throw new Error(`Expected ${buildStore} after sync but it is missing.`);
  }
  copyFileSync(buildStore, devStore);
}
