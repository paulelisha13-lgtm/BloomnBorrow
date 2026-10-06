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
import { peso } from "../lib/format";
import { isAdminUser } from "../lib/roles";
import { useDiscardGuard } from "../components/DiscardGuard";

const BLANK_CONDITION={condition_status:"good",condition_type:"after_return",notes:"",booking_id:""};

// Package/bundle contents round-trip as { name, quantity }. Quantity is kept
// as a string here so the number input stays controlled exactly like the
// other price/quantity fields on this form; validation coerces it on save.
const toBundleRows = value => {
  let list = value;
  if (typeof list === "string") { try { list = JSON.parse(list); } catch { list = null; } }
  if (!Array.isArray(list)) return [];
  return list.map(row => ({ name: String(row?.name ?? ""), quantity: String(row?.quantity ?? 1) }));
};

export function Inventory() {
  const [rows,setRows]=useState([]);
  const [modal,setModal]=useState(false);
  const [editing,setEditing]=useState(null);
  const [error,setError]=useState("");
  const [search,setSearch]=useState("");
  const [categoryFilter,setCategoryFilter]=useState("All");
  const [statusFilter,setStatusFilter]=useState("All");
  const [deleteModal,setDeleteModal]=useState(null);
  const [deleteLoading,setDeleteLoading]=useState(false);
  const [conditionItem,setConditionItem]=useState(null);
  const [conditions,setConditions]=useState([]);
  const [conditionLoading,setConditionLoading]=useState(false);
  const [addConditionModal,setAddConditionModal]=useState(false);
  const [conditionForm,setConditionForm]=useState(BLANK_CONDITION);
  const blank={sku:"",name:"",category:"Events",description:"",daily_price:"",original_price:"",security_deposit:"",total_quantity:1,status:"active",image_url:"",bundle_items:[]};
  const [form,setForm]=useState(blank);
  // Snapshot of the form when it was opened, so closing can tell whether the
  // admin actually changed anything.
  const [baseline,setBaseline]=useState("");
  const itemGuard=useDiscardGuard(modal&&JSON.stringify(form)!==baseline,()=>setModal(false));
  const conditionGuard=useDiscardGuard(addConditionModal&&JSON.stringify(conditionForm)!==JSON.stringify(BLANK_CONDITION),()=>{setAddConditionModal(false);setConditionForm(BLANK_CONDITION)});

  const bundleRows=Array.isArray(form.bundle_items)?form.bundle_items:[];
  const setBundleRow=(i,key,value)=>setForm(f=>({...f,bundle_items:f.bundle_items.map((row,idx)=>idx===i?{...row,[key]:value}:row)}));
  const addBundleRow=()=>setForm(f=>({...f,bundle_items:[...f.bundle_items,{name:"",quantity:"1"}]}));
  const removeBundleRow=i=>setForm(f=>({...f,bundle_items:f.bundle_items.filter((_,idx)=>idx!==i)}));

  const load=()=>api("/admin/inventory").then(d=>setRows(d.items||[])).catch(e=>setError(e.message));
  React.useEffect(()=>{load();},[]);
  const openNew=()=>{setEditing(null);setForm(blank);setBaseline(JSON.stringify(blank));setModal(true)};
  const openEdit=(x)=>{const next={...x,bundle_items:toBundleRows(x.bundle_items)};setEditing(x);setForm(next);setBaseline(JSON.stringify(next));setModal(true)};
  const save=async(e)=>{e.preventDefault();setError("");try{await api(editing?`/admin/inventory/${editing.id}`:"/admin/inventory",{method:editing?"PATCH":"POST",body:JSON.stringify(form)});setModal(false);load()}catch(err){setError(err.message)}};
  const confirmDelete=(x)=>{setDeleteModal(x)};
  const remove=async()=>{if(!deleteModal)return;setDeleteLoading(true);try{await api(`/admin/inventory/${deleteModal.id}`,{method:"DELETE"});setDeleteModal(null);load()}catch(e){setError(e.message)}finally{setDeleteLoading(false)}};

  const viewConditions=async(item)=>{
    setConditionItem(item);
    setConditionLoading(true);
    try{
      const data=await api(`/admin/items/${item.id}/conditions`);
      setConditions(data.conditions||[]);
    }catch(e){setError(e.message)}
    finally{setConditionLoading(false)}
  };

  const addCondition=async()=>{
    if(!conditionItem)return;
    try{
      await api(`/admin/items/${conditionItem.id}/conditions`,{method:"POST",body:JSON.stringify(conditionForm)});
      setAddConditionModal(false);
      setConditionForm(BLANK_CONDITION);
      viewConditions(conditionItem);
    }catch(e){setError(e.message)}
  };

  const categories=["All",...new Set(rows.map(x=>x.category))];
  const statuses=["All","active","inactive","maintenance"];
  const filtered=rows.filter(x=>{
    const matchSearch=x.name.toLowerCase().includes(search.toLowerCase())||x.sku.toLowerCase().includes(search.toLowerCase());
    const matchCat=categoryFilter==="All"||x.category===categoryFilter;
    const matchStatus=statusFilter==="All"||x.status===statusFilter;
    return matchSearch&&matchCat&&matchStatus;
  });
  const sorts={
    created_at:{label:"Date added",get:x=>Date.parse(x.created_at)||0},
    name:{label:"Name",get:x=>x.name||""},
    sku:{label:"SKU",get:x=>x.sku||""},
    category:{label:"Category",get:x=>x.category||""},
    daily_price:{label:"Daily price",get:x=>Number(x.daily_price)||0},
    available:{label:"Available units",get:x=>Number(x.total_quantity||0)-Number(x.reserved_all||0)},
    reserved_all:{label:"Reserved",get:x=>Number(x.reserved_all)||0},
    status:{label:"Status",get:x=>x.status||""}
  };
  const {sortKey,sortDir,setSort}=useSort("created_at","desc");
  const sorted=sortRows(filtered,sorts,sortKey,sortDir);
  const [view,setView]=useViewMode("bb.view.inventory");
  const pagination=usePagination(sorted.length);
  const visibleRows=sorted.slice(pagination.startIndex,pagination.startIndex+pagination.pageSize);
  const changeSort=key=>{pagination.setPage(1);setSort(key)};

  const stats={
    total:rows.length,
    active:rows.filter(x=>x.status==="active").length,
    maintenance:rows.filter(x=>x.status==="maintenance").length,
    totalStock:rows.reduce((s,x)=>s+Number(x.total_quantity||0),0),
    totalReserved:rows.reduce((s,x)=>s+Number(x.reserved_all||0),0)
  };

  return <AdminShell title="Rental Inventory" subtitle="Manage your rental items, pricing, stock levels, and availability.">
    {error&&<div className="login-error">{error}</div>}

    <section className="kpi-grid">
      <Kpi index={0} icon="📦" label="Total items" value={stats.total} detail="All rental items"/>
      <Kpi index={1} icon="✓" label="Active" value={stats.active} detail="Available for rent"/>
      <Kpi index={2} icon="🔧" label="Maintenance" value={stats.maintenance} detail="Under maintenance"/>
      <Kpi index={3} icon="📊" label="Available" value={stats.totalStock-stats.totalReserved} detail={`${stats.totalReserved} reserved`}/>
    </section>

    <div className="admin-page-toolbar">
      <div className="admin-search">
        <span>⌕</span>
        <input placeholder="Search by name or SKU..." value={search} onChange={e=>{setSearch(e.target.value);pagination.setPage(1)}}/>
      </div>
      <div className="admin-toolbar-controls inventory-filters">
        {isAdminUser()&&<button className="primary-button" onClick={openNew}>+ Rent Item</button>}
        <select value={categoryFilter} onChange={e=>{setCategoryFilter(e.target.value);pagination.setPage(1)}}>
          {categories.map(c=><option key={c}>{c}</option>)}
        </select>
        <select value={statusFilter} onChange={e=>{setStatusFilter(e.target.value);pagination.setPage(1)}}>
          {statuses.map(s=><option key={s}>{s==="All"?"All statuses":s}</option>)}
        </select>
        <SortControls sorts={sorts} sortKey={sortKey} sortDir={sortDir} setSort={changeSort}/>
        <ViewToggle view={view} onChange={setView}/>
      </div>
    </div>

    <section className="admin-card">
      {filtered.length===0?<div className="inventory-empty">
        <span>📭</span>
        <h3>No items found</h3>
        <p>{search||categoryFilter!=="All"||statusFilter!=="All"?"Try adjusting your filters.":"Add your first rental item to get started."}</p>
      </div>:<>{view==="table"?<div className="table-wrap"><table>
        <thead><tr><th>Item</th><th>Category</th><th className="num">Price/day</th><th className="num">Deposit</th><th className="num">Available</th><th className="num">Reserved</th><th>Status</th><th></th></tr></thead>
        <tbody>{visibleRows.map(item=><tr key={item.id}>
          <td><strong>{item.name}</strong><br/><small>{item.sku}</small></td>
          <td>{item.category}</td>
          <td className="num">{peso(Number(item.daily_price))}</td>
          <td className="num">{peso(Number(item.security_deposit))}</td>
          <td className={`num ${Number(item.total_quantity)-Number(item.reserved_all||0)<5?"cell-low":""}`}>{Math.max(0,Number(item.total_quantity)-Number(item.reserved_all||0))}</td>
          <td className="num">{item.reserved_all||0} / {item.total_quantity}</td>
          <td><span className={`status-pill ${item.status==="active"?"confirmed":item.status==="maintenance"?"pending":""}`}>{item.status}</span></td>
          <td><div className="table-actions">
            {isAdminUser()&&<button className="mini-button" onClick={()=>openEdit(item)}>Edit</button>}
            <button className="mini-button" onClick={()=>viewConditions(item)}>History</button>
            {isAdminUser()&&<button className="mini-button danger" onClick={()=>confirmDelete(item)}>Delete</button>}
          </div></td>
        </tr>)}</tbody>
      </table></div>:<div className="inventory-grid">
        {visibleRows.map(item=><article className="inventory-card-item" key={item.id}>
          <div className="inventory-card-image">
            {item.image_url?<img src={item.image_url} alt={item.name}/>:<div className="inventory-card-noimage" aria-label="No photo">📦</div>}
            <span className={`inventory-status-badge ${item.status}`}>{item.status}</span>
          </div>
          <div className="inventory-card-body">
            <div className="inventory-card-header">
              <div>
                <h3>{item.name}</h3>
                <small>{item.sku} · {item.category}</small>
              </div>
            </div>
            <p className="inventory-card-desc">{item.description||"No description available."}</p>
            <div className="inventory-card-stats">
              <div><span>Price</span><strong>{peso(Number(item.daily_price))}/day</strong></div>
              <div><span>Deposit</span><strong>{peso(Number(item.security_deposit))}</strong></div>
              <div className={Number(item.total_quantity)-Number(item.reserved_all||0)<5?"low-stock":""}><span>Available</span><strong>{Math.max(0,Number(item.total_quantity)-Number(item.reserved_all||0))} units</strong></div>
              <div><span>Reserved</span><strong>{item.reserved_all||0} of {item.total_quantity}</strong></div>
            </div>
            <div className="inventory-card-actions">
              {isAdminUser()&&<button className="secondary-button" onClick={()=>openEdit(item)}>Edit</button>}
              <button className="secondary-button" onClick={()=>viewConditions(item)}>History</button>
              {isAdminUser()&&<button className="danger-button" onClick={()=>confirmDelete(item)}>Delete</button>}
            </div>
          </div>
        </article>)}
      </div>}
      <ListPagination {...pagination} total={sorted.length} label="items" onPageChange={pagination.setPage}/></>}
    </section>

    {modal&&<div className="modal-backdrop" onClick={itemGuard.requestClose}><form className="modal" onSubmit={save} onClick={e=>e.stopPropagation()}>
      <div className="modal-head"><div><span className="eyebrow">Inventory</span><h2>{editing?"Edit":"Rent"}</h2></div><button type="button" onClick={itemGuard.requestClose}>×</button></div>
      <div className="form-grid">
        <label>SKU<input required value={form.sku} onChange={e=>setForm({...form,sku:e.target.value})}/></label><label>Item name<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
        <label>Category<input required value={form.category} onChange={e=>setForm({...form,category:e.target.value})}/></label><label>Status<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option>active</option><option>inactive</option><option>maintenance</option></select></label>
        <label>Daily price<input required type="number" min="0" value={form.daily_price} onChange={e=>setForm({...form,daily_price:e.target.value})}/></label><label>Original price <small>(optional, shows “Save ₱X”)</small><input type="number" min="0" value={form.original_price??""} onChange={e=>setForm({...form,original_price:e.target.value})} placeholder="No discount"/></label><label>Security deposit<input required type="number" min="0" value={form.security_deposit} onChange={e=>setForm({...form,security_deposit:e.target.value})}/></label>
        <label>Quantity<input required type="number" min="1" value={form.total_quantity} onChange={e=>setForm({...form,total_quantity:e.target.value})}/></label><label>Image URL<input value={form.image_url||""} onChange={e=>setForm({...form,image_url:e.target.value})}/></label>
        <label className="span-2">Description<textarea value={form.description||""} onChange={e=>setForm({...form,description:e.target.value})}/></label>
        <label className="span-2">Package contents <small>(optional — leave empty for a regular rental item)</small>
          <div className="bundle-editor">
            {bundleRows.map((row,i)=><div className="bundle-row" key={i}>
              <input placeholder="Included item name" value={row.name} onChange={e=>setBundleRow(i,"name",e.target.value)}/>
              <input className="bundle-qty" type="number" min="1" placeholder="Qty" value={row.quantity} onChange={e=>setBundleRow(i,"quantity",e.target.value)}/>
              <button type="button" className="bundle-remove" onClick={()=>removeBundleRow(i)} aria-label={`Remove ${row.name||"included item"}`}>×</button>
            </div>)}
            <button type="button" className="secondary-button bundle-add" onClick={addBundleRow}>+ Add item</button>
            {bundleRows.length===0&&<p className="bundle-hint">Leave empty when this is a single rental item. With contents listed, the customer catalog shows it as a package and the details panel lists everything inside.</p>}
          </div>
        </label>
      </div><div className="modal-actions"><button type="button" className="secondary-button" onClick={itemGuard.requestClose}>Cancel</button><button type="submit" className="primary-button">Save item</button></div>
    </form></div>}
    {itemGuard.discardDialog}

    {deleteModal&&<div className="modal-backdrop" onClick={()=>setDeleteModal(null)}><div className="modal confirm-modal" onClick={e=>e.stopPropagation()}>
      <h3>Delete Item</h3>
      <p>Are you sure you want to delete <strong>{deleteModal.name}</strong> ({deleteModal.sku})?</p>
      <small>This action cannot be undone.</small>
      <div className="confirm-modal-actions">
        <button className="secondary-button" onClick={()=>setDeleteModal(null)}>Cancel</button>
        <button className="danger-button" onClick={remove} disabled={deleteLoading}>{deleteLoading?"Deleting...":"Delete"}</button>
      </div>
    </div></div>}

    {conditionItem&&<div className="modal-backdrop" onClick={()=>{setConditionItem(null);setConditions([])}}><div className="modal condition-history-modal" onClick={e=>e.stopPropagation()}>
      <div className="modal-head"><div><span className="eyebrow">Condition History</span><h2>{conditionItem.name}</h2><small>{conditionItem.sku}</small></div><button type="button" onClick={()=>{setConditionItem(null);setConditions([])}}>×</button></div>
      <div className="condition-history-actions">
        <button className="primary-button" onClick={()=>setAddConditionModal(true)}>+ Add Record</button>
      </div>
      {conditionLoading?<div className="inventory-empty"><p>Loading...</p></div>
      :conditions.length===0?<div className="inventory-empty"><span>📋</span><h3>No condition records</h3><p>This item has no condition history yet.</p></div>
      :<div className="condition-timeline">
        {conditions.map(c=><div className="condition-record" key={c.id}>
          <div className={`condition-badge condition-${c.condition_status}`}>{c.condition_status}</div>
          <div className="condition-record-info">
            <div className="condition-record-type">{c.condition_type.replace("_"," ")}</div>
            {c.notes&&<div className="condition-record-notes">{c.notes}</div>}
            <div className="condition-record-meta">
              {c.booking_no&&<span>📦 {c.booking_no}</span>}
              {c.recorded_by&&<span>👤 {c.recorded_by}</span>}
              <span>📅 {new Date(c.created_at).toLocaleDateString("en-PH",{year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}</span>
            </div>
          </div>
        </div>)}
      </div>}
    </div></div>}

    {addConditionModal&&conditionItem&&<div className="modal-backdrop" onClick={conditionGuard.requestClose}><div className="modal" onClick={e=>e.stopPropagation()}>
      <div className="modal-head"><div><span className="eyebrow">Add Condition Record</span><h2>{conditionItem.name}</h2></div><button type="button" onClick={conditionGuard.requestClose}>×</button></div>
      <div className="form-grid">
        <label>Condition
          <select value={conditionForm.condition_status} onChange={e=>setConditionForm({...conditionForm,condition_status:e.target.value})}>
            <option value="excellent">Excellent</option>
            <option value="good">Good</option>
            <option value="fair">Fair</option>
            <option value="poor">Poor</option>
            <option value="damaged">Damaged</option>
            <option value="lost">Lost</option>
          </select>
        </label>
        <label>Type
          <select value={conditionForm.condition_type} onChange={e=>setConditionForm({...conditionForm,condition_type:e.target.value})}>
            <option value="before_rental">Before Rental</option>
            <option value="after_return">After Return</option>
            <option value="damage_report">Damage Report</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </label>
        <label className="span-2">Notes<textarea value={conditionForm.notes} onChange={e=>setConditionForm({...conditionForm,notes:e.target.value})} placeholder="Optional notes about the condition..."/></label>
      </div>
      <div className="modal-actions"><button className="secondary-button" onClick={conditionGuard.requestClose}>Cancel</button><button className="primary-button" onClick={addCondition}>Save Record</button></div>
    </div></div>}
    {conditionGuard.discardDialog}
  </AdminShell>
}
