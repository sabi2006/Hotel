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
        className="fixed inset-0 animate-fade-in bg-slate-950/65 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Dialog Container */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={[
          "relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-white shadow-2xl ring-1 ring-slate-900/10 sm:rounded-2xl",
          "animate-sheet-up sm:animate-pop z-10 overflow-hidden",
          SIZE_CLASSES[size],
        ].join(" ")}
      >
        {/* Grab handle for mobile */}
        <div className="mx-auto mt-2.5 h-1.5 w-12 rounded-full bg-slate-200 sm:hidden" />

        {/* Modal Header */}
        <header className="flex items-center justify-between border-b border-[#F0EBE1] bg-[#FAF8F5] px-4 sm:px-6 py-3.5 sm:py-4">
          <h2 className="text-base sm:text-lg font-extrabold text-[#1F2220] font-sans truncate">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="pressable flex size-8 items-center justify-center rounded-xl text-[#8E908C] hover:bg-[#F3ECE0] hover:text-[#1F2220] transition"
          >
            <XIcon size={18} />
          </button>
        </header>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5 custom-scrollbar">{children}</div>

        {/* Modal Footer */}
        {footer && (
          <footer className="flex flex-wrap items-center justify-end gap-2.5 sm:gap-3 border-t border-[#F0EBE1] bg-[#FAF8F5] px-4 sm:px-6 py-3.5 sm:py-4 pb-safe">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
