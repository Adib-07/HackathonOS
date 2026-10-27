import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
  /** Whether to show a confirmation before closing when form is dirty. */
  confirmOnDirtyClose?: boolean;
  /** Whether the form has unsaved changes. */
  isDirty?: boolean;
}

/**
 * Accessible modal dialog.
 *
 * Handles the behaviours a native <dialog> would give us but that a plain
 * absolutely-positioned div does not:
 *   - moves focus into the dialog when it opens
 *   - traps Tab / Shift+Tab inside the dialog
 *   - closes on Escape (with optional dirty confirmation)
 *   - restores focus to the trigger when it closes
 *   - locks background scroll
 *   - labels the dialog for screen readers
 *   - supports sticky header/footer with scrollable body
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
  confirmOnDirtyClose = false,
  isDirty = false,
}: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const titleId = useRef(`dialog-title-${Math.random().toString(36).slice(2)}`);
  const descriptionId = useRef(
    `dialog-description-${Math.random().toString(36).slice(2)}`,
  );
  const [showDirtyConfirm, setShowDirtyConfirm] = useState(false);
  const dirtyCloseResolve = useRef<((confirmed: boolean) => void) | null>(null);

  const focusableElements = useCallback(() => {
    const root = dialogRef.current;
    if (!root) return [] as HTMLElement[];
    return Array.from(
      root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ).filter((element) => element.offsetParent !== null || element === document.activeElement);
  }, []);

  // Handle dirty confirmation
  const handleCloseRequest = useCallback(() => {
    if (confirmOnDirtyClose && isDirty) {
      setShowDirtyConfirm(true);
      return new Promise<boolean>((resolve) => {
        dirtyCloseResolve.current = resolve;
      }).then((confirmed) => {
        if (confirmed) onClose();
      });
    }
    onClose();
    return Promise.resolve();
  }, [confirmOnDirtyClose, isDirty, onClose]);

  const handleDirtyConfirm = useCallback((confirmed: boolean) => {
    setShowDirtyConfirm(false);
    dirtyCloseResolve.current?.(confirmed);
    dirtyCloseResolve.current = null;
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
      if (!showDirtyConfirm) {
        previouslyFocused.current?.focus?.();
      }
    };
  }, [open, focusableElements, showDirtyConfirm]);

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
        if (showDirtyConfirm) {
          event.preventDefault();
          handleDirtyConfirm(false);
          return;
        }
        event.preventDefault();
        handleCloseRequest();
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
  }, [open, focusableElements, showDirtyConfirm, handleCloseRequest, handleDirtyConfirm]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !showDirtyConfirm) {
          handleCloseRequest();
        }
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
            onClick={handleCloseRequest}
            aria-label="Close dialog"
            data-testid="button-close-create-form"
          >
            <X size={17} />
          </button>
        </div>
        <div className="modal-body" ref={bodyRef}>
          {children}
        </div>
        {footer && <div className="modal-footer">{footer}</div>}

        {showDirtyConfirm && (
          <div className="modal-dirty-confirm" role="alertdialog" aria-modal="true" aria-labelledby="dirty-confirm-title">
            <div className="dirty-confirm-content">
              <h3 id="dirty-confirm-title">Unsaved changes</h3>
              <p>You have unsaved changes. Are you sure you want to close without saving?</p>
              <div className="dirty-confirm-actions">
                <button
                  className="button button-secondary"
                  onClick={() => handleDirtyConfirm(false)}
                  data-testid="button-dirty-cancel"
                >
                  Keep editing
                </button>
                <button
                  className="button button-primary"
                  onClick={() => handleDirtyConfirm(true)}
                  data-testid="button-dirty-confirm"
                >
                  Discard changes
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
