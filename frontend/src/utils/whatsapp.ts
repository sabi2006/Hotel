import type { Order, Payment, RestaurantSettings } from "@/types";
import { PAYMENT_METHOD_LABELS } from "@/types";
import { formatCurrency } from "@/utils/format";
import { toPaise } from "@/utils/money";

/** Countries offered in the share dialog. India first, since that is the default. */
export const PHONE_COUNTRIES = [
  { code: "91", label: "India", flag: "🇮🇳", nationalDigits: 10 },
  { code: "971", label: "UAE", flag: "🇦🇪", nationalDigits: 9 },
  { code: "44", label: "UK", flag: "🇬🇧", nationalDigits: 10 },
  { code: "1", label: "US / Canada", flag: "🇺🇸", nationalDigits: 10 },
  { code: "65", label: "Singapore", flag: "🇸🇬", nationalDigits: 8 },
  { code: "60", label: "Malaysia", flag: "🇲🇾", nationalDigits: 9 },
] as const;

export const DEFAULT_COUNTRY = PHONE_COUNTRIES[0];

/**
 * Turn a locally-typed phone number into the digits wa.me expects.
 *
 * wa.me wants a full international number with no plus sign or separators.
 * Customers type numbers every which way, so normalise the common shapes:
 *   9876543210      -> 919876543210
 *   09876543210     -> 919876543210
 *   +91 98765 43210 -> 919876543210
 *
 * Returns null when there is nothing usable, so the caller can hide the button
 * rather than open a broken link.
 */
export function toWhatsAppNumber(
  rawPhone: string | null | undefined,
  countryCode = "91",
): string | null {
  if (!rawPhone) return null;

  const hadPlus = rawPhone.trim().startsWith("+");
  let digits = rawPhone.replace(/\D/g, "");
  if (!digits) return null;

  // An explicit +country prefix is already complete.
  if (hadPlus) return digits.length >= 10 ? digits : null;

  // A single leading zero is a domestic trunk prefix, not part of the number.
  if (digits.length > 10 && digits.startsWith("0")) {
    digits = digits.replace(/^0+/, "");
  }

  if (digits.startsWith(countryCode) && digits.length > 10) return digits;
  if (digits.length === 10) return `${countryCode}${digits}`;
  // Longer than a local number and not obviously prefixed: send it as typed.
  return digits.length > 10 ? digits : null;
}

export interface PhoneCheck {
  isValid: boolean;
  /** Digits only, international, ready for wa.me. */
  normalised: string | null;
  error: string | null;
}

/**
 * Validate a number the waiter typed, for the country they picked.
 *
 * Separate from normalising because the dialog needs to explain *why* a number
 * was rejected, rather than just refusing to open.
 */
export function checkPhone(rawPhone: string, countryCode: string): PhoneCheck {
  const country = PHONE_COUNTRIES.find((entry) => entry.code === countryCode) ?? DEFAULT_COUNTRY;
  const typed = rawPhone.trim();

  if (!typed) {
    return { isValid: false, normalised: null, error: "Enter the customer WhatsApp number." };
  }

  let digits = typed.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = digits.replace(/^0+/, "");
  if (digits.startsWith(country.code) && digits.length > country.nationalDigits) {
    digits = digits.slice(country.code.length);
  }

  if (digits.length !== country.nationalDigits) {
    return {
      isValid: false,
      normalised: null,
      error: `Please enter a valid ${country.nationalDigits}-digit ${country.label} mobile number.`,
    };
  }

  // An Indian mobile never starts below 6; catches landlines and typos.
  if (country.code === "91" && !/^[6-9]/.test(digits)) {
    return {
      isValid: false,
      normalised: null,
      error: "An Indian mobile number starts with 6, 7, 8 or 9.",
    };
  }

  return { isValid: true, normalised: `${country.code}${digits}`, error: null };
}

interface BillMessageContext {
  payments?: Payment[];
  totalTips?: number;
}

/**
 * The plain-text bill prefilled into WhatsApp.
 *
 * Built from the live order, so it always matches the printed invoice. Nothing
 * internal goes in it - no database ids, no tokens, no API paths - only what a
 * customer would expect to see on a receipt.
 */
export function buildBillMessage(
  order: Order,
  settings: RestaurantSettings | null,
  context: BillMessageContext = {},
): string {
  const { payments = [], totalTips = 0 } = context;
  const lines: string[] = [];
  const blank = () => lines.push("");

  lines.push("Hello! Thank you for dining with us. Here is your bill:");
  blank();

  // --- who ---
  lines.push(`*${(settings?.restaurantName ?? "SPICE GARDEN").toUpperCase()}*`);
  const address = [settings?.addressLine1, settings?.addressLine2, settings?.city]
    .filter(Boolean)
    .join(", ");
  if (address) lines.push(address);
  if (settings?.phone) lines.push(`Phone: ${settings.phone}`);
  if (settings?.gstNumber) lines.push(`GSTIN: ${settings.gstNumber}`);
  blank();

  // --- which bill ---
  const placed = new Date(order.createdAt);
  lines.push("*BILL DETAILS*");
  lines.push(`Invoice: ${order.invoiceNumber}`);
  lines.push(`Order: #${order.orderNumber}`);
  lines.push(`Table: ${order.tableNumber}`);
  lines.push(`Waiter: ${order.waiterName}`);
  if (order.customer.name) lines.push(`Customer: ${order.customer.name}`);
  lines.push(`Date: ${placed.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`);
  lines.push(`Time: ${placed.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`);
  blank();

  // --- what they ate ---
  lines.push("*ITEMS*");
  for (const item of order.items.filter((entry) => entry.kitchenStatus !== "CANCELLED")) {
    lines.push(`${item.name} x ${item.quantity}`);
    const gst = item.gstPercentage > 0 ? ` (GST ${item.gstPercentage}%)` : "";
    lines.push(
      `${formatCurrency(item.price)} x ${item.quantity} = ${formatCurrency(item.total)}${gst}`,
    );
  }
  blank();

  // --- what it cost ---
  lines.push(`Subtotal: ${formatCurrency(order.subtotal)}`);
  lines.push(`GST: ${formatCurrency(order.gstAmount)}`);
  if (order.discount > 0) lines.push(`Discount: -${formatCurrency(order.discount)}`);
  lines.push(`*Grand Total: ${formatCurrency(order.grandTotal)}*`);
  blank();

  // --- how it was paid ---
  // Every tender listed on its own line. A split bill must never collapse to
  // "Payment Method: Multiple" - the customer should see where their money went.
  const livePayments = payments.filter((payment) => !payment.isVoided);
  if (livePayments.length > 0) {
    lines.push("*PAYMENT DETAILS*");
    for (const payment of livePayments) {
      lines.push(`${PAYMENT_METHOD_LABELS[payment.method]}: ${formatCurrency(payment.amount)}`);
    }
    blank();
    lines.push(`Total Paid: ${formatCurrency(order.amountPaid)}`);
  }

  // Integers, so a settled bill never reads as a stray paisa outstanding.
  const balancePaise = toPaise(order.grandTotal) - toPaise(order.amountPaid);
  if (balancePaise > 0) {
    lines.push(`*Balance Due: ${formatCurrency(balancePaise / 100)}*`);
  } else if (livePayments.length > 0) {
    lines.push("Balance: ₹0.00");
  }

  if (totalTips > 0) {
    blank();
    lines.push(`Tip: ${formatCurrency(totalTips)}`);
  }

  blank();
  lines.push(
    settings?.invoiceFooterNote ??
      `Thank you for visiting ${settings?.restaurantName ?? "SPICE GARDEN"}!`,
  );

  return lines.join("\n");
}

/**
 * Build a click-to-chat link.
 *
 * Deliberately the official deep link rather than any unofficial automation:
 * it opens WhatsApp with the message prefilled, and a person presses send.
 * The app never sends anything itself.
 */
export function buildWhatsAppLink(
  phone: string | null | undefined,
  message: string,
  countryCode = "91",
): string | null {
  const number = toWhatsAppNumber(phone, countryCode);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

/** Same link, from an already-normalised international number. */
export function whatsAppLinkFor(normalisedPhone: string, message: string): string {
  return `https://wa.me/${normalisedPhone}?text=${encodeURIComponent(message)}`;
}
