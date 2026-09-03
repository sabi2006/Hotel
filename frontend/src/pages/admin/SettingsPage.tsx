import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { CreditCardIcon, ReceiptIcon, SettingsIcon, ShieldCheckIcon, UtensilsIcon } from "@/components/Icons";
import { Input } from "@/components/Input";
import { Spinner } from "@/components/Spinner";
import { getErrorMessage } from "@/services/api";
import { settingsService } from "@/services/billing";
import { resolveImageUrl, uploadsService } from "@/services/uploads";
import type { RestaurantSettings } from "@/types";

export default function SettingsPage() {
  const [form, setForm] = useState<RestaurantSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingQr, setIsUploadingQr] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    settingsService
      .get()
      .then(setForm)
      .catch((caught) => setError(getErrorMessage(caught, "Could not load settings")))
      .finally(() => setIsLoading(false));
  }, []);

  function update<K extends keyof RestaurantSettings>(key: K, value: RestaurantSettings[K]) {
    setForm((previous) => (previous ? { ...previous, [key]: value } : previous));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form) return;

    setIsSaving(true);
    setError(null);
    try {
      const { updatedAt: _ignored, ...payload } = form;
      setForm(await settingsService.update(payload));
      setNotice("Settings saved successfully.");
    } catch (caught) {
      setError(getErrorMessage(caught, "Could not save settings"));
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) return <Spinner label="Loading settings" />;
  if (!form) return <Alert tone="error">{error ?? "Settings unavailable"}</Alert>;

  return (
    <form onSubmit={handleSubmit} className="max-w-4xl space-y-6 select-none">
      <header>
        <div className="flex items-center gap-2">
          <SettingsIcon size={24} className="text-brand-600" />
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 font-sans">
            Restaurant Configuration &amp; Legal Profile
          </h1>
        </div>
        <p className="mt-0.5 text-xs font-medium text-slate-500">
          Printed tax headers, GSTIN, WhatsApp message templates, and restaurant UPI QR codes.
        </p>
      </header>

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      {/* Identity Card */}
      <section className="card p-6 space-y-4 shadow-sm">
        <div className="border-b border-slate-100 pb-3">
          <h2 className="text-base font-bold text-slate-900 font-sans">Restaurant Business Identity</h2>
          <p className="text-xs text-slate-500">Details printed at the top of customer receipt invoices.</p>
        </div>
        
        <Input
          label="Legal Restaurant / Business Name"
          required
          value={form.restaurantName}
          onChange={(e) => update("restaurantName", e.target.value)}
          placeholder="e.g. Royal Grand Restaurant &amp; Dine"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Street Address Line 1"
            value={form.addressLine1 ?? ""}
            onChange={(e) => update("addressLine1", e.target.value)}
            placeholder="123 Anna Salai"
          />
          <Input
            label="Address Line 2"
            value={form.addressLine2 ?? ""}
            onChange={(e) => update("addressLine2", e.target.value)}
            placeholder="Near Bus Stand"
          />
          <Input
            label="City &amp; Postal Code"
            value={form.city ?? ""}
            onChange={(e) => update("city", e.target.value)}
            placeholder="Chennai - 600001"
          />
          <Input
            label="Contact Mobile / Landline Phone"
            type="tel"
            value={form.phone ?? ""}
            onChange={(e) => update("phone", e.target.value)}
            placeholder="+91 98765 43210"
          />
          <div className="sm:col-span-2">
            <Input
              label="Contact Email"
              type="email"
              value={form.email ?? ""}
              onChange={(e) => update("email", e.target.value)}
              placeholder="billing@restaurant.com"
            />
          </div>
        </div>
      </section>

      {/* Tax Registration */}
      <section className="card p-6 space-y-4 shadow-sm">
        <div className="border-b border-slate-100 pb-3">
          <h2 className="text-base font-bold text-slate-900 font-sans">Statutory &amp; Tax Registrations</h2>
          <p className="text-xs text-slate-500">GSTIN and FSSAI numbers printed on bills for compliance.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="GSTIN Identification Number"
            value={form.gstNumber ?? ""}
            onChange={(e) => update("gstNumber", e.target.value)}
            placeholder="33ABCDE1234F1Z5"
            hint="15-digit GST identification code"
          />
          <Input
            label="FSSAI License Number"
            value={form.fssaiNumber ?? ""}
            onChange={(e) => update("fssaiNumber", e.target.value)}
            placeholder="12345678901234"
            hint="Food safety compliance registration"
          />
        </div>
      </section>

      {/* Restaurant UPI Payment */}
      <section className="card p-6 space-y-4 shadow-sm bg-white border border-[#EBE7DF]">
        <div className="border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <CreditCardIcon size={20} className="text-brand-600" />
            <h2 className="text-base font-bold text-slate-900 font-sans">Restaurant Digital UPI Collection</h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Customers can scan this QR code on the Waiter / Settlement screen to pay their bill.
          </p>
        </div>

        <div className="space-y-4">
          <Input
            label="Primary Restaurant UPI ID (VPA)"
            value={form.upiId ?? ""}
            onChange={(e) => update("upiId", e.target.value)}
            placeholder="e.g. spicegarden@okaxis or 9876543210@paytm"
            hint="Entering your UPI ID automatically generates dynamic payment QR codes with exact bill amounts"
          />

          {/* Upload QR Image File */}
          <div className="rounded-xl border border-dashed border-[#D4BD9B] bg-[#FAF8F5] p-4 sm:p-5">
            <label className="block text-xs font-bold uppercase tracking-wider text-[#424541] mb-2">
              Upload Official Merchant UPI QR Graphic
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="file"
                id="upi-qr-upload"
                accept="image/*"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setIsUploadingQr(true);
                  setError(null);
                  try {
                    const result = await uploadsService.uploadImage(file);
                    update("upiQrImage", result.url);
                    setNotice("UPI QR graphic uploaded successfully.");
                  } catch (caught) {
                    setError(getErrorMessage(caught, "Could not upload QR image"));
                  } finally {
                    setIsUploadingQr(false);
                  }
                }}
                className="hidden"
              />
              <label
                htmlFor="upi-qr-upload"
                className="pressable inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-[#1F2220] ring-1 ring-[#E8E3D8] hover:bg-[#F3ECE0] hover:ring-[#D8CEBE] cursor-pointer shadow-2xs"
              >
                <span>📷 Choose QR Image from Device</span>
              </label>

              {isUploadingQr && (
                <span className="text-xs font-bold text-brand-700 animate-pulse">Uploading QR...</span>
              )}

              {form.upiQrImage && (
                <button
                  type="button"
                  onClick={() => update("upiQrImage", null)}
                  className="pressable rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100 transition"
                >
                  Remove Uploaded Graphic
                </button>
              )}
            </div>

            <p className="mt-2 text-xs text-[#8E908C]">
              Supports PNG, JPG, or WEBP merchant Standee/QR photos.
            </p>
          </div>

          {/* QR Previews */}
          <div className="grid gap-4 sm:grid-cols-2 pt-2">
            {/* Dynamic UPI QR Preview */}
            {form.upiId ? (
              <div className="rounded-2xl bg-white p-4 ring-1 ring-[#E8E3D8] text-center shadow-2xs">
                <p className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg ring-1 ring-emerald-200 inline-block mb-3">
                  ✨ Live Dynamic UPI QR (Auto-fills bill amount)
                </p>
                <div className="flex justify-center">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                      `upi://pay?pa=${form.upiId}&pn=${encodeURIComponent(
                        form.restaurantName || "Spice Garden",
                      )}&cu=INR`,
                    )}`}
                    alt="Dynamic UPI QR preview"
                    className="size-44 rounded-xl ring-1 ring-slate-200 shadow-sm p-1.5 bg-white object-contain"
                  />
                </div>
                <p className="mt-2 text-xs font-bold text-slate-800 font-mono">
                  {form.upiId}
                </p>
              </div>
            ) : null}

            {/* Uploaded Static Graphic Preview */}
            {form.upiQrImage ? (
              <div className="rounded-2xl bg-white p-4 ring-1 ring-[#E8E3D8] text-center shadow-2xs">
                <p className="text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg ring-1 ring-slate-200 inline-block mb-3">
                  🖼️ Custom Merchant QR Graphic
                </p>
                <div className="flex justify-center">
                  <img
                    src={resolveImageUrl(form.upiQrImage) ?? form.upiQrImage}
                    alt="Uploaded UPI QR"
                    className="max-h-44 rounded-xl ring-1 ring-slate-200 shadow-sm object-contain"
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* Receipt Customization */}
      <section className="card p-6 space-y-4 shadow-sm">
        <div className="border-b border-slate-100 pb-3">
          <h2 className="text-base font-bold text-slate-900 font-sans">Bill Receipt Customization</h2>
          <p className="text-xs text-slate-500">Custom greetings and footer notes.</p>
        </div>

        <Input
          label="Invoice Footer Note"
          value={form.invoiceFooterNote}
          onChange={(e) => update("invoiceFooterNote", e.target.value)}
          placeholder="Thank you for dining with us! Please visit again."
          hint="Appears on thermal printout and WhatsApp digital bills"
        />
      </section>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="submit" size="lg" isLoading={isSaving}>
          Save Configuration Changes
        </Button>
      </div>
    </form>
  );
}
