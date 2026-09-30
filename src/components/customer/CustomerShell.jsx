import React, { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { Logo } from "../Logo";
import { useCart } from "../../context/CartContext";
import { publicApi } from "../../lib/publicApi";

function CartBadge() {
  const { count } = useCart();
  return <NavLink to="/shop/cart" className="shop-cart-link">
    Cart{count > 0 && <span className="shop-cart-count">{count}</span>}
  </NavLink>;
}

function CustomerFooter() {
  const [business, setBusiness] = useState(null);
  useEffect(() => { publicApi("/public/business-info").then(d => setBusiness(d.business || {})).catch(() => {}); }, []);
  const name = business?.business_name || "Bloom & Borrow";
  const hasContact = business && (business.business_phone || business.business_email || business.business_address);

  return <footer className="shop-footer">
    {hasContact && <section className="shop-contact admin-card">
      <h2>Contact Us</h2>
      <strong>{name}</strong>
      <div className="shop-contact-grid">
        {business.business_address && <div><span>📍</span><span>{business.business_address}</span></div>}
        {business.business_phone && <div><span>📞</span><span>{business.business_phone}</span></div>}
        {business.business_email && <div><span>✉</span><span>{business.business_email}</span></div>}
      </div>
    </section>}
    <div className="shop-footer-bar">
      <span>© {new Date().getFullYear()} {name}</span>
      <nav><NavLink to="/shop">Browse</NavLink><NavLink to="/shop/status">Check Status</NavLink></nav>
    </div>
  </footer>;
}

// Public-facing chrome for the Customer Side. Deliberately not AdminShell
// (that's staff-only: sidebar, notification bell, admin profile menu) --
// this mirrors the slim public-page pattern already used by Login.jsx.
//
// Note: CartProvider is NOT mounted here. Pages call useCart() themselves
// before they render <CustomerShell>, so the provider has to be an ancestor
// of the page component -- it's mounted once per route in App.jsx instead.
export function CustomerShell({ title, subtitle, children }) {
  return (
    <div className="shop-shell">
      <header className="shop-header">
        <Logo to="/shop" />
        <nav className="shop-nav">
          <NavLink to="/shop" end>Browse</NavLink>
          <NavLink to="/shop/status">Check Status</NavLink>
          <CartBadge />
        </nav>
      </header>
      <main className="shop-main">
        {(title || subtitle) && <div className="shop-page-head">
          {title && <h1>{title}</h1>}
          {subtitle && <p>{subtitle}</p>}
        </div>}
        {children}
      </main>
      <CustomerFooter />
    </div>
  );
}
