import type { MetadataRoute } from "next";
import { getClaims, graph } from "@/lib/graph";
import { siteBaseUrl } from "@/lib/site";

// Static-export the sitemap at build time (output: "export").
export const dynamic = "force-static";

/**
 * A sitemap over the published surfaces, with honest `lastmod`s. Per-claim and
 * per-dossier dates come from the corpus itself (the authored timestamps), so
 * a rebuild that changes nothing does not churn the dates. The informational
 * pages have no content date of their own, so they carry the newest corpus
 * timestamp as a truthful "site last updated" proxy.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteBaseUrl();
  const claims = getClaims();

  const latest =
    claims.map((c) => c.createdAt).sort().at(-1) ?? new Date().toISOString();

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: latest, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/graph`, lastModified: latest, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/about`, lastModified: latest, changeFrequency: "monthly", priority: 0.5 },
  ];

  const claimPages: MetadataRoute.Sitemap = claims.map((c) => ({
    url: `${base}/claims/${c.id}`,
    lastModified: c.createdAt,
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  const dossierPages: MetadataRoute.Sitemap = graph.dossiers.map((d) => {
    const authored = [d.pro.authoredBy.generatedAt, d.con.authoredBy.generatedAt].sort();
    return {
      url: `${base}/dossiers/${d.attachedToClaimId}`,
      lastModified: authored.at(-1) ?? latest,
      changeFrequency: "monthly",
      priority: 0.7,
    };
  });

  return [...staticPages, ...claimPages, ...dossierPages];
}
