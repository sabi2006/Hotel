import { useRef, useState } from "react";
import type { ChangeEvent, DragEvent, KeyboardEvent } from "react";

import { Button } from "@/components/Button";
import { PlusIcon, Trash2Icon } from "@/components/Icons";
import { useToast } from "@/hooks/useToast";
import { getErrorMessage } from "@/services/api";
import { resolveImageUrl, uploadsService } from "@/services/uploads";

interface ImageUploaderProps {
  label?: string;
  value?: string | null;
  onChange: (imageUrl: string | null) => void;
  disabled?: boolean;
  aspectRatio?: "square" | "video" | "wide";
}

const MAX_SIZE_MB = 5;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/jpg"];

export function ImageUploader({
  label = "Dish Photo",
  value,
  onChange,
  disabled = false,
  aspectRatio = "square",
}: ImageUploaderProps) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [previewLocalUrl, setPreviewLocalUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState(false);

  // Reset previewError when value or previewLocalUrl changes
  const resolvedValue = resolveImageUrl(value);
  const displayUrl = previewError ? null : (previewLocalUrl || resolvedValue);

  const validateAndUpload = async (file: File) => {
    if (!ALLOWED_TYPES.includes(file.type.toLowerCase())) {
      toast.error("Invalid file type", "Please upload a JPG, PNG, or WEBP image.");
      return;
    }

    if (file.size > MAX_SIZE_BYTES) {
      toast.error("File too large", `Image size must be less than ${MAX_SIZE_MB}MB.`);
      return;
    }

    // Set immediate local preview
    const localUrl = URL.createObjectURL(file);
    setPreviewLocalUrl(localUrl);
    setIsUploading(true);

    try {
      const result = await uploadsService.uploadImage(file);
      onChange(result.url);
      toast.success("Image uploaded", "Dish photo uploaded successfully.");
    } catch (caught) {
      toast.error("Upload failed", getErrorMessage(caught, "Could not upload image"));
      setPreviewLocalUrl(null);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void validateAndUpload(file);
    }
    // Reset file input value so selecting the same file again triggers change
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && !isDragging) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (disabled || isUploading) return;

    const file = e.dataTransfer.files?.[0];
    if (file) {
      void validateAndUpload(file);
    }
  };

  const handleClickArea = () => {
    if (!disabled && !isUploading && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.key === "Enter" || e.key === " ") && !disabled && !isUploading) {
      e.preventDefault();
      handleClickArea();
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPreviewLocalUrl(null);
    onChange(null);
  };

  const handleChangeImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleClickArea();
  };

  return (
    <div className="space-y-1.5 select-none">
      <label className="block text-xs font-bold text-ink-soft">
        {label}
      </label>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png, image/jpeg, image/webp, image/jpg"
        onChange={handleFileChange}
        className="sr-only"
        aria-label="Upload dish photo"
        disabled={disabled || isUploading}
      />

      {/* Main Upload Box */}
      {displayUrl ? (
        /* Image Preview Box */
        <div className="relative overflow-hidden rounded-xl border border-line bg-surface-soft p-2 shadow-xs transition-all">
          <div className="relative aspect-video sm:aspect-[4/3] w-full overflow-hidden rounded-xl bg-ink/5">
            <img
              src={displayUrl}
              alt="Dish photo preview"
              onError={() => setPreviewError(true)}
              className="size-full object-cover rounded-xl"
            />

            {isUploading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-ink/60 text-white">
                <span className="size-6 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span className="mt-2 text-xs font-bold">Uploading image...</span>
              </div>
            )}
          </div>

          <div className="mt-2 flex items-center justify-between gap-2 px-1 py-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-success">
              <span className="size-2 rounded-full bg-success" />
              <span>Dish photo selected</span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="xs"
                variant="secondary"
                onClick={handleChangeImage}
                disabled={isUploading}
              >
                Change Image
              </Button>
              <Button
                type="button"
                size="xs"
                variant="danger"
                onClick={handleRemove}
                disabled={isUploading}
                className="gap-1"
              >
                <Trash2Icon size={13} />
                <span>Remove</span>
              </Button>
            </div>
          </div>
        </div>
      ) : (
        /* Empty Upload Zone with Drag & Drop */
        <div
          role="button"
          tabIndex={0}
          onClick={handleClickArea}
          onKeyDown={handleKeyDown}
          onDragOver={handleDragOver}
          onDragEnter={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={[
            "group relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-all cursor-pointer focus-ring",
            isDragging
              ? "border-brand-500 bg-brand-50/70 scale-[1.01] shadow-sm ring-2 ring-brand-400"
              : "border-line bg-surface-soft/60 hover:border-brand-400 hover:bg-surface-soft hover:shadow-xs",
            disabled ? "opacity-50 cursor-not-allowed" : "",
          ].join(" ")}
        >
          <div className="flex size-13 items-center justify-center rounded-xl bg-white text-muted shadow-sm ring-1 ring-line group-hover:text-brand-600 transition-all">
            <PlusIcon size={22} />
          </div>

          <p className="mt-3 text-sm font-bold text-ink">
            {isDragging ? "Drop image here" : "Add dish photo"}
          </p>

          <p className="mt-0.5 text-xs text-muted font-medium">
            {isDragging ? "Release to upload immediately" : "Drag & drop an image here, or"}
          </p>

          {!isDragging && (
            <div className="mt-2.5">
              <span className="inline-flex items-center gap-1 rounded-xl bg-white px-3.5 py-1.5 text-xs font-bold text-brand-700 shadow-2xs ring-1 ring-line group-hover:bg-brand-50 group-hover:text-brand-800 transition">
                <PlusIcon size={14} />
                <span>Choose Image</span>
              </span>
            </div>
          )}

          <p className="mt-3 text-[11px] font-semibold text-subtle">
            PNG, JPG, JPEG, WEBP · Maximum file size: 5MB
          </p>
        </div>
      )}
    </div>
  );
}
