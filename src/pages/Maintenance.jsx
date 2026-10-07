import React, { useState } from "react";
import { api } from "../lib/api";
import { AdminShell } from "../components/layout/AdminShell";
import { ListPagination } from "../components/ListPagination";
import { SortControls } from "../components/SortControls";
import { usePagination } from "../hooks/usePagination";
import { sortRows, useSort } from "../hooks/useSort";

export function Maintenance() {
  const [rows,setRows]=useState([]); const [error,setError]=useState("");
  const [search,setSearch]=useState(""); const [statusFilter,setStatusFilter]=useState("All");
  const load=()=>api("/admin/maintenance").then(d=>setRows(d.records||[])).catch(e=>setError(e.message));
  React.useEffect(()=>{load()},[]);
  const update=async(r,status)=>{try{await api(`/admin/maintenance/${r.id}`,{method:"PATCH",body:JSON.stringify({status,cost:r.cost||0,notes:r.notes||"",rental_item_id:r.rental_item_id})});load()}catch(e){setError(e.message)}};
  const statuses=["All",...Array.from(new Set(rows.map(r=>r.status).filter(Boolean)))];
  const filtered=rows.filter(r=>{
    const q=search.toLowerCase();
    const matchSearch=!q||[r.item_name,r.sku,r.booking_no,r.reason].some(v=>String(v||"").toLowerCase().includes(q));
    const matchStatus=statusFilter==="All"||r.status===statusFilter;
    return matchSearch&&matchStatus;
  });
  const sorts={
    opened_at:{label:"Opened",get:r=>Date.parse(r.opened_at)||0},
    item_name:{label:"Item",get:r=>r.item_name||""},
    booking_no:{label:"Booking",get:r=>r.booking_no||""},
    reason:{label:"Reason",get:r=>r.reason||""},
    status:{label:"Status",get:r=>r.status||""}
  };
  const {sortKey,sortDir,setSort}=useSort("opened_at","desc");
  const sorted=sortRows(filtered,sorts,sortKey,sortDir);
  const pagination=usePagination(sorted.length);
  const visibleRows=sorted.slice(pagination.startIndex,pagination.startIndex+pagination.pageSize);
  const changeSort=key=>{pagination.setPage(1);setSort(key)};
  return <AdminShell title="Maintenance" subtitle="Items flagged during returns remain unavailable until maintenance is completed.">
    {error&&<div className="login-error">{error}</div>}
    <div className="admin-page-toolbar">
      <div className="admin-search"><span>⌕</span><input placeholder="Search by item, SKU, booking, or reason..." value={search} onChange={e=>{setSearch(e.target.value);pagination.setPage(1)}}/></div>
      <div className="admin-toolbar-controls payment-filters">
        <select className="booking-status-select" value={statusFilter} onChange={e=>{setStatusFilter(e.target.value);pagination.setPage(1)}}>
          {statuses.map(s=><option key={s} value={s}>{s==="All"?"All statuses":String(s).replace("_"," ")}</option>)}
        </select>
        <SortControls sorts={sorts} sortKey={sortKey} sortDir={sortDir} setSort={changeSort}/>
      </div>
    </div>
    <section className="admin-card"><div className="table-wrap"><table><thead><tr><th>Item</th><th>Booking</th><th>Reason</th><th>Opened</th><th>Status</th><th>Action</th></tr></thead><tbody>{visibleRows.map(r=><tr key={r.id}><td><strong>{r.item_name}</strong><br/><small>{r.sku}</small></td><td>{r.booking_no||"—"}</td><td>{r.reason}</td><td>{new Date(r.opened_at).toLocaleString()}</td><td><span className={`status-pill ${r.status==="completed"?"completed":r.status==="in_progress"?"ready":"pending"}`}>{String(r.status||"").replaceAll("_"," ")}</span></td><td>{r.status!=="completed"&&<><button className="mini-button" onClick={()=>update(r,"in_progress")}>In progress</button> <button className="mini-button" onClick={()=>update(r,"completed")}>Complete</button></>}</td></tr>)}{sorted.length===0&&<tr><td colSpan="6" className="muted" style={{textAlign:"center",padding:"24px"}}>No maintenance records found.</td></tr>}</tbody></table></div><ListPagination {...pagination} total={sorted.length} label="maintenance records" onPageChange={pagination.setPage}/></section>
  </AdminShell>
}
