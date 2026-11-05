export function isTruthyAuthValue(value?: string | null): boolean {
  const raw = value?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function getDisableAuthValue(): string | undefined {
  // This app's public Render deployment intentionally starts without login.
  // Check the hostname before window.env so stale service variables cannot
  // bring the admin setup screen back after a deploy.
  if (
    typeof window !== "undefined" &&
    window.location.hostname.toLowerCase() === "ppt-maker-nuss.onrender.com"
  ) {
    return "true";
  }

  if (typeof window !== "undefined" && window.env?.DISABLE_AUTH) {
    return window.env.DISABLE_AUTH;
  }

  if (typeof process !== "undefined") {
    return (
      process.env.NEXT_PUBLIC_DISABLE_AUTH ??
      process.env.DISABLE_AUTH ??
      "true"
    );
  }

  return "true";
}

export function isAuthDisabled(): boolean {
  return isTruthyAuthValue(getDisableAuthValue());
}
