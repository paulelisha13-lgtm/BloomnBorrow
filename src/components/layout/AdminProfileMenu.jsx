import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, clearAuth, getStoredUser } from "../../lib/api";
import { AdminIcon } from "./AdminIcon";

export function AdminProfileMenu() {
  const navigate = useNavigate();
  const user = getStoredUser() || {};
  const [open,setOpen] = useState(false);
  const [signingOut,setSigningOut] = useState(false);
  const [logoutConfirm,setLogoutConfirm] = useState(false);
  const menuRef = useRef(null);
  const initials = (user.full_name || "Admin User").split(" ").filter(Boolean).map(x=>x[0]).join("").slice(0,2).toUpperCase() || "AD";

  useEffect(()=>{
    const onPointerDown = e => { if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false); };
    const onKeyDown = e => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown",onPointerDown);
    document.addEventListener("keydown",onKeyDown);
    return ()=>{ document.removeEventListener("pointerdown",onPointerDown); document.removeEventListener("keydown",onKeyDown); };
  },[]);

  const logout = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try { await api("/auth/logout", { method:"POST" }); } catch {}
    finally {
      clearAuth();
      setOpen(false);
      navigate("/access/login",{replace:true});
    }
  };

  return <div className="admin-profile-menu" ref={menuRef}>
    <button type="button" className="admin-profile-trigger" aria-haspopup="menu" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>
      <div className="avatar">{initials}</div>
      <div className="admin-profile-copy"><strong>{user.full_name || "Admin User"}</strong><small>{user.role || "admin"}</small></div>
      <AdminIcon name="chevronDown" size={16} className={`profile-chevron ${open?"open":""}`}/>
    </button>
    {open && <div className="admin-profile-dropdown" role="menu">
      <button type="button" role="menuitem" onClick={()=>{setOpen(false);navigate("/admin/account-settings")}}>
        <span><AdminIcon name="user" size={17}/></span><div><strong>Account Settings</strong><small>Profile and password</small></div>
      </button>
      <div className="profile-menu-divider"/>
      <button type="button" role="menuitem" className="profile-signout" disabled={signingOut} onClick={()=>{setOpen(false);setLogoutConfirm(true)}}>
        <span><AdminIcon name="logout" size={17}/></span><div><strong>Sign Out</strong><small>End this session</small></div>
      </button>
    </div>}

    {logoutConfirm && <div className="modal-backdrop" onClick={()=>!signingOut&&setLogoutConfirm(false)}><div className="modal confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="signout-title" aria-describedby="signout-description" onClick={e=>e.stopPropagation()}>
      <h3 id="signout-title">Sign Out</h3>
      <p id="signout-description">Are you sure you want to sign out?</p>
      <div className="confirm-modal-actions">
        <button type="button" className="secondary-button" disabled={signingOut} onClick={()=>setLogoutConfirm(false)}>Cancel</button>
        <button type="button" className="primary-button" disabled={signingOut} onClick={logout}>{signingOut?"Signing out...":"Sign Out"}</button>
      </div>
    </div></div>}
  </div>;
}
