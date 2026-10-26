/**
 * Base-path helpers.
 *
 * A project site on GitHub Pages is served from a sub-path
 * (`https://<owner>.github.io/<repo>/`), while local development and the test
 * suites run from the domain root (`/`). `PUBLIC_BASE_URL` selects the sub-path
 * at build time; every link the site renders goes through `withBase` and every
 * incoming URL through `stripBase`, so one build is correct in both places.
 */

/** Normalize a configured base into `/`, `/print/`, `/apps/print/`, … */
export function resolveBase(raw: string | undefined): string {
  if (!raw) return "/";

  // Accept either a bare path ("print") or a full deployment URL.
  const path = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? new URL(raw).pathname : raw;
  const trimmed = path.replace(/^\/+|\/+$/g, "");
  return trimmed === "" ? "/" : `/${trimmed}/`;
}

/** The deployment base for this build, read from the environment. */
export const basePath = resolveBase(process.env.PUBLIC_BASE_URL);

/** Prefix a root-relative path with the deployment base. */
export function withBase(path: string, base: string = basePath): string {
  const prefix = resolveBase(base);
  const relative = path.replace(/^\/+/, "");
  return prefix === "/" ? `/${relative}` : `${prefix}${relative}`;
}

/** Remove the deployment base from a pathname so routes can be parsed. */
export function stripBase(path: string, base: string = basePath): string {
  const prefix = resolveBase(base);
  if (prefix !== "/" && path.startsWith(prefix)) {
    return `/${path.slice(prefix.length)}`;
  }
  return path.startsWith("/") ? path : `/${path}`;
}
