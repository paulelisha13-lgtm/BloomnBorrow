import React from "react";
import { Link } from "react-router-dom";
import logoImg from "../assets/logo.png";

export function Logo({ light = false, to = "/admin" }) {
  return (
    <Link className={`logo ${light ? "logo-light" : ""}`} to={to}>
      <img src={logoImg} alt="Bloom & Borrow" className="logo-img" />
      <span>Bloom<span>&amp;Borrow</span></span>
    </Link>
  );
}
