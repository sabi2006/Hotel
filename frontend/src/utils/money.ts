/**
 * Currency maths in paise.
 *
 * Splitting a bill is the one place in this app where floating point actually
 * bites: 0.1 + 0.2 !== 0.3, so three rows that look like they add up to the
 * total can leave a stray fraction of a paisa behind and refuse to settle.
 * Every split calculation goes through integers instead, and only converts
 * back to rupees at the edges.
 */

export const toPaise = (rupees: number): number => Math.round(rupees * 100);

export const toRupees = (paise: number): number => paise / 100;

/** Parses a user-typed amount. Anything unusable becomes 0, never NaN. */
export function parseAmountToPaise(input: string): number {
  const value = Number(String(input).replace(/[^0-9.]/g, ""));
  return Number.isFinite(value) && value > 0 ? toPaise(value) : 0;
}

export const sumPaise = (values: number[]): number =>
  values.reduce((total, value) => total + value, 0);
