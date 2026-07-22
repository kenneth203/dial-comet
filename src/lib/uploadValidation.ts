/**
 * Shared client-side upload validation (Cyber Essentials control).
 * Server-side limits should also be configured on the storage bucket where possible.
 */

export const MIME_GROUPS = {
  images: ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp", "image/svg+xml"],
  docs: [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // docx
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // xlsx
    "text/csv",
    "text/plain",
  ],
} as const;

export interface ValidateFileOptions {
  maxBytes?: number;
  mimes?: readonly string[];
}

export interface ValidateFileResult {
  ok: boolean;
  error?: string;
}

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB project-wide rule

export function validateFile(
  file: File,
  opts: ValidateFileOptions = {}
): ValidateFileResult {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const mimes = opts.mimes;

  if (!file) return { ok: false, error: "No file selected." };

  if (file.size > maxBytes) {
    const mb = Math.round(maxBytes / (1024 * 1024));
    return { ok: false, error: `File is too large. Maximum size is ${mb}MB.` };
  }

  if (mimes && mimes.length > 0 && !mimes.includes(file.type)) {
    return {
      ok: false,
      error: "This file type is not allowed.",
    };
  }

  // Block obvious executable/script extensions even if MIME passes
  const name = file.name.toLowerCase();
  const blockedExt = [
    ".exe", ".bat", ".cmd", ".sh", ".ps1", ".msi", ".js", ".jse",
    ".vbs", ".vbe", ".wsf", ".wsh", ".jar", ".scr", ".com", ".dll",
    ".app", ".apk", ".dmg", ".pkg",
  ];
  if (blockedExt.some((ext) => name.endsWith(ext))) {
    return { ok: false, error: "Executable and script files are not allowed." };
  }

  return { ok: true };
}
