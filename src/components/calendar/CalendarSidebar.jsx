import React from "react";
import { shortDate } from "../../lib/calendarDates";

const TILES=[
  ["scheduled","Scheduled","neutral"],
  ["completed","Completed","good"],
  ["pending","Pending","warn"],
  ["overdue","Overdue","bad"]
];

// Right-hand column: what's on today, how the viewed month is going, and the
// rentals going out or coming back over the next week. Everything here is
// independent of the filters and of which month is on screen.
export function CalendarSidebar({today,summary,monthLabel,upcoming,onOpenDay,onAdd}){
  return <aside className="cal-side" aria-label="Calendar overview">
    <section className="cal-side-card">
      <header><h3>Today's tasks</h3><span className="cal-badge" aria-label={`${today.length} tasks today`}>{today.length}</span></header>
      {today.length===0
        ? <div className="cal-side-empty"><p>Nothing scheduled today.</p><button type="button" className="cal-link" onClick={()=>onAdd()}>+ Add an entry</button></div>
        : <ul className="cal-task-list">
            {today.map(row=><li key={row.id}>
              <button type="button" onClick={()=>onOpenDay(row.day)}>
                <i className={`cal-dot cal-tone-${row.tone}`} aria-hidden="true"/>
                <span className="cal-task-title">{row.title}</span>
                <small>{row.when}</small>
              </button>
            </li>)}
          </ul>}
    </section>

    <section className="cal-side-card">
      <header><h3>{monthLabel} summary</h3></header>
      <div className="cal-tiles">
        {TILES.map(([key,label,tone])=><div key={key} className={`cal-tile cal-tile-${tone}`}>
          <strong>{summary[key]}</strong>
          <span>{label}</span>
        </div>)}
      </div>
      <p className="cal-side-note">{summary.rentals} rental booking{summary.rentals===1?"":"s"} this month (read-only, from Bookings)</p>
    </section>

    <section className="cal-side-card">
      <header><h3>Deliveries and pickups</h3><span className="cal-side-sub">Next 7 days</span></header>
      {upcoming.length===0
        ? <div className="cal-side-empty"><p>No rentals going out or due back this week.</p></div>
        : <div className="cal-run-list">
            {upcoming.map(group=><div key={group.day} className="cal-run-day">
              <h4>{group.isToday?"Today":shortDate(group.day)}</h4>
              <ul>
                {group.rows.map(row=><li key={row.id}>
                  <button type="button" onClick={()=>onOpenDay(group.day)}>
                    <span className={`cal-run-kind ${row.kind==="out"?"is-out":"is-due"}`}>{row.kind==="out"?"Out":"Due"}</span>
                    <span className="cal-run-body">
                      <strong>{row.customer}</strong>
                      <small>{row.items||row.code}</small>
                    </span>
                  </button>
                </li>)}
              </ul>
            </div>)}
          </div>}
    </section>
  </aside>;
}
