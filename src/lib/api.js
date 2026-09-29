const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

function readCookie(name) {
  const prefix = `${encodeURIComponent(name)}=`;
  return document.cookie.split(";").map(x => x.trim()).find(x => x.startsWith(prefix))?.slice(prefix.length) || "";
}

export function getToken() {
  return localStorage.getItem("bloom_borrow_user") ? "cookie-session" : null;
}

export function getStoredUser() {
  try { return JSON.parse(localStorage.getItem("bloom_borrow_user") || "null"); }
  catch { return null; }
}

export function saveAuth(_token, user) {
  localStorage.setItem("bloom_borrow_user", JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem("bloom_borrow_user");
}

export async function api(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
  if (!["GET","HEAD","OPTIONS"].includes(method)) {
    const csrf = decodeURIComponent(readCookie("bloom_borrow_staff_csrf"));
    if (csrf) headers["X-CSRF-Token"] = csrf;
  }
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      method,
      credentials: "include",
      headers
    });
  } catch {
    throw new Error(`Cannot reach the server at ${API_BASE}. Is the API running?`);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) clearAuth();
    throw new Error(data.message || describeHttpError(response.status));
  }
  return data;
}

function describeHttpError(status) {
  if (status === 429) return "Too many requests — wait a moment and try again.";
  if (status === 404) return "That endpoint was not found (404).";
  if (status === 403) return "You do not have permission to do that (403).";
  if (status >= 500) return `Server error (${status}). Please try again shortly.`;
  return `Request failed (${status}).`;
}