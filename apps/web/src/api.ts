import common from "./locales/en/common.json";

const catalogs = { common };

export function t(key: keyof typeof common) {
  return catalogs.common[key] ?? key;
}

export async function api(path: string, options: RequestInit = {}) {
  const csrf = document.cookie.split("; ").find((row) => row.startsWith("csrf="))?.split("=")[1];
  const response = await fetch(`/api/v1${path}`, {
    ...options,
    credentials: "include",
    headers: {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(csrf ? { "x-csrf-token": decodeURIComponent(csrf) } : {}),
      ...(options.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error ?? "request_failed") as Error & { reason?: string };
    error.reason = body.reason;
    throw error;
  }
  return body;
}
