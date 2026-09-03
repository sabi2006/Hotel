import type { ButtonHTMLAttributes, PointerEvent, ReactNode } from "react";

import { useRipple } from "@/hooks/useRipple";

type Variant = "primary" | "secondary" | "danger" | "ghost" | "success";
type Size = "xs" | "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
  fullWidth?: boolean;
  children: ReactNode;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-gradient-to-r from-brand-600 to-brand-700 text-white shadow-sm shadow-brand-950/20 hover:from-brand-500 hover:to-brand-600 hover:shadow-md focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 font-bold",
  secondary:
    "bg-white text-[#202322] ring-1 ring-[#E8E3D8] hover:bg-[#FAF8F3] hover:text-[#111312] hover:ring-[#D8CEBE] shadow-2xs focus-visible:ring-2 focus-visible:ring-[#B58D54] focus-visible:ring-offset-2 font-semibold",
  danger:
    "bg-gradient-to-r from-[#C24138] to-[#A8352D] text-white shadow-sm shadow-red-950/20 hover:from-[#D14940] hover:to-[#B53B33] hover:shadow-md focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 font-bold",
  success:
    "bg-gradient-to-r from-emerald-600 to-emerald-700 text-white shadow-sm shadow-emerald-950/20 hover:from-emerald-500 hover:to-emerald-600 hover:shadow-md focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 font-bold",
  ghost:
    "bg-transparent text-[#5F615D] hover:bg-[#EFEAE1] hover:text-[#1F2220] focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2 font-semibold",
};

const SIZE_CLASSES: Record<Size, string> = {
  xs: "px-2.5 py-1 text-xs rounded-lg",
  sm: "px-3 py-1.5 text-xs font-semibold rounded-xl",
  md: "px-4 py-2.5 text-sm font-semibold rounded-xl",
  lg: "px-6 py-3.5 text-base font-bold rounded-2xl",
};

export function Button({
  variant = "primary",
  size = "md",
  isLoading = false,
  fullWidth = false,
  className = "",
  disabled,
  onPointerDown,
  children,
  ...props
}: ButtonProps) {
  const spawnRipple = useRipple();
  const isInert = disabled || isLoading;

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (!isInert) spawnRipple(event);
    onPointerDown?.(event);
  }

  return (
    <button
      {...props}
      disabled={isInert}
      onPointerDown={handlePointerDown}
      className={[
        "ripple-host pressable inline-flex items-center justify-center gap-2 select-none cursor-pointer transition-all duration-150",
        "focus-ring",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 disabled:hover:shadow-none",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        fullWidth ? "w-full" : "",
        className,
      ].join(" ")}
    >
      {isLoading && (
        <span
          aria-hidden
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent shrink-0"
        />
      )}
      {children}
    </button>
  );
}
