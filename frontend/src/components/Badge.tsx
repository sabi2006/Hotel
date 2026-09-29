import type { ReactNode } from "react";

export type BadgeTone =
  | "neutral"
  | "free"
  | "occupied"
  | "ready"
  | "preparing"
  | "success"
  | "warning"
  | "danger"
  | "info";

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-surface-soft text-muted ring-line",
  free: "bg-success-soft text-success ring-success-line",
  occupied: "bg-warning-soft text-warning ring-warning-line",
  ready: "bg-success-soft text-success ring-success-line",
  preparing: "bg-warning-soft text-warning ring-warning-line",
  success: "bg-success-soft text-success ring-success-line",
  warning: "bg-warning-soft text-warning ring-warning-line",
  danger: "bg-danger-soft text-danger ring-danger-line",
  info: "bg-info-soft text-info ring-info-line",
};

export function Badge({
  tone = "neutral",
  dot = false,
  pulse = false,
  children,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  pulse?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${TONE_CLASSES[tone]}`}
    >
      {dot && (
        <span
          aria-hidden
          className={`size-1.5 rounded-full bg-current ${pulse ? "" : ""}`}
        />
      )}
      {children}
    </span>
  );
}
