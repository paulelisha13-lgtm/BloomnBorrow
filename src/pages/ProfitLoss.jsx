import React, { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Kpi } from "../components/Kpi";
import { AdminShell } from "../components/layout/AdminShell";
import { peso } from "../lib/format";
import { buildProfitLossCsv } from "../lib/profitLossCsv";

const monthLabel = (month, long = false) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-PH", long ? { month: "long", year: "numeric" } : { month: "short", year: "2-digit" });
};
const marginLabel = value => (value === null || value === undefined ? "—" : `${Number(value).toFixed(1)}%`);
const compact = n => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);

function ProfitLossChart({ months }) {
  const [hovered, setHovered] = useState(null);
  const width = 760, height = 280, pad = { l: 54, r: 18, t: 18, b: 42 };
  const innerW = width - pad.l - pad.r, innerH = height - pad.t - pad.b;
  const max = Math.max(0, ...months.flatMap(m => [m.income, m.expenses]));
  const yMax = max > 0 ? max * 1.12 : 1;
  const slot = innerW / Math.max(months.length, 1);
  const barW = Math.min(18, slot / 3);
  const y = v => pad.t + innerH - (v / yMax) * innerH;
  const description = months.map(m => `${monthLabel(m.month, true)}: income ${peso(m.income)}, expenses ${peso(m.expenses)}, net ${peso(m.net_profit)}`).join("; ");

  return <div className="revenue-chart-wrap" aria-label="Income and expenses for the last 12 months">
    <svg className="revenue-line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-describedby="pnl-chart-desc">
      {[0, .25, .5, .75, 1].map(g => {
        const gy = pad.t + innerH - g * innerH;
        return <g key={g}><line className="chart-grid-line" x1={pad.l} x2={width - pad.r} y1={gy} y2={gy} /><text className="chart-y-label" x={pad.l - 9} y={gy + 4} textAnchor="end">{g === 0 ? "0" : compact(yMax * g)}</text></g>;
      })}
      {months.map((m, i) => {
        const cx = pad.l + slot * i + slot / 2;
        return <g key={m.month} onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(i)} onBlur={() => setHovered(null)} tabIndex="0" aria-label={`${monthLabel(m.month, true)}: income ${peso(m.income)}, expenses ${peso(m.expenses)}`}>
          <rect x={cx - slot / 2} y={pad.t} width={slot} height={innerH} fill="transparent" />
          <rect x={cx - barW - 1} y={y(m.income)} width={barW} height={Math.max(0, pad.t + innerH - y(m.income))} rx="3" fill="var(--brand)" opacity={hovered === null || hovered === i ? 1 : .55} />
          <rect x={cx + 1} y={y(m.expenses)} width={barW} height={Math.max(0, pad.t + innerH - y(m.expenses))} rx="3" fill="#d6935a" opacity={hovered === null || hovered === i ? 1 : .55} />
          <text className="chart-x-label" x={cx} y={height - 14} textAnchor="middle">{monthLabel(m.month)}</text>
        </g>;
      })}
    </svg>
    <span id="pnl-chart-desc" className="sr-only">{description}</span>
    {hovered !== null && months[hovered] && <div className="revenue-tooltip" style={{ left: `${((pad.l + slot * hovered + slot / 2) / width) * 100}%`, top: "12%" }}>
      <strong>{monthLabel(months[hovered].month, true)}</strong>
      <span>Income {peso(months[hovered].income)}</span>
      <span>Expenses {peso(months[hovered].expenses)}</span>
      <span>Net {peso(months[hovered].net_profit)}</span>
    </div>}
    {max === 0 && <div className="chart-empty-message">No income or expenses recorded for this period</div>}
    <p className="pnl-legend"><i style={{ background: "var(--brand)" }} /> Income <i style={{ background: "#d6935a" }} /> Expenses</p>
  </div>;
}

export function ProfitLoss() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    return api("/admin/finance/profit-loss?months=12")
      .then(d => { setData(d); setError(""); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };
  React.useEffect(() => { load(); }, []);

  const exportCsv = () => {
    const blob = new Blob(["﻿" + buildProfitLossCsv(data)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `profit-and-loss-${data.current_month}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const months = data?.months || [];
  const current = months[months.length - 1];
  const profitable = current && current.net_profit >= 0;

  return <AdminShell title="Profit & Loss" subtitle="Monthly income, expenses and net profit. Income counts rental, delivery and other payments only; security deposits and their refunds are left out.">
    {error && <div className="login-error">{error}</div>}
    {loading && !data ? <section className="admin-card report-loading">Loading profit and loss...</section> : data && <>
      <section className="kpi-grid">
        <Kpi index={0} currency label={`Income · ${monthLabel(current.month, true)}`} value={current.income} detail="Rental payments, deposits excluded" />
        <Kpi index={1} currency label="Expenses this month" value={current.expenses} detail="Confirmed expense records" />
        <Kpi index={2} currency label="Net profit this month" value={current.net_profit} detail={`${marginLabel(current.margin)} margin · ${profitable ? "Profitable" : "Operating at a loss"}`} />
        <Kpi index={3} currency label="Net profit · 12 months" value={data.totals.net_profit} detail={`${marginLabel(data.totals.margin)} margin`} />
      </section>

      <section className="admin-card stat-card revenue-report-card">
        <div className="card-heading report-chart-heading">
          <div><span>Income vs expenses</span><h2>Last 12 months</h2></div>
          <div className="report-updated">
            <span className={`status-pill ${profitable ? "confirmed" : "overdue"}`}>{profitable ? "Profitable this month" : "Loss this month"}</span>
            <button type="button" className="report-refresh" onClick={load} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
            <button type="button" className="report-refresh" onClick={exportCsv}>Export CSV</button>
          </div>
        </div>
        <ProfitLossChart months={months} />
      </section>

      <section className="admin-card">
        <div className="card-heading"><div><span>Month by month</span><h2>Profit and loss table</h2></div><Link to="/admin/finance/expenses">Manage expenses</Link></div>
        <div className="table-wrap"><table>
          <thead><tr><th>Month</th><th className="num">Income</th><th className="num">Expenses</th><th className="num">Net profit</th><th className="num">Margin</th><th>Result</th></tr></thead>
          <tbody>
            {[...months].reverse().map(m => <tr key={m.month}>
              <td><strong>{monthLabel(m.month, true)}</strong></td>
              <td className="num">{peso(m.income)}</td>
              <td className="num">{peso(m.expenses)}</td>
              <td className="num"><strong>{peso(m.net_profit)}</strong></td>
              <td className="num">{marginLabel(m.margin)}</td>
              <td>{m.income === 0 && m.expenses === 0 ? "—" : <span className={`status-pill ${m.net_profit >= 0 ? "confirmed" : "overdue"}`}>{m.net_profit >= 0 ? "Profit" : "Loss"}</span>}</td>
            </tr>)}
            <tr>
              <td><strong>Total</strong></td>
              <td className="num"><strong>{peso(data.totals.income)}</strong></td>
              <td className="num"><strong>{peso(data.totals.expenses)}</strong></td>
              <td className="num"><strong>{peso(data.totals.net_profit)}</strong></td>
              <td className="num"><strong>{marginLabel(data.totals.margin)}</strong></td>
              <td></td>
            </tr>
          </tbody>
        </table></div>
      </section>
    </>}
  </AdminShell>;
}
