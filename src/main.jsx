import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles.css";

// Pages are loaded on demand. After a new deploy, a tab still running the old
// build may ask for a page file that no longer exists -- reload once to pick up
// the new build instead of showing a broken page. At most once per tab session,
// so a file that is genuinely missing can never cause a reload loop.
window.addEventListener("vite:preloadError", event => {
  try {
    if (sessionStorage.getItem("bb_reloaded_for_update")) return;
    sessionStorage.setItem("bb_reloaded_for_update", "1");
  } catch {}
  event.preventDefault();
  window.location.reload();
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);