import { useEffect, useRef } from "react";

import { realtime } from "@/services/realtime";
import type { RealtimeMessage } from "@/services/realtime";

/**
 * Run a handler for every live event.
 *
 * The handler is kept in a ref, updated in an effect, so callers can pass an
 * inline arrow function without resubscribing the socket on every render.
 */
export function useRealtime(onMessage: (message: RealtimeMessage) => void): void {
  const handlerRef = useRef(onMessage);

  useEffect(() => {
    handlerRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => realtime.subscribe((message) => handlerRef.current(message)), []);
}
