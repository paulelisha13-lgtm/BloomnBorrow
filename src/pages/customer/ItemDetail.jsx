import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { CustomerShell } from "../../components/customer/CustomerShell";
import { PriceDisplay } from "../../components/PriceDisplay";
import { useCart } from "../../context/CartContext";
import { publicApi } from "../../lib/publicApi";
import { peso } from "../../lib/format";

// Opened from Browse/Home, this renders as a popup over the page that's
// still mounted underneath (the "background location" react-router
// pattern -- see App.jsx). Opened directly (a typed URL, a refresh, or a
// shared link), there's no page underneath to show, so it falls back to a
// full standalone page with its own shell.
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

  const close = () => navigate(-1);
  const Shell = ({ children }) => background ? <>{children}</> : <CustomerShell hideFloatingCart>{children}</CustomerShell>;

  if (loading) return <Shell><div className="modal-backdrop" onClick={close}><div className="shop-detail-modal shop-detail-modal-small" onClick={e => e.stopPropagation()}>
    <button type="button" className="booking-modal-close" onClick={close} aria-label="Close">×</button>
    <p className="shop-detail-status-text">Loading item…</p>
  </div></div></Shell>;
  if (loadError || !item) return <Shell><div className="modal-backdrop" onClick={close}><div className="shop-detail-modal shop-detail-modal-small" onClick={e => e.stopPropagation()}>
    <button type="button" className="booking-modal-close" onClick={close} aria-label="Close">×</button>
    <h3>Item not found</h3>
    <p className="shop-detail-status-text">{loadError || "This item may no longer be available."}</p>
    <Link className="secondary-button" to="/shop/browse">Back to browsing</Link>
  </div></div></Shell>;

  const out = item.available_quantity < 1;
  const step = delta => setQuantity(q => Math.min(item.available_quantity || 1, Math.max(1, (Number(q) || 1) + delta)));

  const addToCart = () => {
    if (out) return;
    addItem(item, Math.min(item.available_quantity, Math.max(1, Number(quantity) || 1)));
    setToast(true);
    setTimeout(close, 800);
  };

  const quickAddRelated = (e, r) => {
    e.stopPropagation();
    if (r.available_quantity < 1) return;
    addItem(r, 1);
    setRelatedAdded(r.id);
    setTimeout(() => setRelatedAdded(id => id === r.id ? null : id), 900);
  };

  return <Shell>
    {toast && <div className="shop-toast">✓ Added to cart</div>}
    <div className="modal-backdrop" onClick={close}>
      <div className="shop-detail-modal" onClick={e => e.stopPropagation()}>
        <button type="button" className="booking-modal-close" onClick={close} aria-label="Close">×</button>

        <div className="shop-detail-grid">
          <div className="shop-detail-media">
            {item.image_url ? <img src={item.image_url} alt={item.name} /> : <div className="inventory-card-noimage">🌸</div>}
            {out && <span className="shop-item-out-badge">Unavailable</span>}
          </div>

          <div className="shop-detail-info">
            <span className="eyebrow">{item.category}</span>
            <h1>{item.name}</h1>
            {item.description && <p className="shop-detail-desc">{item.description}</p>}

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
                <input type="number" min="1" max={item.available_quantity || 1} value={quantity} disabled={out} onChange={e => setQuantity(e.target.value)} />
                <button type="button" onClick={() => step(1)} disabled={out} aria-label="Increase quantity">+</button>
              </div>
              <button type="button" className="primary-button shop-detail-addbtn" disabled={out} onClick={addToCart}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg>
                {out ? "Unavailable" : "Add to Cart"}
              </button>
            </div>

            <div className="shop-detail-notes">
              <span><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="1" y="7" width="14" height="10" rx="1.5" /><path d="M15 10h3.5l3.5 3.5V17h-7z" /><circle cx="6.5" cy="19.5" r="1.5" /><circle cx="17.5" cy="19.5" r="1.5" /></svg>Delivery available (fee confirmed on request)</span>
              <span><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>Flexible rental duration</span>
            </div>
          </div>
        </div>

        {related.length > 0 && <section className="shop-related-section">
          <h2>Related Items</h2>
          <div className="shop-item-grid shop-related-grid">
            {related.map(r => <article className={`shop-item-card ${r.available_quantity < 1 ? "is-unavailable" : ""}`} onClick={() => navigate(`/shop/${r.id}`, { state: { backgroundLocation: background || location } })} key={r.id}>
              <div className="shop-item-card-image">
                {r.image_url ? <img src={r.image_url} alt={r.name} /> : <div className="inventory-card-noimage">🌸</div>}
                {r.available_quantity < 1 && <span className="shop-item-out-badge">Unavailable</span>}
              </div>
              <div className="shop-item-card-body">
                <small className="shop-item-card-cat">{r.category}</small>
                <h3>{r.name}</h3>
                <div className="shop-item-card-foot">
                  <div className="shop-item-card-price">
                    <PriceDisplay price={r.daily_price} originalPrice={r.original_price} />
                    <small className={r.available_quantity < 1 ? "shop-qty-zero" : ""}>{r.available_quantity < 1 ? "Unavailable" : `Available: ${r.available_quantity}`}</small>
                  </div>
                  <button type="button" className={`primary-button shop-add-btn ${relatedAdded === r.id ? "is-added" : ""}`} disabled={r.available_quantity < 1} onClick={e => quickAddRelated(e, r)}>{relatedAdded === r.id ? "Added ✓" : "Add to Cart"}</button>
                </div>
              </div>
            </article>)}
          </div>
        </section>}
      </div>
    </div>
  </Shell>;
}
