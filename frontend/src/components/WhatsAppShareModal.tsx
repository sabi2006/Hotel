import { useState } from "react";

import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { checkPhone, DEFAULT_COUNTRY, PHONE_COUNTRIES } from "@/utils/whatsapp";

interface Props {
  isOpen: boolean;
  /** Prefills from the order when a number was already taken. */
  initialPhone?: string | null;
  defaultCountryCode?: string;
  /** The exact text that will be prefilled, so it can be previewed. */
  message: string;
  onClose: () => void;
  onConfirm: (normalisedPhone: string) => void;
}

export function WhatsAppShareModal(props: Props) {
  if (!props.isOpen) return null;
  return <WhatsAppShareForm {...props} />;
}

function WhatsAppShareForm({
  isOpen,
  initialPhone,
  defaultCountryCode,
  message,
  onClose,
  onConfirm,
}: Props) {
  const [countryCode, setCountryCode] = useState(defaultCountryCode ?? DEFAULT_COUNTRY.code);
  const [phone, setPhone] = useState(initialPhone ?? "");
  // Nothing is marked wrong until the waiter has actually tried to continue.
  const [hasTried, setHasTried] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const check = checkPhone(phone, countryCode);
  const showError = hasTried && !check.isValid;

  function handleContinue() {
    setHasTried(true);
    if (check.isValid && check.normalised) onConfirm(check.normalised);
  }

  return (
    <Modal
      isOpen={isOpen}
      title="Share bill on WhatsApp"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleContinue} disabled={hasTried && !check.isValid}>
            Continue to WhatsApp
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          Enter the customer WhatsApp number. The bill opens in WhatsApp ready to send.
        </p>

        <div>
          <label
            htmlFor="wa-phone"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            WhatsApp number
          </label>

          <div className="flex gap-2">
            <select
              aria-label="Country code"
              value={countryCode}
              onChange={(event) => setCountryCode(event.target.value)}
              className="w-32 shrink-0 cursor-pointer rounded-lg border-0 bg-white px-2 py-2.5 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-brand-600"
            >
              {PHONE_COUNTRIES.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.flag} +{country.code}
                </option>
              ))}
            </select>

            <input
              id="wa-phone"
              type="tel"
              inputMode="numeric"
              autoFocus
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleContinue();
              }}
              placeholder="9876543210"
              aria-invalid={showError}
              className={[
                "block w-full rounded-lg border-0 bg-white px-3 py-2.5 text-lg tabular-nums text-slate-900",
                "shadow-sm ring-1 ring-inset focus:ring-2 focus:ring-inset",
                showError
                  ? "ring-red-400 focus:ring-red-500"
                  : "ring-slate-300 focus:ring-brand-600",
              ].join(" ")}
            />
          </div>

          {showError ? (
            <p className="mt-1.5 animate-rise text-sm text-red-600">{check.error}</p>
          ) : (
            <p className="mt-1.5 text-sm text-slate-500">
              {check.isValid ? `Will open +${check.normalised}` : "Digits only, no spaces needed."}
            </p>
          )}
        </div>

        {/* The waiter is about to send this to a customer, so let them look. */}
        <div>
          <button
            onClick={() => setIsPreviewOpen((open) => !open)}
            className="pressable text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            {isPreviewOpen ? "Hide" : "Preview"} the message
          </button>
          {isPreviewOpen && (
            <pre className="mt-2 max-h-56 animate-rise overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-700 ring-1 ring-inset ring-slate-200">
              {message}
            </pre>
          )}
        </div>

        <Alert tone="info">
          WhatsApp opens with the bill already filled in. Press <strong>Send</strong> there to
          deliver it — this app never sends the message itself.
        </Alert>
      </div>
    </Modal>
  );
}
