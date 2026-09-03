import type { ReactNode } from "react";

type Tone = "error" | "success" | "info" | "warning";

const TONE_CLASSES: Record<Tone, string> = {
  error: "bg-red-50/90 text-red-900 ring-red-200/90 border-l-4 border-l-red-500",
  success: "bg-emerald-50/90 text-emerald-900 ring-emerald-200/90 border-l-4 border-l-emerald-500",
  info: "bg-sky-50/90 text-sky-900 ring-sky-200/90 border-l-4 border-l-sky-500",
  warning: "bg-amber-50/90 text-amber-950 ring-amber-200/90 border-l-4 border-l-amber-500",
};

const TONE_ICONS: Record<Tone, string> = {
  error: "⚠️",
  success: "✅",
  info: "ℹ️",
  warning: "🔔",
};

export function Alert({ tone = "info", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div
      role="alert"
      className={`flex animate-rise items-start gap-3 rounded-xl px-4 py-3 text-xs sm:text-sm font-medium ring-1 shadow-2xs ${TONE_CLASSES[tone]}`}
    >
      <span aria-hidden className="mt-0.5 shrink-0 text-base">
        {TONE_ICONS[tone]}
      </span>
      <div className="min-w-0 flex-1 leading-relaxed">{children}</div>
    </div>
  );
}
