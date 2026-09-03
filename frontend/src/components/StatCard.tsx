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
  default: "bg-[#FAF8F5] text-[#424541] ring-[#E8E3D8]",
  brand: "bg-[#FAF6EE] text-brand-800 ring-[#E8DCB8]",
  emerald: "bg-[#F0F7F3] text-[#276B49] ring-[#CFE7D9]",
  amber: "bg-[#FEF7EE] text-[#9E6523] ring-[#FADFB8]",
  sky: "bg-[#F0F5F9] text-[#365D7B] ring-[#CFE0ED]",
  purple: "bg-[#F5F2F9] text-[#6B4F8C] ring-[#DDD3EB]",
};

const TONE_ACCENT_CLASSES: Record<NonNullable<StatCardProps["tone"]>, string> = {
  default: "from-[#8E908C] to-[#424541]",
  brand: "from-brand-500 to-brand-700",
  emerald: "from-[#3F8F68] to-[#276B49]",
  amber: "from-[#C58A3A] to-[#9E6523]",
  sky: "from-[#6688A8] to-[#365D7B]",
  purple: "from-[#8E71B0] to-[#6B4F8C]",
};

export function StatCard({ label, value, hint, icon, trend, tone = "default" }: StatCardProps) {
  return (
    <div className="card-interactive group relative flex flex-col justify-between overflow-hidden p-5 select-none bg-white border border-[#EBE7DF]">
      {/* Top Tone Accent line */}
      <div
        aria-hidden
        className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${TONE_ACCENT_CLASSES[tone]} opacity-80 group-hover:opacity-100 transition-opacity`}
      />

      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#8E908C]">{label}</p>
          <div className="mt-2 text-2xl font-extrabold tracking-tight text-[#1F2220] tabular-nums font-sans">
            {value}
          </div>
        </div>

        {icon && (
          <div
            className={`flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 shadow-2xs ${TONE_BADGE_CLASSES[tone]}`}
          >
            {icon}
          </div>
        )}
      </div>

      {(hint || trend) && (
        <div className="mt-3.5 flex items-center gap-2 pt-2 border-t border-[#F0EBE1] text-xs">
          {trend && (
            <span
              className={`inline-flex items-center font-bold px-1.5 py-0.5 rounded-md ${
                trend.isPositive ? "bg-[#EBF5EE] text-[#276B49]" : "bg-[#FDF2F1] text-[#C24138]"
              }`}
            >
              {trend.isPositive ? "↑" : "↓"} {trend.value}
            </span>
          )}
          {hint && <span className="text-[#8E908C] truncate font-medium">{hint}</span>}
        </div>
      )}
    </div>
  );
}
