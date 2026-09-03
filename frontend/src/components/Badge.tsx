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
  neutral: "bg-[#FAF8F5] text-[#5F615D] ring-[#E8E3D8]",
  free: "bg-[#EBF5EE] text-[#276B49] ring-[#BCE2CD]",
  occupied: "bg-[#FEF7EE] text-[#9E6523] ring-[#FADFB8]",
  ready: "bg-[#EBF5EE] text-[#276B49] ring-[#8AC8A5]",
  preparing: "bg-[#FEF7EE] text-[#9E6523] ring-[#FADFB8]",
  success: "bg-[#EBF5EE] text-[#276B49] ring-[#BCE2CD]",
  warning: "bg-[#FEF7EE] text-[#A66C24] ring-[#FCE4C3]",
  danger: "bg-[#FDF2F1] text-[#C24138] ring-[#F7C6C3]",
  info: "bg-[#F0F5F9] text-[#365D7B] ring-[#CFE0ED]",
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
          className={`size-1.5 rounded-full bg-current ${pulse ? "animate-attention" : ""}`}
        />
      )}
      {children}
    </span>
  );
}
