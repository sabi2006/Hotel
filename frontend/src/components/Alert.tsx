import type { ReactNode } from "react";

import { AlertCircleIcon, BellIcon, CheckCircleIcon, InfoIcon } from "@/components/Icons";

type Tone = "error" | "success" | "info" | "warning";

const TONE_CLASSES: Record<Tone, string> = {
  error: "bg-danger-soft text-danger-strong ring-danger-line",
  success: "bg-success-soft text-success-strong ring-success-line",
  info: "bg-info-soft text-info-strong ring-info-line",
  warning: "bg-warning-soft text-warning-strong ring-warning-line",
};

const TONE_ICONS: Record<Tone, ReactNode> = {
  error: <AlertCircleIcon size={18} />,
  success: <CheckCircleIcon size={18} />,
  info: <InfoIcon size={18} />,
  warning: <BellIcon size={18} />,
};

export function Alert({
  tone = "info",
  children,
  action,
}: {
  tone?: Tone;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      role="alert"
      className={`flex items-start justify-between gap-3 rounded-lg px-4 py-3 text-sm font-medium ring-1 ring-inset ${TONE_CLASSES[tone]}`}
    >
      <div className="flex items-start gap-2.5 min-w-0 flex-1">
        <span aria-hidden className="mt-px shrink-0">
          {TONE_ICONS[tone]}
        </span>
        <div className="min-w-0 flex-1 leading-relaxed">{children}</div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
