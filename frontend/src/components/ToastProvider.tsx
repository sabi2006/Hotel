import { useCallback, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import { ToastContext } from "@/context/toast-context";
import type { Toast, ToastTone } from "@/context/toast-context";

const TONE_STYLES: Record<ToastTone, { ring: string; icon: string; bar: string; glyph: string }> = {
  success: {
    ring: "ring-emerald-200",
    icon: "bg-emerald-100 text-emerald-700",
    bar: "bg-emerald-500",
    glyph: "✓",
  },
  error: { ring: "ring-red-200", icon: "bg-red-100 text-red-700", bar: "bg-red-500", glyph: "!" },
  warning: {
    ring: "ring-amber-200",
    icon: "bg-amber-100 text-amber-700",
    bar: "bg-amber-500",
    glyph: "!",
  },
  info: { ring: "ring-sky-200", icon: "bg-sky-100 text-sky-700", bar: "bg-sky-500", glyph: "i" },
};

/** An error is read, not glanced at, so it gets longer on screen. */
const DEFAULT_DURATION: Record<ToastTone, number> = {
  success: 3200,
  info: 3600,
  warning: 5000,
  error: 6000,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback<(input: Omit<Toast, "id" | "duration"> & { duration?: number }) => void>(
    (input) => {
      const id = nextId.current++;
      const duration = input.duration ?? DEFAULT_DURATION[input.tone];

      // Cap the stack. A burst of events should not bury the screen.
      setToasts((current) => [...current.slice(-3), { ...input, id, duration }]);
      window.setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  const value = useMemo(
    () => ({
      push,
      dismiss,
      success: (title: string, description?: string) =>
        push({ tone: "success", title, description }),
      error: (title: string, description?: string) => push({ tone: "error", title, description }),
      info: (title: string, description?: string) => push({ tone: "info", title, description }),
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* Bottom-centre on a phone, where a thumb can reach the dismiss;
          top-right on a desktop, out of the way of the working area. */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-0 sm:items-end"
      >
        {toasts.map((toast) => {
          const style = TONE_STYLES[toast.tone];
          return (
            <div
              key={toast.id}
              role={toast.tone === "error" ? "alert" : "status"}
              className={`pointer-events-auto w-full max-w-sm animate-sheet-up overflow-hidden rounded-xl bg-white shadow-lg ring-1 ${style.ring} sm:animate-pop`}
            >
              <div className="flex items-start gap-3 p-3.5">
                <span
                  aria-hidden
                  className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${style.icon}`}
                >
                  {style.glyph}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">{toast.title}</p>
                  {toast.description && (
                    <p className="mt-0.5 text-sm text-slate-500">{toast.description}</p>
                  )}
                </div>

                <button
                  onClick={() => dismiss(toast.id)}
                  aria-label="Dismiss notification"
                  className="pressable -m-1 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  ✕
                </button>
              </div>

              {/* The bar drains for exactly as long as the toast will live. */}
              <div className="h-0.5 bg-slate-100">
                <div
                  className={`h-full origin-left ${style.bar}`}
                  style={{ animation: `toast-drain ${toast.duration}ms linear forwards` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
