import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CustomerShell } from "../../components/customer/CustomerShell";
import { useCart } from "../../context/CartContext";
import { publicApi } from "../../lib/publicApi";
import { peso } from "../../lib/format";

export function CustomerItemDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
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

  if (loading) return <CustomerShell><div className="admin-card inventory-empty">Loading item…</div></CustomerShell>;
  if (loadError || !item) return <CustomerShell><div className="admin-card inventory-empty"><h3>Item not found</h3><p>{loadError || "This item may no longer be available."}</p><Link className="secondary-button" to="/shop/browse">Back to browsing</Link></div></CustomerShell>;

  const out = item.available_quantity < 1;

  const addToCart = () => {
    if (out) return;
    addItem(item, Math.min(item.available_quantity, Math.max(1, Number(quantity) || 1)));
    setToast(true);
    setTimeout(() => navigate("/shop/browse"), 800);
  };

  const quickAddRelated = (e, r) => {
    e.stopPropagation();
    if (r.available_quantity < 1) return;
    addItem(r, 1);
    setRelatedAdded(r.id);
    setTimeout(() => setRelatedAdded(id => id === r.id ? null : id), 900);
  };

  return <CustomerShell>
    {toast && <div className="shop-toast">✓ Added to cart</div>}
    <button type="button" className="shop-back-link" onClick={() => navigate(-1)}>← Back</button>
    <div className="shop-item-layout">
      <div className="shop-item-media admin-card">
        {item.image_url ? <img src={item.image_url} alt={item.name} /> : <div className="inventory-card-noimage">🌸</div>}
      </div>
      <div className="shop-item-info">
        <span className="eyebrow">{item.category}</span>
        <h1>{item.name}</h1>
        <div className="shop-item-price">
          <strong>{peso(Number(item.daily_price))}</strong><span>/day</span>
        </div>
        <ul className="shop-item-facts">
          <li><span>Security deposit</span><strong>{peso(Number(item.security_deposit))}</strong></li>
          <li><span>Available</span><strong className={out ? "shop-qty-zero" : ""}>{out ? "Unavailable" : item.available_quantity}</strong></li>
        </ul>

        <div className="shop-add-form">
          <label>Qty<input type="number" min="1" max={item.available_quantity || 1} value={quantity} disabled={out} onChange={e => setQuantity(e.target.value)} /></label>
          <button type="button" className="primary-button shop-add-btn" disabled={out} onClick={addToCart}>{out ? "Unavailable" : "Add to Cart"}</button>
        </div>
      </div>
    </div>

    {item.description && <section className="shop-details-section">
      <h2>Description</h2>
      <p>{item.description}</p>
    </section>}

    {related.length > 0 && <section className="shop-related-section">
      <h2>Related Items</h2>
      <div className="shop-item-grid shop-related-grid">
        {related.map(r => <article className={`shop-item-card ${r.available_quantity < 1 ? "is-unavailable" : ""}`} onClick={() => navigate(`/shop/${r.id}`)} key={r.id}>
          <div className="shop-item-card-image">
            {r.image_url ? <img src={r.image_url} alt={r.name} /> : <div className="inventory-card-noimage">🌸</div>}
            {r.available_quantity < 1 && <span className="shop-item-out-badge">Unavailable</span>}
          </div>
          <div className="shop-item-card-body">
            <small className="shop-item-card-cat">{r.category}</small>
            <h3>{r.name}</h3>
            <div className="shop-item-card-foot">
              <div className="shop-item-card-price">
                <strong>{peso(Number(r.daily_price))}<span>/day</span></strong>
                <small className={r.available_quantity < 1 ? "shop-qty-zero" : ""}>{r.available_quantity < 1 ? "Unavailable" : `Available: ${r.available_quantity}`}</small>
              </div>
              <button type="button" className={`primary-button shop-add-btn ${relatedAdded === r.id ? "is-added" : ""}`} disabled={r.available_quantity < 1} onClick={e => quickAddRelated(e, r)}>{relatedAdded === r.id ? "Added ✓" : "Add to Cart"}</button>
            </div>
          </div>
        </article>)}
      </div>
    </section>}
  </CustomerShell>;
}
