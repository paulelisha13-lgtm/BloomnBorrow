import React, { useState } from "react";
import { api } from "../lib/api";
import { Kpi } from "../components/Kpi";
import { ListPagination } from "../components/ListPagination";
import { AdminShell } from "../components/layout/AdminShell";
import { PasswordInput } from "../components/PasswordInput";
import { SortControls } from "../components/SortControls";
import { usePagination } from "../hooks/usePagination";
import { sortRows, useSort } from "../hooks/useSort";

export function AccessManagement() {
  const [users,setUsers] = useState([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [modal,setModal] = useState(false);
  const [form,setForm] = useState({full_name:"",email:"",phone:"",role:"admin",password:"[removed-demo-credential]"});
  const [search,setSearch] = useState("");
  const [roleFilter,setRoleFilter] = useState("All");
  const [statusFilter,setStatusFilter] = useState("All");
  const [resetTarget,setResetTarget] = useState(null);
  const [resetForm,setResetForm] = useState({password:"",confirm:""});
  const [resetError,setResetError] = useState("");
  const [resetting,setResetting] = useState(false);
  const [notice,setNotice] = useState("");

  const load = async () => {
    setLoading(true);
    try { setUsers((await api("/users")).users || []); setError(""); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  React.useEffect(()=>{ load(); },[]);

  const create = async (e) => {
    e.preventDefault();
    try {
      await api("/users",{method:"POST",body:JSON.stringify(form)});
      setModal(false);
      setForm({full_name:"",email:"",phone:"",role:"admin",password:"[removed-demo-credential]"});
      await load();
    } catch(e){ setError(e.message); }
  };

  const toggleStatus = async (u) => {
    try {
      await api(`/users/${u.id}/status`,{
        method:"PATCH",
        body:JSON.stringify({status:u.status==="active"?"disabled":"active"})
      });
      await load();
    } catch(e){ setError(e.message); }
  };

  const openReset = (u) => { setResetTarget(u); setResetForm({password:"",confirm:""}); setResetError(""); };
  const closeReset = () => { if(!resetting) setResetTarget(null); };
  const randomInt = max => crypto.getRandomValues(new Uint32Array(1))[0]%max;
  const generatePassword = () => {
    const sets=["ABCDEFGHJKLMNPQRSTUVWXYZ","abcdefghijkmnopqrstuvwxyz","23456789","!@#$%^&*?-_"];
    const pick=chars=>chars[randomInt(chars.length)];
    const all=sets.join("");
    const chars=[...sets.map(pick),...Array.from({length:12},()=>pick(all))];
    for(let i=chars.length-1;i>0;i--){const j=randomInt(i+1);[chars[i],chars[j]]=[chars[j],chars[i]]}
    const password=chars.join("");
    setResetForm({password,confirm:password});
  };
  const pw=resetForm.password;
  const rules=[
    ["At least 14 characters",pw.length>=14],
    ["An uppercase letter",/[A-Z]/.test(pw)],
    ["A lowercase letter",/[a-z]/.test(pw)],
    ["A number",/[0-9]/.test(pw)],
    ["A symbol",/[^A-Za-z0-9]/.test(pw)]
  ];
  const passwordOk=rules.every(([,ok])=>ok);
  const mismatch=resetForm.confirm&&pw!==resetForm.confirm;
  const submitReset = async (e) => {
    e.preventDefault();
    if(!passwordOk) return setResetError("Password does not meet all the requirements.");
    if(pw!==resetForm.confirm) return setResetError("Passwords do not match.");
    setResetting(true); setResetError("");
    try {
      await api(`/users/${resetTarget.id}/reset-password`,{method:"PATCH",body:JSON.stringify({password:pw})});
      setNotice(`Password for ${resetTarget.full_name} was reset. Their active sessions have been signed out.`);
      setResetTarget(null);
    } catch(err){ setResetError(err.message); }
    finally { setResetting(false); }
  };

  const roles=["All",...Array.from(new Set(users.map(u=>u.role).filter(Boolean)))];
  const filtered=users.filter(u=>{
    const q=search.toLowerCase();
    const matchSearch=!q||[u.full_name,u.email,u.phone].some(v=>String(v||"").toLowerCase().includes(q));
    const matchRole=roleFilter==="All"||u.role===roleFilter;
    const matchStatus=statusFilter==="All"||u.status===statusFilter;
    return matchSearch&&matchRole&&matchStatus;
  });
  const sorts={
    full_name:{label:"User",get:u=>u.full_name||""},
    email:{label:"Email",get:u=>u.email||""},
    role:{label:"Role",get:u=>u.role||""},
    status:{label:"Status",get:u=>u.status||""},
    last_login_at:{label:"Last login",get:u=>Date.parse(u.last_login_at)||0},
    created_at:{label:"Date added",get:u=>Date.parse(u.created_at)||0}
  };
  const {sortKey,sortDir,setSort}=useSort("full_name","asc");
  const sorted=sortRows(filtered,sorts,sortKey,sortDir);
  const pagination=usePagination(sorted.length);
  const visibleUsers=sorted.slice(pagination.startIndex,pagination.startIndex+pagination.pageSize);
  const changeSort=key=>{pagination.setPage(1);setSort(key)};

  return <AdminShell title="Access Management" subtitle="Manage Admin accounts, status, roles, and access security.">
    <section className="kpi-grid">
      <Kpi icon="♜" label="Total staff" value={users.length} detail="Admin accounts"/>
      <Kpi icon="✓" label="Active accounts" value={users.filter(x=>x.status==="active").length} detail="Allowed to sign in"/>
      <Kpi icon="A" label="Admins" value={users.filter(x=>x.role==="admin").length} detail="Full system access"/>
    </section>

    <div className="admin-page-toolbar">
      <div className="admin-search"><span>⌕</span><input placeholder="Search by name, email, or phone..." value={search} onChange={e=>{setSearch(e.target.value);pagination.setPage(1)}}/></div>
      <div className="admin-toolbar-controls payment-filters">
        <button className="primary-button" onClick={()=>setModal(true)}>+ Add account</button>
        <select className="booking-status-select" value={roleFilter} onChange={e=>{setRoleFilter(e.target.value);pagination.setPage(1)}}>
          {roles.map(r=><option key={r} value={r}>{r==="All"?"All roles":r}</option>)}
        </select>
        <select className="booking-status-select" value={statusFilter} onChange={e=>{setStatusFilter(e.target.value);pagination.setPage(1)}}>
          <option value="All">All statuses</option>
          <option value="active">Active</option>
          <option value="disabled">Disabled</option>
        </select>
        <SortControls sorts={sorts} sortKey={sortKey} sortDir={sortDir} setSort={changeSort}/>
      </div>
    </div>

    {error && <div className="login-error">{error}</div>}
    {notice && <div className="access-notice" role="status"><span>{notice}</span><button type="button" onClick={()=>setNotice("")} aria-label="Dismiss">×</button></div>}

    <section className="admin-card">
      {loading ? <p>Loading accounts...</p> :
      <><div className="table-wrap"><table>
        <thead><tr><th>User</th><th>Email</th><th>Phone</th><th>Role</th><th>Status</th><th>Last login</th><th>Actions</th></tr></thead>
        <tbody>{visibleUsers.map(u=><tr key={u.id}>
          <td><strong>{u.full_name}</strong></td>
          <td>{u.email}</td>
          <td>{u.phone || "—"}</td>
          <td><span className={`role-pill ${u.role}`}>{u.role}</span></td>
          <td><span className={`status-pill ${u.status==="active"?"confirmed":"overdue"}`}>{u.status}</span></td>
          <td>{u.last_login_at ? new Date(u.last_login_at).toLocaleString() : "Never"}</td>
          <td><div className="access-actions">
            <button className="mini-button" onClick={()=>openReset(u)}>Reset password</button>
            <button className="secondary-button small" onClick={()=>toggleStatus(u)}>{u.status==="active"?"Disable":"Enable"}</button>
          </div></td>
        </tr>)}{sorted.length===0&&<tr><td colSpan="7" className="muted" style={{textAlign:"center",padding:"24px"}}>No accounts match your filters.</td></tr>}</tbody>
      </table></div><ListPagination {...pagination} total={sorted.length} label="accounts" onPageChange={pagination.setPage}/></>}
    </section>

    <section className="admin-card access-policy-card">
      <div className="card-heading"><div><span>Permissions</span><h2>Role access policy</h2></div></div>
      <div className="permission-grid">
        <div><strong>Admin</strong><span>Dashboard</span><span>Inventory</span><span>Bookings</span><span>Customers</span><span>Payments</span><span>Reports</span><span>Settings</span><span>Access Management</span><span>Audit Log</span></div>
        <div><strong>Manager</strong><span>Dashboard</span><span>Inventory</span><span>Bookings</span><span>Customers</span><span>Payments</span><span>Reports</span><span>Settings</span><span className="denied">Access Management</span><span className="denied">Audit Log</span></div>
        <div><strong>Staff</strong><span>Dashboard</span><span>Inventory (view)</span><span>Bookings</span><span>Customers</span><span>Payments</span><span>Calendar</span><span>Maintenance</span></div>
      </div>
    </section>

    {resetTarget && <div className="modal-backdrop" onClick={closeReset}><form className="modal reset-modal" onSubmit={submitReset} onClick={e=>e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="reset-title">
      <div className="modal-head"><div><span className="eyebrow">Account security</span><h2 id="reset-title">Reset password</h2></div><button type="button" onClick={closeReset} aria-label="Close">×</button></div>
      <p className="muted reset-target">Set a new password for <strong>{resetTarget.full_name}</strong> ({resetTarget.email}). They will be signed out of all active sessions.</p>
      <div className="form-grid">
        <label className="span-2">New password<PasswordInput autoFocus autoComplete="new-password" required value={pw} onChange={e=>setResetForm({...resetForm,password:e.target.value})}/></label>
        <label className="span-2">Confirm password<PasswordInput autoComplete="new-password" required value={resetForm.confirm} onChange={e=>setResetForm({...resetForm,confirm:e.target.value})}/></label>
      </div>
      {mismatch && <small className="reset-mismatch">Passwords do not match.</small>}
      <ul className="password-rules">{rules.map(([label,ok])=><li key={label} className={ok?"ok":""}>{label}</li>)}</ul>
      {resetError && <div className="login-error">{resetError}</div>}
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={generatePassword}>Generate strong password</button><span className="modal-spacer"/><button type="button" className="secondary-button" onClick={closeReset} disabled={resetting}>Cancel</button><button className="primary-button" disabled={resetting||!passwordOk||pw!==resetForm.confirm}>{resetting?"Resetting...":"Reset password"}</button></div>
    </form></div>}

    {modal && <div className="modal-backdrop" onClick={()=>setModal(false)}><form className="modal" onSubmit={create} onClick={e=>e.stopPropagation()}>
      <div className="modal-head"><div><span className="eyebrow">Staff access</span><h2>Create account</h2></div><button type="button" onClick={()=>setModal(false)}>×</button></div>
      <div className="form-grid">
        <label>Full name<input required value={form.full_name} onChange={e=>setForm({...form,full_name:e.target.value})}/></label>
        <label>Email<input type="email" required value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label>
        <label>Phone<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label>
        <label>Role<select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}><option value="admin">Admin</option><option value="manager">Manager</option><option value="staff">Staff</option></select></label>
        <label className="span-2">Temporary password<PasswordInput autoComplete="new-password" required minLength="14" placeholder="14+ chars: upper, lower, number, symbol" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/></label>
      </div>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={()=>setModal(false)}>Cancel</button><button className="primary-button">Create account</button></div>
    </form></div>}
  </AdminShell>
}
