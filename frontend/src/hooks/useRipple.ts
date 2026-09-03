import { useCallback } from "react";
import type { PointerEvent } from "react";

/**
 * Material-style ripple, spawned from wherever the finger actually landed.
 *
 * Done in the DOM rather than in React state on purpose: a ripple is pure
 * decoration with a fixed lifetime, and routing it through a re-render would
 * make every tap cost a render pass on a tablet that is already busy.
 *
 * The host element needs the `ripple-host` class for the overflow clip.
 */
export function useRipple() {
  return useCallback((event: PointerEvent<HTMLElement>) => {
    const host = event.currentTarget;

    // Respect the OS setting. The CSS hides the ink too, but not creating it
    // at all saves the work entirely.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const bounds = host.getBoundingClientRect();
    // Cover the furthest corner from the press point.
    const size = Math.max(bounds.width, bounds.height) * 1.2;

    const ink = document.createElement("span");
    ink.className = "ripple-ink";
    ink.style.width = `${size}px`;
    ink.style.height = `${size}px`;
    ink.style.left = `${event.clientX - bounds.left - size / 2}px`;
    ink.style.top = `${event.clientY - bounds.top - size / 2}px`;

    host.appendChild(ink);
    ink.addEventListener("animationend", () => ink.remove(), { once: true });
  }, []);
}
