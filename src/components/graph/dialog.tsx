"use client";

import { useEffect, useRef } from "react";
import { focusableWithin, nextFocus } from "./focus-trap";

/**
 * The one modal shell the editors and the JSON-LD export share.
 *
 * Before this they carried `role="dialog"` and nothing else, or (the export
 * modal) no role at all: no `aria-modal`, no accessible name, no initial
 * focus, no focus trap and no Escape. A keyboard user opening the node editor
 * kept focus on the canvas behind it, and the only way out was the mouse.
 *
 * Each caller keeps its own markup and classes; what is shared is the
 * semantics and the focus behaviour.
 */
type Props = {
  /** Id of the element naming this dialog, for `aria-labelledby`. */
  labelledBy: string;
  onClose: () => void;
  /** Class for the backdrop, whose bare click closes the dialog. */
  backdropClassName: string;
  /** Class for the dialog box itself. */
  className: string;
  children: React.ReactNode;
};

export function ModalDialog({
  labelledBy,
  onClose,
  backdropClassName,
  className,
  children,
}: Props) {
  const boxRef = useRef<HTMLDivElement>(null);

  // Callers pass an inline arrow, so `onClose` is a new function every render.
  // Depending on it directly would re-run the effect below on every keystroke,
  // and its initial-focus line would yank focus back to the first field while
  // the user was typing in the third. Hold it in a ref and set the trap up once.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const restoreTo = document.activeElement;

    // First field if there is one, else the box (which carries tabindex="-1"),
    // so focus is inside the dialog from the moment it opens.
    (focusableWithin(box)[0] ?? box).focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        // Stop here: the page-level handler also listens for Escape, and both
        // firing would close this dialog and the export modal behind it.
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const target = nextFocus(box!, document.activeElement, event.shiftKey);
      if (!target) return; // nothing focusable; leave Tab to the browser
      event.preventDefault();
      target.focus();
    }

    box.addEventListener("keydown", onKeyDown);
    return () => {
      box.removeEventListener("keydown", onKeyDown);
      // Back to whatever opened the dialog, so closing does not dump focus at
      // the top of the document.
      if (restoreTo instanceof HTMLElement) restoreTo.focus();
    };
  }, []);

  return (
    <div
      className={backdropClassName}
      // Presentational, and truthfully so: the backdrop carries no content and
      // no state. Click-outside-to-close is a pointer affordance on top of the
      // keyboard one, which is Escape, handled in the effect above — so this is
      // not a control missing its keyboard equivalent.
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={boxRef}
        className={className}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>
  );
}
