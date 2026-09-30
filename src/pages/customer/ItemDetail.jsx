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
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    publicApi(`/public/items/${id}`).then(d => setItem(d.item)).catch(e => setLoadError(e.message)).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <CustomerShell><div className="admin-card inventory-empty">Loading item…</div></CustomerShell>;
  if (loadError || !item) return <CustomerShell><div className="admin-card inventory-empty"><h3>Item not found</h3><p>{loadError || "This item may no longer be available."}</p><Link className="secondary-button" to="/shop">Back to browsing</Link></div></CustomerShell>;

  const addToCart = () => {
    addItem(item, Math.max(1, Number(quantity) || 1));
    setAdded(true);
  };

  return <CustomerShell>
    <div className="shop-item-layout">
      <div className="shop-item-media admin-card">
        {item.image_url ? <img src={item.image_url} alt={item.name} /> : <div className="inventory-card-noimage">🌸</div>}
      </div>
      <div className="shop-item-info">
        <span className="eyebrow">{item.category}</span>
        <h1>{item.name}</h1>
        {item.description && <p className="muted">{item.description}</p>}
        <div className="review-total">
          <div><span>Price / day</span><strong>{peso(Number(item.daily_price))}</strong></div>
          <div><span>Security deposit</span><strong>{peso(Number(item.security_deposit))}</strong></div>
        </div>

        {added ? <div className="shop-added-banner">
          <span>✓ Added to cart</span>
          <div className="shop-added-actions">
            <button type="button" className="secondary-button" onClick={() => navigate("/shop")}>Continue Browsing</button>
            <button type="button" className="primary-button" onClick={() => navigate("/shop/cart")}>View Cart</button>
          </div>
        </div> : <div className="shop-add-form">
          <label>Quantity<input type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)} /></label>
          <button type="button" className="primary-button full" onClick={addToCart}>Add to Cart</button>
        </div>}
      </div>
    </div>
  </CustomerShell>;
}
