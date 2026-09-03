import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { resolveImageUrl } from "@/services/uploads";

interface ProductImageProps {
  src?: string | null;
  alt?: string;
  className?: string;
  fallbackClassName?: string;
  fallbackIcon?: ReactNode;
  aspectRatio?: "square" | "video" | "auto";
  loading?: "lazy" | "eager";
}

export function ProductImage({
  src,
  alt = "Dish photo",
  className = "size-full object-cover",
  fallbackClassName = "size-full flex items-center justify-center bg-slate-100 text-slate-400 text-xl",
  fallbackIcon = "🍽️",
  aspectRatio = "auto",
  loading = "lazy",
}: ProductImageProps) {
  const resolvedUrl = resolveImageUrl(src);
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Reset state when src changes
  useEffect(() => {
    setHasError(false);
    setIsLoaded(false);
  }, [resolvedUrl]);

  if (!resolvedUrl || hasError) {
    return (
      <div
        className={`select-none ${fallbackClassName}`}
        role="img"
        aria-label={alt}
      >
        <span>{fallbackIcon}</span>
      </div>
    );
  }

  return (
    <div className="relative size-full overflow-hidden">
      {/* Subtle skeleton placeholder while image loads */}
      {!isLoaded && (
        <div
          className="absolute inset-0 animate-pulse bg-slate-100"
          aria-hidden="true"
        />
      )}

      <img
        src={resolvedUrl}
        alt={alt}
        loading={loading}
        decoding="async"
        onLoad={() => setIsLoaded(true)}
        onError={() => setHasError(true)}
        className={`${className} transition-opacity duration-200 ${
          isLoaded ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}
