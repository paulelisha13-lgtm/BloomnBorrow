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
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    method,
    credentials: "include",
    headers
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) clearAuth();
    throw new Error(data.message || "Request failed");
  }
  return data;
}

export function getCustomerToken() {
  return localStorage.getItem("bloom_borrow_customer_user") ? "cookie-session" : null;
}
export function getCustomerUser() {
  try { return JSON.parse(localStorage.getItem("bloom_borrow_customer_user") || "null"); }
  catch { return null; }
}
export function saveCustomerAuth(_token, user) {
  localStorage.setItem("bloom_borrow_customer_user", JSON.stringify(user));
}
export function clearCustomerAuth() {
  localStorage.removeItem("bloom_borrow_customer_user");
}
export async function customerApi(path, options={}) {
  const method=String(options.method || "GET").toUpperCase();
  const headers={
    "Content-Type":"application/json",
    ...(options.headers||{})
  };
  if(!["GET","HEAD","OPTIONS"].includes(method)){
    const csrf=decodeURIComponent(readCookie("bloom_borrow_customer_csrf"));
    if(csrf) headers["X-CSRF-Token"]=csrf;
  }
  const response=await fetch(`${API_BASE}${path}`,{
    ...options,
    method,
    credentials:"include",
    headers
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    if(response.status===401) clearCustomerAuth();
    throw new Error(data.message || "Request failed");
  }
  return data;
}