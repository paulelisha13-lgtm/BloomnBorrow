import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CustomerShell } from "../../components/customer/CustomerShell";
import { useCart } from "../../context/CartContext";
import { peso } from "../../lib/format";

// Rental dates aren't chosen yet at this step (they're entered once, for the
// whole cart, on the rental form -- matching Admin -> Add Booking, which
// also prices a single date range across every line item). So this shows
// the per-day rate and deposit, not a final total; the real total appears
// on the rental form once dates make it computable via the existing pricing
// logic (daily_price * quantity * days).
export function CustomerCart() {
  const navigate = useNavigate();
  const { items, setQuantity, removeItem } = useCart();
  const [qtyErrors, setQtyErrors] = useState({});
  const dailyTotal = items.reduce((sum, x) => sum + x.daily_price * x.quantity, 0);
  const depositTotal = items.reduce((sum, x) => sum + x.security_deposit * x.quantity, 0);

  const changeQuantity = (x, value) => {
    const requested = Number(value) || 1;
    const cap = x.available_quantity ?? Infinity;
    if (requested > cap) {
      setQtyErrors(prev => ({ ...prev, [x.item_id]: `Only ${cap} available for ${x.name}.` }));
    } else {
      setQtyErrors(prev => { const next = { ...prev }; delete next[x.item_id]; return next; });
    }
    setQuantity(x.item_id, requested);
  };

  return <CustomerShell title="Your cart" subtitle="Review your selected items before continuing.">
    {items.length === 0 ? <div className="admin-card inventory-empty">
      <h3>Your cart is empty</h3>
      <p>Browse our items and add what you'd like to rent.</p>
      <Link className="primary-button" to="/shop/browse">Browse items</Link>
    </div> : <>
      <div className="shop-cart-list">
        {items.map(x => <div className="admin-card shop-cart-row" key={x.item_id}>
          {x.image_url ? <img src={x.image_url} alt={x.name} /> : <div className="inventory-card-noimage shop-cart-thumb">🌸</div>}
          <div className="shop-cart-info">
            <strong>{x.name}</strong>
            <small>{x.category}</small>
            <small>{peso(x.daily_price)}/day · {peso(x.security_deposit)} deposit</small>
          </div>
          <div className="shop-cart-qty">
            <label>Qty
              <input type="number" min="1" max={x.available_quantity || undefined} value={x.quantity} onChange={e => changeQuantity(x, e.target.value)} />
            </label>
            {qtyErrors[x.item_id] && <small className="shop-qty-zero">{qtyErrors[x.item_id]}</small>}
          </div>
          <strong className="shop-cart-line-total">{peso(x.daily_price * x.quantity)}<span>/day</span></strong>
          <button type="button" className="mini-button danger" onClick={() => removeItem(x.item_id)}>Remove</button>
        </div>)}
      </div>

      <div className="admin-card review-total shop-cart-summary">
        <div><span>Rental subtotal</span><strong>{peso(dailyTotal)}<small> /day</small></strong></div>
        <div><span>Security deposit</span><strong>{peso(depositTotal)}</strong></div>
        <p className="muted">Final total depends on your rental dates — you'll see the full breakdown on the next step.</p>
      </div>

      <div className="shop-cart-actions">
        <Link className="secondary-button" to="/shop/browse">Continue Shopping</Link>
        <button type="button" className="primary-button" onClick={() => navigate("/shop/checkout")}>Proceed to Rental</button>
      </div>
    </>}
  </CustomerShell>;
}
