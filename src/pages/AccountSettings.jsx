import React, { useEffect, useState } from "react";
import { api, getStoredUser, saveAuth } from "../lib/api";
import { AdminShell } from "../components/layout/AdminShell";
import { PasswordInput } from "../components/PasswordInput";

export function AccountSettings() {
  const stored = getStoredUser() || {};
  const [profile,setProfile] = useState({full_name:stored.full_name||"",email:stored.email||"",phone:stored.phone||""});
  const [passwords,setPasswords] = useState({current_password:"",new_password:"",confirm_password:""});
  const [profileMsg,setProfileMsg] = useState("");
  const [passwordMsg,setPasswordMsg] = useState("");
  const [error,setError] = useState("");
  const [saving,setSaving] = useState(false);

  useEffect(()=>{
    api("/auth/me").then(({user})=>{
      const next={full_name:user.full_name||"",email:user.email||"",phone:user.phone||""};
      setProfile(next);
      saveAuth(null,user);
    }).catch(()=>{});
  },[]);

  const saveProfile = async e => {
    e.preventDefault(); setError(""); setProfileMsg(""); setSaving(true);
    try {
      const {user}=await api("/auth/profile",{method:"PATCH",body:JSON.stringify(profile)});
      saveAuth(null,user);
      setProfile({full_name:user.full_name||"",email:user.email||"",phone:user.phone||""});
      setProfileMsg("Profile updated successfully.");
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const changePassword = async e => {
    e.preventDefault(); setError(""); setPasswordMsg("");
    if (passwords.new_password !== passwords.confirm_password) return setError("New password and confirmation do not match.");
    if (passwords.new_password.length < 14) return setError("New password must be at least 14 characters.");
    setSaving(true);
    try {
      await api("/auth/change-password",{method:"PATCH",body:JSON.stringify({current_password:passwords.current_password,new_password:passwords.new_password})});
      setPasswords({current_password:"",new_password:"",confirm_password:""});
      setPasswordMsg("Password changed successfully.");
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return <AdminShell title="Account Settings" subtitle="Manage your staff profile and account security.">
    {error && <div className="login-error account-settings-alert">{error}</div>}
    <div className="account-settings-grid">
      <form className="admin-card account-settings-card" onSubmit={saveProfile}>
        <div className="card-heading"><div><span>Profile</span><h2>Personal information</h2></div></div>
        <label>Full name<input required value={profile.full_name} onChange={e=>setProfile({...profile,full_name:e.target.value})}/></label>
        <label>Email address<input type="email" required value={profile.email} onChange={e=>setProfile({...profile,email:e.target.value})}/></label>
        <label>Phone<input value={profile.phone} onChange={e=>setProfile({...profile,phone:e.target.value})}/></label>
        {profileMsg && <div className="settings-success">{profileMsg}</div>}
        <button className="primary-button" disabled={saving}>{saving?"Saving…":"Save profile"}</button>
      </form>
      <form className="admin-card account-settings-card" onSubmit={changePassword}>
        <div className="card-heading"><div><span>Security</span><h2>Change password</h2></div></div>
        <label>Current password<PasswordInput autoComplete="current-password" required value={passwords.current_password} onChange={e=>setPasswords({...passwords,current_password:e.target.value})}/></label>
        <label>New password<PasswordInput autoComplete="new-password" minLength="14" required value={passwords.new_password} onChange={e=>setPasswords({...passwords,new_password:e.target.value})}/></label>
        <label>Confirm new password<PasswordInput autoComplete="new-password" minLength="14" required value={passwords.confirm_password} onChange={e=>setPasswords({...passwords,confirm_password:e.target.value})}/></label>
        <small className="password-help">Use at least 14 characters with uppercase, lowercase, a number, and a symbol. Avoid predictable or reused passwords.</small>
        {passwordMsg && <div className="settings-success">{passwordMsg}</div>}
        <button className="primary-button" disabled={saving}>{saving?"Updating…":"Change password"}</button>
      </form>
    </div>
  </AdminShell>;
}
