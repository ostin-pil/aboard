import { describe, expect, it } from "vitest";
import { interpolate, renderContent, renderMarkdown, splitSlots } from "./render";

/**
 * Structure and failure modes only, never prose. Assertions here are about what
 * a page can rely on: that placeholders resolve or throw, that Markdown becomes
 * the elements the stylesheet targets, and that slots land in the right order.
 */

describe("interpolate", () => {
  it("substitutes known placeholders, with or without inner spaces", () => {
    expect(interpolate("{{a}} and {{ b }}", { a: "one", b: 2 }, "d.md")).toBe("one and 2");
  });

  it("repeats a placeholder used more than once", () => {
    expect(interpolate("{{n}}/{{n}}", { n: 3 }, "d.md")).toBe("3/3");
  });

  it("leaves text with no placeholders untouched", () => {
    expect(interpolate("plain { braces } here", {}, "d.md")).toBe("plain { braces } here");
  });

  it("throws on an unknown placeholder, naming the file and what it has", () => {
    expect(() => interpolate("{{clamCount}}", { claimCount: 9 }, "content/about.md")).toThrow(
      /content\/about\.md[\s\S]*clamCount[\s\S]*claimCount/,
    );
  });

  it("renders a zero rather than treating it as absent", () => {
    expect(interpolate("{{n}}", { n: 0 }, "d.md")).toBe("0");
  });
});

describe("renderMarkdown", () => {
  it("renders paragraphs, emphasis, code and links", () => {
    const html = renderMarkdown("A **bold** and `code` and [link](/graph).");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<code>code</code>");
    expect(html).toContain('<a href="/graph">link</a>');
    expect(html.startsWith("<p>")).toBe(true);
  });

  it("renders ordered and unordered lists", () => {
    expect(renderMarkdown("- one\n- two")).toContain("<ul>");
    expect(renderMarkdown("1. one\n2. two")).toContain("<ol>");
  });

  it("renders GFM tables, which the spread table relies on", () => {
    const html = renderMarkdown("| A | B |\n| --- | --- |\n| 1 | 2 |");
    expect(html).toContain("<table>");
    expect(html).toContain("<th>A</th>");
    expect(html).toContain("<td>1</td>");
  });

  it("returns a string synchronously", () => {
    expect(typeof renderMarkdown("hi")).toBe("string");
  });
});

describe("renderContent", () => {
  it("interpolates before rendering, so a value can carry Markdown", () => {
    expect(renderContent("Spans {{n}} domains.", { n: 3 }, "d.md")).toContain("Spans 3 domains.");
  });
});

describe("splitSlots", () => {
  it("splits html around a marker, preserving order", () => {
    const parts = splitSlots("<p>before</p>\n<!-- slot: readings -->\n<p>after</p>");
    expect(parts.map((p) => p.kind)).toEqual(["html", "slot", "html"]);
    expect(parts[1]).toEqual({ kind: "slot", name: "readings" });
  });

  it("handles a marker at the start and at the end", () => {
    expect(splitSlots("<!-- slot: a -->\n<p>x</p>").map((p) => p.kind)).toEqual(["slot", "html"]);
    expect(splitSlots("<p>x</p>\n<!-- slot: a -->").map((p) => p.kind)).toEqual(["html", "slot"]);
  });

  it("handles several markers", () => {
    const parts = splitSlots("<!-- slot: a --><p>x</p><!-- slot: b -->");
    expect(parts.map((p) => (p.kind === "slot" ? p.name : "html"))).toEqual(["a", "html", "b"]);
  });

  it("returns one html part when there is no marker", () => {
    expect(splitSlots("<p>x</p>")).toEqual([{ kind: "html", html: "<p>x</p>" }]);
  });

  it("returns nothing for empty html", () => {
    expect(splitSlots("   ")).toEqual([]);
  });
});
