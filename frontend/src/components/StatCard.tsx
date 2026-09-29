import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  trend?: {
    value: string;
    isPositive?: boolean;
  };
  tone?: "default" | "brand" | "emerald" | "amber" | "sky" | "purple";
}

const TONE_BADGE_CLASSES: Record<NonNullable<StatCardProps["tone"]>, string> = {
  default: "bg-surface-soft text-ink-soft ring-line",
  brand: "bg-brand-50 text-brand-700 ring-brand-100",
  emerald: "bg-success-soft text-success ring-success-line",
  amber: "bg-warning-soft text-warning ring-warning-line",
  sky: "bg-info-soft text-info ring-info-line",
  purple: "bg-purple-soft text-purple ring-purple-line",
};

export function StatCard({ label, value, hint, icon, trend, tone = "default" }: StatCardProps) {
  return (
    <div className="card flex flex-col justify-between p-5 select-none">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted">{label}</p>
          <div className="mt-1.5 text-2xl font-bold tracking-tight text-ink tabular-nums">
            {value}
          </div>
        </div>

        {icon && (
          <div
            className={`flex size-9 shrink-0 items-center justify-center rounded-lg ring-1 ${TONE_BADGE_CLASSES[tone]}`}
          >
            {icon}
          </div>
        )}
      </div>

      {(hint || trend) && (
        <div className="mt-3 flex items-center gap-2 text-xs">
          {trend && (
            <span
              className={`inline-flex items-center font-bold px-1.5 py-0.5 rounded-md ${
                trend.isPositive ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
              }`}
            >
              {trend.isPositive ? "↑" : "↓"} {trend.value}
            </span>
          )}
          {hint && <span className="text-subtle truncate font-medium">{hint}</span>}
        </div>
      )}
    </div>
  );
}
