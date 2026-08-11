/**
 * Focus order inside a modal dialog.
 *
 * Split out of `dialog.tsx` because this is the part that can be wrong in a way
 * nobody notices: a selector that misses the domain `<select>`, or a wrap that
 * skips the last button, is invisible to anyone using a mouse and traps a
 * keyboard user outside the dialog they just opened. Pure functions over a DOM
 * subtree, so the suite can exercise them directly.
 */

/**
 * Elements that take focus by default. Deliberately not `[contenteditable]` or
 * `<audio controls>`: neither exists in this app's dialogs, and listing them
 * would imply a coverage the tests do not have.
 */
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Every focusable descendant of `root`, in document order, minus the ones
 * hidden from the accessibility tree. `hidden` and `aria-hidden` are checked
 * because the node editor conditionally renders its "new domain" field, and
 * tabbing into a field that is not on screen is worse than not trapping at all.
 */
export function focusableWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute("hidden") && el.getAttribute("aria-hidden") !== "true"
  );
}

/**
 * Where Tab (or Shift+Tab) should move focus, given what holds it now. Returns
 * null when the dialog has nothing focusable, in which case the caller leaves
 * the event alone rather than swallowing it.
 *
 * Focus sitting outside the list — on the dialog container itself, which
 * carries `tabindex="-1"` for its initial focus — enters at the near end, so
 * the first Tab after opening lands on the first field.
 */
export function nextFocus(
  root: HTMLElement,
  active: Element | null,
  shift: boolean
): HTMLElement | null {
  const items = focusableWithin(root);
  if (items.length === 0) return null;
  const current = active instanceof HTMLElement ? items.indexOf(active) : -1;
  if (current === -1) return shift ? items[items.length - 1] : items[0];
  const next = shift ? current - 1 : current + 1;
  if (next < 0) return items[items.length - 1];
  if (next >= items.length) return items[0];
  return items[next];
}
