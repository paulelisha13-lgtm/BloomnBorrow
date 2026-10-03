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
  const [availability, setAvailability] = useState({});
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [business, setBusiness] = useState(null);
  const [agreed, setAgreed] = useState(false);

  useEffect(() => { if (items.length === 0 && !result) navigate("/shop/cart", { replace: true }); }, [items, result, navigate]);
  useEffect(() => { publicApi("/public/business-info").then(d => setBusiness(d.business || {})).catch(() => {}); }, []);

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

  const confirmBackToCart = () => {
    setForm(blankForm());
    setIdFile(null);
    setIdFileError("");
    setLeaveConfirm(false);
    navigate("/shop/cart");
  };

  if (result) {
    const isGcash = (result.payment_method || form.payment_method) === "gcash";
    return <CustomerShell hideFloatingCart>
      <section className="admin-card shop-success" aria-labelledby="request-success-title">
        <div className="shop-success-mark" aria-hidden="true">✓</div>
        <p className="home-eyebrow">Request confirmation</p>
        <h1 id="request-success-title">Request Submitted Successfully</h1>
        <div className="shop-success-reference">
          <span>Rental reference number</span>
          <strong>{result.booking_no}</strong>
        </div>
        <div className="shop-success-status">
          <span>Status</span>
          <strong><i aria-hidden="true" />Pending Admin Approval</strong>
        </div>
        <p className="shop-success-message">Your rental request has been submitted and is currently waiting for Admin approval.</p>
        <div className="shop-success-total"><span>Rental total</span><strong>{peso(Number(result.grand_total))}</strong></div>

        {isGcash && <div className="shop-success-payment">
          <h2>GCash Payment</h2>
          <p>Your GCash payment QR code and payment instructions will be sent to your registered <strong>Gmail address</strong> once your rental request has been reviewed by Admin.</p>
          <small>Please check your <strong>Inbox and Spam/Junk folder</strong> for the payment instructions.</small>
        </div>}

        <div className="shop-success-actions">
          <Link className="primary-button" to="/shop/status">Check Status</Link>
          <Link className="secondary-button" to="/shop/browse">Browse More Items</Link>
        </div>
      </section>
    </CustomerShell>;
  }

  if (items.length === 0) return null;

  if (!agreed) return <CustomerShell title="Complete your rental request" subtitle="One request covers every item in your cart." hideFloatingCart disableModuleTransition>
    <PrivacyConsentModal business={business} onAgree={() => setAgreed(true)} onDecline={() => navigate("/shop/cart")} />
  </CustomerShell>;

  return <CustomerShell title="Complete your rental request" subtitle="Fill out the information below. Review your booking summary before submitting." hideFloatingCart>
    <div className="shop-request-layout">
      <div className="shop-request-main">
        {error && <div className="login-error">{error}</div>}

        <section className="admin-card form-section shop-request-section">
          <div className="form-section-title"><span>1</span><div><h2>Customer information</h2><p>Your personal and contact details.</p></div></div>
          <div className="customer-information-fields shop-request-fields">
            <div className="form-group"><label>Full name <span className="required">*</span></label><input required type="text" value={form.full_name} onChange={e => setForm({ ...form, full_name:e.target.value })} placeholder="Enter your full name" /></div>
            <div className="form-group"><label>Phone number <span className="required">*</span></label><input required type="tel" value={form.phone} onChange={e => setForm({ ...form, phone:e.target.value })} placeholder="09XX XXX XXXX" /></div>
            <div className="form-group"><label>Email address <span className="required">*</span></label><input required type="email" value={form.email} onChange={e => setForm({ ...form, email:e.target.value })} placeholder="you@example.com" /></div>
            <div className="form-group"><label>Full address <span className="required">*</span></label><input required value={form.address} onChange={e => setForm({ ...form, address:e.target.value })} placeholder="Enter your complete address" /></div>
            <div className="form-group span-2"><label>Additional notes <span>(optional)</span></label><textarea rows="3" value={form.notes} onChange={e => setForm({ ...form, notes:e.target.value })} placeholder="Special requests, delivery instructions, or other details" /></div>
          </div>
        </section>

        <section className="admin-card form-section shop-request-section">
          <div className="form-section-title"><span>2</span><div><h2>Rental information</h2><p>Set your rental period and preferred options.</p></div></div>
          <div className="form-grid shop-request-rental-fields">
            <div className="form-group"><label>Rental start date <span className="required">*</span></label><input required type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date:e.target.value })} /></div>
            <div className="form-group"><label>Rental end date <span className="required">*</span></label><input required type="date" min={form.start_date || undefined} value={form.end_date} onChange={e => setForm({ ...form, end_date:e.target.value })} /></div>
            <div className="form-group"><label>Fulfillment</label><select value={form.fulfillment} onChange={e => setForm({ ...form, fulfillment:e.target.value })}><option value="pickup">Pickup</option><option value="delivery">Delivery</option></select></div>
            <div className="form-group"><label>Payment method</label><select value={form.payment_method} onChange={e => setForm({ ...form, payment_method:e.target.value })}><option value="cash">Cash</option><option value="gcash">GCash</option><option value="bank_transfer">Bank transfer</option><option value="other">Other</option></select></div>
          </div>
          {form.fulfillment === "delivery" && <p className="shop-request-help">The delivery fee will be confirmed after Admin reviews your request.</p>}
        </section>

        <section className="admin-card form-section shop-request-section">
          <div className="form-section-title"><span>3</span><div><h2>Rental items</h2><p>Review the items included in this request.</p></div></div>
          <div className="shop-request-items">
            {lines.map(x => <article className="shop-request-item" key={x.item_id}>
              {x.image_url ? <img src={x.image_url} alt="" /> : <span className="shop-request-item-placeholder">B</span>}
              <div className="shop-request-item-name"><strong>{x.name}</strong><small>{x.category}</small></div>
              <div><small>Quantity</small><strong>{x.quantity}</strong></div>
              <div><small>Duration</small><strong>{days} day{days === 1 ? "" : "s"}</strong></div>
              <div className={`shop-request-availability ${availability[x.item_id]?.available ? "ok" : availability[x.item_id] ? "bad" : ""}`}>{!form.start_date || !form.end_date ? "Select dates" : availability[x.item_id] ? (availability[x.item_id].available ? `Available: ${availability[x.item_id].available_quantity}` : `Only ${availability[x.item_id].available_quantity} available`) : "Checking..."}</div>
              <div className="shop-request-item-total"><strong>{peso(x.rental)}</strong><small>Rental total</small></div>
            </article>)}
          </div>
          <Link className="secondary-button shop-request-edit-cart" to="/shop/cart">Edit rental items</Link>
        </section>

        <section className="admin-card form-section shop-request-section">
          <div className="form-section-title"><span>4</span><div><h2>Upload ID</h2><p>A valid ID is required for verification.</p></div></div>
          <div className="shop-request-upload">
            <div className="form-group"><label>ID document <span className="required">*</span></label><input type="file" accept={ID_TYPES.join(",")} onChange={onPickFile} /></div>
            <small>Accepted formats: JPG, PNG, PDF. Maximum size: 5MB.</small>
          </div>
          {idFileError && <div className="login-error">{idFileError}</div>}
          {idFile && <div className="shop-file-preview"><span>{idFile.name}</span><button type="button" className="mini-button" onClick={() => setIdFile(null)}>Replace</button></div>}
        </section>
      </div>

      <aside className="admin-card shop-request-summary">
        <div className="shop-request-summary-head"><h2>Booking summary</h2><p>Review your booking details and estimated total.</p></div>
        <div className="shop-request-summary-items">
          <strong>Rental items ({items.reduce((sum,item)=>sum+item.quantity,0)})</strong>
          {lines.map(x => <div className="shop-request-summary-item" key={x.item_id}>
            {x.image_url ? <img src={x.image_url} alt="" /> : <span className="shop-request-summary-placeholder">B</span>}
            <div><strong>{x.name}</strong><small>{x.quantity} piece{x.quantity === 1 ? "" : "s"} · {days} day{days === 1 ? "" : "s"}</small></div>
            <b>{peso(x.rental)}</b>
          </div>)}
        </div>
        <div className="shop-request-totals">
          <div><span>Rental subtotal</span><strong>{peso(rentalSubtotal)}</strong></div>
          <div><span>Delivery fee</span><strong>{form.fulfillment === "delivery" ? "To be confirmed" : peso(0)}</strong></div>
          <div><span>Security deposit</span><strong>{peso(depositSubtotal)}</strong></div>
          <div className="grand"><span>Estimated total</span><strong>{peso(total)}</strong></div>
        </div>
        <button type="button" className="primary-button shop-request-submit" onClick={openConfirm}>Request to Rent</button>
        <p className="shop-request-safe">Your information is used only to process and verify this rental request.</p>
        <button type="button" className="secondary-button shop-request-back" onClick={() => setLeaveConfirm(true)}>Back to Cart</button>
        {(business?.business_phone || business?.business_email || business?.business_address) && <div className="shop-request-contact">
          <strong>Business contact</strong>
          {business.business_phone && <span>{business.business_phone}</span>}
          {business.business_email && <span>{business.business_email}</span>}
          {business.business_address && <span>{business.business_address}</span>}
        </div>}
      </aside>
    </div>

    {leaveConfirm && <div className="modal-backdrop" onClick={() => setLeaveConfirm(false)}><div className="modal confirm-modal" onClick={e => e.stopPropagation()}>
      <h3>Leave Rental Request?</h3>
      <p>Going back to the cart will clear everything you've entered in this rental request.</p>
      <div className="confirm-modal-actions">
        <button className="secondary-button" onClick={() => setLeaveConfirm(false)}>Cancel</button>
        <button className="primary-button" data-customer-nav onClick={confirmBackToCart}>Continue</button>
      </div>
    </div></div>}

    {confirming && <div className="modal-backdrop" onClick={() => !submitting && setConfirming(false)}><div className="modal confirm-modal confirm-modal-review" onClick={e => e.stopPropagation()}>
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
        <button className={`primary-button ${submitting ? "is-loading" : ""}`} disabled={submitting} aria-busy={submitting} onClick={submit}>{submitting ? "Confirming…" : "Continue to Confirm"}</button>
      </div>
    </div></div>}
  </CustomerShell>;
}
