import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CustomerShell } from "../../components/customer/CustomerShell";
import { useCart } from "../../context/CartContext";
import { publicApi, publicApiForm } from "../../lib/publicApi";
import { peso } from "../../lib/format";

const ID_TYPES = ["image/jpeg", "image/png", "application/pdf"];
const MAX_ID_BYTES = 5 * 1024 * 1024;

const blankForm = () => ({
  start_date: "", end_date: "", fulfillment: "pickup",
  full_name: "", phone: "", email: "", address: "", city: "", province: "", postal_code: "", notes: ""
});

// The step after Cart -> "Proceed to Rental". One shared date range + one
// customer record covers every cart item, exactly like Admin -> Add
// Booking's single-booking-multiple-items structure -- so this submits the
// whole cart as one POST /public/bookings request, not one per item.
export function CustomerRentalForm() {
  const navigate = useNavigate();
  const { items, clear } = useCart();
  const [form, setForm] = useState(blankForm());
  const [idFile, setIdFile] = useState(null);
  const [idFileError, setIdFileError] = useState("");
  const [availability, setAvailability] = useState({});
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => { if (items.length === 0 && !result) navigate("/shop/cart", { replace: true }); }, [items, result, navigate]);

  const days = form.start_date && form.end_date
    ? Math.max(1, Math.floor((new Date(form.end_date + "T00:00:00") - new Date(form.start_date + "T00:00:00")) / 86400000) + 1)
    : 1;
  const lines = items.map(x => ({ ...x, rental: x.daily_price * x.quantity * days, deposit: x.security_deposit * x.quantity }));
  const rentalSubtotal = lines.reduce((s, x) => s + x.rental, 0);
  const depositSubtotal = lines.reduce((s, x) => s + x.deposit, 0);
  const total = rentalSubtotal + depositSubtotal;

  useEffect(() => {
    if (!form.start_date || !form.end_date || items.length === 0) { setAvailability({}); return; }
    const timer = setTimeout(() => {
      publicApi("/public/availability/check", {
        method: "POST",
        body: JSON.stringify({ start_date: form.start_date, end_date: form.end_date, items: items.map(x => ({ item_id: x.item_id, quantity: x.quantity })) })
      }).then(d => setAvailability(Object.fromEntries(d.items.map(x => [x.item_id, x])))).catch(() => setAvailability({}));
    }, 300);
    return () => clearTimeout(timer);
  }, [form.start_date, form.end_date, items]);

  const onPickFile = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIdFileError("");
    if (!ID_TYPES.includes(file.type)) { setIdFileError("ID document must be a JPG, PNG, or PDF file."); e.target.value = ""; return; }
    if (file.size > MAX_ID_BYTES) { setIdFileError("ID document must be 5MB or smaller."); e.target.value = ""; return; }
    setIdFile(file);
  };

  const validate = () => {
    if (!form.full_name.trim() || !form.phone.trim() || !form.email.trim()) return "Complete your name, contact number, and email address.";
    if (!form.address.trim()) return "A complete address is required.";
    if (!form.start_date || !form.end_date) return "Select a start and end date.";
    if (form.end_date < form.start_date) return "End date cannot be before start date.";
    if (items.some(x => availability[x.item_id] && !availability[x.item_id].available)) return "One or more cart items are unavailable for the selected dates.";
    if (!idFile) return "Upload a valid ID document to continue.";
    return "";
  };

  const openConfirm = () => {
    const message = validate();
    if (message) return setError(message);
    setError("");
    setConfirming(true);
  };

  const submit = async () => {
    setSubmitting(true);
    setError("");
    try {
      const body = new FormData();
      for (const [key, value] of Object.entries(form)) body.append(key, value);
      body.append("items", JSON.stringify(items.map(x => ({ item_id: x.item_id, quantity: x.quantity, delivery_fee_per_piece: 0 }))));
      body.append("id_document", idFile);
      const data = await publicApiForm("/public/bookings", body);
      setResult(data.booking);
      clear();
      setConfirming(false);
    } catch (e) {
      setError(e.message);
      setConfirming(false);
    } finally {
      setSubmitting(false);
    }
  };

  if (result) return <CustomerShell title="Request submitted">
    <div className="admin-card shop-success">
      <div className="confirm-modal-icon">✓</div>
      <h2>{result.booking_no}</h2>
      <p>Your rental request has been submitted and is now waiting for Admin approval.</p>
      <div className="shop-success-actions">
        <Link className="secondary-button" to="/shop">Browse more items</Link>
        <Link className="primary-button" to="/shop/status">Check status</Link>
      </div>
    </div>
  </CustomerShell>;

  if (items.length === 0) return null;

  return <CustomerShell title="Complete your rental request" subtitle="One request covers every item in your cart.">
    <section className="admin-card shop-booking-form">
      {error && <div className="login-error">{error}</div>}

      <h2>Items in this request</h2>
      <div className="shop-review-list">
        {lines.map(x => <div key={x.item_id}><span>{x.name} × {x.quantity}</span><strong>{peso(x.rental)}</strong></div>)}
      </div>

      <div className="form-grid">
        <label>Start date<input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} /></label>
        <label>End date<input type="date" min={form.start_date || undefined} value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} /></label>
        <label className="span-2">Fulfillment
          <select value={form.fulfillment} onChange={e => setForm({ ...form, fulfillment: e.target.value })}>
            <option value="pickup">Pickup</option>
            <option value="delivery">Delivery</option>
          </select>
        </label>
      </div>
      {form.start_date && form.end_date && <div className="shop-availability-list">
        {items.map(x => <div key={x.item_id} className={`availability-box ${availability[x.item_id] ? (availability[x.item_id].available ? "ok" : "bad") : ""}`}>
          {x.name}: {availability[x.item_id] ? (availability[x.item_id].available ? `Available (${availability[x.item_id].available_quantity})` : `Only ${availability[x.item_id].available_quantity} available`) : "Checking…"}
        </div>)}
      </div>}
      {form.fulfillment === "delivery" && <p className="muted">Delivery fee will be confirmed by our team after your request is reviewed.</p>}

      <div className="form-grid">
        <label>Full name<input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} placeholder="Enter full name" /></label>
        <label>Contact number<input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="09XX XXX XXXX" /></label>
        <label className="span-2">Email address<input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" /></label>
        <label className="span-2">Full address<textarea rows="2" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="House number, street, barangay, city, province, postal code" /></label>
        <label>City<input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} placeholder="Optional" /></label>
        <label>Province<input value={form.province} onChange={e => setForm({ ...form, province: e.target.value })} placeholder="Optional" /></label>
      </div>

      <label>ID document (JPG, PNG, or PDF, up to 5MB)
        <input type="file" accept={ID_TYPES.join(",")} onChange={onPickFile} />
      </label>
      {idFileError && <div className="login-error">{idFileError}</div>}
      {idFile && <div className="shop-file-preview">
        <span>{idFile.name}</span>
        <button type="button" className="mini-button" onClick={() => setIdFile(null)}>Replace</button>
      </div>}

      <label>Notes (optional)<textarea rows="2" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Anything we should know?" /></label>

      <div className="review-total">
        <div><span>Rental subtotal</span><strong>{peso(rentalSubtotal)}</strong></div>
        <div><span>Security deposit</span><strong>{peso(depositSubtotal)}</strong></div>
        <div className="grand"><span>Estimated total</span><strong>{peso(total)}</strong></div>
      </div>

      <button className="primary-button full" onClick={openConfirm}>Review &amp; Request to Rent</button>
    </section>

    {confirming && <div className="modal-backdrop" onClick={() => !submitting && setConfirming(false)}><div className="modal confirm-modal" onClick={e => e.stopPropagation()}>
      <div className="confirm-modal-icon">📋</div>
      <h3>Confirm your rental request</h3>
      <div className="shop-review-list">
        {lines.map(x => <div key={x.item_id}><span>{x.name} × {x.quantity}</span><strong>{peso(x.rental)}</strong></div>)}
        <div><span>Dates</span><strong>{form.start_date} → {form.end_date} ({days} day{days === 1 ? "" : "s"})</strong></div>
        <div><span>Fulfillment</span><strong>{form.fulfillment === "delivery" ? "Delivery" : "Pickup"}</strong></div>
        <div><span>Name</span><strong>{form.full_name}</strong></div>
        <div><span>Contact</span><strong>{form.phone} · {form.email}</strong></div>
        <div><span>Address</span><strong>{form.address}</strong></div>
        <div><span>ID document</span><strong>{idFile?.name}</strong></div>
        <div><span>Estimated total</span><strong>{peso(total)}</strong></div>
      </div>
      <p className="muted">Submitting sends this request to our team. It will be marked as waiting for approval — this is not a confirmed booking yet.</p>
      <div className="confirm-modal-actions">
        <button className="secondary-button" disabled={submitting} onClick={() => setConfirming(false)}>Edit</button>
        <button className="primary-button" disabled={submitting} onClick={submit}>{submitting ? "Submitting…" : "Confirm & Submit"}</button>
      </div>
    </div></div>}
  </CustomerShell>;
}
