import React, { useState } from "react";
import { api } from "../lib/api";
import { Kpi } from "../components/Kpi";
import { AdminShell } from "../components/layout/AdminShell";
import { SortControls } from "../components/SortControls";
import { sortRows, useSort } from "../hooks/useSort";
import { peso } from "../lib/format";

export function Incidents() {
  const [incidents,setIncidents]=useState([]);
  const [error,setError]=useState("");
  const [search,setSearch]=useState("");
  const [typeFilter,setTypeFilter]=useState("All");
  const [statusFilter,setStatusFilter]=useState("All");
  const [detail,setDetail]=useState(null);
  const [showNew,setShowNew]=useState(false);
  const [newForm,setNewForm]=useState({rental_item_id:"",booking_id:"",customer_id:"",incident_type:"damaged_minor",description:"",replacement_cost:"",charge_amount:"",insurance_claim_amount:""});
  const [items,setItems]=useState([]);
  const [customers,setCustomers]=useState([]);

  const load=()=>{
    api("/admin/incidents").then(d=>setIncidents(d.incidents||[])).catch(e=>setError(e.message));
    api("/admin/inventory").then(d=>setItems(d.items||[])).catch(()=>{});
    api("/admin/customers").then(d=>setCustomers(d.customers||[])).catch(()=>{});
  };
  React.useEffect(()=>{load()},[]);

  const filtered=incidents.filter(i=>{
    const matchSearch=(i.incident_no||"").toLowerCase().includes(search.toLowerCase())||(i.item_name||"").toLowerCase().includes(search.toLowerCase())||(i.customer_name||"").toLowerCase().includes(search.toLowerCase());
    const matchStatus=statusFilter==="All"||i.status===statusFilter;
    const matchType=typeFilter==="All"||i.incident_type===typeFilter;
    return matchSearch&&matchStatus&&matchType;
  });
  const sorts={
    reported_at:{label:"Date",get:i=>Date.parse(i.reported_at)||0},
    incident_no:{label:"Incident #",get:i=>i.incident_no||""},
    item_name:{label:"Item",get:i=>i.item_name||""},
    customer_name:{label:"Customer",get:i=>i.customer_name||""},
    incident_type:{label:"Type",get:i=>i.incident_type||""},
    charge_amount:{label:"Charge",get:i=>Number(i.charge_amount)||0},
    status:{label:"Status",get:i=>i.status||""}
  };
  const {sortKey,sortDir,setSort}=useSort("reported_at","desc");
  const sorted=sortRows(filtered,sorts,sortKey,sortDir);

  const stats={
    total:incidents.length,
    open:incidents.filter(i=>["reported","investigating"].includes(i.status)).length,
    resolved:incidents.filter(i=>i.status.startsWith("resolved_")).length,
    totalCharged:incidents.reduce((s,i)=>s+Number(i.charge_amount||0),0)
  };

  const createIncident=async()=>{
    if(!newForm.rental_item_id||!newForm.description)return;
    try{
      await api("/admin/incidents",{method:"POST",body:JSON.stringify(newForm)});
      setShowNew(false);
      setNewForm({rental_item_id:"",booking_id:"",customer_id:"",incident_type:"damaged_minor",description:"",replacement_cost:"",charge_amount:"",insurance_claim_amount:""});
      load();
    }catch(e){setError(e.message)}
  };

  const updateStatus=async(incident,status)=>{
    try{
      await api(`/admin/incidents/${incident.id}`,{method:"PATCH",body:JSON.stringify({status})});
      load();
      if(detail&&detail.id===incident.id)setDetail({...detail,status});
    }catch(e){setError(e.message)}
  };

  const typeLabels={lost:"Lost",damaged_minor:"Minor Damage",damaged_major:"Major Damage",partially_missing:"Partially Missing",other:"Other"};
  const statusLabels={reported:"Reported",investigating:"Investigating",resolved_charged:"Resolved (Charged)",resolved_insurance:"Resolved (Insurance)",written_off:"Written Off",dismissed:"Dismissed"};

  return <AdminShell title="Incidents" subtitle="Track lost, damaged, and missing items across rentals.">
    {error&&<div className="login-error">{error}</div>}

    <section className="kpi-grid">
      <Kpi index={0} icon="⚠" label="Total incidents" value={stats.total} detail="All time"/>
      <Kpi index={1} icon="🔴" label="Open" value={stats.open} detail="Needs attention"/>
      <Kpi index={2} icon="✓" label="Resolved" value={stats.resolved} detail="Handled cases"/>
      <Kpi index={3} icon="💰" label="Total charged" value={peso(stats.totalCharged)} detail="Customer charges"/>
    </section>

    <div className="admin-page-toolbar">
      <div className="admin-search">
        <span>⌕</span>
        <input placeholder="Search by incident #, item, or customer..." value={search} onChange={e=>setSearch(e.target.value)}/>
      </div>
      <div className="payment-filters">
        <select className="booking-status-select" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="All">All Status</option>
          {Object.entries(statusLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}
        </select>
        <select className="booking-status-select" value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}>
          <option value="All">All Types</option>
          {Object.entries(typeLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}
        </select>
        <SortControls sorts={sorts} sortKey={sortKey} sortDir={sortDir} setSort={setSort}/>
        <button className="primary-button" onClick={()=>setShowNew(true)}>+ Report Incident</button>
      </div>
    </div>

    <section className="admin-card">
      {filtered.length===0?<div className="inventory-empty">
        <span>⚠</span>
        <h3>No incidents found</h3>
        <p>{search||statusFilter!=="All"||typeFilter!=="All"?"Try adjusting your filters.":"No incidents reported yet."}</p>
      </div>:<div className="table-wrap"><table><thead><tr><th>Incident</th><th>Item</th><th>Customer</th><th>Type</th><th>Charge</th><th>Status</th><th>Date</th><th></th></tr></thead><tbody>
        {sorted.map(i=><tr key={i.id}>
          <td><strong>{i.incident_no}</strong></td>
          <td>{i.item_name||"—"}<br/><small>{i.item_sku||""}</small></td>
          <td>{i.customer_name||"—"}</td>
          <td><span className="status-pill">{typeLabels[i.incident_type]||i.incident_type}</span></td>
          <td>{peso(Number(i.charge_amount||0))}</td>
          <td><span className={`status-pill ${i.status.startsWith("resolved")?"confirmed":i.status==="dismissed"?"":"pending"}`}>{statusLabels[i.status]||i.status}</span></td>
          <td><small>{new Date(i.reported_at).toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"})}</small></td>
          <td><button className="mini-button" onClick={()=>setDetail(i)}>View</button></td>
        </tr>)}
      </tbody></table></div>}
    </section>

    {detail&&<div className="modal-backdrop" onClick={()=>setDetail(null)}><div className="modal" onClick={e=>e.stopPropagation()}>
      <button className="booking-modal-close" onClick={()=>setDetail(null)}>×</button>
      <div className="modal-head"><div><span className="eyebrow">{detail.incident_no}</span><h2>{typeLabels[detail.incident_type]||detail.incident_type}</h2></div></div>
      <div className="detail-grid" style={{gridTemplateColumns:"1fr 1fr",gap:"12px",marginBottom:"16px"}}>
        <div><small>Item</small><strong>{detail.item_name} ({detail.item_sku})</strong></div>
        <div><small>Customer</small><strong>{detail.customer_name||"—"}</strong></div>
        <div><small>Booking</small><strong>{detail.booking_no||"—"}</strong></div>
        <div><small>Reported by</small><strong>{detail.reported_by||"—"}</strong></div>
        <div><small>Replacement cost</small><strong>{peso(Number(detail.replacement_cost||0))}</strong></div>
        <div><small>Charge amount</small><strong>{peso(Number(detail.charge_amount||0))}</strong></div>
        <div><small>Insurance claim</small><strong>{peso(Number(detail.insurance_claim_amount||0))}</strong></div>
        <div><small>Status</small><strong>{statusLabels[detail.status]||detail.status}</strong></div>
      </div>
      <div style={{marginBottom:"16px"}}><small>Description</small><p style={{margin:"4px 0",fontSize:"13px",lineHeight:"1.5"}}>{detail.description}</p></div>
      {detail.resolution_notes&&<div style={{marginBottom:"16px"}}><small>Resolution notes</small><p style={{margin:"4px 0",fontSize:"13px",lineHeight:"1.5"}}>{detail.resolution_notes}</p></div>}
      <div className="booking-actions" style={{flexWrap:"wrap",gap:"8px"}}>
        {detail.status==="reported"&&<button className="secondary-button" onClick={()=>updateStatus(detail,"investigating")}>Start Investigation</button>}
        {["reported","investigating"].includes(detail.status)&&<>
          <button className="primary-button" onClick={()=>updateStatus(detail,"resolved_charged")}>Resolve (Charged)</button>
          <button className="secondary-button" onClick={()=>updateStatus(detail,"resolved_insurance")}>Resolve (Insurance)</button>
          <button className="secondary-button" onClick={()=>updateStatus(detail,"written_off")}>Write Off</button>
          <button className="secondary-button danger" onClick={()=>updateStatus(detail,"dismissed")}>Dismiss</button>
        </>}
      </div>
    </div></div>}

    {showNew&&<div className="modal-backdrop" onClick={()=>setShowNew(false)}><div className="modal" onClick={e=>e.stopPropagation()}>
      <div className="modal-head"><div><span className="eyebrow">New Incident</span><h2>Report Incident</h2></div><button type="button" onClick={()=>setShowNew(false)}>×</button></div>
      <div className="form-grid">
        <label>Item<select required value={newForm.rental_item_id} onChange={e=>setNewForm({...newForm,rental_item_id:e.target.value})}><option value="">Select item...</option>{items.map(i=><option key={i.id} value={i.id}>{i.name} ({i.sku})</option>)}</select></label>
        <label>Type<select value={newForm.incident_type} onChange={e=>setNewForm({...newForm,incident_type:e.target.value})}>{Object.entries(typeLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
        <label>Booking ID (optional)<input type="number" value={newForm.booking_id} onChange={e=>setNewForm({...newForm,booking_id:e.target.value})} placeholder="Link to booking..."/></label>
        <label>Customer (optional)<select value={newForm.customer_id} onChange={e=>setNewForm({...newForm,customer_id:e.target.value})}><option value="">Select customer...</option>{customers.map(c=><option key={c.id} value={c.id}>{c.full_name}</option>)}</select></label>
        <label className="span-2">Description<textarea required value={newForm.description} onChange={e=>setNewForm({...newForm,description:e.target.value})} placeholder="Describe the incident..."/></label>
        <label>Replacement cost<input type="number" min="0" value={newForm.replacement_cost} onChange={e=>setNewForm({...newForm,replacement_cost:e.target.value})}/></label>
        <label>Charge to customer<input type="number" min="0" value={newForm.charge_amount} onChange={e=>setNewForm({...newForm,charge_amount:e.target.value})}/></label>
        <label>Insurance claim<input type="number" min="0" value={newForm.insurance_claim_amount} onChange={e=>setNewForm({...newForm,insurance_claim_amount:e.target.value})}/></label>
      </div>
      <div className="modal-actions"><button className="secondary-button" onClick={()=>setShowNew(false)}>Cancel</button><button className="primary-button" onClick={createIncident}>Report Incident</button></div>
    </div></div>}
  </AdminShell>
}
