import Link from "next/link";
import type { Metadata } from "next";
import { about, site } from "@/lib/content/loader";
import { renderContent, splitSlots, type Part } from "@/lib/content/render";
import type { AboutModule, AboutReading } from "@/lib/content/schema";
import type { SpreadRow } from "@/lib/content/spread";
import { aboutSpreadRows, aboutVars } from "@/lib/content/vars";

/**
 * The about page is chrome only: every word of prose lives in
 * `content/about.md`, and the sections here are whatever that document's `##`
 * headings are. Adding, renaming or reordering a section is a content edit.
 *
 * Two blocks cannot be expressed in Markdown, so they are frontmatter data
 * rendered by the components below and positioned by `<!-- slot: -->` markers
 * in the body.
 */

const LABEL = "content/about.md";

export const metadata: Metadata = {
  title: about.data.title,
  description: site.description,
  openGraph: {
    type: "article",
    siteName: "aboard",
    title: `${about.data.title} — aboard`,
    description: site.description,
  },
  twitter: {
    card: "summary_large_image",
    title: `${about.data.title} — aboard`,
    description: site.description,
  },
};

export default function AboutPage() {
  const vars = aboutVars();
  const sections = about.sections.map((section) => ({
    slug: section.slug,
    title: section.title,
    parts: splitSlots(renderContent(section.markdown, vars, LABEL)),
  }));
  const [intro, ...rest] = sections;

  return (
    <main className="about-page">
      <Link className="breadcrumb" href="/">
        ← graph
      </Link>

      <h1 className="detail-headline">{about.data.headline}</h1>

      <div className="about-intro">
        <Parts parts={intro.parts} />
      </div>

      {rest.map((section) => (
        <section key={section.slug} id={section.slug} className="about-section">
          <h2 className="section-label">{section.title}</h2>
          <Parts parts={section.parts} />
        </section>
      ))}
    </main>
  );
}

/** Rendered prose runs, with the document's component slots in between. */
function Parts({ parts }: { parts: Part[] }) {
  return (
    <>
      {parts.map((part, i) =>
        part.kind === "html" ? (
          <div
            key={i}
            className="about-prose"
            dangerouslySetInnerHTML={{ __html: part.html }}
          />
        ) : (
          <Slot key={i} name={part.name} />
        ),
      )}
    </>
  );
}

/**
 * Throws on an unknown slot rather than rendering nothing. A typo in a marker
 * would otherwise drop a whole block silently; `content.test.ts` asserts the
 * document's slots and this switch agree, and this is the build-time backstop.
 */
function Slot({ name }: { name: string }) {
  switch (name) {
    case "modules":
      return (
        <div className="module-list">
          {about.data.modules.map((m) => (
            <Module key={m.tag} {...m} />
          ))}
        </div>
      );
    case "readings":
      return (
        <div className="reading-cards">
          {about.data.readings.map((r) => (
            <Reading key={r.label} {...r} />
          ))}
        </div>
      );
    case "spread":
      return <SpreadTable rows={aboutSpreadRows()} />;
    default:
      throw new Error(`${LABEL}: no component for slot "${name}"`);
  }
}

function Module({ tag, name, body }: AboutModule) {
  return (
    <div className="module-row">
      <div className="tag">{tag}</div>
      <div>
        <div className="name">{name}</div>
        <p>{body}</p>
      </div>
    </div>
  );
}

/** Median and spread come from `data/`; only the reading column is authored. */
function SpreadTable({ rows }: { rows: SpreadRow[] }) {
  return (
    <div className="spread-table">
      <table>
        <thead>
          <tr>
            <th>Forecast</th>
            <th>Median</th>
            <th align="right">Spread</th>
            <th>Reading</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.id}</td>
              <td>{r.median}</td>
              <td align="right">{r.spread}</td>
              <td>{r.reading}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Reading({ label, title, body, implies }: AboutReading) {
  return (
    <div className="reading-card">
      <div className="reading-label">{label}</div>
      <div className="reading-title">{title}</div>
      <p className="reading-body">{body}</p>
      <div className="reading-lever">
        <span className="reading-lever-label">implies</span> {implies}
      </div>
    </div>
  );
}
