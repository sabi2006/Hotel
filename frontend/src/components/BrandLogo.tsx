import type { ImgHTMLAttributes } from "react";

export interface BrandLogoProps extends ImgHTMLAttributes<HTMLImageElement> {
  variant?: "full" | "mark" | "badge" | "sidebar";
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
  showTagline?: boolean;
  stationTitle?: string;
}

export const BRAND_LOGO_SRC = "/assets/spice-garden-logo.png";
export const BRAND_NAME = "SPICE GARDEN";
export const BRAND_TAGLINE = "HOSPITALITY & POS";

const SIZE_CLASSES = {
  xs: "h-6 w-auto",
  sm: "h-8 w-auto",
  md: "h-11 w-auto",
  lg: "h-16 w-auto",
  xl: "h-24 w-auto",
  "2xl": "h-32 w-auto",
};

const MARK_SIZES = {
  xs: "size-6",
  sm: "size-8",
  md: "size-10",
  lg: "size-14",
  xl: "size-20",
  "2xl": "size-28",
};

export function BrandLogo({
  variant = "full",
  size = "md",
  showTagline = true,
  stationTitle,
  className = "",
  alt = "Spice Garden Restaurant Logo",
  ...rest
}: BrandLogoProps) {
  if (variant === "sidebar") {
    return (
      <div className={`flex items-center gap-3 select-none ${className}`}>
        <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-[#1E2120] to-[#111312] p-0.5 shadow-md shadow-black/50 ring-1 ring-[#D4BD9B]/40">
          <img
            src={BRAND_LOGO_SRC}
            alt={alt}
            className="size-full object-cover rounded-lg"
            loading="eager"
            decoding="async"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black tracking-tight text-[#FAF8F5] font-sans">
            {BRAND_NAME}
          </p>
          <p className="truncate text-[10px] font-bold text-brand-400 uppercase tracking-widest">
            {stationTitle ? `${stationTitle} Station` : BRAND_TAGLINE}
          </p>
        </div>
      </div>
    );
  }

  if (variant === "badge" || variant === "mark") {
    return (
      <div
        className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-[#1E2120] to-[#111312] p-0.5 shadow-sm ring-1 ring-[#D4BD9B]/40 ${MARK_SIZES[size]} ${className}`}
      >
        <img
          src={BRAND_LOGO_SRC}
          alt={alt}
          className="size-full object-cover rounded-lg"
          loading="eager"
          decoding="async"
        />
      </div>
    );
  }

  // Full image logo variant
  return (
    <div className={`inline-flex flex-col items-center select-none ${className}`}>
      <img
        src={BRAND_LOGO_SRC}
        alt={alt}
        className={`${SIZE_CLASSES[size]} object-contain drop-shadow-md`}
        loading="eager"
        decoding="async"
        {...rest}
      />
    </div>
  );
}
