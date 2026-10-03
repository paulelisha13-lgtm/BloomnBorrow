import React, { useState } from "react";
import { api } from "../lib/api";
import { Kpi } from "../components/Kpi";
import { ListPagination } from "../components/ListPagination";
import { AdminShell } from "../components/layout/AdminShell";
import { SortControls } from "../components/SortControls";
import { ViewToggle } from "../components/ViewToggle";
import { sortRows, useSort } from "../hooks/useSort";
import { usePagination } from "../hooks/usePagination";
import { useViewMode } from "../hooks/useViewMode";
import { useBusinessProfile } from "../hooks/useBusinessProfile";
import { peso } from "../lib/format";
import { openInvoice } from "../lib/invoice";
import { isAdminUser } from "../lib/roles";

export function Payments() {
  const [rows,setRows]=useState([]);
  const [error,setError]=useState("");
  const [search,setSearch]=useState("");
  const [typeFilter,setTypeFilter]=useState("All");
  const [statusFilter,setStatusFilter]=useState("All");
  const [expanded,setExpanded]=useState(null);
  const [voidTarget,setVoidTarget]=useState(null);
  const [voidReason,setVoidReason]=useState("");
  const [voiding,setVoiding]=useState(false);
  const [sendingInvoice,setSendingInvoice]=useState(null);
  const [sentInvoiceId,setSentInvoiceId]=useState(null);
  const [invoiceConfirm,setInvoiceConfirm]=useState(null);
  const business=useBusinessProfile();
  const canVoid=isAdminUser();

  const load=()=>api("/admin/payments").then(d=>setRows(d.payments||[])).catch(e=>setError(e.message));
  React.useEffect(()=>{load()},[]);

  // Payments are voided, never deleted, so the record and the reason stay on file.
  const voidPayment=async()=>{
    if(!voidTarget||!voidReason.trim())return;
    setVoiding(true);
    try{
      await api(`/admin/payments/${voidTarget.id}/void`,{method:"PATCH",body:JSON.stringify({reason:voidReason.trim()})});
      setVoidTarget(null);
      load();
    }catch(e){setError(e.message)}
    finally{setVoiding(false)}
  };

  const filtered=rows.filter(p=>{
    const matchSearch=(p.booking_no||"").toLowerCase().includes(search.toLowerCase())||(p.customer_name||"").toLowerCase().includes(search.toLowerCase());
    const matchType=typeFilter==="All"||p.payment_type===typeFilter;
    const matchStatus=statusFilter==="All"||p.status===statusFilter;
    return matchSearch&&matchType&&matchStatus;
  });

  const grouped=React.useMemo(()=>{
    const map=new Map();
    filtered.forEach(p=>{
      const key=p.booking_id;
      if(!map.has(key)){
        map.set(key,{booking_id:key,booking_no:p.booking_no,customer_name:p.customer_name,customer_email:p.customer_email,payments:[],totalPaid:0,latestDate:p.created_at,hasPending:false,hasRefund:false,primaryMethod:p.method});
      }
      const g=map.get(key);
      g.payments.push(p);
      if(p.status==="completed"){
        g.totalPaid+=(p.payment_type==="refund"?-1:1)*Number(p.amount);
      }
      if(p.status==="pending")g.hasPending=true;
      if(p.payment_type==="refund")g.hasRefund=true;
      if(new Date(p.created_at)>new Date(g.latestDate))g.latestDate=p.created_at;
      if(p.status==="completed")g.primaryMethod=p.method;
    });
    return Array.from(map.values());
  },[filtered]);

  const sorts={
    latestDate:{label:"Latest activity",get:g=>Date.parse(g.latestDate)||0},
    booking_no:{label:"Booking #",get:g=>g.booking_no||""},
    customer_name:{label:"Customer",get:g=>g.customer_name||""},
    totalPaid:{label:"Amount",get:g=>Number(g.totalPaid)||0},
    count:{label:"# payments",get:g=>g.payments.length}
  };
  const {sortKey,sortDir,setSort}=useSort("latestDate","desc");
  const sortedGroups=sortRows(grouped,sorts,sortKey,sortDir);
  const [view,setView]=useViewMode("bb.view.payments");
  const pagination=usePagination(sortedGroups.length);
  const visibleGroups=sortedGroups.slice(pagination.startIndex,pagination.startIndex+pagination.pageSize);
  const changeSort=key=>{pagination.setPage(1);setSort(key)};

  const net=rows.filter(x=>x.status==="completed").reduce((s,x)=>s+(x.payment_type==="refund"?-1:1)*Number(x.amount),0);
  const stats={
    net,
    refunds:rows.filter(x=>x.payment_type==="refund"&&x.status==="completed").reduce((s,x)=>s+Number(x.amount),0),
    completed:rows.filter(x=>x.status==="completed").length,
    pending:rows.filter(x=>x.status==="pending").length
  };

  const printInvoice=async(p)=>{
    try {
      const data=await api(`/admin/bookings/${p.booking_id}`);
      openInvoice(data.booking,business);
    } catch(e) { setError(`Could not prepare invoice: ${e.message}`); }
  };

  const sendInvoice=async(p)=>{
    setSendingInvoice(p.booking_id);setError("");
    try {
      await api(`/admin/bookings/${p.booking_id}/send-invoice`,{method:"POST",body:JSON.stringify({})});
      setSentInvoiceId(p.booking_id);
      setTimeout(()=>setSentInvoiceId(id=>id===p.booking_id?null:id),3000);
    } catch(e) { setError(`Could not send invoice: ${e.message}`); }
    finally { setSendingInvoice(null); }
  };

  return <AdminShell title="Payments" subtitle="Payment, deposit and refund transaction history with invoicing.">
    {error&&<div className="login-error">{error}</div>}

    <section className="kpi-grid">
      <Kpi index={0} icon="💰" label="Net collections" value={peso(stats.net)} detail={`${rows.length} transactions`}/>
      <Kpi index={1} icon="↩" label="Refunds" value={peso(stats.refunds)} detail="Deposit/refund transactions"/>
      <Kpi index={2} icon="✓" label="Completed" value={stats.completed} detail="Valid transactions"/>
      <Kpi index={3} icon="⏳" label="Pending" value={stats.pending} detail="Awaiting confirmation"/>
    </section>

    <div className="admin-page-toolbar">
      <div className="admin-search">
        <span>⌕</span>
        <input placeholder="Search by booking # or customer..." value={search} onChange={e=>{setSearch(e.target.value);pagination.setPage(1)}}/>
      </div>
      <div className="admin-toolbar-controls payment-filters">
        <select className="booking-status-select" value={typeFilter} onChange={e=>{setTypeFilter(e.target.value);pagination.setPage(1)}}>
          <option value="All">All Types</option>
          <option value="rental">Rental</option>
          <option value="deposit">Deposit</option>
          <option value="refund">Refund</option>
        </select>
        <select className="booking-status-select" value={statusFilter} onChange={e=>{setStatusFilter(e.target.value);pagination.setPage(1)}}>
          <option value="All">All Status</option>
          <option value="completed">Completed</option>
          <option value="pending">Pending</option>
          <option value="void">Void</option>
        </select>
        <SortControls sorts={sorts} sortKey={sortKey} sortDir={sortDir} setSort={changeSort}/>
        <ViewToggle view={view} onChange={setView}/>
      </div>
    </div>

    <section className="admin-card">
      {grouped.length===0?<div className="inventory-empty">
        <span>💳</span>
        <h3>No payments found</h3>
        <p>{search||typeFilter!=="All"||statusFilter!=="All"?"Try adjusting your filters.":"No payment transactions yet."}</p>
      </div>:<>{view==="table"?<div className="table-wrap"><table>
        <thead><tr><th>Booking</th><th>Customer</th><th className="num">Payments</th><th>Method</th><th>Latest activity</th><th>Status</th><th className="num">Amount</th><th></th></tr></thead>
        <tbody>{visibleGroups.map(g=>[
          <tr key={g.booking_id} className="row-clickable" onClick={()=>setExpanded(expanded===g.booking_id?null:g.booking_id)}>
            <td><strong>{g.booking_no}</strong></td>
            <td>{g.customer_name}</td>
            <td className="num">{g.payments.length}</td>
            <td>{(g.primaryMethod||"cash").replace("_"," ")}</td>
            <td>{new Date(g.latestDate).toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"})}</td>
            <td><span className={`status-pill ${g.hasPending?"pending":"confirmed"}`}>{g.hasPending?"pending":"completed"}</span></td>
            <td className="num">{peso(Number(g.totalPaid))}</td>
            <td onClick={e=>e.stopPropagation()}><div className="table-actions">
              <button className="mini-button" onClick={()=>setExpanded(expanded===g.booking_id?null:g.booking_id)}>{expanded===g.booking_id?"Hide":"Details"}</button>
              <button className="mini-button" onClick={()=>printInvoice(g.payments[0])}>Invoice</button>
              <button className="mini-button" disabled={sendingInvoice===g.booking_id} onClick={()=>setInvoiceConfirm(g)}>{sendingInvoice===g.booking_id?"Sending...":sentInvoiceId===g.booking_id?"Sent ✓":"Email"}</button>
            </div></td>
          </tr>,
          expanded===g.booking_id&&<tr key={g.booking_id+"-x"} className="table-subrow"><td colSpan="8">
            {g.payments.map(p=><div className="payment-transaction-row" key={p.id}>
              <div className="payment-tx-info">
                <span className={`status-pill status-tiny ${p.status==="completed"?"confirmed":p.status==="void"?"overdue":"pending"}`}>{p.status}</span>
                <small>{p.payment_type}</small>
                <small>{(p.method||"cash").replace("_"," ")}</small>
                {p.notes&&<small className="payment-tx-note">{p.notes}</small>}
              </div>
              <div className="payment-tx-actions">
                <div className="payment-tx-meta">
                  <strong className={p.payment_type==="refund"?"refund-amount":""}>{p.payment_type==="refund"?"-":"+"}{peso(Number(p.amount))}</strong>
                  <small>{new Date(p.created_at).toLocaleDateString("en-PH",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}</small>
                </div>
                {canVoid&&p.status!=="void"&&<button className="tx-delete-btn" title="Void payment" onClick={()=>{setVoidReason("");setVoidTarget(p)}}>⊘</button>}
              </div>
            </div>)}
          </td></tr>
        ])}</tbody>
      </table></div>:<div className="payment-card-grid">
        {visibleGroups.map(g=><article className={`payment-card ${expanded===g.booking_id?"payment-card-expanded":""}`} key={g.booking_id}>
          <div className="payment-card-top" onClick={()=>setExpanded(expanded===g.booking_id?null:g.booking_id)}>
            <div className="payment-card-icon-wrap">
              <span className="payment-card-icon">{g.hasRefund?"↩":g.payments[0]?.payment_type==="deposit"?"🔒":"💵"}</span>
            </div>
            <div className="payment-card-info">
              <strong>{g.booking_no}</strong>
              <small>{g.customer_name}</small>
            </div>
            <div className="payment-card-amount">
              <strong>{peso(Number(g.totalPaid))}</strong>
              <span className={`status-pill ${g.hasPending?"pending":"confirmed"}`}>{g.hasPending?"pending":"completed"}</span>
            </div>
          </div>
          <div className="payment-card-body">
            <div className="payment-card-detail"><small>{g.payments.length} payment{g.payments.length>1?"s":""}</small></div>
            <div className="payment-card-detail"><small>Method: {(g.primaryMethod||"cash").replace("_"," ")}</small></div>
            <div className="payment-card-detail"><small>{new Date(g.latestDate).toLocaleDateString("en-PH",{year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}</small></div>
          </div>
          {expanded===g.booking_id&&<div className="payment-card-transactions">
            {g.payments.map(p=><div className="payment-transaction-row" key={p.id}>
              <div className="payment-tx-info">
                <span className={`status-pill status-tiny ${p.status==="completed"?"confirmed":p.status==="void"?"overdue":"pending"}`}>{p.status}</span>
                <small>{p.payment_type}</small>
                <small>{(p.method||"cash").replace("_"," ")}</small>
                {p.notes&&<small className="payment-tx-note">{p.notes}</small>}
              </div>
              <div className="payment-tx-actions">
                <div className="payment-tx-meta">
                  <strong className={p.payment_type==="refund"?"refund-amount":""}>{p.payment_type==="refund"?"-":"+"}{peso(Number(p.amount))}</strong>
                  <small>{new Date(p.created_at).toLocaleDateString("en-PH",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}</small>
                </div>
                {canVoid&&p.status!=="void"&&<button className="tx-delete-btn" title="Void payment" onClick={()=>{setVoidReason("");setVoidTarget(p)}}>⊘</button>}
              </div>
            </div>)}
          </div>}
          <div className="payment-card-footer">
            <button className="secondary-button" onClick={()=>setExpanded(expanded===g.booking_id?null:g.booking_id)}>{expanded===g.booking_id?"Hide Details":"View Details"}</button>
            <button className="secondary-button" onClick={()=>printInvoice(g.payments[0])}>Print Invoice</button>
            <button className="secondary-button" disabled={sendingInvoice===g.booking_id} onClick={()=>setInvoiceConfirm(g)}>{sendingInvoice===g.booking_id?"Sending...":sentInvoiceId===g.booking_id?"Sent ✓":"Email Invoice"}</button>
          </div>
        </article>)}
      </div>}
      <ListPagination {...pagination} total={sortedGroups.length} label="bookings" onPageChange={pagination.setPage}/></>}
    </section>

    {voidTarget&&<div className="modal-backdrop" onClick={()=>setVoidTarget(null)}><div className="modal confirm-modal" onClick={e=>e.stopPropagation()}>
      <h3>Void Payment</h3>
      <p>Void this <strong>{voidTarget.payment_type}</strong> payment of <strong>{peso(Number(voidTarget.amount))}</strong>?</p>
      <small>It will no longer count toward totals, but the record stays in the history.</small>
      <label className="void-reason">Reason<textarea rows="2" maxLength="150" placeholder="e.g. Entered twice, wrong amount" value={voidReason} onChange={e=>setVoidReason(e.target.value)}/></label>
      <div className="confirm-modal-actions">
        <button className="secondary-button" onClick={()=>setVoidTarget(null)}>Cancel</button>
        <button className="danger-button" disabled={voiding||!voidReason.trim()} onClick={voidPayment}>{voiding?"Voiding...":"Void Payment"}</button>
      </div>
    </div></div>}

    {invoiceConfirm&&<div className="modal-backdrop" onClick={()=>setInvoiceConfirm(null)}><div className="modal confirm-modal" onClick={e=>e.stopPropagation()}>
      <h3>Send Invoice Email</h3>
      {invoiceConfirm.customer_email?<p>Send the invoice for <strong>{invoiceConfirm.booking_no}</strong> to <strong>{invoiceConfirm.customer_email}</strong>?</p>
        :<p>This booking has no customer email on file. Add one before sending.</p>}
      <div className="confirm-modal-actions">
        <button className="secondary-button" onClick={()=>setInvoiceConfirm(null)}>Cancel</button>
        <button className="primary-button" disabled={!invoiceConfirm.customer_email} onClick={()=>{sendInvoice(invoiceConfirm.payments[0]);setInvoiceConfirm(null)}}>Send</button>
      </div>
    </div></div>}
  </AdminShell>
}
