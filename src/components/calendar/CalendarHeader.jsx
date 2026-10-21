import React, { useEffect, useRef, useState } from "react";
import { MONTH_NAMES } from "../../lib/calendarDates";

const VIEWS=[["day","Day"],["week","Week"],["month","Month"]];

// Title, prev/next, Today, the Day/Week/Month switch, and a small popover to
// jump to any month and year (the title opens it).
export function CalendarHeader({view,onView,title,year,month,yearOptions,onPrev,onNext,onToday,onJump}){
  const [jumpOpen,setJumpOpen]=useState(false);
  const rootRef=useRef(null);

  useEffect(()=>{
    if(!jumpOpen) return undefined;
    const onPointer=e=>{if(!rootRef.current?.contains(e.target)) setJumpOpen(false)};
    const onKey=e=>{if(e.key==="Escape") setJumpOpen(false)};
    document.addEventListener("pointerdown",onPointer);
    document.addEventListener("keydown",onKey);
    return()=>{document.removeEventListener("pointerdown",onPointer);document.removeEventListener("keydown",onKey)};
  },[jumpOpen]);

  const unit=view==="month"?"month":view==="week"?"week":"day";

  return <header className="cal-head">
    <div className="cal-head-nav" ref={rootRef}>
      <button type="button" className="cal-round" onClick={onPrev} aria-label={`Previous ${unit}`} title={`Previous ${unit}`}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>
      </button>
      <button type="button" className="cal-title" aria-haspopup="dialog" aria-expanded={jumpOpen} onClick={()=>setJumpOpen(o=>!o)} title="Jump to a month">
        <h2>{title}</h2>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
      </button>
      <button type="button" className="cal-round" onClick={onNext} aria-label={`Next ${unit}`} title={`Next ${unit}`}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
      </button>
      <button type="button" className="cal-today-btn" onClick={onToday}>Today</button>

      {jumpOpen&&<div className="cal-jump" role="dialog" aria-label="Jump to month">
        <select className="cal-select" aria-label="Month" value={month} onChange={e=>onJump(year,Number(e.target.value))}>
          {MONTH_NAMES.map((name,i)=><option key={name} value={i}>{name}</option>)}
        </select>
        <select className="cal-select cal-year" aria-label="Year" value={year} onChange={e=>onJump(Number(e.target.value),month)}>
          {yearOptions.map(y=><option key={y} value={y}>{y}</option>)}
        </select>
      </div>}
    </div>

    <div className="cal-seg" role="group" aria-label="Calendar view">
      {VIEWS.map(([key,label])=><button key={key} type="button" className={view===key?"active":""} aria-pressed={view===key} onClick={()=>onView(key)}>{label}</button>)}
    </div>
  </header>;
}
