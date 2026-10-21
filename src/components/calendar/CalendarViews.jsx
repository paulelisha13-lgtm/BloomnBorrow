import React from "react";
import { CalChip } from "./CalChip";
import { WEEKDAYS, addDays, clock, isoUtc, longDate, parseKey, shortDate, timeLabel } from "../../lib/calendarDates";

const MAX_CHIPS=3;

const DayNumber=({day,today,outside,onClick,children})=>(
  <button type="button" className={`cal-daynum${today?" is-today":""}${outside?" is-outside":""}`} onClick={onClick} aria-label={`View ${longDate(day)}${today?" (today)":""}`} aria-current={today?"date":undefined}>
    {children}
  </button>
);

const AddButton=({day,onAdd,label="+ Add"})=>(
  <button type="button" className="cal-add" onClick={()=>onAdd(day)} aria-label={`Add entry on ${longDate(day)}`}>{label}</button>
);

export function MonthView({cells,month,year,byDay,today,onOpenDay,onAdd}){
  return <>
    <div className="cal-weekdays" aria-hidden="true">{WEEKDAYS.map(d=><span key={d}>{d}</span>)}</div>
    <div className="cal-grid">
      {cells.map(cell=>{
        const key=isoUtc(cell);
        const items=byDay.get(key)||[];
        const outside=cell.getUTCMonth()!==month||cell.getUTCFullYear()!==year;
        const isToday=key===today;
        return <div key={key} className={`cal-cell${outside?" is-outside":""}${isToday?" is-today":""}`}>
          <div className="cal-cell-top">
            <DayNumber day={key} today={isToday} outside={outside} onClick={()=>onOpenDay(key)}>{cell.getUTCDate()}</DayNumber>
            {items.length>0&&<span className="cal-count" aria-hidden="true">{items.length}</span>}
          </div>
          <div className="cal-items">
            {items.slice(0,MAX_CHIPS).map(item=><CalChip key={`${item.kind}${item.kind==="booking"?item.booking.id:item.entry.id}`} item={item} day={key} onOpen={onOpenDay}/>)}
            {items.length>MAX_CHIPS&&<button type="button" className="cal-more" onClick={()=>onOpenDay(key)}>+{items.length-MAX_CHIPS} more</button>}
          </div>
          <AddButton day={key} onAdd={onAdd}/>
        </div>;
      })}
    </div>
  </>;
}

export function WeekView({start,byDay,today,onOpenDay,onAdd}){
  const days=Array.from({length:7},(_,i)=>addDays(start,i));
  return <div className="cal-week">
    {days.map(key=>{
      const items=byDay.get(key)||[];
      const isToday=key===today;
      const {day}=parseKey(key);
      const dow=WEEKDAYS[new Date(`${key}T00:00:00Z`).getUTCDay()];
      return <section key={key} className={`cal-week-col${isToday?" is-today":""}`} aria-label={longDate(key)}>
        <header className="cal-week-head">
          <span>{dow}</span>
          <DayNumber day={key} today={isToday} onClick={()=>onOpenDay(key)}>{day}</DayNumber>
        </header>
        <div className="cal-week-items">
          {items.length===0&&<p className="cal-week-empty">Nothing scheduled</p>}
          {items.map(item=><CalChip key={`${item.kind}${item.kind==="booking"?item.booking.id:item.entry.id}`} item={item} day={key} onOpen={onOpenDay} variant="card"/>)}
        </div>
        <AddButton day={key} onAdd={onAdd} label="+ Add entry"/>
      </section>;
    })}
  </div>;
}

export function DayView({day,items,today,onOpenDay,onAdd}){
  const allDay=items.filter(i=>i.kind==="booking"||!clock(i.entry.start_time));
  const timed=items.filter(i=>i.kind==="entry"&&clock(i.entry.start_time));
  const itemKey=item=>`${item.kind}${item.kind==="booking"?item.booking.id:item.entry.id}`;

  if(items.length===0) return <div className="cal-day-empty">
    <strong>{day===today?"Nothing scheduled today":`Nothing scheduled on ${shortDate(day)}`}</strong>
    <p>Add a reservation, event or note to see it here.</p>
    <button type="button" className="primary-button" onClick={()=>onAdd(day)}>+ Add entry</button>
  </div>;

  return <div className="cal-agenda">
    {allDay.length>0&&<div className="cal-agenda-row">
      <span className="cal-agenda-time">All day</span>
      <div className="cal-agenda-list">{allDay.map(item=><CalChip key={itemKey(item)} item={item} day={day} onOpen={onOpenDay} variant="card"/>)}</div>
    </div>}
    {timed.map(item=><div key={itemKey(item)} className="cal-agenda-row">
      <span className="cal-agenda-time">{timeLabel(item.entry.start_time)}</span>
      <div className="cal-agenda-list"><CalChip item={item} day={day} onOpen={onOpenDay} variant="card"/></div>
    </div>)}
    <div className="cal-agenda-foot"><button type="button" className="cal-add is-visible" onClick={()=>onAdd(day)}>+ Add entry on this day</button></div>
  </div>;
}
