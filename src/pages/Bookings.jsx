import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, API_BASE } from "../lib/api";
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
import { isOverdueBooking, stageByKey } from "../lib/bookingStages";
import { useDiscardGuard } from "../components/DiscardGuard";

const BLANK_INSPECT={condition:"Good",damage_charge:"0",maintenance_required:false};
const DEFAULT_GCASH_INSTRUCTIONS = "Please scan the attached GCash QR code and pay the rental total shown in this email. After payment, open Check Status on the Bloom & Borrow website and upload your payment screenshot for review.";
const BOOKINGS_PER_PAGE = 10;

export function Bookings() {
  const navigate=useNavigate();
  const [searchParams]=useSearchParams();
  const stage=stageByKey(searchParams.get("stage"));
  const [rows,setRows]=useState([]);
  const [detail,setDetail]=useState(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [search,setSearch]=useState("");
  const [statusFilter,setStatusFilter]=useState("All");
  const [page,setPage]=useState(1);
  const [showPaymentModal,setShowPaymentModal]=useState(false);
  const [paymentForm,setPaymentForm]=useState({amount:"",method:"cash",payment_type:"rental",notes:""});
  const [paymentSubmitting,setPaymentSubmitting]=useState(false);
  const [deleteBookingTarget,setDeleteBookingTarget]=useState(null);
  const [deletingBooking,setDeletingBooking]=useState(false);
  const [showInspectModal,setShowInspectModal]=useState(false);
  const [inspectForm,setInspectForm]=useState(BLANK_INSPECT);
  const [inspectSubmitting,setInspectSubmitting]=useState(false);
  const [sendingInvoice,setSendingInvoice]=useState(false);
  const [invoiceSent,setInvoiceSent]=useState(false);
  const [invoiceConfirm,setInvoiceConfirm]=useState(false);
  const [rentConfirm,setRentConfirm]=useState(false);
  const [approveConfirm,setApproveConfirm]=useState(false);
  const [rejectConfirm,setRejectConfirm]=useState(false);
  const [rejectReason,setRejectReason]=useState("");
  const [showGcashModal,setShowGcashModal]=useState(false);
  const [gcashQr,setGcashQr]=useState(null);
  const [gcashInstructions,setGcashInstructions]=useState(DEFAULT_GCASH_INSTRUCTIONS);
  const [gcashError,setGcashError]=useState("");
  const [sendingGcash,setSendingGcash]=useState(false);
  const [sendingStatusEmail,setSendingStatusEmail]=useState(false);
  const [proofReviewMode,setProofReviewMode]=useState(null);
  const [proofReviewForm,setProofReviewForm]=useState({verified_amount:"",gcash_reference:"",review_note:""});
  const [proofReviewError,setProofReviewError]=useState("");
  const [proofReviewSubmitting,setProofReviewSubmitting]=useState(false);
  const [showDeliveryQuote,setShowDeliveryQuote]=useState(false);
  const [deliveryQuote,setDeliveryQuote]=useState("");
  const [deliveryQuoteError,setDeliveryQuoteError]=useState("");
  const [deliveryQuoteSubmitting,setDeliveryQuoteSubmitting]=useState(false);
  // Each form modal remembers how it looked when opened, so closing it only
  // asks for confirmation when something was actually entered or changed.
  const [paymentBaseline,setPaymentBaseline]=useState("");
  const [proofBaseline,setProofBaseline]=useState("");
  const paymentGuard=useDiscardGuard(showPaymentModal&&JSON.stringify(paymentForm)!==paymentBaseline,()=>setShowPaymentModal(false));
  const inspectGuard=useDiscardGuard(showInspectModal&&JSON.stringify(inspectForm)!==JSON.stringify(BLANK_INSPECT),()=>setShowInspectModal(false));
  const gcashGuard=useDiscardGuard(showGcashModal&&(Boolean(gcashQr)||gcashInstructions!==DEFAULT_GCASH_INSTRUCTIONS),()=>setShowGcashModal(false));
  const proofGuard=useDiscardGuard(Boolean(proofReviewMode)&&JSON.stringify(proofReviewForm)!==proofBaseline,()=>setProofReviewMode(null));
  const [actionNotice,setActionNotice]=useState("");
  const business=useBusinessProfile();

  const load=()=>api("/admin/bookings").then(d=>{setRows(d.bookings||[]);window.dispatchEvent(new Event("bb:bookings-changed"))}).catch(e=>setError(e.message));
  React.useEffect(()=>{load()},[]);
  const open=async(id)=>{setError("");setActionNotice("");setInvoiceSent(false);try{setDetail((await api(`/admin/bookings/${id}`)).booking)}catch(e){setError(e.message)}};
  const act=async(path,body={})=>{setBusy(true);setError("");try{const data=await api(path,{method:"PATCH",body:JSON.stringify(body)});if(detail)await open(detail.id);await load();setActionNotice(data.message||"Booking updated successfully.")}catch(e){setError(e.message)}finally{setBusy(false)}};

  const sendInvoice=async()=>{
    setSendingInvoice(true);setError("");
    try{
      await api(`/admin/bookings/${detail.id}/send-invoice`,{method:"POST",body:JSON.stringify({})});
      setInvoiceSent(true);
      setTimeout(()=>setInvoiceSent(false),3000);
    }catch(e){setError(`Could not send invoice: ${e.message}`)}
    finally{setSendingInvoice(false)}
  };

  const openGcashModal=()=>{
    setGcashQr(null);
    setGcashInstructions(DEFAULT_GCASH_INSTRUCTIONS);
    setGcashError("");
    setShowGcashModal(true);
  };

  const sendGcashInstructions=async()=>{
    if(!detail||!gcashQr)return setGcashError("Choose the GCash QR code image to send.");
    if(!gcashInstructions.trim())return setGcashError("Add the payment instructions for the customer.");
    setSendingGcash(true);setGcashError("");
    try{
      const body=new FormData();
      body.append("qr_code",gcashQr);
      body.append("instructions",gcashInstructions.trim());
      await api(`/admin/bookings/${detail.id}/send-gcash-instructions`,{method:"POST",body});
      setShowGcashModal(false);
      await open(detail.id);
    }catch(e){setGcashError(e.message)}
    finally{setSendingGcash(false)}
  };

  const openProofReview=mode=>{
    const outstanding=paymentBreakdown(detail).outstanding;
    setProofReviewMode(mode);
    setProofReviewError("");
    const form={verified_amount:mode==="approve"?String(outstanding):"",gcash_reference:"",review_note:""};
    setProofReviewForm(form);
    setProofBaseline(JSON.stringify(form));
  };

  const submitProofReview=async()=>{
    if(!detail||!proofReviewMode)return;
    if(proofReviewMode==="approve"&&Number(proofReviewForm.verified_amount)<=0)return setProofReviewError("Enter the amount confirmed in the GCash transaction.");
    if(proofReviewMode==="approve"&&!proofReviewForm.gcash_reference.trim())return setProofReviewError("Enter the GCash reference number before approving.");
    if(proofReviewMode==="reject"&&!proofReviewForm.review_note.trim())return setProofReviewError("Explain why the screenshot cannot be approved. The customer will see this reason.");
    setProofReviewSubmitting(true);setProofReviewError("");
    try{
      const data=await api(`/admin/bookings/${detail.id}/payment-proof/review`,{method:"PATCH",body:JSON.stringify({
        action:proofReviewMode,
        verified_amount:proofReviewMode==="approve"?Number(proofReviewForm.verified_amount):undefined,
        gcash_reference:proofReviewMode==="approve"?proofReviewForm.gcash_reference.trim():"",
        review_note:proofReviewForm.review_note.trim()
      })});
      const bookingId=detail.id;
      setProofReviewMode(null);
      await open(bookingId);
      await load();
      setActionNotice([data.message,data.email_warning].filter(Boolean).join(" "));
    }catch(e){setProofReviewError(e.message)}
    finally{setProofReviewSubmitting(false)}
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
    const form={amount:String(balances.rentalBalance||balances.depositBalance||0),method:detail.payment_method||"cash",payment_type:balances.rentalBalance>0?"rental":"deposit",notes:""};
    setPaymentForm(form);
    setPaymentBaseline(JSON.stringify(form));
    setShowPaymentModal(true);
  };

  const openDeliveryQuote=()=>{
    setDeliveryQuote(detail?.delivery_fee_confirmed_at?String(Number(detail.delivery_fee||0)):String(business?.delivery_fee||""));
    setDeliveryQuoteError("");
    setShowDeliveryQuote(true);
  };

  const submitDeliveryQuote=async amountOverride=>{
    const amount=amountOverride===undefined?Number(deliveryQuote):Number(amountOverride);
    if(!Number.isFinite(amount)||amount<0)return setDeliveryQuoteError("Enter a valid delivery fee, or choose Confirm free delivery.");
    setDeliveryQuoteSubmitting(true);setDeliveryQuoteError("");
    try{
      const data=await api(`/admin/bookings/${detail.id}/delivery-fee`,{method:"PATCH",body:JSON.stringify({amount})});
      setShowDeliveryQuote(false);
      await open(detail.id);await load();
      setActionNotice(data.message);
    }catch(e){setDeliveryQuoteError(e.message)}finally{setDeliveryQuoteSubmitting(false)}
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

  const resendStatusEmail=async()=>{
    if(!detail)return;
    setSendingStatusEmail(true);setError("");
    try{
      const data=await api(`/admin/bookings/${detail.id}/send-status-email`,{method:"POST",body:JSON.stringify({})});
      const bookingId=detail.id;
      await open(bookingId);
      setActionNotice(data.message);
    }catch(e){setError(`Could not send status email: ${e.message}`)}
    finally{setSendingStatusEmail(false)}
  };

  const reschedule=async()=>{const start=window.prompt("New start date (YYYY-MM-DD):",String(detail.start_date).slice(0,10));if(!start)return;const end=window.prompt("New end date (YYYY-MM-DD):",String(detail.end_date).slice(0,10));if(!end)return;await act(`/admin/bookings/${detail.id}/reschedule`,{start_date:start,end_date:end})};
  const openInspect=()=>{setInspectForm(BLANK_INSPECT);setShowInspectModal(true)};
  const submitInspect=async()=>{setInspectSubmitting(true);try{const data=await api(`/admin/bookings/${detail.id}/return-inspection`,{method:"POST",body:JSON.stringify({condition_after:inspectForm.condition,damage_charge:Number(inspectForm.damage_charge),maintenance_required:inspectForm.maintenance_required})});setShowInspectModal(false);if(inspectForm.maintenance_required){navigate("/admin/maintenance")}else{const bookingId=detail.id;await open(bookingId);await load();setActionNotice(data.message||"Return inspection recorded.")}}catch(e){setError(e.message)}finally{setInspectSubmitting(false)}};

  const completeRental=async()=>{
    setBusy(true);setError("");
    try{
      const data=await api(`/admin/bookings/${detail.id}/complete`,{method:"POST",body:JSON.stringify({})});
      const bookingId=detail.id;
      await open(bookingId);await load();setActionNotice(data.message||"Rental completed.");
    }catch(e){setError(e.message)}finally{setBusy(false)}
  };

  // A stage (sidebar submenu) narrows the same bookings list; the dropdown then
  // only offers that stage's statuses.
  const stageRows=stage?rows.filter(b=>stage.statuses.includes(b.status)):rows;
  const statuses=["All",...(stage?stage.statuses:["pending","confirmed","ready","rented","overdue","returned","completed","cancelled","rejected"])];
  const statusCounts=Object.fromEntries(statuses.map(s=>[s,s==="All"?stageRows.length:stageRows.filter(b=>b.status===s).length]));
  React.useEffect(()=>{setStatusFilter("All");setPage(1)},[stage?.key]);
  const filtered=stageRows.filter(b=>{
    const matchSearch=(b.booking_no||"").toLowerCase().includes(search.toLowerCase())||(b.customer_name||"").toLowerCase().includes(search.toLowerCase());
    const matchStatus=statusFilter==="All"||b.status===statusFilter;
    return matchSearch&&matchStatus;
  });
  const sorts={
    newest:{label:"Newest booking",get:b=>Number(b.id)||0},
    start_date:{label:"Start date",get:b=>Date.parse(b.start_date)||0},
    end_date:{label:"End date",get:b=>Date.parse(b.end_date)||0},
    booking_no:{label:"Booking #",get:b=>b.booking_no||""},
    customer_name:{label:"Customer",get:b=>b.customer_name||""},
    grand_total:{label:"Total",get:b=>Number(b.grand_total)||0},
    status:{label:"Status",get:b=>b.status||""}
  };
  const {sortKey,sortDir,setSort}=useSort("start_date","desc",{newest:"desc"});
  const sorted=sortRows(filtered,sorts,sortKey,sortDir);
  const pageCount=Math.max(1,Math.ceil(sorted.length/BOOKINGS_PER_PAGE));
  const currentPage=Math.min(page,pageCount);
  const pageStart=(currentPage-1)*BOOKINGS_PER_PAGE;
  const visibleRows=sorted.slice(pageStart,pageStart+BOOKINGS_PER_PAGE);
  const [view,setView]=useViewMode("bb.view.bookings");

  React.useEffect(()=>{
    if(page>pageCount)setPage(pageCount);
  },[page,pageCount]);

  const changeSort=key=>{
    setPage(1);
    setSort(key);
  };

  const stats={
    total:rows.length,
    pending:rows.filter(b=>b.status==="pending").length,
    active:rows.filter(b=>["confirmed","ready","rented"].includes(b.status)).length,
    overdue:rows.filter(b=>b.status==="overdue").length,
    revenue:rows.filter(b=>["completed","returned"].includes(b.status)).reduce((s,b)=>s+Number(b.grand_total||0),0)
  };

  return <AdminShell title={stage?.title||"Booking Management"} subtitle="Approve, reject, reschedule, collect payment, return and complete rentals.">
    {error&&<div className="login-error">{error}</div>}

    <section className="kpi-grid">
      <Kpi index={0} label="Total bookings" value={stats.total} detail="All time"/>
      <Kpi index={1} label="Pending" value={stats.pending} detail="Awaiting approval"/>
      <Kpi index={2} label="Active" value={stats.active} detail="Confirmed / ready / rented"/>
      <Kpi index={3} label="Overdue" value={stats.overdue} detail="Needs attention"/>
    </section>

    <div className="admin-page-toolbar">
      <div className="admin-search">
        <span>⌕</span>
        <input placeholder="Search by booking # or customer..." value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}}/>
      </div>
      <div className="admin-toolbar-controls booking-filter-group">
        <button className="primary-button" onClick={()=>navigate("/admin/bookings/new")}>+ Add Booking</button>
        <select className="booking-status-select" value={statusFilter} onChange={e=>{setStatusFilter(e.target.value);setPage(1)}}>
          {statuses.map(s=><option key={s} value={s}>{s==="All"?(stage?"All in this stage":"All Status"):s.charAt(0).toUpperCase()+s.slice(1)} ({statusCounts[s]})</option>)}
        </select>
        <SortControls sorts={sorts} sortKey={sortKey} sortDir={sortDir} setSort={changeSort}/>
        <ViewToggle view={view} onChange={setView}/>
      </div>
    </div>

    <section className="admin-card">
      {filtered.length===0?<div className="inventory-empty">
        <span>📭</span>
        <h3>No bookings found</h3>
        <p>{search||statusFilter!=="All"?"Try adjusting your search or filter.":"No bookings have been made yet."}</p>
      </div>:<>{view==="table"?<div className="table-wrap"><table>
        <thead><tr><th>Booking</th><th>Customer</th><th>Items</th><th>Dates</th><th>Payment</th><th>Status</th><th className="num">Total</th><th></th></tr></thead>
        <tbody>{visibleRows.map(b=><tr key={b.id} className={`row-clickable${isOverdueBooking(b)?" row-overdue":""}`} onClick={()=>open(b.id)}>
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
        {visibleRows.map(b=><article className={`booking-card${isOverdueBooking(b)?" is-overdue":""}`} key={b.id} onClick={()=>open(b.id)}>
          <div className="booking-card-top">
            <div className="booking-card-id">
              <div><strong>{b.booking_no}</strong><small>{b.customer_name}</small></div>
            </div>
            <span className={`status-pill ${b.status==="pending"?"pending":b.status==="overdue"?"overdue":b.status==="cancelled"||b.status==="rejected"?"overdue":"confirmed"}`}>{b.status}</span>
          </div>
          <div className="booking-card-body">
            <div className="booking-card-info"><small>{b.items||"—"}</small></div>
            <div className="booking-card-info"><small>{new Date(b.start_date).toLocaleDateString("en-PH",{month:"short",day:"numeric"})} → {new Date(b.end_date).toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"})}</small></div>
            <div className={`booking-card-info ${b.payment_status==="paid"?"payment-paid":b.payment_status==="partial"?"payment-partial":""}`}><small>{b.payment_status==="paid"?"Paid in full":b.payment_status==="partial"?"Partial payment":b.payment_status||"Unpaid"}</small></div>
          </div>
          <div className="booking-card-footer">
            <span className="booking-card-total">{peso(Number(b.grand_total))}</span>
            <button className="mini-button">Manage →</button>
          </div>
        </article>)}
      </div>}
      <nav className="list-pagination" aria-label="Bookings pagination">
        <span className="list-pagination-summary">Showing {pageStart+1}&ndash;{Math.min(pageStart+BOOKINGS_PER_PAGE,sorted.length)} of {sorted.length} bookings</span>
        <div className="list-pagination-controls">
          <button type="button" disabled={currentPage===1} onClick={()=>setPage(currentPage-1)} aria-label="Previous bookings page">&larr; Previous</button>
          <span>Page {currentPage} of {pageCount}</span>
          <button type="button" disabled={currentPage===pageCount} onClick={()=>setPage(currentPage+1)} aria-label="Next bookings page">Next &rarr;</button>
        </div>
      </nav></>}
    </section>

    {detail&&(()=>{
      const money=paymentBreakdown(detail);
      const totalPaid=money.totalPaid;
      const grandTotal=money.totalDue;
      const balance=money.outstanding;
      const isPaid=balance<=0;
      const isPartial=totalPaid>0&&!isPaid;
      const deliveryAddress=[detail.delivery_address,detail.city,detail.province,detail.postal_code].filter(Boolean).join(", ");
      const mapsUrl=`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(deliveryAddress)}`;

      return <div className="modal-backdrop booking-drawer-backdrop" onClick={()=>setDetail(null)}><div className="modal booking-modal" role="dialog" aria-modal="true" aria-labelledby="booking-detail-title" onClick={e=>e.stopPropagation()}>
      <button className="booking-modal-close" onClick={()=>setDetail(null)} aria-label="Close booking details">×</button>
      <div className="booking-modal-header">
        <div className="booking-modal-customer">
          <div><span className="eyebrow">{detail.booking_no}{detail.id_document_path&&" · Customer request"}</span><h2 id="booking-detail-title">{detail.customer_name}</h2><p>{detail.customer_email} · {detail.customer_phone}</p></div>
        </div>
      </div>

      {actionNotice&&<div className="booking-action-feedback" role="status">{actionNotice}</div>}

      {isPaid&&<div className="booking-paid-banner"><span className="paid-banner-icon">✓</span><div><strong>Payment Complete</strong><small>Customer has fully paid this booking</small></div></div>}
      {!isPaid&&isPartial&&<div className="booking-partial-banner"><span className="partial-banner-icon">⏳</span><div><strong>Partial Payment</strong><small>{peso(totalPaid)} paid — {peso(balance)} balance remaining</small></div></div>}
      {!isPaid&&!isPartial&&<div className="booking-unpaid-banner"><span className="unpaid-banner-icon">!</span><div><strong>Unpaid</strong><small>{peso(grandTotal)} total amount due</small></div></div>}

      <div className="booking-detail-grid">
        <div className="booking-stat-card"><div><small>Status</small><b>{detail.status}</b></div></div>
        <div className="booking-stat-card"><div><small>Payment</small><b>{detail.payment_status} · {detail.payment_method}</b></div></div>
        <div className="booking-stat-card"><div><small>Dates</small><b>{new Date(detail.start_date).toLocaleDateString("en-PH",{month:"short",day:"numeric"})} → {new Date(detail.end_date).toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"})}</b></div></div>
        <div className="booking-stat-card"><div><small>Total</small><b>{peso(grandTotal)}</b></div></div>
      </div>

      {detail.fulfillment==="delivery"&&<div className={`booking-delivery-review ${detail.delivery_fee_confirmed_at?"is-confirmed":"is-pending"}`}>
        <div className="booking-delivery-head">
          <div><small>Delivery review</small><strong>{detail.delivery_fee_confirmed_at?(Number(detail.delivery_fee)>0?`${peso(Number(detail.delivery_fee))} confirmed`:"Free delivery confirmed"):"Fee not reviewed"}</strong></div>
          <span>{detail.delivery_fee_confirmed_at?"Ready for approval":"Required before approval"}</span>
        </div>
        <div className="booking-delivery-address"><small>Customer address</small><p>{deliveryAddress||"No complete address provided"}</p></div>
        <p className="booking-delivery-zone"><strong>Free-delivery reference:</strong> {business?.free_delivery_area||"Biclatan, General Trias, Cavite and verified nearby areas"}</p>
        <div className="booking-delivery-actions">
          {deliveryAddress&&<a className="secondary-button" href={mapsUrl} target="_blank" rel="noreferrer">Open in Maps</a>}
          {detail.status==="pending"&&<button type="button" className="primary-button" onClick={openDeliveryQuote}>{detail.delivery_fee_confirmed_at?"Update delivery fee":"Review delivery fee"}</button>}
        </div>
      </div>}

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
            {detail.status==="pending"&&<><button className="primary-button" disabled={busy||(detail.fulfillment==="delivery"&&!detail.delivery_fee_confirmed_at)} title={detail.fulfillment==="delivery"&&!detail.delivery_fee_confirmed_at?"Review and confirm the delivery fee first":""} onClick={()=>setApproveConfirm(true)}>Approve Booking</button><button className="secondary-button danger" onClick={()=>{setRejectReason("");setRejectConfirm(true)}}>Reject Booking</button></>}
            {["pending","confirmed","ready"].includes(detail.status)&&<button className="secondary-button" onClick={reschedule}>Reschedule Date</button>}
            {detail.status==="confirmed"&&<button className="primary-button" onClick={()=>act(`/admin/bookings/${detail.id}/status`,{status:"ready"})}>Mark as Ready</button>}
            {detail.status==="ready"&&<button className="primary-button" onClick={()=>setRentConfirm(true)}>{detail.fulfillment==="pickup"?"Confirm Pickup · Rented":"Mark as Rented"}</button>}
            {["rented","overdue"].includes(detail.status)&&<button className="primary-button" onClick={openInspect}>Return Item</button>}
            {detail.status==="returned"&&detail.inspection&&<button className="primary-button" disabled={busy} onClick={completeRental}>Mark Complete</button>}
            <button className="secondary-button" disabled={sendingStatusEmail||!detail.customer_email} onClick={resendStatusEmail}>{sendingStatusEmail?"Sending Status Email…":"Email Current Status"}</button>
          </div>
          {detail.customer_email_delivery&&<p className={`customer-email-delivery ${detail.customer_email_delivery.status}`}><strong>Latest customer email: {detail.customer_email_delivery.status}</strong> · {detail.customer_email_delivery.title} · {new Date(detail.customer_email_delivery.created_at).toLocaleString()}</p>}
        </div>
        <div className="booking-actions-group">
          <div className="booking-actions-label">Payments</div>
          <div className="booking-actions">
            <button className="primary-button" onClick={openPaymentModal}>Add Payment</button>
            <button className="secondary-button" disabled={sendingInvoice||!detail.customer_email} title={detail.customer_email?"":"This booking has no customer email on file"} onClick={()=>setInvoiceConfirm(true)}>{sendingInvoice?"Sending...":invoiceSent?"Sent ✓":"Email Invoice"}</button>
            {detail.payment_method==="gcash"&&<button className="secondary-button" disabled={detail.status==="pending"||!detail.customer_email||["cancelled","rejected","completed"].includes(detail.status)} title={detail.status==="pending"?"Approve the request before sending payment instructions":!detail.customer_email?"This booking has no customer email on file":""} onClick={openGcashModal}>{detail.gcash_payment?.instructions_sent_at?"Resend GCash Instructions":"Send GCash Instructions"}</button>}
            {["submitted","approved","rejected"].includes(detail.gcash_payment?.proof_status)&&<a className="secondary-button" href={`${API_BASE}/admin/bookings/${detail.id}/payment-proof`} target="_blank" rel="noreferrer">View Payment Proof</a>}
            {detail.gcash_payment?.proof_status==="submitted"&&<><button className="primary-button" onClick={()=>openProofReview("approve")}>Approve Proof</button><button className="secondary-button danger" onClick={()=>openProofReview("reject")}>Reject Proof</button></>}
          </div>
          {detail.payment_method==="gcash"&&detail.gcash_payment?.instructions_sent_at&&<p className="booking-action-note">GCash instructions sent {new Date(detail.gcash_payment.instructions_sent_at).toLocaleString()}.</p>}
          {detail.gcash_payment?.proof_status==="submitted"&&<div className="payment-proof-review-state submitted"><strong>Awaiting Admin review</strong><span>Customer screenshot uploaded {new Date(detail.gcash_payment.proof_uploaded_at).toLocaleString()}.</span></div>}
          {detail.gcash_payment?.proof_status==="approved"&&<div className="payment-proof-review-state approved"><strong>Payment proof approved</strong><span>{peso(Number(detail.gcash_payment.verified_amount||0))} recorded{detail.gcash_payment.gcash_reference?` · Ref ${detail.gcash_payment.gcash_reference}`:""}{detail.gcash_payment.reviewed_by?` · ${detail.gcash_payment.reviewed_by}`:""}.</span></div>}
          {detail.gcash_payment?.proof_status==="rejected"&&<div className="payment-proof-review-state rejected"><strong>Replacement proof required</strong><span>{detail.gcash_payment.review_note} The customer can upload another screenshot from Check Status.</span></div>}
        </div>
        {detail.id_document_path&&<div className="booking-actions-group">
          <div className="booking-actions-label">Verification</div>
          <div className="booking-actions">
            <a className="secondary-button" href={`${API_BASE}/admin/bookings/${detail.id}/id-document`} target="_blank" rel="noreferrer">View Uploaded ID</a>
          </div>
          {detail.rental_terms_accepted_at&&<p className="booking-action-note">Rental terms {detail.rental_terms_version||""} accepted {new Date(detail.rental_terms_accepted_at).toLocaleString("en-PH")}.</p>}
        </div>}
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

    {showPaymentModal&&detail&&<div className="modal-backdrop" onClick={paymentGuard.requestClose}><div className="modal payment-modal" onClick={e=>e.stopPropagation()}>
      <button className="booking-modal-close" onClick={paymentGuard.requestClose}>×</button>
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
        <button className="secondary-button" onClick={paymentGuard.requestClose}>Cancel</button>
        <button className="primary-button" disabled={paymentSubmitting||!paymentForm.amount||Number(paymentForm.amount)<=0} onClick={submitPayment}>{paymentSubmitting?"Processing...":`Confirm ${peso(Number(paymentForm.amount||0))}`}</button>
      </div>
    </div></div>}

    {deleteBookingTarget&&<div className="modal-backdrop" onClick={()=>setDeleteBookingTarget(null)}><div className="modal confirm-modal" onClick={e=>e.stopPropagation()}>
      <h3>Delete Booking</h3>
      <p>Are you sure you want to delete <strong>{deleteBookingTarget.booking_no}</strong>?</p>
      <small>This will permanently remove the booking, all its payments, and status history. This action cannot be undone.</small>
      <div className="confirm-modal-actions">
        <button className="secondary-button" onClick={()=>setDeleteBookingTarget(null)}>Cancel</button>
        <button className="danger-button" disabled={deletingBooking} onClick={deleteBooking}>{deletingBooking?"Deleting...":"Delete Booking"}</button>
      </div>
    </div></div>}

    {invoiceConfirm&&detail&&<div className="modal-backdrop" onClick={()=>setInvoiceConfirm(false)}><div className="modal confirm-modal" onClick={e=>e.stopPropagation()}>
      <h3>Send Invoice Email</h3>
      <p>Send the invoice for <strong>{detail.booking_no}</strong> to <strong>{detail.customer_email}</strong>?</p>
      <div className="confirm-modal-actions">
        <button className="secondary-button" onClick={()=>setInvoiceConfirm(false)}>Cancel</button>
        <button className="primary-button" onClick={()=>{setInvoiceConfirm(false);sendInvoice()}}>Send</button>
      </div>
    </div></div>}

    {showGcashModal&&detail&&<div className="modal-backdrop" onClick={()=>!sendingGcash&&gcashGuard.requestClose()}><div className="modal confirm-modal gcash-email-modal" onClick={e=>e.stopPropagation()}>
      <h3>Send GCash Payment Email</h3>
      <p>Send the QR code and payment instructions for <strong>{detail.booking_no}</strong> to <strong>{detail.customer_email}</strong>.</p>
      <div className="gcash-email-total"><span>Rental total</span><strong>{peso(Number(detail.grand_total))}</strong></div>
      <label>GCash QR code
        <input type="file" accept="image/jpeg,image/png" onChange={e=>{setGcashError("");setGcashQr(e.target.files?.[0]||null)}} />
        <small>JPG or PNG · up to 5MB</small>
      </label>
      <label>Payment instructions
        <textarea rows="5" maxLength="2000" value={gcashInstructions} onChange={e=>setGcashInstructions(e.target.value)} />
      </label>
      {gcashError&&<div className="login-error">{gcashError}</div>}
      <div className="confirm-modal-actions">
        <button className="secondary-button" disabled={sendingGcash} onClick={gcashGuard.requestClose}>Cancel</button>
        <button className="primary-button" disabled={sendingGcash||!gcashQr||!gcashInstructions.trim()} onClick={sendGcashInstructions}>{sendingGcash?"Sending…":"Send Email"}</button>
      </div>
    </div></div>}

    {proofReviewMode&&detail&&<div className="modal-backdrop" onClick={()=>!proofReviewSubmitting&&proofGuard.requestClose()}><div className="modal gcash-review-modal" onClick={e=>e.stopPropagation()}>
      <div className="modal-head"><div><span className="eyebrow">GCash Verification</span><h2>{proofReviewMode==="approve"?"Approve Payment Proof":"Reject Payment Proof"}</h2></div><button type="button" disabled={proofReviewSubmitting} onClick={proofGuard.requestClose}>×</button></div>
      <p className="gcash-review-intro">Booking <strong>{detail.booking_no}</strong> · {detail.customer_name}</p>
      <a className="secondary-button gcash-review-proof-link" href={`${API_BASE}/admin/bookings/${detail.id}/payment-proof`} target="_blank" rel="noreferrer">Open submitted screenshot</a>
      {proofReviewMode==="approve"?<div className="gcash-review-fields">
        <label>Verified amount
          <div className="payment-amount-wrap"><span className="payment-currency">₱</span><input type="number" min="0.01" step="0.01" value={proofReviewForm.verified_amount} onChange={e=>setProofReviewForm({...proofReviewForm,verified_amount:e.target.value})}/></div>
          <small>Maximum remaining balance: {peso(paymentBreakdown(detail).outstanding)}</small>
        </label>
        <label>GCash reference number<input maxLength="120" value={proofReviewForm.gcash_reference} onChange={e=>setProofReviewForm({...proofReviewForm,gcash_reference:e.target.value})} placeholder="Enter the transaction reference"/></label>
        <label>Internal note <small>(optional)</small><textarea rows="3" maxLength="500" value={proofReviewForm.review_note} onChange={e=>setProofReviewForm({...proofReviewForm,review_note:e.target.value})} placeholder="Optional verification note"/></label>
        <p className="gcash-review-impact">Approval records the verified amount immediately. It is allocated to rental/service charges first, then the refundable deposit.</p>
      </div>:<div className="gcash-review-fields">
        <label>Reason shown to customer<textarea rows="4" maxLength="500" value={proofReviewForm.review_note} onChange={e=>setProofReviewForm({...proofReviewForm,review_note:e.target.value})} placeholder="Example: The screenshot is blurry and the transaction reference cannot be read."/></label>
        <p className="gcash-review-impact is-warning">No payment will be recorded. The customer will be asked to upload a clear replacement screenshot.</p>
      </div>}
      {proofReviewError&&<div className="login-error">{proofReviewError}</div>}
      <div className="modal-actions">
        <button className="secondary-button" disabled={proofReviewSubmitting} onClick={proofGuard.requestClose}>Cancel</button>
        <button className={proofReviewMode==="approve"?"primary-button":"danger-button"} disabled={proofReviewSubmitting} onClick={submitProofReview}>{proofReviewSubmitting?"Saving…":proofReviewMode==="approve"?"Approve and Record Payment":"Reject and Notify Customer"}</button>
      </div>
    </div></div>}

    {rentConfirm&&detail&&<div className="modal-backdrop" onClick={()=>setRentConfirm(false)}><div className="modal confirm-modal" onClick={e=>e.stopPropagation()}>
      <h3>Mark as Rented</h3>
      <p>Mark <strong>{detail.booking_no}</strong> as Rented? The items will remain reserved until they are returned.</p>
      <div className="confirm-modal-actions">
        <button className="secondary-button" onClick={()=>setRentConfirm(false)}>Cancel</button>
        <button className="primary-button" disabled={busy} onClick={()=>{setRentConfirm(false);act(`/admin/bookings/${detail.id}/status`,{status:"rented",note:detail.fulfillment==="pickup"?"Items picked up by customer":"Items delivered to customer"})}}>Confirm</button>
      </div>
    </div></div>}

    {showDeliveryQuote&&detail&&<div className="modal-backdrop" onClick={()=>!deliveryQuoteSubmitting&&setShowDeliveryQuote(false)}><div className="modal confirm-modal delivery-quote-modal" role="dialog" aria-modal="true" aria-labelledby="delivery-quote-title" onClick={e=>e.stopPropagation()}>
      <span className="eyebrow">Delivery review</span>
      <h3 id="delivery-quote-title">Confirm delivery fee</h3>
      <p>Check the customer's complete address and compare it with your free-delivery coverage before approving the booking.</p>
      <div className="delivery-quote-address"><small>Deliver to</small><strong>{[detail.delivery_address,detail.city,detail.province,detail.postal_code].filter(Boolean).join(", ")}</strong></div>
      <div className="delivery-quote-zone"><small>Free-delivery reference</small><span>{business?.free_delivery_area||"Biclatan, General Trias, Cavite and verified nearby areas"}</span></div>
      {deliveryQuoteError&&<div className="login-error" role="alert">{deliveryQuoteError}</div>}
      <label className="delivery-quote-field">Fee for this booking
        <div><span>₱</span><input type="number" min="0" step="0.01" value={deliveryQuote} onChange={e=>setDeliveryQuote(e.target.value)} placeholder="Enter amount"/></div>
        <small>Use ₱0 only after confirming that the address qualifies for free delivery.</small>
      </label>
      <div className="delivery-quote-free"><button type="button" className="secondary-button" disabled={deliveryQuoteSubmitting} onClick={()=>submitDeliveryQuote(0)}>Confirm free delivery</button><span>For verified Biclatan or nearby coverage.</span></div>
      <div className="confirm-modal-actions">
        <button type="button" className="secondary-button" disabled={deliveryQuoteSubmitting} onClick={()=>setShowDeliveryQuote(false)}>Cancel</button>
        <button type="button" className={`primary-button ${deliveryQuoteSubmitting?"is-loading":""}`} disabled={deliveryQuoteSubmitting||deliveryQuote===""} onClick={()=>submitDeliveryQuote()}>{deliveryQuoteSubmitting?"Saving…":"Save delivery fee"}</button>
      </div>
    </div></div>}

    {approveConfirm&&detail&&<div className="modal-backdrop" onClick={()=>setApproveConfirm(false)}><div className="modal confirm-modal" onClick={e=>e.stopPropagation()}>
      <h3>Approve Rental</h3>
      <p>Approve this rental request?</p>
      <div className="confirm-modal-actions">
        <button className="secondary-button" onClick={()=>setApproveConfirm(false)}>Cancel</button>
        <button className="primary-button" disabled={busy} onClick={()=>{setApproveConfirm(false);act(`/admin/bookings/${detail.id}/status`,{status:"confirmed"})}}>Approve</button>
      </div>
    </div></div>}

    {rejectConfirm&&detail&&<div className="modal-backdrop" onClick={()=>setRejectConfirm(false)}><div className="modal confirm-modal" onClick={e=>e.stopPropagation()}>
      <h3>Reject Rental</h3>
      <p>Reject this rental request? The customer will receive the reason below by email.</p>
      <label className="reject-reason-field">Reason shown to customer<textarea rows="3" maxLength="255" value={rejectReason} onChange={e=>setRejectReason(e.target.value)} placeholder="Example: Required ID details could not be verified."/></label>
      <div className="confirm-modal-actions">
        <button className="secondary-button" onClick={()=>setRejectConfirm(false)}>Cancel</button>
        <button className="danger-button" disabled={busy||!rejectReason.trim()} onClick={()=>{setRejectConfirm(false);act(`/admin/bookings/${detail.id}/status`,{status:"rejected",note:rejectReason.trim()})}}>Reject and Email Customer</button>
      </div>
    </div></div>}

    {showInspectModal&&detail&&<div className="modal-backdrop" onClick={inspectGuard.requestClose}><div className="modal inspect-modal" onClick={e=>e.stopPropagation()}>
      <button className="booking-modal-close" onClick={inspectGuard.requestClose}>×</button>
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
        <button className="secondary-button" onClick={inspectGuard.requestClose}>Cancel</button>
        <button className="primary-button" disabled={inspectSubmitting||!inspectForm.condition} onClick={submitInspect}>{inspectSubmitting?"Processing...":"Confirm Return"}</button>
      </div>
    </div></div>}
    {paymentGuard.discardDialog}
    {inspectGuard.discardDialog}
    {gcashGuard.discardDialog}
    {proofGuard.discardDialog}
  </AdminShell>
}
