import { api } from "@/services/api";

export interface UploadResult {
  url: string;
  filename: string;
}

export const uploadsService = {
  async uploadImage(file: File): Promise<UploadResult> {
    const formData = new FormData();
    formData.append("file", file);

    const response = await api.post<UploadResult>("/uploads/image", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return response.data;
  },
};

/**
 * Universal Image URL resolver.
 * Converts backend relative paths, Windows paths, and full URLs into clean browser URLs.
 */
export function resolveImageUrl(path: string | null | undefined): string | null {
  if (!path || typeof path !== "string") return null;
  const trimmed = path.trim();
  if (!trimmed || trimmed === "null" || trimmed === "undefined" || trimmed === "None") {
    return null;
  }

  // Reject obsolete temporary blob URLs
  if (trimmed.startsWith("blob:")) {
    return null;
  }

  // Normalize Windows paths or paths with backslashes e.g. D:\Hotel\backend\uploads\images\abc.jpg
  if (trimmed.includes("\\") || trimmed.includes("uploads/images/") || trimmed.includes("uploads\\images\\")) {
    const match = trimmed.match(/uploads[\\\/]images[\\\/]([a-zA-Z0-9_\-\.]+)/i);
    if (match && match[1]) {
      return `/uploads/images/${match[1]}`;
    }
  }

  // If localhost URL with explicit port 8000/8001 pointing to /uploads/..., make relative to avoid port conflicts
  const localhostUploadMatch = trimmed.match(/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(\/uploads\/.*)$/i);
  if (localhostUploadMatch) {
    return localhostUploadMatch[1];
  }

  // Full external HTTPS/HTTP or data: URLs
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("data:")) {
    return trimmed;
  }

  // Relative paths
  if (trimmed.startsWith("/")) {
    return trimmed;
  }

  return `/${trimmed}`;
}
