import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CustomerShell } from "../../components/customer/CustomerShell";
import { PrivacyConsentModal } from "../../components/customer/PrivacyConsentModal";
import { useCart } from "../../context/CartContext";
import { publicApi, publicApiForm } from "../../lib/publicApi";
import { peso } from "../../lib/format";

const ID_TYPES = ["image/jpeg", "image/png", "application/pdf"];
const MAX_ID_BYTES = 5 * 1024 * 1024;

const blankForm = () => ({
  start_date: "", end_date: "", fulfillment: "pickup", payment_method: "cash",
  full_name: "", phone: "", email: "", address: "", city: "", province: "", postal_code: "", notes: ""
});

// The step after Cart -> "Proceed to Rental". Mirrors Admin -> Add
// Booking's own sectioned layout (numbered collapsible cards) field for
// field, so this is a customer-facing entry point into the exact same
// booking structure, not a separate design -- one shared date range + one
// customer record covers every cart item, same as Add Booking's
// single-booking-multiple-items model. ID upload is the one addition Admin
// doesn't need (staff verify ID in person), kept as its own section.
export function CustomerRentalForm() {
  const navigate = useNavigate();
  const { items, clear } = useCart();
  const [form, setForm] = useState(blankForm());
  const [idFile, setIdFile] = useState(null);
  const [idFileError, setIdFileError] = useState("");
  const [openSections, setOpenSections] = useState({ customer: true, rental: true, items: true, id: true, summary: true });
  const [availability, setAvailability] = useState({});
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [business, setBusiness] = useState(null);
  const [agreed, setAgreed] = useState(false);

  useEffect(() => { if (items.length === 0 && !result) navigate("/shop/cart", { replace: true }); }, [items, result, navigate]);
  useEffect(() => { publicApi("/public/business-info").then(d => setBusiness(d.business || {})).catch(() => {}); }, []);

  const toggleSection = key => setOpenSections(v => ({ ...v, [key]: !v[key] }));

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
      <h2>{result.booking_no}</h2>
      <p>Your rental request has been submitted and is now waiting for Admin approval.</p>
      <div className="shop-success-actions">
        <Link className="secondary-button" to="/shop">Browse more items</Link>
        <Link className="primary-button" to="/shop/status">Check status</Link>
      </div>
    </div>
  </CustomerShell>;

  if (items.length === 0) return null;

  if (!agreed) return <CustomerShell title="Complete your rental request" subtitle="One request covers every item in your cart.">
    <PrivacyConsentModal business={business} onAgree={() => setAgreed(true)} onDecline={() => navigate("/shop/cart")} />
  </CustomerShell>;

  return <CustomerShell title="Complete your rental request" subtitle="One request covers every item in your cart.">
    <div className="admin-booking-form">
      {error && <div className="login-error">{error}</div>}

      <section className={`admin-card form-section ${openSections.customer ? "is-open" : "is-collapsed"}`}>
        <button type="button" className="form-section-toggle" onClick={() => toggleSection("customer")} aria-expanded={openSections.customer}>
          <div className="form-section-title"><span>1</span><div><h2>Customer Information</h2><p>{openSections.customer ? "Tell us who this rental request is for." : form.full_name ? `${form.full_name} · ${form.phone}` : "Customer details not completed"}</p></div></div>
          <span className="section-chevron">⌄</span>
        </button>
        {openSections.customer && <div className="form-section-content">
          <div className="customer-information-fields">
            <div className="form-group"><label>Customer Name <span className="required">*</span></label><input required type="text" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} placeholder="Enter full name" /></div>
            <div className="form-group"><label>Contact Number <span className="required">*</span></label><input required type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="09XX XXX XXXX" /></div>
            <div className="form-group"><label>Email Address <span className="required">*</span></label><input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" /></div>
            <div className="form-group customer-address-field"><label>Full Address <span className="required">*</span></label><textarea required rows="3" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="House number, street, barangay, city, province, postal code" /></div>
          </div>
        </div>}
      </section>

      <section className={`admin-card form-section ${openSections.rental ? "is-open" : "is-collapsed"}`}>
        <button type="button" className="form-section-toggle" onClick={() => toggleSection("rental")} aria-expanded={openSections.rental}>
          <div className="form-section-title"><span>2</span><div><h2>Rental Information</h2><p>{openSections.rental ? "Duration-based prices are calculated inclusively." : form.start_date && form.end_date ? `${form.start_date} → ${form.end_date} · ${days} days` : "Rental dates not set"}</p></div></div>
          <span className="section-chevron">⌄</span>
        </button>
        {openSections.rental && <div className="form-section-content"><div className="form-grid">
          <div className="form-group"><label>Start date <span className="required">*</span></label><input required type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} /></div>
          <div className="form-group"><label>End date <span className="required">*</span></label><input required type="date" min={form.start_date || undefined} value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} /></div>
          <div className="form-group"><label>Fulfillment</label><select value={form.fulfillment} onChange={e => setForm({ ...form, fulfillment: e.target.value })}><option value="pickup">Pickup</option><option value="delivery">Delivery</option></select></div>
          <div className="form-group"><label>Payment method</label><select value={form.payment_method} onChange={e => setForm({ ...form, payment_method: e.target.value })}><option value="cash">Cash</option><option value="gcash">GCash</option><option value="bank_transfer">Bank transfer</option><option value="other">Other</option></select></div>
        </div>
        {form.fulfillment === "delivery" && <p className="muted">Delivery fee will be confirmed by our team after your request is reviewed.</p>}
        </div>}
      </section>

      <section className={`admin-card form-section ${openSections.items ? "is-open" : "is-collapsed"}`}>
        <button type="button" className="form-section-toggle" onClick={() => toggleSection("items")} aria-expanded={openSections.items}>
          <div className="form-section-title"><span>3</span><div><h2>Rental Items</h2><p>{openSections.items ? "From your cart -- to change items or quantity, go back to Cart." : `${lines.length} item${lines.length === 1 ? "" : "s"} · ${items.reduce((s, x) => s + x.quantity, 0)} pieces`}</p></div></div>
          <span className="section-chevron">⌄</span>
        </button>
        {openSections.items && <div className="form-section-content">
          <div className="admin-booking-items">
            {lines.map(x => <article className="admin-booking-item" key={x.item_id}>
              <div className="item-row-head">
                {x.image_url ? <img src={x.image_url} alt="" /> : <span className="item-image-placeholder">B</span>}
                <div className="form-group grow"><label>Rental item</label><input readOnly value={x.name} /></div>
              </div>
              <div className="item-input-grid">
                <div className="form-group"><label>Quantity / pieces</label><input readOnly value={x.quantity} /></div>
                <div className="form-group"><label>Rental duration</label><input readOnly value={`${days} day${days === 1 ? "" : "s"}`} /></div>
                <div className="form-group"><label>Delivery fee / piece</label><input readOnly value="To be confirmed" /></div>
                <div className="form-group"><label>Availability</label><div className={`availability-box ${availability[x.item_id]?.available ? "ok" : availability[x.item_id] ? "bad" : ""}`}>{!form.start_date || !form.end_date ? "Select dates above" : availability[x.item_id] ? (availability[x.item_id].available ? `Available (${availability[x.item_id].available_quantity})` : `Only ${availability[x.item_id].available_quantity} available`) : "Checking…"}</div></div>
              </div>
              <div className="item-calculation"><span>Rental <b>{peso(x.rental)}</b></span><span>Deposit <b>{peso(x.deposit)}</b></span><span>Item total <b>{peso(x.rental + x.deposit)}</b></span></div>
            </article>)}
          </div>
          <Link className="secondary-button" to="/shop/cart">Edit cart</Link>
        </div>}
      </section>

      <section className={`admin-card form-section ${openSections.id ? "is-open" : "is-collapsed"}`}>
        <button type="button" className="form-section-toggle" onClick={() => toggleSection("id")} aria-expanded={openSections.id}>
          <div className="form-section-title"><span>4</span><div><h2>Upload ID</h2><p>{openSections.id ? "Required so we can verify your rental request." : idFile ? idFile.name : "ID not uploaded yet"}</p></div></div>
          <span className="section-chevron">⌄</span>
        </button>
        {openSections.id && <div className="form-section-content">
          <div className="form-group"><label>ID document (JPG, PNG, or PDF, up to 5MB) <span className="required">*</span></label><input type="file" accept={ID_TYPES.join(",")} onChange={onPickFile} /></div>
          {idFileError && <div className="login-error">{idFileError}</div>}
          {idFile && <div className="shop-file-preview"><span>{idFile.name}</span><button type="button" className="mini-button" onClick={() => setIdFile(null)}>Replace</button></div>}
        </div>}
      </section>

      <section className={`admin-card form-section booking-review ${openSections.summary ? "is-open" : "is-collapsed"}`}>
        <button type="button" className="form-section-toggle" onClick={() => toggleSection("summary")} aria-expanded={openSections.summary}>
          <div className="form-section-title"><span>5</span><div><h2>Booking Summary</h2><p>{openSections.summary ? "Review everything before requesting to rent." : `Estimated total: ${peso(total)}`}</p></div></div>
          <span className="section-chevron">⌄</span>
        </button>
        {openSections.summary && <div className="form-section-content booking-review-content">
          <div className="form-group"><label>Notes (optional)</label><textarea rows="3" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Anything we should know?" /></div>
          <div className="review-total">
            <div><span>Rental subtotal</span><strong>{peso(rentalSubtotal)}</strong></div>
            <div><span>Security deposit</span><strong>{peso(depositSubtotal)}</strong></div>
            <div className="grand"><span>Estimated total</span><strong>{peso(total)}</strong></div>
          </div>
        </div>}
      </section>

      <div className="sticky-form-actions"><Link className="secondary-button" to="/shop/cart">Back to Cart</Link><button className="primary-button" onClick={openConfirm}>Review &amp; Request to Rent</button></div>
    </div>

    {confirming && <div className="modal-backdrop" onClick={() => !submitting && setConfirming(false)}><div className="modal confirm-modal" onClick={e => e.stopPropagation()}>
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
      <p className="muted">Confirming sends this request to our team. It will be marked as waiting for approval — this is not a confirmed booking yet.</p>
      <div className="confirm-modal-actions">
        <button className="secondary-button" disabled={submitting} onClick={() => setConfirming(false)}>Edit</button>
        <button className="primary-button" disabled={submitting} onClick={submit}>{submitting ? "Confirming…" : "Confirm"}</button>
      </div>
    </div></div>}
  </CustomerShell>;
}
