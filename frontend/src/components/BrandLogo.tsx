import type { ImgHTMLAttributes } from "react";

export interface BrandLogoProps extends ImgHTMLAttributes<HTMLImageElement> {
  variant?: "full" | "mark" | "badge" | "sidebar";
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
  showTagline?: boolean;
  stationTitle?: string;
}

export const BRAND_LOGO_SRC = "/assets/spice-garden-logo.png";
export const BRAND_NAME = "Spice Garden";
export const BRAND_TAGLINE = "Restaurant POS";

const SIZE_CLASSES = {
  xs: "h-6 w-auto",
  sm: "h-8 w-auto",
  md: "h-11 w-auto",
  lg: "h-16 w-auto",
  xl: "h-20 w-auto",
  "2xl": "h-28 w-auto",
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
  stationTitle,
  className = "",
  alt = "Spice Garden logo",
  // Accepted for backwards compatibility; the simplified logo has no tagline toggle.
  showTagline: _showTagline,
  ...rest
}: BrandLogoProps) {
  if (variant === "sidebar") {
    return (
      <div className={`flex items-center gap-3 select-none ${className}`}>
        <img
          src={BRAND_LOGO_SRC}
          alt={alt}
          width={36}
          height={36}
          className="size-9 shrink-0 rounded-lg object-cover bg-ink"
          decoding="async"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-ink">{BRAND_NAME}</p>
          <p className="truncate text-xs text-subtle">
            {stationTitle ? `${stationTitle} workspace` : BRAND_TAGLINE}
          </p>
        </div>
      </div>
    );
  }

  if (variant === "badge" || variant === "mark") {
    return (
      <img
        src={BRAND_LOGO_SRC}
        alt={alt}
        className={`shrink-0 rounded-lg object-cover bg-ink ${MARK_SIZES[size]} ${className}`}
        decoding="async"
      />
    );
  }

  return (
    <img
      src={BRAND_LOGO_SRC}
      alt={alt}
      className={`${SIZE_CLASSES[size]} object-contain select-none ${className}`}
      decoding="async"
      {...rest}
    />
  );
}
