import React, { useState } from "react";
import { api } from "../lib/api";
import { Kpi } from "../components/Kpi";
import { AdminShell } from "../components/layout/AdminShell";
import { peso } from "../lib/format";

function formatReportCurrency(value, currency="PHP") {
  try {
    return new Intl.NumberFormat("en-PH", { style:"currency", currency, maximumFractionDigits:0 }).format(Number(value || 0));
  } catch {
    return peso(Number(value || 0));
  }
}

function changeLabel(value, suffix="vs last month") {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "No previous-period data";
  const n = Number(value);
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}% ${suffix}`;
}

function AnimatedRevenueChart({ data=[], currency="PHP" }) {
  const [hovered,setHovered] = useState(null);
  const reduceMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const width=760, height=260, pad={l:54,r:18,t:18,b:42};
  const values=data.map(x=>Number(x.revenue||0));
  const max=Math.max(0,...values);
  const yMax=max>0 ? max*1.12 : 1;
  const innerW=width-pad.l-pad.r, innerH=height-pad.t-pad.b;
  const points=data.map((d,i)=>({
    ...d,
    x: pad.l + (data.length<=1?0:(i/(data.length-1))*innerW),
    y: pad.t + innerH - (Number(d.revenue||0)/yMax)*innerH
  }));
  const linePath=points.length?`M ${points.map(p=>`${p.x} ${p.y}`).join(" L ")}`:"";
  const areaPath=points.length?`${linePath} L ${points[points.length-1].x} ${pad.t+innerH} L ${points[0].x} ${pad.t+innerH} Z`:"";
  const grid=[0,.25,.5,.75,1];
  const noRevenue=max===0;

  return <div className="revenue-chart-wrap" aria-label="Revenue for the last 12 months">
    <svg className="revenue-line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-describedby="revenue-chart-desc">
      <defs>
        <linearGradient id="revenueAreaGradient" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity=".28"/>
          <stop offset="100%" stopColor="currentColor" stopOpacity=".02"/>
        </linearGradient>
      </defs>
      {grid.map((g,i)=>{
        const y=pad.t+innerH-(g*innerH);
        const val=yMax*g;
        return <g key={i}><line className="chart-grid-line" x1={pad.l} x2={width-pad.r} y1={y} y2={y}/><text className="chart-y-label" x={pad.l-9} y={y+4} textAnchor="end">{val===0?"0":new Intl.NumberFormat("en",{notation:"compact",maximumFractionDigits:1}).format(val)}</text></g>
      })}
      {areaPath && <path className={`revenue-area ${reduceMotion?"no-motion":""}`} d={areaPath} fill="url(#revenueAreaGradient)"/>}
      {linePath && <path className={`revenue-line ${reduceMotion?"no-motion":""}`} d={linePath} pathLength="1"/>}
      {points.map((p,i)=><g key={p.month}>
        <text className="chart-x-label" x={p.x} y={height-14} textAnchor="middle">{p.label}</text>
        <circle className={`revenue-hit ${hovered===i?"active":""}`} cx={p.x} cy={p.y} r="14" onMouseEnter={()=>setHovered(i)} onMouseLeave={()=>setHovered(null)} onFocus={()=>setHovered(i)} onBlur={()=>setHovered(null)} tabIndex="0" aria-label={`${p.full_label}: ${formatReportCurrency(p.revenue,currency)}`}/>
        <circle className={`revenue-dot ${hovered===i?"active":""}`} cx={p.x} cy={p.y} r={hovered===i?5:3}/>
      </g>)}
    </svg>
    <span id="revenue-chart-desc" className="sr-only">{data.map(x=>`${x.full_label}: ${formatReportCurrency(x.revenue,currency)}`).join("; ")}</span>
    {hovered!==null && points[hovered] && <div className="revenue-tooltip" style={{left:`${(points[hovered].x/width)*100}%`,top:`${(points[hovered].y/height)*100}%`}}><strong>{points[hovered].full_label}</strong><span>{formatReportCurrency(points[hovered].revenue,currency)}</span></div>}
    {noRevenue && <div className="chart-empty-message">No revenue recorded for this period</div>}
  </div>
}

export function Reports() {
  const [report,setReport]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [updatedAt,setUpdatedAt]=useState(null);

  const load=async({silent=false}={})=>{
    if(!silent) setLoading(true);
    try {
      const data=await api("/admin/reports");
      setReport(data); setError(""); setUpdatedAt(new Date());
    } catch(e) { setError(e.message || "Unable to load report data."); }
    finally { if(!silent) setLoading(false); }
  };

  React.useEffect(()=>{
    load();
    const timer=setInterval(()=>load({silent:true}),60000);
    return ()=>clearInterval(timer);
  },[]);

  const summary=report?.summary || {};
  const currency=report?.currency || "PHP";
  const top=summary.top_item;

  return <AdminShell title="Reports" subtitle="Revenue, rental performance, utilization, and overdue insights.">
    {error&&<div className="login-error">Unable to load report data: {error}</div>}
    {loading&&!report ? <section className="admin-card report-loading">Loading report data...</section> : <>
      <section className="kpi-grid">
        <Kpi label="Monthly revenue" value={formatReportCurrency(summary.monthly_revenue,currency)} detail={changeLabel(summary.monthly_revenue_change)}/>
        <Kpi label="Total rentals" value={Number(summary.total_rentals||0)} detail={changeLabel(summary.rental_change)}/>
        <Kpi label="Top item" value={top?.item_name || "No data"} detail={`${Number(top?.rented_quantity||0)} rented units`}/>
        <Kpi label="Utilization" value={`${Number(summary.utilization||0).toFixed(1)}%`} detail={`${Number(summary.currently_rented_units||0)} of ${Number(summary.total_rentable_units||0)} units rented`}/>
      </section>
      <div className="dashboard-grid reports-grid">
        <section className="admin-card stat-card revenue-report-card">
          <div className="card-heading report-chart-heading"><div><span>Revenue trend</span><h2>Last 12 months</h2></div><div className="report-updated"><span>{updatedAt?"Updated just now":"Waiting for data"}</span><button className="report-refresh" onClick={()=>load()} disabled={loading}>{loading?"Refreshing…":"Refresh"}</button></div></div>
          <AnimatedRevenueChart data={report?.revenue_trend||[]} currency={currency}/>
        </section>
        <section className="admin-card">
          <div className="card-heading"><div><span>Most rented</span><h2>Top-performing items</h2></div></div>
          {(report?.top_items||[]).length ? report.top_items.map((x,i)=><div className="rank-row" key={x.rental_item_id || `${x.item_name}-${i}`}><span>{String(i+1).padStart(2,"0")}</span>{x.image_url?<img src={x.image_url} alt=""/>:<div className="rank-image-placeholder">B</div>}<div><strong>{x.item_name}</strong><small>{x.category}</small></div><b>{Number(x.rented_quantity||0)} rented</b></div>) : <div className="reports-empty">No rental activity yet.</div>}
        </section>
      </div>
    </>}
  </AdminShell>
}
