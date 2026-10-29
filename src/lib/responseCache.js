// In-memory copy of the last successful GET response per path, so a page the
// user has already visited can render its previous data immediately while the
// fresh request runs. Pages still refetch every time -- this only removes the
// empty/loading flash.
//
// Any successful change (POST/PATCH/PUT/DELETE) clears everything, because one
// save can affect many lists (a booking changes inventory availability,
// customers, payments...). Signing out clears it too. Memory only: nothing is
// written to browser storage, and a full page reload starts empty.
const cache = new Map();

export function cachedResponse(path) {
  return cache.get(path);
}

export function rememberResponse(path, data) {
  cache.set(path, data);
}

export function clearResponseCache() {
  cache.clear();
}
