// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { focusableWithin, nextFocus } from "./focus-trap";

/**
 * Runs against a real DOM rather than the in-memory stub `persist.test.ts`
 * uses. The thing under test is a CSS selector and `document.activeElement`,
 * so a hand-rolled fake would only assert that the fake matches the fake.
 *
 * The fixture is the node editor's actual field set, since that is the dialog
 * with the most ways to go wrong: a select, three text inputs, a textarea, a
 * number input and four buttons, one of them conditionally rendered.
 */

function mount(html: string): HTMLElement {
  document.body.innerHTML = `<div id="box" tabindex="-1">${html}</div>`;
  return document.getElementById("box") as HTMLElement;
}

const NODE_EDITOR = `
  <div class="head"><div id="t">new claim</div></div>
  <select id="kind"><option>symptom</option></select>
  <input id="title" type="text" />
  <textarea id="body"></textarea>
  <input id="conf" type="number" />
  <select id="domain"><option>inequality</option></select>
  <button id="cancel">cancel</button>
  <button id="save">file claim</button>
`;

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("focusableWithin", () => {
  it("finds every field and button, in document order", () => {
    const box = mount(NODE_EDITOR);
    expect(focusableWithin(box).map((el) => el.id)).toEqual([
      "kind",
      "title",
      "body",
      "conf",
      "domain",
      "cancel",
      "save",
    ]);
  });

  it("skips disabled controls", () => {
    const box = mount(`<button id="a"></button><button id="b" disabled></button>`);
    expect(focusableWithin(box).map((el) => el.id)).toEqual(["a"]);
  });

  it("skips elements hidden from the accessibility tree", () => {
    const box = mount(
      `<input id="a" /><input id="b" hidden /><input id="c" aria-hidden="true" />`
    );
    expect(focusableWithin(box).map((el) => el.id)).toEqual(["a"]);
  });

  it("skips tabindex -1, so the dialog container is not its own stop", () => {
    const box = mount(`<div id="inner" tabindex="-1"></div><button id="a"></button>`);
    expect(focusableWithin(box).map((el) => el.id)).toEqual(["a"]);
  });

  it("returns nothing for a dialog with no controls", () => {
    expect(focusableWithin(mount(`<p>read only</p>`))).toEqual([]);
  });
});

describe("nextFocus", () => {
  it("advances through the fields", () => {
    const box = mount(NODE_EDITOR);
    const title = document.getElementById("title")!;
    expect(nextFocus(box, title, false)?.id).toBe("body");
    expect(nextFocus(box, title, true)?.id).toBe("kind");
  });

  // The trap itself. Without the wrap, Tab off the last button leaves the
  // dialog for the canvas behind it and there is no way back with a keyboard.
  it("wraps forward from the last control to the first", () => {
    const box = mount(NODE_EDITOR);
    expect(nextFocus(box, document.getElementById("save"), false)?.id).toBe("kind");
  });

  it("wraps backward from the first control to the last", () => {
    const box = mount(NODE_EDITOR);
    expect(nextFocus(box, document.getElementById("kind"), true)?.id).toBe("save");
  });

  it("enters at the first control when focus is on the dialog container", () => {
    const box = mount(NODE_EDITOR);
    box.focus();
    expect(document.activeElement).toBe(box);
    expect(nextFocus(box, document.activeElement, false)?.id).toBe("kind");
    expect(nextFocus(box, document.activeElement, true)?.id).toBe("save");
  });

  it("enters at the first control when focus is outside the dialog entirely", () => {
    const box = mount(NODE_EDITOR);
    expect(nextFocus(box, null, false)?.id).toBe("kind");
  });

  it("returns null with nothing focusable, leaving Tab to the browser", () => {
    const box = mount(`<p>read only</p>`);
    expect(nextFocus(box, null, false)).toBeNull();
  });

  // A field appearing mid-session (the editor's "+ new domain…" text input)
  // has to join the cycle, which it does only because the order is read at
  // keypress time rather than cached when the dialog opened.
  it("picks up a conditionally rendered field", () => {
    const box = mount(NODE_EDITOR);
    expect(focusableWithin(box)).toHaveLength(7);
    const extra = document.createElement("input");
    extra.id = "newDomain";
    box.appendChild(extra);
    expect(nextFocus(box, document.getElementById("save"), false)?.id).toBe("newDomain");
    expect(nextFocus(box, extra, false)?.id).toBe("kind");
  });

  it("cycles the whole ring back to the start", () => {
    const box = mount(NODE_EDITOR);
    const order = focusableWithin(box);
    let current: HTMLElement | null = order[0];
    const visited: string[] = [];
    for (let i = 0; i < order.length; i++) {
      visited.push(current!.id);
      current = nextFocus(box, current, false);
    }
    expect(visited).toEqual(order.map((el) => el.id));
    expect(current?.id).toBe(order[0].id);
  });
});
