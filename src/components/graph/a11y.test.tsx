// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import axe from "axe-core";
import { ModalDialog } from "./dialog";
import { NodeEditorModal } from "./NodeEditorModal";
import { EdgeEditorModal } from "./EdgeEditorModal";

/**
 * eslint's jsx-a11y rules read the source; axe reads the rendered tree. The two
 * catch different things, and the gap between them is where dialogs fail: a
 * `labelledBy` whose id never reaches the DOM, a control whose label sits
 * outside its `<label>`, an `aria-*` value that only resolves at render. None of
 * those is visible to a linter.
 *
 * The components are rendered rather than mocked up in HTML. `focus-trap.test.ts`
 * uses a hand-written fixture because what it tests is a selector, but a fixture
 * cannot verify the markup a component actually emits — it verifies that the
 * fixture matches the fixture. These three take only props (no context, no
 * store), so `renderToStaticMarkup` reaches the real tree cheaply.
 *
 * `useEffect` does not run under static rendering, so this covers the initial
 * markup and its semantics, not the focus trap. That is `focus-trap.test.ts`.
 */

const noop = () => {};

/** Render into a real document and let axe walk it. */
async function violationsOf(element: React.ReactElement): Promise<axe.Result[]> {
  document.body.innerHTML = renderToStaticMarkup(element);
  const result = await axe.run(document.body, {
    rules: {
      // jsdom computes no styles, so contrast is unknowable here and axe returns
      // it as "incomplete" rather than passing. The palette's contrast is a
      // design question, checked in a browser, not something to fake in node.
      "color-contrast": { enabled: false },
    },
  });
  return result.violations;
}

/** Readable failure: axe's own message plus the offending markup. */
function describeViolations(violations: axe.Result[]): string {
  return violations
    .map((v) => `${v.id}: ${v.help}\n    ${v.nodes.map((n) => n.html).join("\n    ")}`)
    .join("\n");
}

describe("the editor dialogs pass axe", () => {
  it("the node editor, creating a claim", async () => {
    const v = await violationsOf(
      <NodeEditorModal
        node={null}
        onSave={noop}
        onDelete={noop}
        onClose={noop}
        newId={() => "M9"}
        existingRowsCount={() => 0}
        availableDomains={["democratic_backsliding", "inequality"]}
        defaultDomain="inequality"
        getDefaultPosition={() => ({ x: 0, y: 0 })}
      />
    );
    expect(describeViolations(v)).toBe("");
  });

  it("the edge editor, creating a relation", async () => {
    const v = await violationsOf(
      <EdgeEditorModal
        draft={{ source: "M1", target: "S1", kind: "causes", isNew: true }}
        onSave={noop}
        onDelete={noop}
        onClose={noop}
      />
    );
    expect(describeViolations(v)).toBe("");
  });

  it("the JSON-LD export dialog", async () => {
    // The export modal's own body rather than GraphFullbleed's, which would drag
    // in the graph store for no gain: what is being checked is the dialog shell
    // plus the focusable `<pre>`, and that is all of it.
    const v = await violationsOf(
      <ModalDialog
        labelledBy="jsonld-title"
        onClose={noop}
        backdropClassName="jsonld-modal open"
        className="box"
      >
        <div className="head">
          <div id="jsonld-title">JSON-LD export</div>
        </div>
        <pre tabIndex={0} role="region" aria-label="JSON-LD export">
          {"{}"}
        </pre>
        <button className="btn-mono">copy to clipboard</button>
      </ModalDialog>
    );
    expect(describeViolations(v)).toBe("");
  });
});
