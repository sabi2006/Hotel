import { useState } from "react";
import type { FormEvent } from "react";

import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { UserCheckIcon } from "@/components/Icons";
import { Input } from "@/components/Input";
import { useAuth } from "@/hooks/useAuth";
import { getErrorMessage } from "@/services/api";
import { authService } from "@/services/auth";
import { tipsService } from "@/services/tips";
import { resolveImageUrl, uploadsService } from "@/services/uploads";
import { formatDateTime, humanizeEnum, initialsOf } from "@/utils/format";

export default function ProfilePage() {
  const { user } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [tipUpiId, setTipUpiId] = useState(user?.tipUpiId ?? "");
  const [tipQrImage, setTipQrImage] = useState(user?.tipQrImage ?? "");
  const [isSavingTipQr, setIsSavingTipQr] = useState(false);
  const [isUploadingTipQr, setIsUploadingTipQr] = useState(false);
  const [tipNotice, setTipNotice] = useState<string | null>(null);

  async function handleSaveTipQr(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setTipNotice(null);
    setIsSavingTipQr(true);
    try {
      await tipsService.updateMyTipQr({ tipUpiId, tipQrImage });
      setTipNotice("Tip details saved. Customers can now scan your QR at the table.");
    } catch (caught) {
      setError(getErrorMessage(caught, "Could not save your tip details"));
    } finally {
      setIsSavingTipQr(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }

    setIsSaving(true);
    try {
      await authService.changePassword(currentPassword, newPassword);
      setNotice("Password updated successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (caught) {
      setError(getErrorMessage(caught, "Could not update your password"));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6 select-none">
      <header>
        <div className="flex items-center gap-2">
          <UserCheckIcon size={24} className="text-brand-600" />
          <h1 className="text-2xl font-extrabold tracking-tight text-ink font-sans">
            User Account &amp; Staff Profile
          </h1>
        </div>
        <p className="mt-0.5 text-xs font-medium text-muted">
          Personal credentials, security settings, and digital tip configuration.
        </p>
      </header>

      {/* User Information Card */}
      <section className="card p-6 shadow-sm bg-white space-y-5">
        <div className="flex items-center gap-4 border-b border-surface-sunken pb-4">
          <span className="flex size-14 items-center justify-center rounded-xl bg-brand-600 text-white font-extrabold text-lg shadow-sm">
            {user ? initialsOf(user.name) : "U"}
          </span>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-extrabold text-ink font-sans">{user?.name}</h2>
              <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-bold text-brand-700 ring-1 ring-brand-200">
                {user ? humanizeEnum(user.role) : ""}
              </span>
            </div>
            <p className="text-xs text-muted font-medium mt-0.5">{user?.email}</p>
          </div>
        </div>

        <dl className="grid gap-4 sm:grid-cols-2 text-xs sm:text-sm">
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wider text-subtle">Staff Role</dt>
            <dd className="mt-1 font-bold text-ink">{user ? humanizeEnum(user.role) : "—"}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wider text-subtle">Mobile Phone</dt>
            <dd className="mt-1 font-bold text-ink">{user?.phone ?? "Not configured"}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wider text-subtle">Email Address</dt>
            <dd className="mt-1 font-bold text-ink">{user?.email}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wider text-subtle">Account Created</dt>
            <dd className="mt-1 font-bold text-ink">{user ? formatDateTime(user.createdAt) : "—"}</dd>
          </div>
        </dl>
      </section>

      {/* Waiter Tip QR Configuration */}
      {user?.role === "WAITER" && (
        <form
          onSubmit={handleSaveTipQr}
          className="card p-6 space-y-4 shadow-sm bg-white"
        >
          <div className="border-b border-surface-sunken pb-3">
            <h2 className="text-base font-bold text-ink font-sans">Personal UPI Tip QR Code</h2>
            <p className="text-xs text-muted">
              When guests tip at table checkout, your personal QR code will be presented.
            </p>
          </div>

          {tipNotice && <Alert tone="success">{tipNotice}</Alert>}

          <Input
            label="Personal UPI ID (VPA)"
            value={tipUpiId}
            onChange={(e) => setTipUpiId(e.target.value)}
            placeholder="e.g. waitername@okaxis"
            hint="Auto-generates personal Tip QR codes for guests at the table"
          />

          {/* Upload File */}
          <div className="rounded-xl border border-dashed border-brand-300 bg-surface-soft p-4">
            <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft mb-2">
              Upload Personal UPI QR Graphic
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="file"
                id="tip-qr-upload"
                accept="image/*"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setIsUploadingTipQr(true);
                  setError(null);
                  try {
                    const result = await uploadsService.uploadImage(file);
                    setTipQrImage(result.url);
                    setTipNotice("Tip QR image uploaded.");
                  } catch (caught) {
                    setError(getErrorMessage(caught, "Could not upload QR image"));
                  } finally {
                    setIsUploadingTipQr(false);
                  }
                }}
                className="hidden"
              />
              <label
                htmlFor="tip-qr-upload"
                className="pressable inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-bold text-ink ring-1 ring-line hover:bg-brand-100 hover:ring-line-strong cursor-pointer shadow-2xs"
              >
                <span>Upload QR Graphic from Device</span>
              </label>

              {isUploadingTipQr && (
                <span className="text-xs font-bold text-brand-700">Uploading...</span>
              )}

              {tipQrImage && (
                <button
                  type="button"
                  onClick={() => setTipQrImage("")}
                  className="pressable rounded-xl bg-danger-soft px-3 py-1.5 text-xs font-bold text-danger hover:bg-danger-line transition"
                >
                  Remove Graphic
                </button>
              )}
            </div>
          </div>

          {/* Previews */}
          <div className="grid gap-4 sm:grid-cols-2 pt-2">
            {tipUpiId && (
              <div className="rounded-xl bg-white p-3.5 ring-1 ring-line text-center shadow-2xs">
                <p className="text-[11px] font-bold text-success-strong bg-success-soft px-2.5 py-0.5 rounded-md inline-block mb-2">
                  Live Personal Tip QR
                </p>
                <div className="flex justify-center">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
                      `upi://pay?pa=${tipUpiId}&pn=${encodeURIComponent(
                        user?.name || "Staff Tip",
                      )}&cu=INR&tn=${encodeURIComponent(`Tip for ${user?.name || "Waiter"}`)}`,
                    )}`}
                    alt="Live Tip QR preview"
                    className="size-36 rounded-xl ring-1 ring-line shadow-sm p-1 bg-white object-contain"
                  />
                </div>
                <p className="mt-1.5 text-xs font-bold text-ink font-mono">{tipUpiId}</p>
              </div>
            )}

            {tipQrImage && (
              <div className="rounded-xl bg-white p-3.5 ring-1 ring-line text-center shadow-2xs">
                <p className="text-[11px] font-bold text-ink-soft bg-surface-sunken px-2.5 py-0.5 rounded-md inline-block mb-2">
                  Uploaded QR Graphic
                </p>
                <div className="flex justify-center">
                  <img
                    src={resolveImageUrl(tipQrImage) ?? tipQrImage}
                    alt="Tip QR preview"
                    className="max-h-36 rounded-xl ring-1 ring-line shadow-sm object-contain"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end pt-2">
            <Button type="submit" isLoading={isSavingTipQr}>
              Save Tip Credentials
            </Button>
          </div>
        </form>
      )}

      {/* Change Password */}
      <form
        onSubmit={handleSubmit}
        className="card p-6 space-y-4 shadow-sm bg-white"
      >
        <div className="border-b border-surface-sunken pb-3">
          <h2 className="text-base font-bold text-ink font-sans">Change Account Password</h2>
          <p className="text-xs text-muted">Update your security passkey for logging into POS portals.</p>
        </div>

        {error && <Alert tone="error">{error}</Alert>}
        {notice && <Alert tone="success">{notice}</Alert>}

        <Input
          label="Current Password"
          type="password"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
        <Input
          label="New Password"
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          hint="Minimum 6 characters"
        />
        <Input
          label="Confirm New Password"
          type="password"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />

        <div className="flex justify-end pt-2">
          <Button type="submit" isLoading={isSaving}>
            Update Password
          </Button>
        </div>
      </form>
    </div>
  );
}
