import React, { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Logo } from "../Logo";
import { useCart } from "../../context/CartContext";
import { publicApi } from "../../lib/publicApi";

function FacebookIcon() {
  return <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M13.5 21v-7.5h2.5l.5-3h-3V8.5c0-.9.25-1.5 1.5-1.5H16.5V4.3C16.2 4.26 15.2 4.17 14 4.17c-2.4 0-4 1.47-4 4.16V10.5H7.5v3H10V21h3.5z"/></svg>;
}
function InstagramIcon() {
  return <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 8.3a3.7 3.7 0 1 0 0 7.4 3.7 3.7 0 0 0 0-7.4zm0 6.1a2.4 2.4 0 1 1 0-4.8 2.4 2.4 0 0 1 0 4.8zm4.7-6.25a.87.87 0 1 1-1.73 0 .87.87 0 0 1 1.73 0zM20 7.24a5 5 0 0 0-5.24-5.24H9.24A5 5 0 0 0 4 7.24v5.52a5 5 0 0 0 5.24 5.24h5.52A5 5 0 0 0 20 12.76V7.24zM18.6 12.76a3.6 3.6 0 0 1-3.84 3.84H9.24a3.6 3.6 0 0 1-3.84-3.84V7.24A3.6 3.6 0 0 1 9.24 3.4h5.52a3.6 3.6 0 0 1 3.84 3.84v5.52z"/></svg>;
}

function CustomerTabIcon({ name }) {
  if (name === "home") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10Z" /></svg>;
  if (name === "browse") return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></svg>;
  if (name === "status") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" /><path d="m9 14 2 2 9-10" /><path d="M9 3h6v4H9z" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="20" r="1" /><circle cx="19" cy="20" r="1" /><path d="M3 4h2l2.4 10.2a2 2 0 0 0 2 1.5h7.8a2 2 0 0 0 2-1.6L21 7H6" /></svg>;
}

function CustomerTabBar({ detailRoute }) {
  const { count } = useCart();
  const { pathname } = useLocation();
  const cartActive = pathname === "/shop/cart" || pathname === "/shop/checkout";
  const tabClass = active => `shop-mobile-tab${active ? " active" : ""}`;

  return <nav className="shop-mobile-tabbar" aria-label="Customer navigation">
    <NavLink to="/shop" end className={({ isActive }) => tabClass(isActive)}>
      <span className="shop-mobile-tab-icon"><CustomerTabIcon name="home" /></span>
      <span>Home</span>
    </NavLink>
    <NavLink to="/shop/browse" className={({ isActive }) => tabClass(isActive || detailRoute)} aria-current={detailRoute ? "page" : undefined}>
      <span className="shop-mobile-tab-icon"><CustomerTabIcon name="browse" /></span>
      <span>Browse</span>
    </NavLink>
    <NavLink to="/shop/status" className={({ isActive }) => tabClass(isActive)}>
      <span className="shop-mobile-tab-icon"><CustomerTabIcon name="status" /></span>
      <span>Status</span>
    </NavLink>
    <NavLink to="/shop/cart" className={({ isActive }) => tabClass(isActive || cartActive)} aria-current={cartActive ? "page" : undefined} aria-label={`Cart, ${count} item${count === 1 ? "" : "s"}`}>
      <span className="shop-mobile-tab-icon"><CustomerTabIcon name="cart" />{count > 0 && <span className="shop-mobile-tab-count" aria-hidden="true">{count > 99 ? "99+" : count}</span>}</span>
      <span>Cart</span>
    </NavLink>
  </nav>;
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

      <div className="shop-footer-col">
        <strong>Customer Policies</strong>
        <NavLink to="/shop/terms">Rental Terms</NavLink>
        <NavLink to="/shop/privacy">Privacy Policy</NavLink>
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
// CartProvider is mounted once around the customer app in App.jsx so every
// customer page, drawer, and product modal shares the same cart state.
export function CustomerShell({ title, subtitle, eyebrow, pageHeaderExtras, mainClassName = "", hero, children, disableModuleTransition }) {
  const { count } = useCart();
  const { pathname } = useLocation();
  const detailRoute = pathname.startsWith("/shop/") && !["/shop/browse", "/shop/cart", "/shop/checkout", "/shop/status", "/shop/terms", "/shop/privacy"].includes(pathname);
  const cartRoute = pathname === "/shop/cart" || pathname === "/shop/checkout";
  const focusedCheckout = pathname === "/shop/checkout";

  // Route changes should begin at the new module's heading. Item-detail
  // overlays do not mount a new shell, so opening/closing one keeps the
  // catalog's scroll position intact.
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);

  useEffect(()=>{
    document.title=`${title || "Rentals"} | Bloom & Borrow`;
  },[title]);

  return (
    <div className={`shop-shell${focusedCheckout ? " shop-shell-focused" : ""}`}>
      <a className="skip-link" href="#shop-main-content">Skip to main content</a>
      <header className="shop-header">
        <div className="shop-header-inner">
          <Logo to="/shop" />
          <nav className="shop-nav">
            <NavLink to="/shop" end>Home</NavLink>
            <NavLink to="/shop/browse" className={({ isActive }) => isActive || detailRoute ? "active" : undefined} aria-current={detailRoute ? "page" : undefined}>Browse</NavLink>
            <NavLink to="/shop/status">Check Status</NavLink>
            <NavLink to="/shop/cart" className={({isActive})=>isActive||cartRoute?"active shop-nav-cart":"shop-nav-cart"} aria-current={cartRoute?"page":undefined}>Cart {count>0&&<span aria-label={`${count} item${count===1?"":"s"}`}>{count>99?"99+":count}</span>}</NavLink>
          </nav>
        </div>
      </header>
      <div className={`shop-module-enter ${hero ? "has-hero" : ""} ${disableModuleTransition ? "no-enter" : ""}`}>
        {hero}
        <main className={`shop-main ${mainClassName}`.trim()} id="shop-main-content" tabIndex="-1">
          {(title || subtitle) && <div className="shop-page-head">
            {eyebrow && <span className="shop-page-eyebrow">{eyebrow}</span>}
            {title && <h1 id="shop-page-title">{title}</h1>}
            {subtitle && <p>{subtitle}</p>}
            {pageHeaderExtras}
          </div>}
          {children}
        </main>
      </div>
      <CustomerFooter />
      {!focusedCheckout && <CustomerTabBar detailRoute={detailRoute} />}
    </div>
  );
}
