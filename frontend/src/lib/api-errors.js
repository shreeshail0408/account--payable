/*
 * Turn an axios error into a message a user can act on.
 * 401s never reach here (services/api.js refreshes the token or signs the user out).
 */
export function apiErrorMessage(error, { fallback = "Something went wrong. Please try again.", forbidden } = {}) {
  const response = error?.response;
  if (!response) {
    return "Can't reach the server. Check your connection and try again.";
  }
  const { status, data } = response;
  if (status === 403) {
    // Prefer a specific server message (e.g. "You are not assigned this approval.") over DRF's generic one.
    const detail = typeof data?.detail === "string" ? data.detail : "";
    if (detail && !detail.startsWith("You do not have permission")) {
      return detail;
    }
    return forbidden
      || "Your role doesn't allow this. If your role was changed recently, sign out and sign in again.";
  }
  if (status >= 500) {
    return "The server had a problem handling this request. Try again in a moment.";
  }
  return flattenErrors(data) || fallback;
}

/** DRF error bodies: {detail}, {field: [messages]}, {non_field_errors: [...]}, or a plain string/list. */
export function flattenErrors(data) {
  if (!data) {
    return "";
  }
  if (typeof data === "string") {
    return data;
  }
  if (Array.isArray(data)) {
    return data.map(flattenErrors).filter(Boolean).join(" ");
  }
  if (typeof data === "object") {
    return Object.entries(data)
      .map(([field, value]) => {
        const text = flattenErrors(value);
        if (!text || field === "detail" || field === "non_field_errors") {
          return text;
        }
        return `${field.replaceAll("_", " ")}: ${text}`;
      })
      .filter(Boolean)
      .join(" ");
  }
  return String(data);
}

export function isForbidden(error) {
  return error?.response?.status === 403;
}
