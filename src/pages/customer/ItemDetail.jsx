import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { CustomerShell } from "../../components/customer/CustomerShell";
import { PriceDisplay } from "../../components/PriceDisplay";
import { RentalItemCard, isPackageItem, packageContents, packageLabel } from "../../components/customer/RentalItemCard";
import { useCart } from "../../context/CartContext";
import { publicApi } from "../../lib/publicApi";
import { discountOf, peso } from "../../lib/format";

// Module scope on purpose: defining this inside the component would make it a
// brand-new component type on every render, so React would unmount/remount the
// whole panel on each keystroke (input loses focus, the slide-in replays).
function Shell({ background, children }) {
  return background ? <>{children}</> : <CustomerShell hideFloatingCart disableModuleTransition>{children}</CustomerShell>;
}

// Opened from Browse/Home, this renders as a popup over the page that's
// still mounted underneath (the "background location" react-router
// pattern -- see App.jsx). Opened directly (a typed URL, a refresh, or a
// shared link), there's no page underneath to show, so it falls back to a
// full standalone page with its own shell.
//
// This panel is where the card deliberately stops: the full description,
// the specification table, and -- for a package -- every included item with
// its quantity. The catalog card above only ever shows the headline facts.
export function CustomerItemDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const background = location.state?.backgroundLocation;
  const { addItem } = useCart();
  const [item, setItem] = useState(null);
  const [related, setRelated] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [toast, setToast] = useState(false);
  const [relatedAdded, setRelatedAdded] = useState(null);
  const closeRef=useRef(null);

  useEffect(() => {
    setLoading(true);
    setQuantity(1);
    Promise.all([
      publicApi(`/public/items/${id}`),
      publicApi("/public/items")
    ]).then(([itemData, allData]) => {
      setItem(itemData.item);
      // Related items come from the same real category -- no separate
      // "related items" concept exists, so this is just a filter over the
      // same catalog data, excluding the item itself.
      setRelated((allData.items || []).filter(x => x.category === itemData.item.category && x.id !== itemData.item.id).slice(0, 4));
    }).catch(e => setLoadError(e.message)).finally(() => setLoading(false));
  }, [id]);

  const close = () => background ? navigate(-1) : navigate("/shop/browse",{replace:true});

  useEffect(()=>{
    const previousOverflow=document.body.style.overflow;
    document.body.style.overflow="hidden";
    const focusTimer=setTimeout(()=>closeRef.current?.focus(),0);
    const onKeyDown=e=>{if(e.key==="Escape")close()};
    window.addEventListener("keydown",onKeyDown);
    return()=>{clearTimeout(focusTimer);window.removeEventListener("keydown",onKeyDown);document.body.style.overflow=previousOverflow};
  },[id,background]);

  if (loading) return <Shell background={background}><div className="modal-backdrop shop-detail-backdrop" onClick={close}><div className="shop-detail-modal shop-detail-modal-small" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-busy="true">
    <button ref={closeRef} type="button" className="booking-modal-close" onClick={close} aria-label="Close">×</button>
    <p className="shop-detail-status-text" role="status">Loading item…</p>
  </div></div></Shell>;
  if (loadError || !item) return <Shell background={background}><div className="modal-backdrop shop-detail-backdrop" onClick={close}><div className="shop-detail-modal shop-detail-modal-small" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
    <button ref={closeRef} type="button" className="booking-modal-close" onClick={close} aria-label="Close">×</button>
    <h3>Item not found</h3>
    <p className="shop-detail-status-text">{loadError || "This item may no longer be available."}</p>
    <Link className="secondary-button" to="/shop/browse">Back to browsing</Link>
  </div></div></Shell>;

  const out = item.available_quantity < 1;
  const step = delta => setQuantity(q => Math.min(item.available_quantity || 1, Math.max(1, (Number(q) || 1) + delta)));

  const addToCart = () => {
    if (out) return;
    const cap = Math.max(1, Number(item.available_quantity) || 1);
    addItem(item, Math.min(cap, Math.max(1, Number(quantity) || 1)));
    setToast(true);
    setTimeout(close, 800);
  };

  const quickAddRelated = r => {
    if (r.available_quantity < 1) return;
    addItem(r, 1);
    setRelatedAdded(r.id);
    setTimeout(() => setRelatedAdded(prev => prev === r.id ? null : prev), 900);
  };

  const openRelated = r => navigate(`/shop/${r.id}`, { state: { backgroundLocation: background || location } });

  const contents = packageContents(item);
  const pkg = isPackageItem(item);
  const totalPieces = contents.reduce((sum, c) => sum + c.quantity, 0);
  const savings = discountOf(item.daily_price, item.original_price);

  const specs = [
    ["Category", item.category],
    ["Daily rate", `${peso(Number(item.daily_price))} / day`],
    ["Security deposit", peso(Number(item.security_deposit))],
    ["Total units", String(item.total_quantity)],
    ["Available now", `${item.available_quantity} of ${item.total_quantity}`]
  ];
  if (savings) specs.push(["You save", peso(savings.save)]);

  return <Shell background={background}>
    {toast && <div className="shop-toast" role="status" aria-live="polite">✓ Added to cart</div>}
    <div className="modal-backdrop shop-detail-backdrop" onClick={close}>
      <div className="shop-detail-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={item.name}>
        <button ref={closeRef} type="button" className="booking-modal-close" onClick={close} aria-label="Close item details">×</button>

        <div className="shop-detail-content">
        <div className="shop-detail-grid">
          <div className="shop-detail-media">
            {item.image_url ? <img src={item.image_url} alt={item.name} /> : <div className="inventory-card-noimage">🌸</div>}
            {out && <span className="shop-item-out-badge">Unavailable</span>}
          </div>

          <div className="shop-detail-info">
            <span className={`eyebrow ${pkg ? "is-package" : ""}`}>{pkg ? packageLabel(item) : item.category}</span>
            <h1>{item.name}</h1>

            <div className="shop-detail-price-row">
              <PriceDisplay size="detail" price={item.daily_price} originalPrice={item.original_price} />
              <span className="shop-detail-deposit">+ {peso(Number(item.security_deposit))} security deposit</span>
            </div>

            <div className={`shop-detail-availability ${out ? "is-out" : "is-ok"}`}>
              <span className="shop-detail-dot" />{out ? "Unavailable" : `${item.available_quantity} available`}
            </div>

            <div className="shop-detail-actions">
              <div className="shop-qty-stepper">
                <button type="button" onClick={() => step(-1)} disabled={out} aria-label="Decrease quantity">−</button>
                <input type="number" min="1" max={item.available_quantity || 1} value={quantity} disabled={out} aria-label={`${item.name} quantity`} onChange={e => setQuantity(e.target.value.replace(/[^\d]/g, ""))} />
                <button type="button" onClick={() => step(1)} disabled={out} aria-label="Increase quantity">+</button>
              </div>
              <button type="button" className="primary-button shop-detail-addbtn" disabled={out} onClick={addToCart}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg>
                {out ? "Unavailable" : "Add to Cart"}
              </button>
            </div>
          </div>
        </div>

        {item.description && <section className="shop-detail-section">
          <h2>Description</h2>
          <p className="shop-detail-desc">{item.description}</p>
        </section>}

        {contents.length > 0 && <section className="shop-detail-section">
          <h2>Package contents <span>{totalPieces} piece{totalPieces === 1 ? "" : "s"}</span></h2>
          <ul className="shop-detail-includes">
            {contents.map((entry, index) => <li key={`${entry.name}-${index}`}>
              <span className="shop-detail-includes-name">{entry.name}</span>
              <span className="shop-detail-includes-qty">×{entry.quantity}</span>
            </li>)}
          </ul>
        </section>}

        <section className="shop-detail-section">
          <h2>Specifications</h2>
          <dl className="shop-detail-specs">
            {specs.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
          </dl>
        </section>

        <div className="shop-detail-notes">
          <span><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="1" y="7" width="14" height="10" rx="1.5" /><path d="M15 10h3.5l3.5 3.5V17h-7z" /><circle cx="6.5" cy="19.5" r="1.5" /><circle cx="17.5" cy="19.5" r="1.5" /></svg>Delivery available (fee confirmed on request)</span>
          <span><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>Flexible rental duration</span>
        </div>

        {related.length > 0 && <section className="shop-related-section">
          <h2>Related Items</h2>
          <div className="shop-item-grid shop-related-grid">
            {related.map(r => <RentalItemCard
              key={r.id}
              item={r}
              onOpen={openRelated}
              onAdd={quickAddRelated}
              added={relatedAdded === r.id}
            />)}
          </div>
        </section>}
        </div>
      </div>
    </div>
  </Shell>;
}
