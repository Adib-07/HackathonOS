import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Rendered in the header next to the title. */
  headerAside?: ReactNode;
  /** Test id applied to the dialog element. */
  testId?: string;
}

/**
 * Accessible modal dialog.
 *
 * Handles the behaviours a native <dialog> would give us but that a plain
 * absolutely-positioned div does not:
 *   - moves focus into the dialog when it opens
 *   - traps Tab / Shift+Tab inside the dialog
 *   - closes on Escape
 *   - restores focus to the trigger when it closes
 *   - locks background scroll
 *   - labels the dialog for screen readers
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  headerAside,
  testId,
}: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const titleId = useRef(`dialog-title-${Math.random().toString(36).slice(2)}`);
  const descriptionId = useRef(
    `dialog-description-${Math.random().toString(36).slice(2)}`,
  );

  const focusableElements = useCallback(() => {
    const root = dialogRef.current;
    if (!root) return [] as HTMLElement[];
    return Array.from(
      root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ).filter((element) => element.offsetParent !== null || element === document.activeElement);
  }, []);

  // Move focus in on open, restore it on close.
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const focusFirst = window.setTimeout(() => {
      const elements = focusableElements();
      const target = elements[0] ?? dialogRef.current;
      target?.focus();
    }, 0);

    return () => {
      window.clearTimeout(focusFirst);
      previouslyFocused.current?.focus?.();
    };
  }, [open, focusableElements]);

  // Lock background scroll while the dialog is open.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // Escape closes, Tab is trapped.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const elements = focusableElements();
      if (elements.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const first = elements[0]!;
      const last = elements[elements.length - 1]!;
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === dialogRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, onClose, focusableElements]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId.current}
        aria-describedby={description ? descriptionId.current : undefined}
        tabIndex={-1}
        ref={dialogRef}
        data-testid={testId}
      >
        <div className="modal-head">
          <div className="modal-head-copy">
            {headerAside}
            <h2 id={titleId.current}>{title}</h2>
            {description && (
              <p id={descriptionId.current} className="modal-description">
                {description}
              </p>
            )}
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
            data-testid="button-close-create-form"
          >
            <X size={17} />
          </button>
        </div>
        {children}
        {footer && <div className="modal-actions">{footer}</div>}
      </div>
    </div>
  );
}
