import { useEffect } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

import { XIcon } from "@/components/Icons";

interface ModalProps {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}

const SIZE_CLASSES = {
  sm: "sm:max-w-md",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-4xl",
};

export function Modal({ isOpen, title, onClose, children, footer, size = "md" }: ModalProps) {
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4 overflow-hidden">
      {/* Backdrop */}
      <div
        aria-hidden="true"
        className="fixed inset-0 animate-fade-in bg-ink/50"
        onClick={onClose}
      />

      {/* Dialog Container */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={[
          "relative flex max-h-[92dvh] w-full flex-col rounded-t-xl bg-white shadow-lg ring-1 ring-line sm:rounded-xl",
          "animate-sheet-up z-10 overflow-hidden",
          SIZE_CLASSES[size],
        ].join(" ")}
      >
        {/* Grab handle for mobile */}
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-line-strong sm:hidden" />

        {/* Modal Header */}
        <header className="flex items-center justify-between border-b border-line px-4 sm:px-6 py-3.5">
          <h2 className="text-base sm:text-lg font-semibold text-ink truncate">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="flex size-8 items-center justify-center rounded-lg text-subtle hover:bg-surface-sunken hover:text-ink transition-colors focus-ring"
          >
            <XIcon size={18} />
          </button>
        </header>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5 custom-scrollbar">{children}</div>

        {/* Modal Footer */}
        {footer && (
          <footer className="flex flex-wrap items-center justify-end gap-2.5 sm:gap-3 border-t border-line bg-surface-soft px-4 sm:px-6 py-3.5 sm:py-4 pb-safe">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
