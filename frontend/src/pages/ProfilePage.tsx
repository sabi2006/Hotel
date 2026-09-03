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
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 font-sans">
            User Account &amp; Staff Profile
          </h1>
        </div>
        <p className="mt-0.5 text-xs font-medium text-slate-500">
          Personal credentials, security settings, and digital tip configuration.
        </p>
      </header>

      {/* User Information Card */}
      <section className="card p-6 shadow-sm bg-white space-y-5">
        <div className="flex items-center gap-4 border-b border-slate-100 pb-4">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-600 text-white font-extrabold text-lg shadow-md shadow-brand-950/20">
            {user ? initialsOf(user.name) : "U"}
          </span>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-extrabold text-slate-900 font-sans">{user?.name}</h2>
              <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-bold text-brand-700 ring-1 ring-brand-200">
                {user ? humanizeEnum(user.role) : ""}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">{user?.email}</p>
          </div>
        </div>

        <dl className="grid gap-4 sm:grid-cols-2 text-xs sm:text-sm">
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Staff Role</dt>
            <dd className="mt-1 font-bold text-slate-900">{user ? humanizeEnum(user.role) : "—"}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Mobile Phone</dt>
            <dd className="mt-1 font-bold text-slate-900">{user?.phone ?? "Not configured"}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Email Address</dt>
            <dd className="mt-1 font-bold text-slate-900">{user?.email}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Account Created</dt>
            <dd className="mt-1 font-bold text-slate-900">{user ? formatDateTime(user.createdAt) : "—"}</dd>
          </div>
        </dl>
      </section>

      {/* Waiter Tip QR Configuration */}
      {user?.role === "WAITER" && (
        <form
          onSubmit={handleSaveTipQr}
          className="card p-6 space-y-4 shadow-sm bg-white"
        >
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-slate-900 font-sans">Personal UPI Tip QR Code</h2>
            <p className="text-xs text-slate-500">
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
          <div className="rounded-xl border border-dashed border-[#D4BD9B] bg-[#FAF8F5] p-4">
            <label className="block text-xs font-bold uppercase tracking-wider text-[#424541] mb-2">
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
                className="pressable inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-bold text-[#1F2220] ring-1 ring-[#E8E3D8] hover:bg-[#F3ECE0] hover:ring-[#D8CEBE] cursor-pointer shadow-2xs"
              >
                <span>📷 Upload QR Graphic from Device</span>
              </label>

              {isUploadingTipQr && (
                <span className="text-xs font-bold text-brand-700 animate-pulse">Uploading...</span>
              )}

              {tipQrImage && (
                <button
                  type="button"
                  onClick={() => setTipQrImage("")}
                  className="pressable rounded-xl bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100 transition"
                >
                  Remove Graphic
                </button>
              )}
            </div>
          </div>

          {/* Previews */}
          <div className="grid gap-4 sm:grid-cols-2 pt-2">
            {tipUpiId && (
              <div className="rounded-2xl bg-white p-3.5 ring-1 ring-[#E8E3D8] text-center shadow-2xs">
                <p className="text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-md inline-block mb-2">
                  ✨ Live Personal Tip QR
                </p>
                <div className="flex justify-center">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
                      `upi://pay?pa=${tipUpiId}&pn=${encodeURIComponent(
                        user?.name || "Staff Tip",
                      )}&cu=INR&tn=${encodeURIComponent(`Tip for ${user?.name || "Waiter"}`)}`,
                    )}`}
                    alt="Live Tip QR preview"
                    className="size-36 rounded-xl ring-1 ring-slate-200 shadow-sm p-1 bg-white object-contain"
                  />
                </div>
                <p className="mt-1.5 text-xs font-bold text-slate-800 font-mono">{tipUpiId}</p>
              </div>
            )}

            {tipQrImage && (
              <div className="rounded-2xl bg-white p-3.5 ring-1 ring-[#E8E3D8] text-center shadow-2xs">
                <p className="text-[11px] font-bold text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded-md inline-block mb-2">
                  🖼️ Uploaded QR Graphic
                </p>
                <div className="flex justify-center">
                  <img
                    src={resolveImageUrl(tipQrImage) ?? tipQrImage}
                    alt="Tip QR preview"
                    className="max-h-36 rounded-xl ring-1 ring-slate-200 shadow-sm object-contain"
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
        <div className="border-b border-slate-100 pb-3">
          <h2 className="text-base font-bold text-slate-900 font-sans">Change Account Password</h2>
          <p className="text-xs text-slate-500">Update your security passkey for logging into POS portals.</p>
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
