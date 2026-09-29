import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { Kpi } from "../components/Kpi";
import { AdminShell } from "../components/layout/AdminShell";
import { SortControls } from "../components/SortControls";
import { ViewToggle } from "../components/ViewToggle";
import { sortRows, useSort } from "../hooks/useSort";
import { useViewMode } from "../hooks/useViewMode";
import { useBusinessProfile } from "../hooks/useBusinessProfile";
import { peso } from "../lib/format";
import { balanceStatus, openInvoice, paymentBreakdown } from "../lib/invoice";
import { isAdminUser } from "../lib/roles";

export function Bookings() {
  const navigate=useNavigate();
  const [rows,setRows]=useState([]);
  const [detail,setDetail]=useState(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [search,setSearch]=useState("");
  const [statusFilter,setStatusFilter]=useState("All");
  const [showPaymentModal,setShowPaymentModal]=useState(false);
  const [paymentForm,setPaymentForm]=useState({amount:"",method:"cash",payment_type:"rental",notes:""});
  const [paymentSubmitting,setPaymentSubmitting]=useState(false);
  const [deleteBookingTarget,setDeleteBookingTarget]=useState(null);
  const [deletingBooking,setDeletingBooking]=useState(false);
  const [showInspectModal,setShowInspectModal]=useState(false);
  const [inspectForm,setInspectForm]=useState({condition:"Good",damage_charge:"0",maintenance_required:false});
  const [inspectSubmitting,setInspectSubmitting]=useState(false);
  const [sendingInvoice,setSendingInvoice]=useState(false);
  const [invoiceSent,setInvoiceSent]=useState(false);
  const business=useBusinessProfile();

  const load=()=>api("/admin/bookings").then(d=>setRows(d.bookings||[])).catch(e=>setError(e.message));
  React.useEffect(()=>{load()},[]);
  const open=async(id)=>{setError("");setInvoiceSent(false);try{setDetail((await api(`/admin/bookings/${id}`)).booking)}catch(e){setError(e.message)}};
  const act=async(path,body={})=>{setBusy(true);setError("");try{await api(path,{method:"PATCH",body:JSON.stringify(body)});if(detail)await open(detail.id);load()}catch(e){setError(e.message)}finally{setBusy(false)}};

  const sendInvoice=async()=>{
    setSendingInvoice(true);setError("");
    try{
      await api(`/admin/bookings/${detail.id}/send-invoice`,{method:"POST",body:JSON.stringify({})});
      setInvoiceSent(true);
      setTimeout(()=>setInvoiceSent(false),3000);
    }catch(e){setError(`Could not send invoice: ${e.message}`)}
    finally{setSendingInvoice(false)}
  };

  const deleteBooking=async()=>{
    if(!deleteBookingTarget)return;
    setDeletingBooking(true);
    try{
      await api(`/admin/bookings/${deleteBookingTarget.id}`,{method:"DELETE"});
      setDeleteBookingTarget(null);
      setDetail(null);
      load();
    }catch(e){setError(e.message)}
    finally{setDeletingBooking(false)}
  };

  const openPaymentModal=()=>{
    const balances=paymentBreakdown(detail);
    setPaymentForm({amount:String(balances.rentalBalance||balances.depositBalance||0),method:"cash",payment_type:balances.rentalBalance>0?"rental":"deposit",notes:""});
    setShowPaymentModal(true);
  };

  const submitPayment=async()=>{
    if(!paymentForm.amount||Number(paymentForm.amount)<=0)return;
    setPaymentSubmitting(true);
    try{
      await api(`/admin/bookings/${detail.id}/payments`,{method:"POST",body:JSON.stringify({amount:Number(paymentForm.amount),payment_type:paymentForm.payment_type,method:paymentForm.method,notes:paymentForm.notes})});
      setShowPaymentModal(false);
      await open(detail.id);
      load();
    }catch(e){setError(e.message)}
    finally{setPaymentSubmitting(false)}
  };

  const reschedule=async()=>{const start=window.prompt("New start date (YYYY-MM-DD):",String(detail.start_date).slice(0,10));if(!start)return;const end=window.prompt("New end date (YYYY-MM-DD):",String(detail.end_date).slice(0,10));if(!end)return;await act(`/admin/bookings/${detail.id}/reschedule`,{start_date:start,end_date:end})};
  const openInspect=()=>{setInspectForm({condition:"Good",damage_charge:"0",maintenance_required:false});setShowInspectModal(true)};
  const submitInspect=async()=>{setInspectSubmitting(true);try{await api(`/admin/bookings/${detail.id}/return-inspection`,{method:"POST",body:JSON.stringify({condition_after:inspectForm.condition,damage_charge:Number(inspectForm.damage_charge),maintenance_required:inspectForm.maintenance_required})});setShowInspectModal(false);if(inspectForm.maintenance_required){navigate("/admin/maintenance")}else{await open(detail.id);load()}}catch(e){setError(e.message)}finally{setInspectSubmitting(false)}};

  const statuses=["All","pending","confirmed","ready","rented","overdue","returned","completed","cancelled","rejected"];
  const statusCounts=Object.fromEntries(statuses.map(s=>[s,s==="All"?rows.length:rows.filter(b=>b.status===s).length]));
  const filtered=rows.filter(b=>{
    const matchSearch=(b.booking_no||"").toLowerCase().includes(search.toLowerCase())||(b.customer_name||"").toLowerCase().includes(search.toLowerCase());
    const matchStatus=statusFilter==="All"||b.status===statusFilter;
    return matchSearch&&matchStatus;
  });
  const sorts={
    start_date:{label:"Start date",get:b=>Date.parse(b.start_date)||0},
    end_date:{label:"End date",get:b=>Date.parse(b.end_date)||0},
    booking_no:{label:"Booking #",get:b=>b.booking_no||""},
    customer_name:{label:"Customer",get:b=>b.customer_name||""},
    grand_total:{label:"Total",get:b=>Number(b.grand_total)||0},
    status:{label:"Status",get:b=>b.status||""}
  };
  const {sortKey,sortDir,setSort}=useSort("start_date","desc");
  const sorted=sortRows(filtered,sorts,sortKey,sortDir);
  const [view,setView]=useViewMode("bb.view.bookings");

  const stats={
    total:rows.length,
    pending:rows.filter(b=>b.status==="pending").length,
    active:rows.filter(b=>["confirmed","ready","rented"].includes(b.status)).length,
    overdue:rows.filter(b=>b.status==="overdue").length,
    revenue:rows.filter(b=>["completed","returned"].includes(b.status)).reduce((s,b)=>s+Number(b.grand_total||0),0)
  };

  return <AdminShell title="Booking Management" subtitle="Approve, reject, reschedule, collect payment, return and complete rentals.">
    {error&&<div className="login-error">{error}</div>}

    <section className="kpi-grid">
      <Kpi index={0} icon="📋" label="Total bookings" value={stats.total} detail="All time"/>
      <Kpi index={1} icon="⏳" label="Pending" value={stats.pending} detail="Awaiting approval"/>
      <Kpi index={2} icon="🔄" label="Active" value={stats.active} detail="Confirmed / ready / rented"/>
      <Kpi index={3} icon="⚠" pulseIcon label="Overdue" value={stats.overdue} detail="Needs attention"/>
    </section>

    <div className="admin-page-toolbar">
      <div className="admin-search">
        <span>⌕</span>
        <input placeholder="Search by booking # or customer..." value={search} onChange={e=>setSearch(e.target.value)}/>
      </div>
      <div className="booking-filter-group">
        <button className="primary-button" onClick={()=>navigate("/admin/bookings/new")}>+ Add Booking</button>
        <select className="booking-status-select" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          {statuses.map(s=><option key={s} value={s}>{s==="All"?"All Status":s.charAt(0).toUpperCase()+s.slice(1)} ({statusCounts[s]})</option>)}
        </select>
        <SortControls sorts={sorts} sortKey={sortKey} sortDir={sortDir} setSort={setSort}/>
        <ViewToggle view={view} onChange={setView}/>
      </div>
    </div>

    <section className="admin-card">
      {filtered.length===0?<div className="inventory-empty">
        <span>📭</span>
        <h3>No bookings found</h3>
        <p>{search||statusFilter!=="All"?"Try adjusting your search or filter.":"No bookings have been made yet."}</p>
      </div>:view==="table"?<div className="table-wrap"><table>
        <thead><tr><th>Booking</th><th>Customer</th><th>Items</th><th>Dates</th><th>Payment</th><th>Status</th><th className="num">Total</th><th></th></tr></thead>
        <tbody>{sorted.map(b=><tr key={b.id} className="row-clickable" onClick={()=>open(b.id)}>
          <td><strong>{b.booking_no}</strong></td>
          <td>{b.customer_name}</td>
          <td className="cell-wrap"><small>{b.items||"—"}</small></td>
          <td>{new Date(b.start_date).toLocaleDateString("en-PH",{month:"short",day:"numeric"})} → {new Date(b.end_date).toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"})}</td>
          <td><span className={`status-pill ${b.payment_status==="paid"?"confirmed":b.payment_status==="partial"?"pending":""}`}>{b.payment_status||"unpaid"}</span></td>
          <td><span className={`status-pill ${b.status==="pending"?"pending":b.status==="overdue"?"overdue":b.status==="cancelled"||b.status==="rejected"?"overdue":"confirmed"}`}>{b.status}</span></td>
          <td className="num">{peso(Number(b.grand_total))}</td>
          <td><button className="mini-button" onClick={e=>{e.stopPropagation();open(b.id)}}>Manage →</button></td>
        </tr>)}</tbody>
      </table></div>:<div className="booking-card-grid">
        {sorted.map(b=><article className="booking-card" key={b.id} onClick={()=>open(b.id)}>
          <div className="booking-card-top">
            <div className="booking-card-id">
              <span className="booking-avatar-sm">{b.customer_name.split(" ").map(x=>x[0]).join("").slice(0,2)}</span>
              <div><strong>{b.booking_no}</strong><small>{b.customer_name}</small></div>
            </div>
            <span className={`status-pill ${b.status==="pending"?"pending":b.status==="overdue"?"overdue":b.status==="cancelled"||b.status==="rejected"?"overdue":"confirmed"}`}>{b.status}</span>
          </div>
          <div className="booking-card-body">
            <div className="booking-card-info"><span>📦</span><small>{b.items||"—"}</small></div>
            <div className="booking-card-info"><span>📅</span><small>{new Date(b.start_date).toLocaleDateString("en-PH",{month:"short",day:"numeric"})} → {new Date(b.end_date).toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"})}</small></div>
            <div className={`booking-card-info ${b.payment_status==="paid"?"payment-paid":b.payment_status==="partial"?"payment-partial":""}`}><span>{b.payment_status==="paid"?"✅":b.payment_status==="partial"?"⏳":"💳"}</span><small>{b.payment_status==="paid"?"Paid in full":b.payment_status==="partial"?"Partial payment":b.payment_status||"Unpaid"}</small></div>
          </div>
          <div className="booking-card-footer">
            <span className="booking-card-total">{peso(Number(b.grand_total))}</span>
            <button className="mini-button">Manage →</button>
          </div>
        </article>)}
      </div>}
    </section>

    {detail&&(()=>{
      const money=paymentBreakdown(detail);
      const totalPaid=money.totalPaid;
      const grandTotal=money.totalDue;
      const balance=money.outstanding;
      const isPaid=balance<=0;
      const isPartial=totalPaid>0&&!isPaid;

      return <div className="modal-backdrop" onClick={()=>setDetail(null)}><div className="modal booking-modal" onClick={e=>e.stopPropagation()}>
      <button className="booking-modal-close" onClick={()=>setDetail(null)}>×</button>
      <div className="booking-modal-header">
        <div className="booking-modal-customer">
          <div className="booking-avatar">{detail.customer_name.split(" ").map(x=>x[0]).join("").slice(0,2)}</div>
          <div><span className="eyebrow">{detail.booking_no}</span><h2>{detail.customer_name}</h2><p>{detail.customer_email} · {detail.customer_phone}</p></div>
        </div>
      </div>

      {isPaid&&<div className="booking-paid-banner"><span className="paid-banner-icon">✓</span><div><strong>Payment Complete</strong><small>Customer has fully paid this booking</small></div></div>}
      {!isPaid&&isPartial&&<div className="booking-partial-banner"><span className="partial-banner-icon">⏳</span><div><strong>Partial Payment</strong><small>{peso(totalPaid)} paid — {peso(balance)} balance remaining</small></div></div>}
      {!isPaid&&!isPartial&&<div className="booking-unpaid-banner"><span className="unpaid-banner-icon">!</span><div><strong>Unpaid</strong><small>{peso(grandTotal)} total amount due</small></div></div>}

      <div className="booking-detail-grid">
        <div className="booking-stat-card"><div><small>Status</small><b>{detail.status}</b></div></div>
        <div className="booking-stat-card"><div><small>Payment</small><b>{detail.payment_status}</b></div></div>
        <div className="booking-stat-card"><div><small>Dates</small><b>{new Date(detail.start_date).toLocaleDateString("en-PH",{month:"short",day:"numeric"})} → {new Date(detail.end_date).toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"})}</b></div></div>
        <div className="booking-stat-card"><div><small>Total</small><b>{peso(grandTotal)}</b></div></div>
      </div>

      <div className="booking-modal-section">
        <div className="booking-section-header"><strong>Payment Summary</strong></div>
        <div className="payment-ledger-grid">
          <div className="payment-ledger-card rental-ledger"><div className="ledger-card-head"><div><small>Rental &amp; service fees</small><strong>{peso(money.rentalDue)}</strong></div><span className={`status-pill ${money.rentalBalance<=0?"confirmed":money.rentalPaid?"pending":"overdue"}`}>{balanceStatus(money.rentalPaid,money.rentalDue)}</span></div><div className="ledger-progress"><i style={{width:`${money.rentalDue?Math.min(100,money.rentalPaid/money.rentalDue*100):100}%`}}/></div><div className="ledger-facts"><span>Paid <b>{peso(money.rentalPaid)}</b></span><span>Due <b>{peso(money.rentalBalance)}</b></span></div><p>Due on or before {new Date(detail.start_date).toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"})}</p></div>
          <div className="payment-ledger-card deposit-ledger"><div className="ledger-card-head"><div><small>Refundable rental deposit</small><strong>{peso(money.depositDue)}</strong></div><span className={`status-pill ${money.depositBalance<=0?"confirmed":money.depositPaid?"pending":"overdue"}`}>{balanceStatus(money.depositPaid,money.depositDue)}</span></div><div className="ledger-progress"><i style={{width:`${money.depositDue?Math.min(100,money.depositPaid/money.depositDue*100):100}%`}}/></div><div className="ledger-facts"><span>Held <b>{peso(Math.max(0,money.depositPaid-money.refunded))}</b></span><span>Due <b>{peso(money.depositBalance)}</b></span></div><p>Due before item release · refunded or applied after return</p></div>
        </div>
        <div className="booking-payment-summary payment-total-strip">
          <div className="payment-summary-row"><span>Total amount due</span><strong>{peso(grandTotal)}</strong></div><div className="payment-summary-row"><span>Amount paid</span><strong className="paid-text">{peso(totalPaid)}</strong></div><div className={`payment-summary-row payment-summary-balance ${isPaid?"fully-paid":""}`}><span>Outstanding balance</span><strong>{peso(balance)}</strong></div>
        </div>
      </div>

      <div className="booking-modal-section">
        <div className="booking-section-header"><strong>Items</strong></div>
        <div className="booking-items-list">{detail.items.map(x=><div className="booking-item-row" key={x.id}><div className="booking-item-info"><strong>{x.item_name}</strong><small>{x.quantity} pieces · {peso(Number(x.daily_price))}/day · {x.rental_days} days</small><small>Delivery: {peso(Number(x.delivery_fee_per_piece||0))} × {x.quantity} = {peso(Number(x.line_delivery_total||0))}</small></div><span className="booking-item-subtotal">{peso(Number(x.line_rental_total)+Number(x.line_deposit_total)+Number(x.line_delivery_total||0))}</span></div>)}</div>
      </div>
      <div className="booking-modal-section">
        <div className="booking-section-header"><strong>Actions</strong></div>
        <div className="booking-actions-group">
          <div className="booking-actions-label">Workflow</div>
          <div className="booking-actions">
            {detail.status==="pending"&&<><button className="primary-button" disabled={busy} onClick={()=>window.confirm("Approve this booking?")&&act(`/admin/bookings/${detail.id}/status`,{status:"confirmed"})}>Approve Booking</button><button className="secondary-button danger" onClick={()=>window.confirm("Reject this booking? This ends its workflow.")&&act(`/admin/bookings/${detail.id}/status`,{status:"rejected"})}>Reject Booking</button></>}
            {["pending","confirmed","ready"].includes(detail.status)&&<button className="secondary-button" onClick={reschedule}>Reschedule Date</button>}
            {detail.status==="confirmed"&&<button className="primary-button" onClick={()=>act(`/admin/bookings/${detail.id}/status`,{status:"ready"})}>Mark as Ready</button>}
            {detail.status==="ready"&&<button className="primary-button" onClick={()=>window.confirm("Mark this booking as Rented? The items will remain reserved until they are returned.")&&act(`/admin/bookings/${detail.id}/status`,{status:"rented",note:detail.fulfillment==="pickup"?"Items picked up by customer":"Items delivered to customer"})}>{detail.fulfillment==="pickup"?"Confirm Pickup · Rented":"Mark as Rented"}</button>}
            {["rented","overdue"].includes(detail.status)&&<button className="primary-button" onClick={openInspect}>Return Item</button>}
            {detail.status==="returned"&&detail.inspection&&<button className="primary-button" onClick={()=>api(`/admin/bookings/${detail.id}/complete`,{method:"POST",body:JSON.stringify({})}).then(()=>{open(detail.id);load()}).catch(e=>setError(e.message))}>Mark Complete</button>}
          </div>
        </div>
        <div className="booking-actions-group">
          <div className="booking-actions-label">Payments</div>
          <div className="booking-actions">
            <button className="primary-button" onClick={openPaymentModal}>Add Payment</button>
            <button className="secondary-button" disabled={sendingInvoice||!detail.customer_email} title={detail.customer_email?"":"This booking has no customer email on file"} onClick={sendInvoice}>{sendingInvoice?"Sending...":invoiceSent?"Sent ✓":"Email Invoice"}</button>
          </div>
        </div>
        <div className="booking-actions-group">
          <div className="booking-actions-label">Manage</div>
          <div className="booking-actions">
            {!["cancelled","rejected","completed","returned"].includes(detail.status)&&<button className="secondary-button danger" onClick={()=>act(`/admin/bookings/${detail.id}/status`,{status:"cancelled"})}>✕ Cancel Booking</button>}
            {isAdminUser()&&!(detail.payments||[]).length&&<button className="danger-button" onClick={()=>setDeleteBookingTarget(detail)}>Delete Booking</button>}
          </div>
        </div>
      </div>
      <div className="booking-modal-section">
        <div className="booking-section-header"><strong>Payments</strong></div>
        {detail.payments.length?<div className="booking-payments-list">{detail.payments.map(p=><div className="booking-payment-row" key={p.id}><div className="booking-payment-info"><strong>{p.payment_type==="refund"?"−":""}{peso(Number(p.amount))}</strong><small>{p.payment_type} · {p.method}{p.notes?` · ${p.notes}`:""}</small></div><div className="booking-payment-actions"><span className={`status-pill ${p.status==="completed"?"confirmed":"pending"}`}>{p.status}</span><button className="mini-button" onClick={()=>openInvoice(detail,business)}>Invoice</button></div></div>)}</div>:<div className="booking-empty-state">No payments recorded yet.</div>}
      </div>
      <div className="booking-modal-section">
        <div className="booking-section-header"><strong>Status History</strong></div>
        <div className="booking-timeline">{detail.history.map((h,i)=><div className="booking-timeline-item" key={h.id}><div className="booking-timeline-dot"></div><div className="booking-timeline-content"><strong>{h.to_status}</strong><small>{new Date(h.created_at).toLocaleString()}{h.changed_by?` · ${h.changed_by}`:""}</small></div></div>)}</div>
      </div>
    </div></div>})()}

    {showPaymentModal&&detail&&<div className="modal-backdrop" onClick={()=>setShowPaymentModal(false)}><div className="modal payment-modal" onClick={e=>e.stopPropagation()}>
      <button className="booking-modal-close" onClick={()=>setShowPaymentModal(false)}>×</button>
      <div className="payment-modal-header">
        <span className="eyebrow">Record Payment</span>
        <h2>{detail.booking_no}</h2>
        <p>{detail.customer_name}</p>
      </div>
      <div className="payment-modal-balance">
        <div className="payment-balance-row"><span>Total amount</span><strong>{peso(Number(detail.grand_total))}</strong></div>
        <div className="payment-balance-row"><span>Already paid</span><strong>{peso((detail.payments||[]).filter(p=>p.status==="completed").reduce((s,p)=>s+Number(p.amount||0),0))}</strong></div>
        <div className="payment-balance-row payment-balance-due"><span>Balance due</span><strong>{peso(Number(detail.grand_total)-(detail.payments||[]).filter(p=>p.status==="completed").reduce((s,p)=>s+Number(p.amount||0),0))}</strong></div>
      </div>
      <div className="payment-modal-form">
        <label className="payment-label">Payment type
          <div className="payment-type-grid">
            {[{id:"rental",label:"Rental fee"},{id:"deposit",label:"Rental deposit"},{id:"delivery",label:"Delivery"},{id:"other",label:"Other"},{id:"refund",label:"Deposit refund"}].map(t=><button type="button" key={t.id} className={`payment-type-btn ${paymentForm.payment_type===t.id?"active":""}`} onClick={()=>{const m=paymentBreakdown(detail);setPaymentForm({...paymentForm,payment_type:t.id,amount:String(t.id==="deposit"?m.depositBalance:t.id==="rental"?m.rentalBalance:paymentForm.amount)})}}><strong>{t.label}</strong></button>)}
          </div>
        </label>
        <label className="payment-label">Payment method
          <div className="payment-method-grid">
            {[{id:"cash",label:"Cash"},{id:"gcash",label:"GCash"},{id:"bank_transfer",label:"Bank"},{id:"other",label:"Other"}].map(m=><button type="button" key={m.id} className={`payment-method-btn ${paymentForm.method===m.id?"active":""}`} onClick={()=>setPaymentForm({...paymentForm,method:m.id})}><strong>{m.label}</strong></button>)}
          </div>
        </label>
        <label className="payment-label">Amount
          <div className="payment-amount-wrap"><span className="payment-currency">₱</span><input type="number" min="1" value={paymentForm.amount} onChange={e=>setPaymentForm({...paymentForm,amount:e.target.value})} placeholder="0.00" className="payment-amount-input"/></div>
        </label>
        <label className="payment-label">Notes (optional)
          <input type="text" value={paymentForm.notes} onChange={e=>setPaymentForm({...paymentForm,notes:e.target.value})} placeholder="Add a note about this payment..." className="payment-notes-input"/>
        </label>
      </div>
      <div className="payment-modal-footer">
        <button className="secondary-button" onClick={()=>setShowPaymentModal(false)}>Cancel</button>
        <button className="primary-button" disabled={paymentSubmitting||!paymentForm.amount||Number(paymentForm.amount)<=0} onClick={submitPayment}>{paymentSubmitting?"Processing...":`Confirm ${peso(Number(paymentForm.amount||0))}`}</button>
      </div>
    </div></div>}

    {deleteBookingTarget&&<div className="modal-backdrop" onClick={()=>setDeleteBookingTarget(null)}><div className="modal confirm-modal" onClick={e=>e.stopPropagation()}>
      <div className="confirm-modal-icon">🗑</div>
      <h3>Delete Booking</h3>
      <p>Are you sure you want to delete <strong>{deleteBookingTarget.booking_no}</strong>?</p>
      <small>This will permanently remove the booking, all its payments, and status history. This action cannot be undone.</small>
      <div className="confirm-modal-actions">
        <button className="secondary-button" onClick={()=>setDeleteBookingTarget(null)}>Cancel</button>
        <button className="danger-button" disabled={deletingBooking} onClick={deleteBooking}>{deletingBooking?"Deleting...":"Delete Booking"}</button>
      </div>
    </div></div>}

    {showInspectModal&&detail&&<div className="modal-backdrop" onClick={()=>setShowInspectModal(false)}><div className="modal inspect-modal" onClick={e=>e.stopPropagation()}>
      <button className="booking-modal-close" onClick={()=>setShowInspectModal(false)}>×</button>
      <div className="inspect-modal-header">
        <span className="eyebrow">Return Item</span>
        <h2>{detail.booking_no}</h2>
        <p>{detail.customer_name}</p>
      </div>
      <div className="inspect-modal-items">
        <div className="inspect-items-label">Items to inspect</div>
        <div className="inspect-items-list">{detail.items.map(x=><div className="inspect-item-row" key={x.id}><strong>{x.item_name}</strong><small>× {x.quantity}</small></div>)}</div>
      </div>
      <div className="inspect-modal-form">
        <label className="inspect-label">Condition after return
          <div className="condition-grid">
            {[{id:"Excellent",label:"Excellent"},{id:"Good",label:"Good"},{id:"Fair",label:"Fair"},{id:"Poor",label:"Poor"}].map(c=><button type="button" key={c.id} className={`condition-btn ${inspectForm.condition===c.id?"active":""}`} onClick={()=>setInspectForm({...inspectForm,condition:c.id})}><strong>{c.label}</strong></button>)}
          </div>
        </label>
        <label className="inspect-label">Damage charge
          <div className="inspect-amount-wrap"><span className="inspect-currency">₱</span><input type="number" min="0" value={inspectForm.damage_charge} onChange={e=>setInspectForm({...inspectForm,damage_charge:e.target.value})} placeholder="0.00" className="inspect-amount-input"/></div>
        </label>
        <label className="inspect-label inspect-toggle-label">
          <div className="inspect-toggle-info">
            <strong>Requires maintenance?</strong>
            <small>Mark if item needs repair or cleaning</small>
          </div>
          <button type="button" className={`inspect-toggle ${inspectForm.maintenance_required?"active":""}`} onClick={()=>setInspectForm({...inspectForm,maintenance_required:!inspectForm.maintenance_required})}>
            <span className="inspect-toggle-knob"></span>
          </button>
        </label>
      </div>
      <div className="inspect-modal-footer">
        <button className="secondary-button" onClick={()=>setShowInspectModal(false)}>Cancel</button>
        <button className="primary-button" disabled={inspectSubmitting||!inspectForm.condition} onClick={submitInspect}>{inspectSubmitting?"Processing...":"Confirm Return"}</button>
      </div>
    </div></div>}
  </AdminShell>
}
