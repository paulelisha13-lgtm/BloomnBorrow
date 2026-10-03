import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { AdminShell } from "../components/layout/AdminShell";
import { Kpi } from "../components/Kpi";
import { isAdminUser } from "../lib/roles";

const TYPE_LABELS={booking:"Booking",reservation:"Reservation",note:"Note",event:"Event"};
const ENTRY_STATUS_LABELS={pending:"Pending",confirmed:"Confirmed",cancelled:"Cancelled",completed:"Completed"};
const BOOKING_STATUS_LABELS={pending:"Pending",confirmed:"Confirmed",ready:"Ready",rented:"Rented",returned:"Returned",completed:"Completed",cancelled:"Cancelled",rejected:"Rejected",overdue:"Overdue"};
const WEEKDAYS=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTH_NAMES=["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAY_MS=86400000;
const MAX_PILLS=3;

// DATE columns come back from mysql2 as Date objects at UTC midnight (the pool
// runs timezone "Z"), and TIME columns as plain "HH:MM:SS" strings. A Date must
// be read with toISOString(), never String() -- String(date) gives
// "Tue Sep 29 2026 ...", whose first 10 characters are not a date at all. The
// text branch keeps this correct if a driver ever returns raw SQL dates.
const dayKey=value=>value instanceof Date?value.toISOString().slice(0,10):String(value??"").slice(0,10);
const clock=value=>typeof value==="string"?value.slice(0,5):"";
const isoUtc=date=>date.toISOString().slice(0,10);
// mysql2 hands back a UTC Date for DATETIME, but stay correct if a driver
// change ever returns the raw "YYYY-MM-DD HH:MM:SS" text instead.
const reminderToForm=value=>{
  if(!value) return "";
  return typeof value==="string"?value.slice(0,16).replace(" ","T"):new Date(value).toISOString().slice(0,16);
};
const todayKey=()=>isoUtc(new Date());
const longDate=key=>{
  const [y,m,d]=dayKey(key).split("-").map(Number);
  return `${MONTH_NAMES[m-1]} ${d}, ${y}`;
};
const blankForm=date=>({
  entry_type:"reservation",title:"",customer_name:"",customer_email:"",customer_phone:"",
  entry_date:date,start_time:"",end_time:"",guests:"",location:"",
  status:"pending",reminder_at:"",details:"",notes:""
});
const entryToForm=entry=>({
  entry_type:entry.entry_type||"reservation",
  title:entry.title||"",
  customer_name:entry.customer_name||"",
  customer_email:entry.customer_email||"",
  customer_phone:entry.customer_phone||"",
  entry_date:dayKey(entry.entry_date),
  start_time:clock(entry.start_time),
  end_time:clock(entry.end_time),
  guests:entry.guests==null?"":String(entry.guests),
  location:entry.location||"",
  status:entry.status||"pending",
  reminder_at:reminderToForm(entry.reminder_at),
  details:entry.details||"",
  notes:entry.notes||""
});

export function Calendar() {
  const now=new Date();
  const [anchor,setAnchor]=useState({year:now.getFullYear(),month:now.getMonth()});
  const [entries,setEntries]=useState([]);
  const [bookings,setBookings]=useState([]);
  const [error,setError]=useState("");
  const [search,setSearch]=useState("");
  const [typeFilter,setTypeFilter]=useState("all");
  const [statusFilter,setStatusFilter]=useState("all");
  const [openDay,setOpenDay]=useState(null);
  const [editor,setEditor]=useState(null);
  const [saving,setSaving]=useState(false);
  const [deleteEntryTarget,setDeleteEntryTarget]=useState(null);
  const [deletingEntry,setDeletingEntry]=useState(false);

  // Always six weeks so the month never changes height as you navigate, and
  // so leading/trailing days of the month are visible and clickable.
  const grid=useMemo(()=>{
    const first=Date.UTC(anchor.year,anchor.month,1);
    const start=first-new Date(first).getUTCDay()*DAY_MS;
    const cells=Array.from({length:42},(_,i)=>new Date(start+i*DAY_MS));
    return {cells,from:isoUtc(cells[0]),to:isoUtc(cells[41])};
  },[anchor]);

  const load=useCallback((from,to)=>{
    setError("");
    api(`/admin/calendar?from=${from}&to=${to}`)
      .then(d=>{setEntries(d.entries||[]);setBookings(d.bookings||[])})
      .catch(e=>setError(e.message));
  },[]);

  useEffect(()=>{load(grid.from,grid.to)},[grid.from,grid.to,load]);

  const monthPrefix=`${anchor.year}-${String(anchor.month+1).padStart(2,"0")}`;

  const matches=useCallback(item=>{
    if(typeFilter!=="all"&&item.type!==typeFilter) return false;
    if(statusFilter!=="all"&&item.status!==statusFilter) return false;
    const q=search.trim().toLowerCase();
    if(!q) return true;
    const haystack=item.kind==="booking"
      ? [item.booking_no,item.customer_name,item.items].join(" ")
      : [item.title,item.customer_name,item.location,item.category,item.notes,item.details].join(" ");
    return haystack.toLowerCase().includes(q);
  },[search,typeFilter,statusFilter]);

  // One activity list per day. Calendar entries land on their single date;
  // rental bookings repeat across their whole start-to-end span.
  const byDay=useMemo(()=>{
    const map=new Map();
    const target=key=>{
      if(!map.has(key)) map.set(key,[]);
      return map.get(key);
    };
    for(const entry of entries){
      if(!matches({kind:"entry",type:entry.entry_type,status:entry.status,title:entry.title,customer_name:entry.customer_name,location:entry.location,category:entry.category,notes:entry.notes,details:entry.details})) continue;
      target(dayKey(entry.entry_date)).push({kind:"entry",entry,status:entry.status,type:entry.entry_type,time:clock(entry.start_time)});
    }
    for(const booking of bookings){
      if(!matches({kind:"booking",type:"booking",status:booking.status,booking_no:booking.booking_no,customer_name:booking.customer_name,items:booking.items})) continue;
      const cursor=new Date(`${dayKey(booking.start_date)}T00:00:00Z`);
      const last=new Date(`${dayKey(booking.end_date)}T00:00:00Z`);
      while(cursor<=last){
        const key=isoUtc(cursor);
        if(key>=grid.from&&key<=grid.to) target(key).push({kind:"booking",booking,status:booking.status,type:"booking",time:""});
        cursor.setUTCDate(cursor.getUTCDate()+1);
      }
    }
    for(const list of map.values()){
      list.sort((a,b)=>(a.time||"99:99").localeCompare(b.time||"99:99")||(a.kind===b.kind?0:a.kind==="booking"?-1:1));
    }
    return map;
  },[entries,bookings,grid,matches]);

  const monthActivities=useMemo(()=>{
    const list=[];
    for(const [key,items] of byDay){
      if(key.startsWith(monthPrefix)) list.push(...items);
    }
    return list;
  },[byDay,monthPrefix]);

  const stats={
    scheduled:monthActivities.filter(a=>a.kind==="entry").length,
    pending:monthActivities.filter(a=>a.kind==="entry"&&a.status==="pending").length,
    confirmed:monthActivities.filter(a=>a.kind==="entry"&&a.status==="confirmed").length,
    // A multi-day rental repeats on every day it covers, so count the
    // bookings themselves rather than the day tiles they appear in.
    rentals:new Set(monthActivities.filter(a=>a.kind==="booking").map(a=>a.booking.id)).size
  };

  const step=delta=>setAnchor(prev=>{
    const next=new Date(Date.UTC(prev.year,prev.month+delta,1));
    return {year:next.getUTCFullYear(),month:next.getUTCMonth()};
  });
  const goToday=()=>{const t=new Date();setAnchor({year:t.getFullYear(),month:t.getMonth()})};

  // Enough years to plan ahead and review the past, always including whatever
  // month is currently in view so the select can never end up blank.
  const yearOptions=useMemo(()=>{
    const thisYear=new Date().getFullYear();
    const first=Math.min(thisYear,anchor.year)-3;
    const last=Math.max(thisYear,anchor.year)+7;
    return Array.from({length:last-first+1},(_,i)=>first+i);
  },[anchor.year]);

  const openNew=(date=todayKey())=>setEditor({id:null,form:blankForm(date)});
  const openEdit=entry=>setEditor({id:entry.id,form:entryToForm(entry)});

  const save=async()=>{
    if(!editor) return;
    setSaving(true);
    setError("");
    try{
      await api(editor.id?`/admin/calendar/${editor.id}`:"/admin/calendar",{method:editor.id?"PATCH":"POST",body:JSON.stringify(editor.form)});
      setEditor(null);
      load(grid.from,grid.to);
    }catch(e){setError(e.message)}
    finally{setSaving(false)}
  };

  // Cancel is a soft status change, so it sends the whole entry: the PATCH
  // route validates the full shape and replaces every field.
  const setStatus=(entry,status)=>api(`/admin/calendar/${entry.id}`,{method:"PATCH",body:JSON.stringify({...entryToForm(entry),status})})
    .then(()=>load(grid.from,grid.to))
    .catch(e=>setError(e.message));

  const remove=async entry=>{
    setDeletingEntry(true);
    setError("");
    try{
      await api(`/admin/calendar/${entry.id}`,{method:"DELETE"});
      setDeleteEntryTarget(null);
      load(grid.from,grid.to);
    }catch(e){setError(e.message)}
    finally{setDeletingEntry(false)}
  };

  const dayItems=openDay?(byDay.get(openDay)||[]):[];
  const filtering=search.trim()!==""||typeFilter!=="all"||statusFilter!=="all";

  return <AdminShell title="Calendar" subtitle="Monthly schedule of reservations, bookings, events and notes.">
    {error&&<div className="login-error">{error}</div>}

    <section className="kpi-grid">
      <Kpi index={0} label="Scheduled this month" value={stats.scheduled} detail="Reservations, events and notes"/>
      <Kpi index={1} label="Pending" value={stats.pending} detail="Awaiting confirmation"/>
      <Kpi index={2} label="Confirmed" value={stats.confirmed} detail="Locked in"/>
      <Kpi index={3} label="Rental bookings" value={stats.rentals} detail="Read-only, from Bookings"/>
    </section>

    <div className="admin-page-toolbar">
      <div className="admin-search">
        <span aria-hidden="true">⌕</span>
        <input aria-label="Search the calendar" placeholder="Search by title, customer, location or notes..." value={search} onChange={e=>setSearch(e.target.value)}/>
      </div>
      <div className="admin-toolbar-controls payment-filters">
        <button className="primary-button" onClick={()=>openNew()} disabled={saving}>+ Add Entry</button>
        <select className="booking-status-select" aria-label="Filter by type" value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}>
          <option value="all">All Types</option>
          {Object.entries(TYPE_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
        </select>
        <select className="booking-status-select" aria-label="Filter by status" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="all">All Statuses</option>
          {Object.entries(ENTRY_STATUS_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
        </select>
      </div>
    </div>

    <section className="admin-card cal-shell">
      <header className="cal-bar">
        <div className="cal-bar-nav">
          <button className="mini-button cal-arrow" onClick={()=>step(-1)} aria-label="Previous month" title="Previous month">&larr;</button>
          <button className="mini-button" onClick={goToday}>Today</button>
          <button className="mini-button cal-arrow" onClick={()=>step(1)} aria-label="Next month" title="Next month">&rarr;</button>
        </div>
        <div className="cal-period">
          <select className="cal-select" aria-label="Month" value={anchor.month} onChange={e=>setAnchor(prev=>({...prev,month:Number(e.target.value)}))}>
            {MONTH_NAMES.map((name,i)=><option key={name} value={i}>{name}</option>)}
          </select>
          <select className="cal-select cal-year" aria-label="Year" value={anchor.year} onChange={e=>setAnchor(prev=>({...prev,year:Number(e.target.value)}))}>
            {yearOptions.map(y=><option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <span className="cal-range-note">{grid.from} to {grid.to}</span>
      </header>

      <div className="cal-weekdays">{WEEKDAYS.map(d=><span key={d}>{d}</span>)}</div>

      <div className="cal-grid">
        {grid.cells.map(cell=>{
          const key=isoUtc(cell);
          const items=byDay.get(key)||[];
          const inMonth=cell.getUTCMonth()===anchor.month&&cell.getUTCFullYear()===anchor.year;
          const isToday=key===todayKey();
          return <div key={key} className={`cal-cell ${inMonth?"":"cal-cell-outside"} ${isToday?"cal-cell-today":""}`}>
            <button type="button" className="cal-daynum" onClick={()=>setOpenDay(key)} aria-label={`View ${longDate(key)}`}>
              {cell.getUTCDate()}
              {isToday&&<span className="cal-today-tag">Today</span>}
            </button>
            <div className="cal-items">
              {items.slice(0,MAX_PILLS).map(item=>item.kind==="booking"
                ? <span key={`b${item.booking.id}`} className="cal-pill cal-pill-booking">
                    <em>{item.booking.booking_no}</em> {item.booking.customer_name}
                  </span>
                : <span key={`e${item.entry.id}`} className={`cal-pill cal-pill-${item.entry.entry_type} cal-pill-${item.entry.status}`}>
                    {item.time&&<em>{item.time}</em>} {item.entry.title}
                  </span>)}
              {items.length>MAX_PILLS&&<button type="button" className="cal-more" onClick={()=>setOpenDay(key)}>View more ({items.length-MAX_PILLS} more)</button>}
            </div>
            <button type="button" className="cal-add" onClick={()=>openNew(key)} aria-label={`Add entry on ${longDate(key)}`}>+ Add</button>
          </div>;
        })}
      </div>

      {filtering&&<p className="cal-filter-note">Filters are applied to this view only. Real rental bookings are shown read-only; edit them from Bookings.</p>}
    </section>

    {openDay&&<div className="modal-backdrop" onClick={()=>setOpenDay(null)}><div className="modal cal-modal" onClick={e=>e.stopPropagation()}>
      <div className="modal-head"><div><span className="eyebrow">{dayItems.length} scheduled</span><h2>{longDate(openDay)}</h2></div><button type="button" onClick={()=>setOpenDay(null)}>×</button></div>
      {dayItems.length===0?<div className="inventory-empty"><h3>Nothing scheduled</h3><p>No entries on this day.</p></div>:<div className="cal-day-list">
        {dayItems.map(item=>item.kind==="booking"
          ? <article key={`b${item.booking.id}`} className="cal-day-item cal-day-item-booking">
              <div className="cal-day-item-head">
                <span className="status-pill confirmed">Rental Booking</span>
                <strong>{item.booking.booking_no}</strong>
                <span className="cal-readonly">Read-only</span>
              </div>
              <dl className="detail-grid">
                <div><small>Customer</small><strong>{item.booking.customer_name||"—"}</strong></div>
                <div><small>Status</small><strong>{BOOKING_STATUS_LABELS[item.booking.status]||item.booking.status}</strong></div>
                <div><small>Rental dates</small><strong>{dayKey(item.booking.start_date)} to {dayKey(item.booking.end_date)}</strong></div>
                <div><small>Payment</small><strong>{item.booking.payment_status}</strong></div>
                <div className="span-2"><small>Items</small><strong>{item.booking.items||"—"}</strong></div>
              </dl>
            </article>
          : <article key={`e${item.entry.id}`} className="cal-day-item">
              <div className="cal-day-item-head">
                <span className={`status-pill cal-status-${item.entry.status}`}>{ENTRY_STATUS_LABELS[item.entry.status]||item.entry.status}</span>
                <span className={`cal-kind cal-kind-${item.entry.entry_type}`}>{TYPE_LABELS[item.entry.entry_type]}</span>
                <strong>{item.entry.title}</strong>
              </div>
              <dl className="detail-grid">
                <div><small>Time</small><strong>{clock(item.entry.start_time)?`${clock(item.entry.start_time)}${clock(item.entry.end_time)?` to ${clock(item.entry.end_time)}`:""}`:"All day"}</strong></div>
                <div><small>Customer</small><strong>{item.entry.customer_name||"—"}</strong></div>
                {item.entry.customer_phone&&<div><small>Contact</small><strong>{item.entry.customer_phone}{item.entry.customer_email?` · ${item.entry.customer_email}`:""}</strong></div>}
                {item.entry.location&&<div><small>Location</small><strong>{item.entry.location}</strong></div>}
                {item.entry.guests!=null&&<div><small>Guests</small><strong>{item.entry.guests}</strong></div>}
                {item.entry.category&&<div><small>Category</small><strong>{item.entry.category}</strong></div>}
                {item.entry.reminder_at&&<div><small>Reminder</small><strong>{new Date(item.entry.reminder_at).toISOString().slice(0,16).replace("T"," ")}</strong></div>}
                <div><small>Added by</small><strong>{item.entry.created_by||"—"}</strong></div>
              </dl>
              {item.entry.details&&<p className="cal-day-text">{item.entry.details}</p>}
              {item.entry.notes&&<p className="cal-day-text"><em>Note:</em> {item.entry.notes}</p>}
              <div className="booking-actions cal-day-actions">
                <button className="secondary-button" onClick={()=>openEdit(item.entry)}>Edit</button>
                {item.entry.status!=="cancelled"&&<button className="secondary-button" onClick={()=>setStatus(item.entry,"cancelled")}>Cancel Entry</button>}
                {item.entry.status==="cancelled"&&<button className="secondary-button" onClick={()=>setStatus(item.entry,"confirmed")}>Restore</button>}
                {isAdminUser()&&<button className="secondary-button danger" onClick={()=>setDeleteEntryTarget(item.entry)}>Delete</button>}
              </div>
            </article>)}
      </div>}
      <div className="modal-actions"><button className="secondary-button" onClick={()=>openNew(openDay)}>+ Add on this day</button><button className="primary-button" onClick={()=>setOpenDay(null)}>Close</button></div>
    </div></div>}

    {editor&&<div className="modal-backdrop" onClick={()=>setEditor(null)}><div className="modal cal-entry-modal" onClick={e=>e.stopPropagation()}>
      <div className="modal-head"><div><span className="eyebrow">{editor.id?"Edit Entry":"New Entry"}</span><h2>{editor.id?"Update Calendar Entry":TYPE_LABELS[editor.form.entry_type]}</h2></div><button type="button" onClick={()=>setEditor(null)}>×</button></div>
      <div className="form-grid">
        <label>Type<select value={editor.form.entry_type} onChange={e=>setEditor({...editor,form:{...editor.form,entry_type:e.target.value}})}>{Object.entries(TYPE_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
        <label>Status<select value={editor.form.status} onChange={e=>setEditor({...editor,form:{...editor.form,status:e.target.value}})}>{Object.entries(ENTRY_STATUS_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
        <label className="span-2">Title<input required value={editor.form.title} onChange={e=>setEditor({...editor,form:{...editor.form,title:e.target.value}})} placeholder="What is scheduled?"/></label>
        <label className="span-2">Date<input type="date" required value={editor.form.entry_date} onChange={e=>setEditor({...editor,form:{...editor.form,entry_date:e.target.value}})}/></label>
        <label>Start time<input type="time" value={editor.form.start_time} onChange={e=>setEditor({...editor,form:{...editor.form,start_time:e.target.value}})}/></label>
        <label>End time<input type="time" value={editor.form.end_time} onChange={e=>setEditor({...editor,form:{...editor.form,end_time:e.target.value}})}/></label>
        <label>Customer name<input value={editor.form.customer_name} onChange={e=>setEditor({...editor,form:{...editor.form,customer_name:e.target.value}})} placeholder="Optional"/></label>
        <label>Contact number<input value={editor.form.customer_phone} onChange={e=>setEditor({...editor,form:{...editor.form,customer_phone:e.target.value}})} placeholder="Optional"/></label>
        <label className="span-2">Customer email<input type="email" value={editor.form.customer_email} onChange={e=>setEditor({...editor,form:{...editor.form,customer_email:e.target.value}})} placeholder="Optional"/></label>
        <label>Location<input value={editor.form.location} onChange={e=>setEditor({...editor,form:{...editor.form,location:e.target.value}})} placeholder="Optional"/></label>
        <label>Guests<input type="number" min="0" value={editor.form.guests} onChange={e=>setEditor({...editor,form:{...editor.form,guests:e.target.value}})} placeholder="Optional"/></label>
        <label className="span-2">Reminder<input type="datetime-local" value={editor.form.reminder_at} onChange={e=>setEditor({...editor,form:{...editor.form,reminder_at:e.target.value}})}/></label>
        <label className="span-2">Details<textarea value={editor.form.details} onChange={e=>setEditor({...editor,form:{...editor.form,details:e.target.value}})} placeholder="Optional"/></label>
        <label className="span-2">Notes<textarea value={editor.form.notes} onChange={e=>setEditor({...editor,form:{...editor.form,notes:e.target.value}})} placeholder="Optional"/></label>
      </div>
      <div className="modal-actions"><button className="secondary-button" onClick={()=>setEditor(null)}>Cancel</button><button className="primary-button" onClick={save} disabled={saving}>{saving?"Saving...":editor.id?"Save Changes":"Add to Calendar"}</button></div>
    </div></div>}

    {deleteEntryTarget&&<div className="modal-backdrop" onClick={()=>setDeleteEntryTarget(null)}><div className="modal confirm-modal" onClick={e=>e.stopPropagation()}>
      <h3>Delete Entry</h3>
      <p>Are you sure you want to delete <strong>{deleteEntryTarget.title}</strong>?</p>
      <small>This action cannot be undone.</small>
      <div className="confirm-modal-actions">
        <button className="secondary-button" onClick={()=>setDeleteEntryTarget(null)}>Cancel</button>
        <button className="danger-button" disabled={deletingEntry} onClick={()=>remove(deleteEntryTarget)}>{deletingEntry?"Deleting...":"Delete"}</button>
      </div>
    </div></div>}
  </AdminShell>;
}
