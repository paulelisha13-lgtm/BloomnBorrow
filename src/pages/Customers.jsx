import React, { useState } from "react";
import { api } from "../lib/api";
import { Kpi } from "../components/Kpi";
import { AdminShell } from "../components/layout/AdminShell";
import { SortControls } from "../components/SortControls";
import { ViewToggle } from "../components/ViewToggle";
import { sortRows, useSort } from "../hooks/useSort";
import { useViewMode } from "../hooks/useViewMode";
import { peso } from "../lib/format";
import { isAdminUser } from "../lib/roles";

export function Customers() {
  const [rows,setRows]=useState([]);
  const [error,setError]=useState("");
  const [search,setSearch]=useState("");
  const [detail,setDetail]=useState(null);
  const [renterScore,setRenterScore]=useState(null);
  const [editing,setEditing]=useState(false);
  const [editForm,setEditForm]=useState({});
  const [saving,setSaving]=useState(false);
  const [editError,setEditError]=useState("");
  const [deleteConfirm,setDeleteConfirm]=useState(null);
  const [deleting,setDeleting]=useState(false);

  const load=()=>api("/admin/customers").then(d=>setRows(d.customers||[])).catch(e=>setError(e.message));
  React.useEffect(()=>{load()},[]);
  const del=async()=>{if(!deleteConfirm)return;setDeleting(true);try{await api(`/admin/customers/${deleteConfirm.id}`,{method:"DELETE"});setDeleteConfirm(null);setDetail(null);load()}catch(e){setError(e.message)}finally{setDeleting(false)}};
  const startEdit=()=>{setEditForm({full_name:detail.full_name||"",email:detail.email||"",phone:detail.phone||"",city:detail.city||"",address:detail.address||"",province:detail.province||"",postal_code:detail.postal_code||""});setEditing(true);setEditError("")};
  const cancelEdit=()=>{setEditing(false);setEditError("")};
  const saveCustomer=async()=>{setSaving(true);setEditError("");try{const data=await api(`/admin/customers/${detail.id}`,{method:"PATCH",body:JSON.stringify(editForm)});setDetail({...detail,...data.customer});setEditing(false);load()}catch(e){setEditError(e.message)}finally{setSaving(false)}};

  const loadScore=async(c)=>{
    try{
      const data=await api(`/admin/customers/${c.id}/score`);
      setRenterScore(data);
    }catch(e){setRenterScore(null)}
  };

  const openDetail=async(c)=>{
    try{const data=await api(`/admin/customers/${c.id}`);setDetail(data.customer)}catch(e){setError(e.message);return}
    setRenterScore(null);
    loadScore(c);
  };
  const openEdit=async c=>{try{const data=await api(`/admin/customers/${c.id}`);const d=data.customer;setDetail(d);setEditForm({full_name:d.full_name||"",email:d.email||"",phone:d.phone||"",city:d.city||"",address:d.address||"",province:d.province||"",postal_code:d.postal_code||""});setEditing(true);setEditError("")}catch(e){setError(e.message)}};

  const filtered=rows.filter(c=>{
    const matchSearch=(c.full_name||"").toLowerCase().includes(search.toLowerCase())||(c.email||"").toLowerCase().includes(search.toLowerCase())||(c.phone||"").includes(search);
    return matchSearch;
  });
  const sorts={
    created_at:{label:"Date joined",get:c=>Date.parse(c.created_at)||0},
    full_name:{label:"Name",get:c=>c.full_name||""},
    email:{label:"Email",get:c=>c.email||""},
    booking_count:{label:"Bookings",get:c=>Number(c.booking_count)||0},
    lifetime_value:{label:"Lifetime value",get:c=>Number(c.lifetime_value)||0},
    last_booking_at:{label:"Last booking",get:c=>Date.parse(c.last_booking_at)||0}
  };
  const {sortKey,sortDir,setSort}=useSort("created_at","desc");
  const sorted=sortRows(filtered,sorts,sortKey,sortDir);
  const [view,setView]=useViewMode("bb.view.customers");

  const stats={
    total:rows.length,
    bookings:rows.reduce((s,c)=>s+Number(c.booking_count||0),0),
    totalValue:rows.reduce((s,c)=>s+Number(c.lifetime_value||0),0)
  };

  return <AdminShell title="Customer Management" subtitle="Customer information and booking history.">
    {error&&<div className="login-error">{error}</div>}

    <section className="kpi-grid">
      <Kpi index={0} icon="👤" label="Total customers" value={stats.total} detail="All registered"/>
      <Kpi index={1} icon="▣" label="Total bookings" value={stats.bookings} detail="Across all customers"/>
      <Kpi index={2} icon="💰" label="Total value" value={peso(stats.totalValue)} detail="Lifetime revenue"/>
    </section>

    <div className="admin-page-toolbar">
      <div className="toolbar-left">
        <div className="admin-search">
          <span>⌕</span>
          <input placeholder="Search by name, email, or phone..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <SortControls sorts={sorts} sortKey={sortKey} sortDir={sortDir} setSort={setSort}/>
        <ViewToggle view={view} onChange={setView}/>
      </div>
    </div>

    <section className="admin-card">
      {filtered.length===0?<div className="inventory-empty">
        <span>👤</span>
        <h3>No customers found</h3>
        <p>{search?"Try adjusting your search.":"No customers registered yet."}</p>
      </div>:view==="table"?<div className="table-wrap"><table>
        <thead><tr><th>Customer</th><th>Phone</th><th>Address</th><th className="num">Bookings</th><th className="num">Lifetime value</th><th>Last booking</th><th></th></tr></thead>
        <tbody>{sorted.map(c=><tr key={c.id} className="row-clickable" onClick={()=>openDetail(c)}>
          <td><strong>{c.full_name}</strong><br/><small>{c.email}</small></td>
          <td>{c.phone||"—"}</td>
          <td className="cell-wrap">{[c.address,c.city,c.province].filter(Boolean).join(", ")||"—"}</td>
          <td className="num">{c.booking_count||0}</td>
          <td className="num">{peso(Number(c.lifetime_value||0))}</td>
          <td>{c.last_booking_at?new Date(c.last_booking_at).toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"}):"—"}</td>
          <td onClick={e=>e.stopPropagation()}><div className="table-actions">
            <button className="mini-button" onClick={()=>openDetail(c)}>View Details</button>
            <button className="mini-button" onClick={()=>openEdit(c)}>Edit</button>
            {isAdminUser()&&<button className="mini-button danger" onClick={()=>setDeleteConfirm(c)}>Delete</button>}
          </div></td>
        </tr>)}</tbody>
      </table></div>:<div className="customer-card-grid">
        {sorted.map(c=><article className="customer-detail-card" key={c.id} onClick={()=>openDetail(c)}>
          <div className="customer-card-header">
            <div className="customer-avatar-lg">{c.full_name.split(" ").map(x=>x[0]).join("").slice(0,2)}</div>
            <div className="customer-card-title">
              <h3>{c.full_name}</h3>
              <small>{c.email}</small>
            </div>
          </div>
          <div className="customer-card-body">
            <div className="customer-card-row"><span>📱</span><small>{c.phone||"No phone"}</small></div>
            <div className="customer-card-row"><span>📍</span><small>{c.city||"No city"}</small></div>
          </div>
          <div className="customer-card-stats">
            <div className="customer-stat-item"><span className="customer-stat-num">{c.booking_count||0}</span><span className="customer-stat-label">Bookings</span></div>
            <div className="customer-stat-divider"></div>
            <div className="customer-stat-item"><span className="customer-stat-num">{peso(Number(c.lifetime_value||0))}</span><span className="customer-stat-label">Revenue</span></div>
          </div>
          <div className="customer-card-footer" onClick={e=>e.stopPropagation()}>
            <button className="secondary-button" onClick={()=>openEdit(c)}>Edit</button>
            {isAdminUser()&&<button className="danger-button" onClick={()=>setDeleteConfirm(c)}>Delete</button>}
            <button className="secondary-button" onClick={()=>openDetail(c)}>View Details →</button>
          </div>
        </article>)}
      </div>}
    </section>

    {detail&&<div className="modal-backdrop" onClick={()=>{setDetail(null);setEditing(false)}}><div className="modal customer-detail-modal" onClick={e=>e.stopPropagation()}>
      <button className="booking-modal-close" onClick={()=>{setDetail(null);setEditing(false)}}>×</button>
      <div className="customer-detail-header">
        <div className="customer-avatar-xl">{(editing?editForm.full_name:detail.full_name).split(" ").map(x=>x[0]).join("").slice(0,2)}</div>
        <div>
          {editing?<input className="customer-edit-input" value={editForm.full_name} onChange={e=>setEditForm({...editForm,full_name:e.target.value})} placeholder="Full name"/>:<h2>{detail.full_name}</h2>}
          {editing?<input className="customer-edit-input" type="email" value={editForm.email} onChange={e=>setEditForm({...editForm,email:e.target.value})} placeholder="Email"/>:<p>{detail.email}</p>}
        </div>
      </div>
      {editing?<div className="customer-edit-form">
        {editError&&<div className="login-error">{editError}</div>}
        <label>Phone<input type="tel" value={editForm.phone} onChange={e=>setEditForm({...editForm,phone:e.target.value})} placeholder="Phone number"/></label>
        <label>City<input value={editForm.city} onChange={e=>setEditForm({...editForm,city:e.target.value})} placeholder="City"/></label>
        <label>Province<input value={editForm.province} onChange={e=>setEditForm({...editForm,province:e.target.value})} placeholder="Province"/></label>
        <label>Postal code<input value={editForm.postal_code} onChange={e=>setEditForm({...editForm,postal_code:e.target.value})} placeholder="Postal code"/></label>
        <label className="span-2">Address<textarea value={editForm.address} onChange={e=>setEditForm({...editForm,address:e.target.value})} placeholder="Address" rows={2}/></label>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={cancelEdit}>Cancel</button>
          <button className="primary-button" disabled={saving} onClick={saveCustomer}>{saving?"Saving...":"Save Changes"}</button>
        </div>
      </div>:<><div className="customer-detail-grid">
        <div className="customer-detail-stat"><div><small>Customer reference</small><b>CUST-{String(detail.id).padStart(6,"0")}</b></div></div>
        <div className="customer-detail-stat"><div><small>Registered</small><b>{new Date(detail.created_at).toLocaleDateString("en-PH")}</b></div></div>
        <div className="customer-detail-stat"><div><small>Phone</small><b>{detail.phone||"—"}</b></div></div>
        <div className="customer-detail-stat"><div><small>City</small><b>{detail.city||"—"}</b></div></div>
        <div className="customer-detail-stat"><div><small>Bookings</small><b>{detail.booking_count||0}</b></div></div>
        <div className="customer-detail-stat"><div><small>Lifetime value</small><b>{peso(Number(detail.lifetime_value||0))}</b></div></div>
      </div></>}
      {renterScore&&<div className="booking-modal-section">
        <div className="booking-section-header"><strong>Reliability Score</strong></div>
        <div className="renter-score-card">
          <div className="renter-score-main">
            <div className={`renter-score-circle score-${renterScore.rating.toLowerCase().replace(" ","-")}`}>
              <span className="renter-score-num">{renterScore.score}</span>
              <span className="renter-score-label">/100</span>
            </div>
            <div className="renter-score-rating">{renterScore.rating}</div>
          </div>
          <div className="renter-score-details">
            <div className="renter-score-row"><span>Total bookings</span><strong>{renterScore.totalBookings}</strong></div>
            <div className="renter-score-row"><span>Completed</span><strong>{renterScore.completedBookings}</strong></div>
            <div className="renter-score-row"><span>Late returns</span><strong className={renterScore.lateReturns>0?"text-warning":""}>{renterScore.lateReturns}</strong></div>
            <div className="renter-score-row"><span>Damage incidents</span><strong className={renterScore.damages>0?"text-danger":""}>{renterScore.damages}</strong></div>
            <div className="renter-score-row"><span>Total spent</span><strong>{peso(Number(renterScore.totalSpent))}</strong></div>
          </div>
        </div>
      </div>}
      {!editing&&detail.address&&<div className="booking-modal-section">
        <div className="booking-section-header"><strong>Address</strong></div>
        <div className="customer-address-box">{[detail.address,detail.city,detail.province,detail.postal_code].filter(Boolean).join(", ")}</div>
      </div>}
      <div className="booking-modal-section">
        <div className="booking-section-header"><strong>Recent Bookings</strong></div>
        {detail.recent_bookings&&detail.recent_bookings.length?detail.recent_bookings.map(b=><div className="customer-booking-row" key={b.id}>
          <div className="customer-booking-info"><strong>{b.booking_no}</strong><small>{b.items||"No item details"}</small><small>{new Date(b.start_date).toLocaleDateString("en-PH",{month:"short",day:"numeric"})} → {new Date(b.end_date).toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"})}</small></div>
          <div className="customer-booking-meta"><span className={`status-pill ${b.status==="pending"?"pending":b.status==="overdue"?"overdue":"confirmed"}`}>{b.status}</span><strong>{peso(Number(b.grand_total))}</strong></div>
        </div>):<div className="booking-empty-state">No booking history.</div>}
      </div>
      {!editing&&<div className="booking-modal-section">
        <div className="booking-section-header"><strong>Actions</strong></div>
        <div className="booking-actions">
          <button className="primary-button" onClick={startEdit}>Edit Details</button>
          {isAdminUser()&&<button className="danger-button" onClick={()=>setDeleteConfirm(detail)}>Delete Customer</button>}
        </div>
      </div>}
    </div></div>}

    {deleteConfirm&&<div className="modal-backdrop" onClick={()=>setDeleteConfirm(null)}><div className="modal confirm-modal" onClick={e=>e.stopPropagation()}>
      <div className="confirm-modal-icon">🗑</div>
      <h3>Delete Customer</h3>
      <p>Are you sure you want to delete <strong>{deleteConfirm.full_name}</strong>?</p>
      <small>This will permanently remove the customer and their data. This action cannot be undone.</small>
      <div className="confirm-modal-actions">
        <button className="secondary-button" onClick={()=>setDeleteConfirm(null)}>Cancel</button>
        <button className="danger-button" disabled={deleting} onClick={del}>{deleting?"Deleting...":"Delete Customer"}</button>
      </div>
    </div></div>}
  </AdminShell>
}
