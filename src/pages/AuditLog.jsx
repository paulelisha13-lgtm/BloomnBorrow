import React, { useState } from "react";
import { api } from "../lib/api";
import { AdminShell } from "../components/layout/AdminShell";
import { ListPagination } from "../components/ListPagination";
import { usePagination } from "../hooks/usePagination";
import { peso } from "../lib/format";

// ---- Audit Log -------------------------------------------------------------
// Read-only view of access_audit_logs: who did what, when, and from where.

const AUDIT_LABELS = {
  LOGIN_SUCCESS:"Signed in", LOGOUT:"Signed out", LOGIN_FAILED:"Failed sign-in (wrong password)",
  LOGIN_FAILED_UNKNOWN_EMAIL:"Failed sign-in (unknown email)", ACCOUNT_LOCKED:"Account locked (too many failures)",
  LOGIN_BLOCKED_LOCKED:"Sign-in blocked (account locked)", LOGIN_BLOCKED_DISABLED:"Sign-in blocked (account disabled)",
  CHANGE_PASSWORD:"Changed own password", UPDATE_OWN_PROFILE:"Updated own profile",
  CREATE_USER:"Created staff account", ENABLE_USER:"Enabled staff account", DISABLE_USER:"Disabled staff account",
  CHANGE_USER_STATUS:"Changed staff status", RESET_PASSWORD:"Reset staff password",
  GUEST_BOOKING_CREATED:"Guest booking submitted", BOOKING_STATUS:"Changed booking status",
  RESCHEDULE_BOOKING:"Rescheduled booking", DELETE_BOOKING:"Deleted booking", RETURN_INSPECTION:"Recorded return inspection",
  COMPLETE_BOOKING:"Completed booking", RECORD_PAYMENT:"Recorded payment", VOID_PAYMENT:"Voided payment", DELETE_PAYMENT:"Deleted payment",
  APPROVE_GCASH_PROOF:"Approved GCash proof", REJECT_GCASH_PROOF:"Rejected GCash proof", SEND_GCASH_INSTRUCTIONS:"Sent GCash instructions",
  SEND_BOOKING_STATUS_EMAIL:"Sent booking status email",
  CREATE_RENTAL_ITEM:"Added rental item", UPDATE_RENTAL_ITEM:"Updated rental item", ARCHIVE_RENTAL_ITEM:"Archived rental item",
  DELETE_RENTAL_ITEM:"Deleted rental item", RECORD_ITEM_CONDITION:"Recorded item condition",
  CREATE_INCIDENT:"Reported incident", UPDATE_INCIDENT:"Updated incident",
  CREATE_MAINTENANCE:"Opened maintenance", UPDATE_MAINTENANCE:"Updated maintenance",
  BLOCK_CUSTOMER:"Blocked customer", UNBLOCK_CUSTOMER:"Unblocked customer", UPDATE_CUSTOMER:"Edited customer",
  DELETE_CUSTOMER:"Deleted customer", DELETE_ALL_CUSTOMERS:"Deleted ALL customers",
  UPDATE_SETTINGS:"Changed business settings", RUN_OVERDUE_CHECK:"Ran overdue check", EXPORT_AUDIT_LOG:"Exported audit log", AUDIT_LOG_PURGED:"Old audit entries deleted (retention)"
};

const auditLabel = a => AUDIT_LABELS[a] || String(a||"").toLowerCase().replace(/_/g," ");

// Pill colour: red = security-relevant or destructive, amber = a change, green = routine.
function auditTone(a) {
  if (/FAILED|LOCKED|BLOCKED|DELETE|PURGED|VOID|REJECT|DISABLE_USER|RESET_PASSWORD|EXPORT/.test(a)) return "overdue";
  if (/UPDATE|CHANGE|RESCHEDULE|BLOCK|STATUS|SETTINGS/.test(a)) return "pending";
  return "completed";
}

function auditSummary(l) {
  const d = l.details || {};
  const parts = [];
  if (d.booking_no) parts.push(d.booking_no);
  if (d.incident_no) parts.push(d.incident_no);
  if (d.name || d.sku) parts.push([d.sku,d.name].filter(Boolean).join(" · "));
  if (d.full_name) parts.push(d.full_name);
  if (d.email && !/LOGIN|LOCKED/.test(l.action)) parts.push(d.email);
  if (/LOGIN|LOCKED/.test(l.action) && d.email) parts.push(`as ${d.email}`);
  if (d.amount!==undefined) parts.push(peso(d.amount));
  if (d.from!==undefined && d.to!==undefined && typeof d.from!=="object") parts.push(`${d.from} → ${d.to}`);
  if (d.status && d.from===undefined) parts.push(d.status);
  if (d.changes) { const keys=Object.keys(d.changes); parts.push(keys.length?`changed: ${keys.join(", ")}`:"no changes"); }
  if (d.customers_deleted!==undefined) parts.push(`${d.customers_deleted} customers`);
  if (d.retention_days!==undefined) parts.push(`${d.deleted} entries older than ${d.retention_days} days`);
  if (d.attempts) parts.push(`attempt ${d.attempts}`);
  if (l.target_name && !parts.includes(l.target_name)) parts.unshift(l.target_name);
  return parts.join(" · ") || "—";
}

const auditActor = l => l.actor_name || (l.user_id ? `User #${l.user_id}` : l.action==="AUDIT_LOG_PURGED" ? "System" : "Guest / not signed in");

function csvCell(v) {
  let s = v===null||v===undefined ? "" : typeof v==="object" ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // stop spreadsheet formula injection
  return `"${s.replace(/"/g,'""')}"`;
}

export function AuditLog() {
  const [logs,setLogs]=useState([]);
  const [total,setTotal]=useState(0);
  const [actions,setActions]=useState([]);
  const [actors,setActors]=useState([]);
  const [filters,setFilters]=useState({q:"",action:"",actor:"",from:"",to:""});
  const [search,setSearch]=useState("");
  const [loading,setLoading]=useState(true);
  const [exporting,setExporting]=useState(false);
  const [error,setError]=useState("");
  const [detail,setDetail]=useState(null);
  const [retentionDays,setRetentionDays]=useState(null);
  const pagination=usePagination(total);

  const query=(extra={})=>new URLSearchParams(Object.entries({...filters,...extra}).filter(([,v])=>v!==""&&v!==undefined)).toString();

  const load=async(offset=0)=>{
    setLoading(true);
    try{
      const data=await api(`/access/audit?${query({limit:pagination.pageSize,offset})}`);
      setLogs(data.logs);
      setTotal(data.total); setActions(data.actions||[]); setActors(data.actors||[]); setRetentionDays(data.retention_days??null); setError("");
    }catch(e){setError(e.message)}
    finally{setLoading(false)}
  };
  React.useEffect(()=>{load(pagination.startIndex)},[filters,pagination.page]);
  // Debounce free-text search so typing doesn't fire a request per keystroke.
  React.useEffect(()=>{const t=setTimeout(()=>{pagination.setPage(1);setFilters(f=>f.q===search?f:{...f,q:search})},350);return()=>clearTimeout(t)},[search]);

  const set=(k,v)=>{pagination.setPage(1);setFilters(f=>({...f,[k]:v}))};
  const clear=()=>{pagination.setPage(1);setSearch("");setFilters({q:"",action:"",actor:"",from:"",to:""})};
  const hasFilters=Object.values(filters).some(Boolean);

  const exportCsv=async()=>{
    setExporting(true);
    try{
      const data=await api(`/access/audit?${query({limit:5000,export:"1"})}`);
      const header=["Time","Staff","Staff email","Action","Action code","Target staff","Summary","IP address","User agent","Details"];
      const lines=data.logs.map(l=>[new Date(l.created_at).toISOString(),auditActor(l),l.actor_email,auditLabel(l.action),l.action,l.target_name,auditSummary(l),l.ip_address,l.user_agent,l.details].map(csvCell).join(","));
      const blob=new Blob(["﻿"+[header.map(csvCell).join(","),...lines].join("\r\n")],{type:"text/csv;charset=utf-8"});
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a"); a.href=url; a.download=`audit-log-${new Date().toISOString().slice(0,10)}.csv`; a.click();
      URL.revokeObjectURL(url);
      if(data.total>data.logs.length) setError(`Exported the newest ${data.logs.length} of ${data.total} events. Narrow the date range to export the rest.`);
      pagination.setPage(1);
      if(pagination.page===1)load(0); // the export itself is now an audit event
    }catch(e){setError(e.message)}
    finally{setExporting(false)}
  };

  return <AdminShell title="Audit Log" subtitle="Every sign-in, change, and deletion made in the system: who, what, when, and from where.">
    {error&&<div className="login-error">{error}</div>}
    <div className="admin-page-toolbar audit-toolbar">
      <div className="admin-search"><span>⌕</span><input placeholder="Search staff, booking #, email, IP, details..." value={search} onChange={e=>setSearch(e.target.value)}/></div>
      <div className="admin-toolbar-controls payment-filters audit-filters">
        <button className="primary-button small" onClick={exportCsv} disabled={exporting||!total}>{exporting?"Exporting…":"Export CSV"}</button>
        <select className="booking-status-select" value={filters.action} onChange={e=>set("action",e.target.value)} aria-label="Action">
          <option value="">All actions</option>
          {actions.map(a=><option key={a} value={a}>{auditLabel(a)}</option>)}
        </select>
        <select className="booking-status-select" value={filters.actor} onChange={e=>set("actor",e.target.value)} aria-label="Staff">
          <option value="">All staff</option>
          <option value="guest">Guest / not signed in</option>
          {actors.map(u=><option key={u.id} value={u.id}>{u.full_name}</option>)}
        </select>
        <input className="booking-status-select" type="date" value={filters.from} max={filters.to||undefined} onChange={e=>set("from",e.target.value)} aria-label="From date"/>
        <input className="booking-status-select" type="date" value={filters.to} min={filters.from||undefined} onChange={e=>set("to",e.target.value)} aria-label="To date"/>
        {hasFilters&&<button className="secondary-button small" onClick={clear}>Clear</button>}
      </div>
    </div>

    <section className="admin-card">
      <div className="card-heading"><div><span>Activity</span><h2>{total.toLocaleString()} event{total===1?"":"s"}{hasFilters?" match your filters":""}</h2></div></div>
      {retentionDays!==null&&<p className="muted audit-retention">{retentionDays>0?`Entries older than ${retentionDays} days are deleted automatically every day. Use Export CSV to keep a copy before they are removed.`:"Audit entries are kept permanently (automatic cleanup is off)."}</p>}
      {!loading&&logs.length===0?<div className="inventory-empty"><span>🛡</span><h3>No audit events found</h3><p>{hasFilters?"Try adjusting your filters.":"Activity will appear here as staff use the system."}</p></div>:
      <div className="table-wrap"><table>
        <thead><tr><th>Time</th><th>Staff</th><th>Action</th><th>Details</th><th>IP address</th><th></th></tr></thead>
        <tbody>{logs.map(l=><tr key={l.id}>
          <td>{new Date(l.created_at).toLocaleString()}</td>
          <td><strong>{auditActor(l)}</strong>{l.actor_email&&<><br/><small className="muted">{l.actor_email}</small></>}</td>
          <td><span className={`status-pill ${auditTone(l.action)}`}>{auditLabel(l.action)}</span></td>
          <td className="cell-wrap">{auditSummary(l)}</td>
          <td>{l.ip_address||"—"}</td>
          <td><button className="mini-button" onClick={()=>setDetail(l)}>View</button></td>
        </tr>)}</tbody>
      </table></div>}
      {!loading&&logs.length>0&&<ListPagination {...pagination} total={total} label="events" onPageChange={pagination.setPage}/>}
      {loading&&logs.length===0&&<p className="muted" style={{padding:"20px",textAlign:"center"}}>Loading audit log…</p>}
    </section>

    {detail&&<div className="modal-backdrop" onClick={()=>setDetail(null)}><div className="modal audit-detail" onClick={e=>e.stopPropagation()}>
      <div className="modal-head"><div><span className="eyebrow">Audit event #{detail.id}</span><h2>{auditLabel(detail.action)}</h2></div><button type="button" onClick={()=>setDetail(null)} aria-label="Close">×</button></div>
      <dl className="audit-facts">
        <dt>When</dt><dd>{new Date(detail.created_at).toLocaleString()}</dd>
        <dt>Staff</dt><dd>{auditActor(detail)}{detail.actor_email?` (${detail.actor_email})`:""}</dd>
        {detail.target_name&&<><dt>Target account</dt><dd>{detail.target_name} ({detail.target_email})</dd></>}
        <dt>Action code</dt><dd><code>{detail.action}</code></dd>
        <dt>IP address</dt><dd>{detail.ip_address||"—"}</dd>
        <dt>Device</dt><dd className="audit-ua">{detail.user_agent||"—"}</dd>
      </dl>
      {detail.details?.changes&&Object.keys(detail.details.changes).length>0&&<div className="table-wrap"><table>
        <thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead>
        <tbody>{Object.entries(detail.details.changes).map(([k,v])=><tr key={k}><td><strong>{k.replace(/_/g," ")}</strong></td><td className="cell-wrap">{String(v.from??"—")}</td><td className="cell-wrap">{String(v.to??"—")}</td></tr>)}</tbody>
      </table></div>}
      {detail.details&&<pre className="audit-json">{JSON.stringify(detail.details,null,2)}</pre>}
      <div className="modal-actions"><button className="secondary-button" onClick={()=>setDetail(null)}>Close</button></div>
    </div></div>}
  </AdminShell>
}
