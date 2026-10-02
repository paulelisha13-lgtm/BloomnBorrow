// Fetch helper for the public Customer Side. Mirrors src/lib/api.js's error
// handling, but talks to the unauthenticated /api/public/* routes -- no
// staff session cookie or CSRF token, since guests never log in.
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

function describeHttpError(status) {
  if (status === 429) return "Too many requests — wait a moment and try again.";
  if (status === 404) return "That endpoint was not found (404).";
  if (status >= 500) return `Server error (${status}). Please try again shortly.`;
  return `Request failed (${status}).`;
}

async function handle(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || describeHttpError(response.status));
  return data;
}

export async function publicApi(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      method: options.method || "GET",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) }
    });
  } catch {
    throw new Error(`Cannot reach the server at ${API_BASE}. Is the API running?`);
  }
  return handle(response);
}

// For private customer uploads (booking ID and payment proof), which must use
// multipart/form-data rather than base64/JSON.
export async function publicApiForm(path, formData) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, { method: "POST", body: formData });
  } catch {
    throw new Error(`Cannot reach the server at ${API_BASE}. Is the API running?`);
  }
  return handle(response);
}
