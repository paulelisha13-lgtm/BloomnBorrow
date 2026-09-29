import React, { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { api, getStoredUser, getToken, saveAuth } from "../lib/api";
import { Logo } from "../components/Logo";
import { PasswordInput } from "../components/PasswordInput";
import { staffDestination } from "../lib/roles";

export function AccessLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (getToken() && getStoredUser()) {
    return <Navigate to={staffDestination(location.search)} replace />;
  }

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      saveAuth(data.token, data.user);
      navigate(staffDestination(location.search), { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="admin-login-page">
      <section className="admin-login-visual">
        <div>
          <Logo light />
          <span className="eyebrow light">Bloom & Borrow</span>
          <h1>Inventory Management System</h1>
          <p>Manage your rental inventory, bookings, customers, and payments — all in one place.</p>
          <div className="login-feature-grid">
            <span>✓ Real-time inventory tracking</span>
            <span>✓ Automated booking management</span>
            <span>✓ Customer & payment records</span>
            <span>✓ Revenue reports & analytics</span>
          </div>
        </div>
      </section>

      <section className="admin-login-panel">
        <form className="admin-login-card" onSubmit={submit}>
          <div className="mobile-login-logo"><Logo /></div>
          <span className="eyebrow">Staff access</span>
          <h2>Sign in</h2>
          <p>Use your assigned Admin account.</p>

          {error && <div className="login-error">{error}</div>}

          <label>Email address
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required />
          </label>
          <label>Password
            <PasswordInput autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required />
          </label>

          <button className="primary-button full" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
