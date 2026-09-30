import React, { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { Logo } from "../Logo";
import { useCart } from "../../context/CartContext";
import { publicApi } from "../../lib/publicApi";

// Floating cart access (removed from the navbar to keep it minimal) -- always
// reachable so Browse -> Add to Cart -> Cart -> Proceed to Rental still works.
function CartFab() {
  const { count } = useCart();
  const [bump, setBump] = useState(false);
  const prev = useRef(count);
  useEffect(() => {
    if (count !== prev.current) {
      prev.current = count;
      setBump(true);
      const t = setTimeout(() => setBump(false), 300);
      return () => clearTimeout(t);
    }
  }, [count]);
  return <NavLink to="/shop/cart" className="shop-float-cart" aria-label={`Cart, ${count} item${count === 1 ? "" : "s"}`}>
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
    <span>Cart</span>
    <span className={`shop-cart-count ${bump ? "bump" : ""}`}>{count}</span>
  </NavLink>;
}

function FacebookIcon() {
  return <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M13.5 21v-7.5h2.5l.5-3h-3V8.5c0-.9.25-1.5 1.5-1.5H16.5V4.3C16.2 4.26 15.2 4.17 14 4.17c-2.4 0-4 1.47-4 4.16V10.5H7.5v3H10V21h3.5z"/></svg>;
}
function InstagramIcon() {
  return <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 8.3a3.7 3.7 0 1 0 0 7.4 3.7 3.7 0 0 0 0-7.4zm0 6.1a2.4 2.4 0 1 1 0-4.8 2.4 2.4 0 0 1 0 4.8zm4.7-6.25a.87.87 0 1 1-1.73 0 .87.87 0 0 1 1.73 0zM20 7.24a5 5 0 0 0-5.24-5.24H9.24A5 5 0 0 0 4 7.24v5.52a5 5 0 0 0 5.24 5.24h5.52A5 5 0 0 0 20 12.76V7.24zM18.6 12.76a3.6 3.6 0 0 1-3.84 3.84H9.24a3.6 3.6 0 0 1-3.84-3.84V7.24A3.6 3.6 0 0 1 9.24 3.4h5.52a3.6 3.6 0 0 1 3.84 3.84v5.52z"/></svg>;
}

// Mirrors the dark, columned footer pattern the user referenced (logo +
// link columns + circular social icons + a thin bottom bar), but built
// entirely from data this system actually has: no invented nav pages,
// legal links, or newsletter signup (no such feature exists here).
function CustomerFooter() {
  const [business, setBusiness] = useState(null);
  useEffect(() => { publicApi("/public/business-info").then(d => setBusiness(d.business || {})).catch(() => {}); }, []);
  const name = business?.business_name || "Bloom & Borrow";
  const hasSocial = business && (business.business_facebook || business.business_instagram);
  const hasContact = business && (business.business_phone || business.business_email || business.business_address);

  return <footer className="shop-footer">
    <div className="shop-footer-grid">
      <div className="shop-footer-brand">
        <Logo light to="/shop" />
        <p>Rent what you need, when you need it.</p>
        {hasSocial && <div className="shop-social-row">
          {business.business_facebook && <a href={business.business_facebook} target="_blank" rel="noreferrer" aria-label="Facebook"><FacebookIcon /></a>}
          {business.business_instagram && <a href={business.business_instagram} target="_blank" rel="noreferrer" aria-label="Instagram"><InstagramIcon /></a>}
        </div>}
      </div>

      <div className="shop-footer-col">
        <strong>Quick Links</strong>
        <NavLink to="/shop" end>Home</NavLink>
        <NavLink to="/shop/browse">Browse Items</NavLink>
        <NavLink to="/shop/cart">Cart</NavLink>
        <NavLink to="/shop/status">Check Status</NavLink>
      </div>

      {hasContact && <div className="shop-footer-col">
        <strong>Contact</strong>
        {business.business_address && <span>{business.business_address}</span>}
        {business.business_phone && <a href={`tel:${business.business_phone}`}>{business.business_phone}</a>}
        {business.business_email && <a href={`mailto:${business.business_email}`}>{business.business_email}</a>}
      </div>}
    </div>
    <div className="shop-footer-bar">
      <span>© {new Date().getFullYear()} {name}. All rights reserved.</span>
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
export function CustomerShell({ title, subtitle, hero, children }) {
  return (
    <div className="shop-shell">
      <header className="shop-header">
        <div className="shop-header-inner">
          <Logo to="/shop" />
          <nav className="shop-nav">
            <NavLink to="/shop" end>Home</NavLink>
            <NavLink to="/shop/browse">Browse</NavLink>
            <NavLink to="/shop/status">Check Status</NavLink>
          </nav>
        </div>
      </header>
      {hero}
      <main className="shop-main">
        {(title || subtitle) && <div className="shop-page-head">
          {title && <h1>{title}</h1>}
          {subtitle && <p>{subtitle}</p>}
        </div>}
        {children}
      </main>
      <CustomerFooter />
      <CartFab />
    </div>
  );
}
