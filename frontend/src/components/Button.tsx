import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost" | "success";
type Size = "xs" | "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
  fullWidth?: boolean;
  children: ReactNode;
}

// Flat fills, one radius, one focus ring. Colour carries meaning; nothing else moves.
const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700",
  secondary: "bg-white text-ink ring-1 ring-inset ring-line hover:bg-surface-soft hover:ring-line-strong",
  danger: "bg-danger text-white hover:bg-danger-strong",
  success: "bg-success text-white hover:bg-success-strong",
  ghost: "bg-transparent text-muted hover:bg-surface-sunken hover:text-ink",
};

const SIZE_CLASSES: Record<Size, string> = {
  xs: "min-h-7 px-2.5 py-1 text-xs",
  sm: "min-h-8 px-3 py-1.5 text-xs",
  md: "min-h-10 px-4 py-2 text-sm",
  lg: "min-h-12 px-5 py-2.5 text-base",
};

export function Button({
  variant = "primary",
  size = "md",
  isLoading = false,
  fullWidth = false,
  className = "",
  disabled,
  children,
  ...props
}: ButtonProps) {
  const isInert = disabled || isLoading;

  return (
    <button
      {...props}
      disabled={isInert}
      className={[
        "inline-flex items-center justify-center gap-2 rounded-lg font-semibold select-none cursor-pointer",
        "transition-colors duration-150 focus-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
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
