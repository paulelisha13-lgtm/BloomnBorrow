const START_EVENT = "bloom:action-start";
const END_EVENT = "bloom:action-end";

let recentControl = null;
let sequence = 0;

export function rememberActionControl(control) {
  if (!control) return;
  const captured = { control, capturedAt:Date.now() };
  recentControl = captured;
  // API calls made by a click handler start immediately. Clearing this short
  // handoff window prevents later background polling from claiming the button.
  setTimeout(() => { if (recentControl === captured) recentControl = null; }, 250);
}

export function beginActionRequest(method = "GET") {
  const recent = recentControl && Date.now() - recentControl.capturedAt < 250 ? recentControl : null;
  recentControl = null;
  if (!recent || typeof window === "undefined") return null;
  const id = `action-${Date.now()}-${++sequence}`;
  window.dispatchEvent(new CustomEvent(START_EVENT, {
    detail:{ id, method:String(method).toUpperCase(), control:recent.control }
  }));
  return id;
}

export function finishActionRequest(id, { ok, message = "", method = "GET" }) {
  if (!id || typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(END_EVENT, {
    detail:{ id, ok:Boolean(ok), message:String(message || ""), method:String(method).toUpperCase() }
  }));
}

export const actionFeedbackEvents = { start:START_EVENT, end:END_EVENT };
