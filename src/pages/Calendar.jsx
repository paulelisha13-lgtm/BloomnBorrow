import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { AdminShell } from "../components/layout/AdminShell";
import { CalendarHeader } from "../components/calendar/CalendarHeader";
import { DayView, MonthView, WeekView } from "../components/calendar/CalendarViews";
import { CalendarSidebar } from "../components/calendar/CalendarSidebar";
import { EntryEditor } from "../components/calendar/EntryEditor";
import { isAdminUser } from "../lib/roles";
import { useDiscardGuard } from "../components/DiscardGuard";
import {
  BOOKING_STATUS_LABELS, DAY_MS, ENTRY_STATUS_LABELS, MONTH_NAMES, TYPE_LABELS,
  addDays, blankForm, buildDayMap, clock, dayKey, entryToForm, isoUtc, longDate,
  parseKey, shortDate, timeLabel, todayKey, weekStart
} from "../lib/calendarDates";

const VIEW_KEY="bb_admin_calendar_view";
const readView=()=>{
  try{const v=localStorage.getItem(VIEW_KEY);return ["day","week","month"].includes(v)?v:"month"}
  catch{return "month"}
};
const NO_RENTAL=new Set(["cancelled","rejected"]);
const pad=n=>String(n).padStart(2,"0");

// Month stepping keeps the day of the month where it exists (Jan 31 -> Feb 28).
const shiftMonth=(key,delta)=>{
  const {year,month,day}=parseKey(key);
  const target=new Date(Date.UTC(year,month+delta,1));
  const last=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();
  return `${target.getUTCFullYear()}-${pad(target.getUTCMonth()+1)}-${pad(Math.min(day,last))}`;
};

const mergeById=(a,b)=>{
  const seen=new Map();
  for(const row of [...a,...b]) seen.set(row.id,row);
  return [...seen.values()];
};

const periodTitle=(view,cursor)=>{
  const {year,month}=parseKey(cursor);
  if(view==="month") return `${MONTH_NAMES[month]} ${year}`;
  if(view==="day") return `${shortDate(cursor)}, ${year}`;
  const start=weekStart(cursor),end=addDays(start,6);
  const a=parseKey(start),b=parseKey(end);
  const m=n=>MONTH_NAMES[n].slice(0,3);
  if(a.year!==b.year) return `${m(a.month)} ${a.day}, ${a.year} – ${m(b.month)} ${b.day}, ${b.year}`;
  if(a.month!==b.month) return `${m(a.month)} ${a.day} – ${m(b.month)} ${b.day}, ${b.year}`;
  return `${m(a.month)} ${a.day} – ${b.day}, ${b.year}`;
};

export function Calendar() {
  const [view,setViewState]=useState(readView);
  const [cursor,setCursor]=useState(todayKey);
  const [entries,setEntries]=useState([]);
  const [bookings,setBookings]=useState([]);
  // Today through the next 7 days, loaded on its own so the sidebar stays right
  // whichever month is on screen.
  const [side,setSide]=useState({entries:[],bookings:[],from:"",to:""});
  const [error,setError]=useState("");
  const [search,setSearch]=useState("");
  const [typeFilter,setTypeFilter]=useState("all");
  const [statusFilter,setStatusFilter]=useState("all");
  const [openDay,setOpenDay]=useState(null);
  const [editor,setEditor]=useState(null);
  // Form as it was when the editor opened, so closing can tell if it changed.
  const [editorBaseline,setEditorBaseline]=useState("");
  const editorGuard=useDiscardGuard(Boolean(editor)&&JSON.stringify(editor.form)!==editorBaseline,()=>setEditor(null));
  const [saving,setSaving]=useState(false);
  const [deleteEntryTarget,setDeleteEntryTarget]=useState(null);
  const [deletingEntry,setDeletingEntry]=useState(false);

  const {year,month}=parseKey(cursor);
  const today=todayKey();

  const setView=next=>{
    setViewState(next);
    try{localStorage.setItem(VIEW_KEY,next)}catch{/* storage unavailable */}
  };

  // Always six weeks so the month never changes height as you navigate, and
  // so leading/trailing days of the month are visible and clickable. A week
  // or a day of the cursor's month always falls inside this window too.
  const grid=useMemo(()=>{
    const first=Date.UTC(year,month,1);
    const start=first-new Date(first).getUTCDay()*DAY_MS;
    const cells=Array.from({length:42},(_,i)=>new Date(start+i*DAY_MS));
    return {cells,from:isoUtc(cells[0]),to:isoUtc(cells[41])};
  },[year,month]);

  const load=useCallback((from,to)=>{
    setError("");
    api(`/admin/calendar?from=${from}&to=${to}`)
      .then(d=>{setEntries(d.entries||[]);setBookings(d.bookings||[])})
      .catch(e=>setError(e.message));
  },[]);

  const loadSide=useCallback(()=>{
    const from=todayKey(),to=addDays(from,7);
    api(`/admin/calendar?from=${from}&to=${to}`)
      .then(d=>setSide({entries:d.entries||[],bookings:d.bookings||[],from,to}))
      .catch(()=>{/* the main grid reports load errors; the sidebar just stays as it was */});
  },[]);

  useEffect(()=>{load(grid.from,grid.to)},[grid.from,grid.to,load]);
  useEffect(()=>{loadSide()},[loadSide]);

  const refresh=()=>{load(grid.from,grid.to);loadSide()};

  const monthPrefix=`${year}-${pad(month+1)}`;

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
  // rental bookings repeat across their whole start-to-end span. The sidebar's
  // own data is merged in so a day opened from there is complete too.
  const byDay=useMemo(()=>{
    const range={
      from:side.from&&side.from<grid.from?side.from:grid.from,
      to:side.to&&side.to>grid.to?side.to:grid.to
    };
    return buildDayMap(mergeById(entries,side.entries),mergeById(bookings,side.bookings),range,matches);
  },[entries,bookings,side,grid,matches]);

  const summary=useMemo(()=>{
    const list=[];
    for(const [key,items] of byDay){
      if(key.startsWith(monthPrefix)) list.push(...items);
    }
    const own=list.filter(a=>a.kind==="entry");
    // A multi-day rental repeats on every day it covers, so count the
    // bookings themselves rather than the day tiles they appear in.
    const rentals=new Set(list.filter(a=>a.kind==="booking").map(a=>a.booking.id));
    const overdue=new Set(list.filter(a=>a.kind==="booking"&&a.status==="overdue").map(a=>a.booking.id));
    return {
      scheduled:own.length,
      completed:own.filter(a=>a.status==="completed").length,
      pending:own.filter(a=>a.status==="pending").length,
      overdue:overdue.size,
      rentals:rentals.size
    };
  },[byDay,monthPrefix]);

  // Sidebar: what's on today.
  const todayTasks=useMemo(()=>{
    const rows=[];
    for(const e of side.entries){
      if(dayKey(e.entry_date)!==today||e.status==="cancelled") continue;
      rows.push({id:`e${e.id}`,day:today,tone:e.entry_type,title:e.title,when:timeLabel(e.start_time)||"All day",sort:clock(e.start_time)||"99:99"});
    }
    for(const b of side.bookings){
      if(NO_RENTAL.has(b.status)) continue;
      const name=b.customer_name||b.booking_no;
      if(dayKey(b.start_date)===today) rows.push({id:`o${b.id}`,day:today,tone:"booking",title:`Out: ${name}`,when:"Rental out",sort:"99:98"});
      if(dayKey(b.end_date)===today&&!["returned","completed"].includes(b.status)) rows.push({id:`d${b.id}`,day:today,tone:"booking",title:`Due back: ${name}`,when:"Due back",sort:"99:99"});
    }
    return rows.sort((a,b)=>a.sort.localeCompare(b.sort));
  },[side,today]);

  // Sidebar: rentals going out or coming back, grouped by day.
  const upcoming=useMemo(()=>{
    const groups=[];
    for(let i=0;i<=7;i++){
      const day=addDays(today,i);
      const rows=[];
      for(const b of side.bookings){
        if(NO_RENTAL.has(b.status)) continue;
        const base={customer:b.customer_name||b.booking_no,items:b.items,code:b.booking_no};
        if(dayKey(b.start_date)===day) rows.push({...base,id:`o${b.id}`,kind:"out"});
        if(dayKey(b.end_date)===day&&!["returned","completed"].includes(b.status)) rows.push({...base,id:`d${b.id}`,kind:"due"});
      }
      if(rows.length) groups.push({day,rows,isToday:i===0});
    }
    return groups;
  },[side,today]);

  const step=delta=>setCursor(prev=>view==="month"?shiftMonth(prev,delta):addDays(prev,delta*(view==="week"?7:1)));
  const jump=(y,m)=>setCursor(`${y}-${pad(m+1)}-01`);

  // Enough years to plan ahead and review the past, always including whatever
  // month is currently in view so the select can never end up blank.
  const yearOptions=useMemo(()=>{
    const thisYear=new Date().getFullYear();
    const first=Math.min(thisYear,year)-3;
    const last=Math.max(thisYear,year)+7;
    return Array.from({length:last-first+1},(_,i)=>first+i);
  },[year]);

  const openNew=(date=todayKey())=>{setError("");const form=blankForm(date);setEditorBaseline(JSON.stringify(form));setEditor({id:null,form})};
  const openEdit=entry=>{setError("");const form=entryToForm(entry);setEditorBaseline(JSON.stringify(form));setEditor({id:entry.id,form})};
  // Opening a day from the sidebar also moves the calendar there.
  const showDay=key=>{setCursor(key);setOpenDay(key)};

  const save=async()=>{
    if(!editor) return;
    setSaving(true);
    setError("");
    try{
      await api(editor.id?`/admin/calendar/${editor.id}`:"/admin/calendar",{method:editor.id?"PATCH":"POST",body:JSON.stringify(editor.form)});
      setEditor(null);
      refresh();
    }catch(e){setError(e.message)}
    finally{setSaving(false)}
  };

  // Cancel is a soft status change, so it sends the whole entry: the PATCH
  // route validates the full shape and replaces every field.
  const setStatus=(entry,status)=>api(`/admin/calendar/${entry.id}`,{method:"PATCH",body:JSON.stringify({...entryToForm(entry),status})})
    .then(refresh)
    .catch(e=>setError(e.message));

  const remove=async entry=>{
    setDeletingEntry(true);
    setError("");
    try{
      await api(`/admin/calendar/${entry.id}`,{method:"DELETE"});
      setDeleteEntryTarget(null);
      refresh();
    }catch(e){setError(e.message)}
    finally{setDeletingEntry(false)}
  };

  // Escape closes the day panel, unless a dialog opened from it is on top.
  useEffect(()=>{
    if(!openDay||editor||deleteEntryTarget) return undefined;
    const onKey=e=>{if(e.key==="Escape") setOpenDay(null)};
    document.addEventListener("keydown",onKey);
    return()=>document.removeEventListener("keydown",onKey);
  },[openDay,editor,deleteEntryTarget]);

  const dayItems=openDay?(byDay.get(openDay)||[]):[];
  const filtering=search.trim()!==""||typeFilter!=="all"||statusFilter!=="all";

  return <AdminShell title="Calendar" subtitle="Schedule of reservations, bookings, events and notes.">
    {error&&!editor&&<div className="login-error">{error}</div>}

    <div className="admin-page-toolbar calendar-toolbar">
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

    <div className="cal-layout">
      <section className="cal-card" aria-label="Calendar">
        <CalendarHeader
          view={view} onView={setView} title={periodTitle(view,cursor)}
          year={year} month={month} yearOptions={yearOptions}
          onPrev={()=>step(-1)} onNext={()=>step(1)} onToday={()=>setCursor(todayKey())} onJump={jump}
        />

        {view==="month"&&<MonthView cells={grid.cells} month={month} year={year} byDay={byDay} today={today} onOpenDay={setOpenDay} onAdd={openNew}/>}
        {view==="week"&&<WeekView start={weekStart(cursor)} byDay={byDay} today={today} onOpenDay={setOpenDay} onAdd={openNew}/>}
        {view==="day"&&<DayView day={cursor} items={byDay.get(cursor)||[]} today={today} onOpenDay={setOpenDay} onAdd={openNew}/>}

        <footer className="cal-legend">
          <ul aria-label="Colour key">
            {["booking","reservation","event","note"].map(type=><li key={type}><i className={`cal-dot cal-tone-${type}`} aria-hidden="true"/>{TYPE_LABELS[type]}</li>)}
          </ul>
          {filtering
            ? <p>Filters apply to this view only. Rental bookings are read-only; edit them from Bookings.</p>
            : <p>Rental bookings are read-only; edit them from Bookings.</p>}
        </footer>
      </section>

      <CalendarSidebar
        today={todayTasks} summary={summary} monthLabel={MONTH_NAMES[month]} upcoming={upcoming}
        onOpenDay={showDay} onAdd={openNew}
      />
    </div>

    {openDay&&<div className="modal-backdrop" onClick={()=>setOpenDay(null)}><div className="modal cal-modal" onClick={e=>e.stopPropagation()}>
      <div className="modal-head"><div><span className="eyebrow">{dayItems.length} scheduled</span><h2>{longDate(openDay)}</h2></div><button type="button" onClick={()=>setOpenDay(null)} aria-label="Close">×</button></div>
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

    {editor&&<EntryEditor editor={editor} setEditor={setEditor} saving={saving} error={error} onSave={save} onClose={editorGuard.requestClose}/>}
    {editorGuard.discardDialog}

    {deleteEntryTarget&&<div className="modal-backdrop" onClick={()=>setDeleteEntryTarget(null)}><div className="modal confirm-modal" onClick={e=>e.stopPropagation()}>
      <button type="button" className="confirm-modal-close" aria-label="Close delete entry confirmation" disabled={deletingEntry} onClick={()=>setDeleteEntryTarget(null)}>×</button>
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
