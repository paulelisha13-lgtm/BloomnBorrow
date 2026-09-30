import React, { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { BookingTable } from "../components/BookingTable";
import { Kpi } from "../components/Kpi";
import { AdminShell } from "../components/layout/AdminShell";
import { peso } from "../lib/format";

function DashboardRevenueBarChart({ rows=[] }) {
  const max=Math.max(1,...rows.map(x=>Number(x.revenue)||0));
  const [hovered,setHovered]=useState(null);
  return <div className="revenue-bars" role="img" aria-label="Revenue collections for the last seven days">
    {rows.map((row,index)=>{
      const revenue=Number(row.revenue)||0;
      const height=revenue===0?0:Math.max(5,(revenue/max)*100);
      return <div className="revenue-bar-col" key={row.date} onMouseEnter={()=>setHovered(index)} onMouseLeave={()=>setHovered(null)} onFocus={()=>setHovered(index)} onBlur={()=>setHovered(null)} tabIndex="0" aria-label={`${row.label}: ${peso(revenue)}`}>
        <div className="revenue-bar-track">
          {hovered===index&&<div className="revenue-bar-tooltip"><small>{row.label}</small><strong>{peso(revenue)}</strong></div>}
          <span className={`revenue-bar-fill ${hovered===index?"hovered":""}`} style={{height:`${height}%`,animationDelay:`${index*80}ms`}}/>
        </div>
        <small className="revenue-bar-label">{row.label}</small>
      </div>;
    })}
  </div>;
}

function DashboardBookingAreaChart({ rows=[] }) {
  const width=620, height=210, padX=26, padTop=18, padBottom=32;
  const values=rows.map(row=>Number(row.bookings)||0);
  const max=Math.max(1,...values);
  const usableW=width-padX*2, usableH=height-padTop-padBottom;
  const points=rows.map((row,index)=>({x:padX+(rows.length>1?(index*usableW)/(rows.length-1):usableW/2),y:padTop+usableH-((Number(row.bookings)||0)/max)*usableH,row}));
  const linePoints=points.map(point=>`${point.x},${point.y}`).join(" ");
  const areaPoints=points.length?`${padX},${height-padBottom} ${linePoints} ${padX+usableW},${height-padBottom}`:"";
  const [hover,setHover]=useState(null);
  return <div className="dash-chart-wrap">
    <svg className="dash-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Booking activity for the last seven days">
      <defs><linearGradient id="bookingAreaGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#12aaa7" stopOpacity=".42"/><stop offset="48%" stopColor="#12aaa7" stopOpacity=".16"/><stop offset="100%" stopColor="#12aaa7" stopOpacity="0"/></linearGradient></defs>
      {[0,.5,1].map((ratio,index)=><line key={index} x1={padX} y1={padTop+usableH*ratio} x2={width-padX} y2={padTop+usableH*ratio} className="chart-grid-line"/>)}
      {areaPoints&&<polygon points={areaPoints} className="booking-area"/>}
      {linePoints&&<polyline points={linePoints} className="booking-line" pathLength="1"/>}
      {points.map((point,index)=><g key={point.row.date} className="booking-point-group" tabIndex="0" onMouseEnter={()=>setHover(index)} onMouseLeave={()=>setHover(null)} onFocus={()=>setHover(index)} onBlur={()=>setHover(null)} aria-label={`${point.row.label}: ${Number(point.row.bookings||0)} bookings`}>
        <circle cx={point.x} cy={point.y} r={hover===index?6:4} className={hover===index?"booking-point active":"booking-point"}/>
        <rect x={point.x-25} y={padTop} width="50" height={usableH} fill="transparent"/>
        <text x={point.x} y={height-8} textAnchor="middle" className="chart-axis-label">{point.row.label}</text>
      </g>)}
    </svg>
    {hover!==null&&points[hover]&&<div className="dash-chart-tooltip" style={{left:`${(points[hover].x/width)*100}%`}}><b>{points[hover].row.label}</b><span>{Number(points[hover].row.bookings||0)} bookings</span></div>}
  </div>;
}

export function AdminDashboard() {
  const [data,setData]=useState(null);
  const [updatedAt,setUpdatedAt]=useState(null);
  const [escalations,setEscalations]=useState(null);
  const load=React.useCallback(()=>api("/admin/dashboard").then(d=>{setData(d);setUpdatedAt(new Date())}).catch(()=>{}),[]);
  const loadEscalations=React.useCallback(()=>api("/admin/escalations").then(d=>setEscalations(d)).catch(()=>{}),[]);
  React.useEffect(()=>{load();loadEscalations();const id=setInterval(()=>{load();loadEscalations()},60000);return()=>clearInterval(id)},[load,loadEscalations]);
  const s=data?.stats || {};
  const daily=data?.daily||[];
  const sevenDayRevenue=daily.reduce((sum,x)=>sum+Number(x.revenue||0),0);
  const sevenDayBookings=daily.reduce((sum,x)=>sum+Number(x.bookings||0),0);
  const escStats=escalations?.stats||{};

  return <AdminShell title="Dashboard" subtitle="Live overview of your rental business.">
    <section className="kpi-grid">
      <Kpi index={0} icon="▣" label="Today's bookings" value={s.today_bookings ?? 0} detail={`${s.upcoming_reservations ?? 0} upcoming`}/>
      <Kpi index={1} icon="↗" label="Active rentals" value={s.active_rentals ?? 0} detail="Currently rented"/>
      <Kpi index={2} icon="!" pulseIcon label="Overdue rentals" value={s.overdue_rentals ?? 0} detail="Needs attention"/>
      <Kpi index={3} icon="₱" currency label="Revenue today" value={Number(s.revenue_today ?? 0)} detail={`${s.pending_payments ?? 0} pending payments`}/>
    </section>

    <div className="dashboard-layout">
      <div className="dashboard-analytics-row">
        <section className="admin-card dashboard-chart-card">
          <div className="card-heading"><div><span>Revenue · last 7 days</span><h2>Collections trend</h2></div><button className="chart-refresh" onClick={load}>Refresh</button></div>
          <div className="chart-summary"><strong>{peso(sevenDayRevenue)}</strong><small>{updatedAt?"Updated just now":"Loading…"}</small></div>
          <DashboardRevenueBarChart rows={daily}/>
          {daily.length>0&&daily.every(row=>Number(row.revenue||0)===0)&&<p className="chart-empty">No revenue activity for this period.</p>}
        </section>

        <section className="admin-card dashboard-chart-card">
          <div className="card-heading"><div><span>Bookings · last 7 days</span><h2>Booking activity</h2></div><Link to="/admin/bookings">View bookings</Link></div>
          <div className="chart-summary"><strong>{sevenDayBookings}</strong><small>Valid bookings</small></div>
          <DashboardBookingAreaChart rows={daily}/>
          {daily.length>0&&daily.every(row=>Number(row.bookings||0)===0)&&<p className="chart-empty">No booking activity for this period.</p>}
        </section>
      </div>

      <div className="dashboard-support-row">
        <section className="admin-card bookings-card">
          <div className="card-heading"><div><span>Recent bookings</span><h2>Latest reservations</h2></div><Link to="/admin/bookings">View all</Link></div>
          <BookingTable rows={(data?.recent||[]).map(b=>({id:b.booking_no,customer:b.customer_name,item:b.items||"—",dates:`${String(b.start_date).slice(0,10)} → ${String(b.end_date).slice(0,10)}`,total:Number(b.grand_total),status:b.status[0].toUpperCase()+b.status.slice(1)}))}/>
        </section>
        <section className="admin-card inventory-card"><div className="card-heading"><div><span>Operations</span><h2>Attention needed</h2></div></div><div className="ops-summary"><span><b>{s.unavailable_items ?? 0}</b> unavailable / maintenance items</span><span><b>{s.pending_payments ?? 0}</b> bookings with balance</span><span><b>{s.overdue_rentals ?? 0}</b> overdue rentals</span></div></section>
        <section className="admin-card upcoming-card"><div className="card-heading"><div><span>Workflow</span><h2>Quick actions</h2></div></div><div className="quick-actions">
          <Link className="quick-action-card" to="/admin/bookings">
            <span>Manage bookings</span>
          </Link>
          <Link className="quick-action-card" to="/admin/inventory">
            <span>Manage inventory</span>
          </Link>
          <Link className="quick-action-card" to="/admin/payments">
            <span>Payments</span>
          </Link>
          <Link className="quick-action-card" to="/admin/maintenance">
            <span>Maintenance</span>
          </Link>
        </div></section>
      </div>

      {escStats.total>0&&<div className="dashboard-escalation-row">
        <section className="admin-card escalation-card">
          <div className="card-heading"><div><span>⚠ Overdue Escalation</span><h2>Rentals requiring follow-up</h2></div><Link to="/admin/bookings">View all</Link></div>
          <div className="escalation-stats">
            <div className="escalation-stat gentle"><span className="esc-badge gentle">●</span><b>{escStats.gentle||0}</b><small>Gentle</small></div>
            <div className="escalation-stat reminder"><span className="esc-badge reminder">●</span><b>{escStats.reminder||0}</b><small>Reminder</small></div>
            <div className="escalation-stat formal"><span className="esc-badge formal">●</span><b>{escStats.formal||0}</b><small>Formal</small></div>
            <div className="escalation-stat final"><span className="esc-badge final">●</span><b>{escStats.final||0}</b><small>Final Notice</small></div>
          </div>
          <div className="escalation-list">
            {(escalations?.escalated||[]).slice(0,5).map(e=><div className="escalation-row" key={e.id}>
              <div className="esc-row-main">
                <span className={`esc-badge ${e.level}`}>{e.level}</span>
                <div className="esc-row-info">
                  <strong>{e.customer_name}</strong>
                  <small>{e.booking_no} · {e.daysText}</small>
                </div>
              </div>
              <div className="esc-row-actions">
                <span className="esc-fee">{peso(e.lateFee)}</span>
                <Link className="secondary-button" to="/admin/bookings">View</Link>
              </div>
            </div>)}
          </div>
        </section>
      </div>}
    </div>
  </AdminShell>;
}
