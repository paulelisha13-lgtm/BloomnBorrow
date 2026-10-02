import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { CustomerShell } from "../../components/customer/CustomerShell";
import { RentalItemCard } from "../../components/customer/RentalItemCard";
import { useCart } from "../../context/CartContext";
import { publicApi } from "../../lib/publicApi";

function SearchIcon() {
  return <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
}
function CartIcon() {
  return <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M2 3h3l2.4 11.2a1.6 1.6 0 0 0 1.6 1.3h7.8a1.6 1.6 0 0 0 1.6-1.3L21 7H6" /></svg>;
}
function FileIcon() {
  return <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h4" /></svg>;
}
function ClockIcon() {
  return <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.2 2" /></svg>;
}

// The four real steps of this system, shown as static display-only cards --
// they explain the flow (browse -> cart -> request -> status) but don't link
// anywhere; the hero and footer already carry the navigation.
const STEPS = [
  { icon: <SearchIcon />, title: "Browse the catalog", text: "See current inventory, daily rates, and live availability at a glance." },
  { icon: <CartIcon />, title: "Build your cart", text: "Pick the items and quantities you need for your dates." },
  { icon: <FileIcon />, title: "Send your request", text: "Submit your details once — we confirm availability right away." },
  { icon: <ClockIcon />, title: "Track your booking", text: "Follow every status update with your booking number." }
];

// Keep scroll-linked motion out of React state: CSS variables let the browser
// update the composited layers without re-rendering the homepage on every tick.
function useHeroParallax(heroRef) {
  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return undefined;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frameId = 0;
    let listening = false;

    const reset = () => {
      hero.style.removeProperty("--hero-content-shift");
      hero.style.removeProperty("--hero-content-opacity");
      hero.style.removeProperty("--hero-dots-left-shift");
      hero.style.removeProperty("--hero-dots-right-shift");
    };

    const update = () => {
      frameId = 0;
      const travel = Math.min(Math.max(window.scrollY / (hero.offsetHeight * 1.15), 0), 1);
      hero.style.setProperty("--hero-content-shift", `${travel * -28}px`);
      hero.style.setProperty("--hero-content-opacity", `${1 - travel * 0.12}`);
      hero.style.setProperty("--hero-dots-left-shift", `${travel * -11}px`);
      hero.style.setProperty("--hero-dots-right-shift", `${travel * -20}px`);
    };

    const requestUpdate = () => {
      if (!frameId) frameId = window.requestAnimationFrame(update);
    };

    const disable = () => {
      if (listening) {
        window.removeEventListener("scroll", requestUpdate);
        window.removeEventListener("resize", requestUpdate);
        listening = false;
      }
      if (frameId) window.cancelAnimationFrame(frameId);
      frameId = 0;
      reset();
    };

    const enable = () => {
      if (listening) return;
      window.addEventListener("scroll", requestUpdate, { passive: true });
      window.addEventListener("resize", requestUpdate);
      listening = true;
      requestUpdate();
    };

    const syncMotionPreference = () => {
      if (reducedMotion.matches) disable();
      else enable();
    };

    syncMotionPreference();
    reducedMotion.addEventListener?.("change", syncMotionPreference);

    return () => {
      disable();
      reducedMotion.removeEventListener?.("change", syncMotionPreference);
    };
  }, [heroRef]);
}

export function CustomerHome() {
  const navigate = useNavigate();
  const location = useLocation();
  const { addItem } = useCart();
  const heroRef = useRef(null);
  const [items, setItems] = useState([]);
  const [added, setAdded] = useState(null);
  const [selected, setSelected] = useState(null);

  useHeroParallax(heroRef);

  // The homepage must stay useful even if the API is down, so a failed
  // load just hides the featured section instead of showing an error page.
  useEffect(() => {
    publicApi("/public/items").then(d => setItems(d.items || [])).catch(() => {});
  }, []);

  const featured = items.filter(x => x.available_quantity > 0).slice(0, 4);

  const openItem = item => {
    setSelected(item.id);
    navigate(`/shop/${item.id}`, { state: { backgroundLocation: location } });
  };

  const quickAdd = item => {
    if (item.available_quantity < 1) return;
    addItem(item, 1);
    setAdded(item.id);
    setTimeout(() => setAdded(id => id === item.id ? null : id), 900);
  };

  const hero = (
    <section className="home-hero" ref={heroRef}>
      <span className="home-hero-dots home-hero-dots-left" aria-hidden="true" />
      <span className="home-hero-dots home-hero-dots-right" aria-hidden="true" />
      <div className="home-hero-inner">
        <p className="home-eyebrow home-hero-reveal" style={{ "--hero-delay": "80ms", "--hero-duration": "600ms" }}>Bloom &amp; Borrow</p>
        <h1 className="home-hero-reveal" style={{ "--hero-delay": "170ms", "--hero-duration": "650ms" }}>Rent what you need, when you need it.</h1>
        <p className="home-hero-text home-hero-reveal" style={{ "--hero-delay": "290ms", "--hero-duration": "620ms" }}>Browse real-time inventory, send a rental request in minutes, and track your booking — no account required.</p>
        <div className="home-hero-actions home-hero-reveal home-hero-reveal-scale" style={{ "--hero-delay": "410ms", "--hero-duration": "560ms" }}>
          <Link className="primary-button" to="/shop/browse">Browse Rentals</Link>
          <Link className="secondary-button" to="/shop/status">Check Booking Status</Link>
        </div>
      </div>
    </section>
  );

  return <CustomerShell hero={hero}>
    <section className="home-section">
      <div className="home-section-head">
        <p className="home-eyebrow">How it works</p>
        <h2>Renting made simple</h2>
      </div>
      <div className="home-steps">
        {STEPS.map(step => <div className="home-step" key={step.title}>
          <span className="home-step-icon">{step.icon}</span>
          <h3>{step.title}</h3>
          <p>{step.text}</p>
          <span className="home-step-arrow" aria-hidden="true">→</span>
        </div>)}
      </div>
    </section>

    {featured.length > 0 && <section className="home-section">
      <div className="home-section-head">
        <p className="home-eyebrow">Our catalog</p>
        <h2>Ready to rent today</h2>
        <Link className="home-section-link" to="/shop/browse">View all items →</Link>
      </div>
      <div className="shop-item-grid shop-async-reveal">
        {featured.map(item => <RentalItemCard
          key={item.id}
          item={item}
          selected={selected === item.id}
          onOpen={openItem}
          onAdd={quickAdd}
          added={added === item.id}
        />)}
      </div>
    </section>}

    <section className="home-cta">
      <div>
        <h2>Already have a booking?</h2>
        <p>Enter your booking number and email to see its live status.</p>
      </div>
      <Link className="primary-button" to="/shop/status">Check Status</Link>
    </section>
  </CustomerShell>;
}
