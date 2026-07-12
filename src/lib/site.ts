/**
 * Canonical site base URL used to build absolute JSON-LD `@id`s.
 *
 * Under static export there is no request to derive an origin from, so the
 * base comes from the `SITE_URL` build-time env var. When unset it returns an
 * empty string, which yields relative IRIs — still valid JSON-LD, resolved
 * against the document base by consumers. Set `SITE_URL=https://<domain>` at
 * build time once the canonical domain is chosen.
 */
export function siteBaseUrl(): string {
  return (process.env.SITE_URL ?? "").trim().replace(/\/+$/, "");
}
