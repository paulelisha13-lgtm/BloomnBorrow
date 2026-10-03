import React, { useEffect, useRef, useState } from "react";
import { actionFeedbackEvents, rememberActionControl } from "../lib/actionFeedback";

const CLICKABLE = "button, a.primary-button, a.secondary-button, a.mini-button, a.danger-button";
const MUTATING_METHODS = new Set(["POST","PUT","PATCH","DELETE"]);

function controlLabel(control) {
  return String(control?.getAttribute("aria-label") || control?.textContent || "Action")
    .replace(/\s+/g," ").trim().replace(/[+×✓✕→←]/g,"").trim() || "Action";
}

export function InteractionFeedback() {
  const [notice,setNotice]=useState(null);
  const [pageLoading,setPageLoading]=useState(false);
  const pending=useRef(new Map());
  const noticeTimer=useRef(null);
  const pageTimer=useRef(null);

  useEffect(() => {
    const showNotice=(message,type) => {
      clearTimeout(noticeTimer.current);
      setNotice({message,type});
      noticeTimer.current=setTimeout(()=>setNotice(null),type==="error"?4200:2400);
    };

    const clearButton=(entry,result) => {
      const control=entry?.control;
      if(!control?.classList)return;
      control.classList.remove("app-button-loading");
      control.removeAttribute("aria-busy");
      control.classList.add(result.ok?"app-button-success":"app-button-error");
      setTimeout(()=>control.classList?.remove("app-button-success","app-button-error"),650);
    };

    const onClick=e => {
      const customerNavigation=e.target.closest?.("a[href^='/shop'],[data-customer-nav]");
      const nestedNonNavigation=e.target.closest?.("[data-no-page-loading]");
      if(customerNavigation&&!nestedNonNavigation){
        clearTimeout(pageTimer.current);
        setPageLoading(true);
        pageTimer.current=setTimeout(()=>setPageLoading(false),450);
      }

      const control=e.target.closest?.(CLICKABLE);
      if(!control || control.matches(":disabled,[aria-disabled='true']"))return;
      if(control.classList.contains("app-button-loading")){
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      rememberActionControl(control);
      control.classList.add("app-button-clicked");
      setTimeout(()=>control.classList?.remove("app-button-clicked"),260);
    };

    const onSubmit=e => {
      const control=e.submitter || e.target.querySelector?.("button[type='submit'],button:not([type])");
      if(control)rememberActionControl(control);
    };

    const onStart=e => {
      const {id,control,method}=e.detail;
      const entry={control,method,startedAt:Date.now(),label:controlLabel(control)};
      pending.current.set(id,entry);
      if(control?.classList){
        control.classList.add("app-button-loading");
        control.setAttribute("aria-busy","true");
      }
    };

    const onEnd=e => {
      const entry=pending.current.get(e.detail.id);
      if(!entry)return;
      pending.current.delete(e.detail.id);
      const finish=()=>{
        clearButton(entry,e.detail);
        if(!e.detail.ok)showNotice(e.detail.message||`${entry.label} failed. Please try again.`,"error");
        else if(MUTATING_METHODS.has(entry.method))showNotice(e.detail.message||`${entry.label} completed successfully.`,"success");
      };
      const remaining=Math.max(0,360-(Date.now()-entry.startedAt));
      setTimeout(finish,remaining);
    };

    document.addEventListener("click",onClick,true);
    document.addEventListener("submit",onSubmit,true);
    window.addEventListener(actionFeedbackEvents.start,onStart);
    window.addEventListener(actionFeedbackEvents.end,onEnd);
    return()=>{
      document.removeEventListener("click",onClick,true);
      document.removeEventListener("submit",onSubmit,true);
      window.removeEventListener(actionFeedbackEvents.start,onStart);
      window.removeEventListener(actionFeedbackEvents.end,onEnd);
      clearTimeout(noticeTimer.current);
      clearTimeout(pageTimer.current);
    };
  },[]);

  return <>
    {pageLoading&&<div className="customer-page-loading" role="status" aria-live="polite" aria-label="Loading page"><div className="customer-page-loading-dots" aria-hidden="true"><span/><span/><span/></div></div>}
    {notice&&<div className={`app-action-notice ${notice.type}`} role={notice.type==="error"?"alert":"status"} aria-live="polite">{notice.message}</div>}
  </>;
}
