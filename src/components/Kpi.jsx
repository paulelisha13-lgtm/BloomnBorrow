import React, { useEffect, useRef, useState } from "react";
import { peso } from "../lib/format";

function AnimatedKpiValue({ value=0, format=(n)=>String(n), delay=0, duration=850 }) {
  const numeric=Number(value)||0;
  const [display,setDisplay]=useState(0);
  const reduceMotion=useRef(false);

  useEffect(()=>{
    reduceMotion.current=window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches||false;
    if(reduceMotion.current){setDisplay(numeric);return;}
    let raf;
    let timer;
    const startAnimation=()=>{
      const started=performance.now();
      const tick=(now)=>{
        const progress=Math.min(1,(now-started)/duration);
        const eased=1-Math.pow(1-progress,3);
        setDisplay(Math.round(numeric*eased));
        if(progress<1) raf=requestAnimationFrame(tick);
      };
      raf=requestAnimationFrame(tick);
    };
    timer=setTimeout(startAnimation,delay);
    return()=>{clearTimeout(timer);cancelAnimationFrame(raf)};
  },[numeric,delay,duration]);

  return <>{format(display)}</>;
}

export function Kpi({ label, value, detail, index=0, currency=false }) {
  const delay=index*110;
  const numeric=Number(value)||0;
  return <article className="kpi-card kpi-card-animated" style={{"--kpi-delay":`${delay}ms`}}>
    <div>
      <span>{label}</span>
      <strong className="kpi-animated-value"><AnimatedKpiValue value={numeric} delay={delay+80} format={currency?peso:(n)=>String(n)}/></strong>
      <small>{detail}</small>
    </div>
  </article>
}
