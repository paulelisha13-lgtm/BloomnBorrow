import React, { useState } from "react";

// Password input with a Show/Hide toggle. Takes the same props as <input>.
export function PasswordInput(props) {
  const [visible,setVisible]=useState(false);
  return <span className="password-field">
    <input {...props} type={visible?"text":"password"} autoCapitalize="off" autoCorrect="off" spellCheck={false}/>
    <button type="button" className="password-toggle" onClick={()=>setVisible(v=>!v)} aria-pressed={visible} aria-label={visible?"Hide password":"Show password"}>{visible?"Hide":"Show"}</button>
  </span>;
}
