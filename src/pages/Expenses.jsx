import React, { useState } from "react";
import { api, API_BASE } from "../lib/api";
import { Kpi } from "../components/Kpi";
import { ListPagination } from "../components/ListPagination";
import { AdminShell } from "../components/layout/AdminShell";
import { useDiscardGuard } from "../components/DiscardGuard";
import { usePagination } from "../hooks/usePagination";
import { peso } from "../lib/format";

const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const blankForm = () => ({ expense_date: todayLocal(), category: "", amount: "", description: "", booking_id: "", rental_item_id: "", remove_receipt: false });
const formatDate = value => {
  if (!value) return "—";
  const [y, m, d] = String(value).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
};

export function Expenses() {
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [total, setTotal] = useState(0);
  const [count, setCount] = useState(0);
  const [suggestions, setSuggestions] = useState([]);
  const [month, setMonth] = useState("");
  const [category, setCategory] = useState("All");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blankForm());
  const [baseline, setBaseline] = useState("");
  const [receipt, setReceipt] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [busyKey, setBusyKey] = useState("");
  const [bookings, setBookings] = useState([]);
  const [items, setItems] = useState([]);

  const guard = useDiscardGuard(modal && (JSON.stringify(form) !== baseline || Boolean(receipt)), () => setModal(false));

  // Only the newest request may update the table, so a slow earlier response cannot overwrite a newer filter.
  const latestLoad = React.useRef(0);
  const loadExpenses = () => {
    const query = new URLSearchParams();
    if (month) query.set("month", month);
    if (category !== "All") query.set("category", category);
    const id = ++latestLoad.current;
    return api(`/admin/expenses${query.toString() ? `?${query}` : ""}`)
      .then(d => {
        if (id !== latestLoad.current) return;
        setExpenses(d.expenses || []); setCategories(d.categories || []); setTotal(Number(d.total || 0)); setCount(Number(d.count ?? (d.expenses || []).length)); setError("");
      })
      .catch(e => { if (id === latestLoad.current) setError(e.message); });
  };
  const loadSuggestions = () => api("/admin/expense-suggestions").then(d => setSuggestions(d.suggestions || [])).catch(e => setError(e.message));

  React.useEffect(() => { loadExpenses(); }, [month, category]);
  React.useEffect(() => { loadSuggestions(); }, []);

  // The booking and item pickers are optional, so they load the first time the form opens instead of on every visit.
  const lookupsLoaded = React.useRef(false);
  const loadLookups = () => {
    if (lookupsLoaded.current) return;
    lookupsLoaded.current = true;
    api("/admin/bookings").then(d => setBookings(d.bookings || [])).catch(() => { lookupsLoaded.current = false; });
    api("/admin/inventory").then(d => setItems(d.items || [])).catch(() => { lookupsLoaded.current = false; });
  };

  const pagination = usePagination(expenses.length);
  const visible = expenses.slice(pagination.startIndex, pagination.startIndex + pagination.pageSize);
  React.useEffect(() => { pagination.setPage(1); }, [month, category]);

  const openAdd = () => {
    const next = blankForm();
    setEditing(null); setForm(next); setBaseline(JSON.stringify(next)); setReceipt(null); setModal(true); loadLookups();
  };
  const openEdit = e => {
    const next = { expense_date: e.expense_date, category: e.category, amount: String(e.amount), description: e.description, booking_id: e.booking_id ? String(e.booking_id) : "", rental_item_id: e.rental_item_id ? String(e.rental_item_id) : "", remove_receipt: false };
    setEditing(e); setForm(next); setBaseline(JSON.stringify(next)); setReceipt(null); setModal(true); loadLookups();
  };

  const save = async event => {
    event.preventDefault();
    setSaving(true);
    try {
      const body = new FormData();
      for (const [key, value] of Object.entries(form)) body.append(key, String(value));
      if (receipt) body.append("receipt", receipt);
      const data = await api(editing ? `/admin/expenses/${editing.id}` : "/admin/expenses", { method: editing ? "PATCH" : "POST", body });
      setModal(false); setNotice(data.message || "Saved."); setError("");
      await loadExpenses();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    try {
      const data = await api(`/admin/expenses/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null); setNotice(data.message || "Expense deleted.");
      await Promise.all([loadExpenses(), loadSuggestions()]);
    } catch (e) { setError(e.message); setDeleteTarget(null); }
  };

  const suggestionKey = s => `${s.source_type}-${s.source_id}`;
  const act = async (s, action) => {
    setBusyKey(suggestionKey(s));
    try {
      const data = await api(`/admin/expense-suggestions/${action}`, { method: "POST", body: JSON.stringify({ source_type: s.source_type, source_id: s.source_id }) });
      setNotice(data.message || "Done."); setError("");
    } catch (e) { setError(e.message); }
    finally {
      setBusyKey("");
      await Promise.all([loadExpenses(), loadSuggestions()]);
    }
  };

  const withoutReceipt = expenses.filter(e => !e.has_receipt).length;

  return <AdminShell title="Expenses" subtitle="Record what the business spends. Suggested damage and maintenance costs only count once you confirm them.">
    {error && <div className="login-error">{error}</div>}
    {notice && <div className="admin-alert" role="status"><div><strong>{notice}</strong></div><button type="button" className="secondary-button" onClick={() => setNotice("")}>Dismiss</button></div>}

    <section className="kpi-grid">
      <Kpi index={0} currency label={month ? "Expenses this month" : "Total expenses"} value={total} detail={month || category !== "All" ? "Matching the filters" : "All recorded expenses"} />
      <Kpi index={1} label="Records" value={count} detail={count > expenses.length ? `Showing the newest ${expenses.length}` : "Confirmed expenses"} />
      <Kpi index={2} label="Suggested" value={suggestions.length} detail="Awaiting confirmation" />
      <Kpi index={3} label="No receipt" value={withoutReceipt} detail="Records without an attachment" />
    </section>

    <div className="admin-page-toolbar">
      <div className="admin-toolbar-controls payment-filters">
        <label className="expense-filter">Month<input type="month" value={month} onChange={e => setMonth(e.target.value)} /></label>
        <select className="booking-status-select" value={category} onChange={e => setCategory(e.target.value)} aria-label="Filter by category">
          <option value="All">All categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {month && <button type="button" className="secondary-button" onClick={() => setMonth("")}>All months</button>}
        <button type="button" className="primary-button" onClick={openAdd}>+ Add Expense</button>
      </div>
    </div>

    {suggestions.length > 0 && <section className="admin-card">
      <div className="card-heading"><div><span>Not counted yet</span><h2>Suggested expenses</h2></div></div>
      <div className="table-wrap"><table>
        <thead><tr><th>Date</th><th>Description</th><th>Category</th><th className="num">Amount</th><th>Action</th></tr></thead>
        <tbody>{suggestions.map(s => <tr key={suggestionKey(s)}>
          <td>{formatDate(s.date)}</td>
          <td className="cell-wrap"><strong>{s.description}</strong>{s.booking_no && <><br /><small>Booking {s.booking_no}</small></>}</td>
          <td>{s.category}</td>
          <td className="num">{peso(s.amount)}</td>
          <td>
            <button type="button" className="mini-button" disabled={busyKey === suggestionKey(s)} onClick={() => act(s, "confirm")}>Confirm</button>{" "}
            <button type="button" className="mini-button" disabled={busyKey === suggestionKey(s)} onClick={() => act(s, "dismiss")}>Dismiss</button>
          </td>
        </tr>)}</tbody>
      </table></div>
    </section>}

    <section className="admin-card">
      {expenses.length === 0 ? <div className="inventory-empty">
        <span>🧾</span>
        <h3>No expenses found</h3>
        <p>{month || category !== "All" ? "Try a different month or category." : "Add your first expense to start tracking profit."}</p>
      </div> : <>
        <div className="table-wrap"><table>
          <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Linked to</th><th className="num">Amount</th><th>Receipt</th><th>Action</th></tr></thead>
          <tbody>{visible.map(e => <tr key={e.id}>
            <td>{formatDate(e.expense_date)}</td>
            <td>{e.category}</td>
            <td className="cell-wrap"><strong>{e.description}</strong>{e.source_type !== "manual" && <><br /><small>From {e.source_type} record</small></>}</td>
            <td>{[e.booking_no, e.item_name].filter(Boolean).join(" · ") || "—"}</td>
            <td className="num">{peso(e.amount)}</td>
            <td>{e.has_receipt ? <a className="mini-button" href={`${API_BASE}/admin/expenses/${e.id}/receipt`} target="_blank" rel="noreferrer">View</a> : "—"}</td>
            <td><button type="button" className="mini-button" onClick={() => openEdit(e)}>Edit</button>{" "}<button type="button" className="mini-button" onClick={() => setDeleteTarget(e)}>Delete</button></td>
          </tr>)}</tbody>
        </table></div>
        <ListPagination {...pagination} total={expenses.length} label="expenses" onPageChange={pagination.setPage} />
      </>}
    </section>

    {modal && <div className="modal-backdrop" onClick={guard.requestClose}><form className="modal" onSubmit={save} onClick={e => e.stopPropagation()}>
      <div className="modal-head"><div><span className="eyebrow">Finance</span><h2>{editing ? "Edit Expense" : "Add Expense"}</h2></div><button type="button" onClick={guard.requestClose}>×</button></div>
      <div className="form-grid">
        <label>Date<input required type="date" value={form.expense_date} onChange={e => setForm({ ...form, expense_date: e.target.value })} /></label>
        <label>Category<select required value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
          <option value="">Select category</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select></label>
        <label>Amount (₱)<input required type="number" min="0.01" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></label>
        <label>Receipt <small>(optional — JPG, PNG, WebP or PDF)</small><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e => setReceipt(e.target.files?.[0] || null)} /></label>
        <label className="span-2">Description<input required maxLength="255" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
        <label>Booking <small>(optional)</small><select value={form.booking_id} onChange={e => setForm({ ...form, booking_id: e.target.value })}>
          <option value="">None</option>
          {bookings.map(b => <option key={b.id} value={b.id}>{b.booking_no} — {b.customer_name}</option>)}
        </select></label>
        <label>Rental item <small>(optional)</small><select value={form.rental_item_id} onChange={e => setForm({ ...form, rental_item_id: e.target.value })}>
          <option value="">None</option>
          {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select></label>
        {editing?.has_receipt && !receipt && <label className="span-2"><span><input type="checkbox" checked={form.remove_receipt} onChange={e => setForm({ ...form, remove_receipt: e.target.checked })} /> Remove the current receipt</span></label>}
      </div>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={guard.requestClose}>Cancel</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "Saving..." : "Save expense"}</button></div>
    </form></div>}
    {guard.discardDialog}

    {deleteTarget && <div className="modal-backdrop" onClick={() => setDeleteTarget(null)}><div className="modal confirm-modal" onClick={e => e.stopPropagation()}>
      <h3>Delete Expense</h3>
      <p>Delete <strong>{deleteTarget.description}</strong> ({peso(deleteTarget.amount)})?</p>
      <small>It will no longer count toward your profit. {deleteTarget.source_type !== "manual" ? "Because it came from a suggestion, it will be suggested again." : ""}</small>
      <div className="confirm-modal-actions">
        <button className="secondary-button" onClick={() => setDeleteTarget(null)}>Cancel</button>
        <button className="danger-button" onClick={remove}>Delete</button>
      </div>
    </div></div>}
  </AdminShell>;
}
