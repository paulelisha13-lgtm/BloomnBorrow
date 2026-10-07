import React from "react";

const steps = [
  ["cart", "Cart"],
  ["details", "Rental details"],
  ["confirmation", "Confirmation"]
];

export function CustomerProgress({ current }) {
  const currentIndex=Math.max(0,steps.findIndex(([key])=>key===current));
  return <nav className="shop-progress" aria-label="Rental request progress">
    <ol>{steps.map(([key,label],index)=><li className={index<currentIndex?"complete":index===currentIndex?"current":""} key={key} aria-current={index===currentIndex?"step":undefined}>
      <span aria-hidden="true">{index<currentIndex?"✓":index+1}</span>
      <strong>{label}</strong>
    </li>)}</ol>
  </nav>;
}
