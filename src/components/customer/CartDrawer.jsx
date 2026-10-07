import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useCart } from "../../context/CartContext";
import { peso } from "../../lib/format";

// Floating right-side cart panel opened by the bottom-right cart button.
// Shows the same CartContext state as the /shop/cart page (qty edits and
// removal work here too); dates are still picked later on the rental form.
export function CartDrawer({ onClose }) {
  const navigate = useNavigate();
  const { items, count, setQuantity, removeItem } = useCart();
  const closeRef=useRef(null);
  const dailyTotal = items.reduce((sum, x) => sum + x.daily_price * x.quantity, 0);
  const depositTotal = items.reduce((sum, x) => sum + x.security_deposit * x.quantity, 0);

  useEffect(() => {
    const previousOverflow=document.body.style.overflow;
    document.body.style.overflow="hidden";
    closeRef.current?.focus();
    const onKey = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow=previousOverflow; };
  }, [onClose]);

  const go = to => { onClose(); navigate(to); };

  return <div className="shop-cart-drawer-backdrop" onClick={onClose}>
    <aside className="shop-cart-drawer" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="cart-drawer-title">
      <header className="shop-cart-drawer-head">
        <div>
          <h2 id="cart-drawer-title">Your Cart</h2>
          <small>{count} item{count === 1 ? "" : "s"}</small>
        </div>
        <button ref={closeRef} type="button" className="booking-modal-close" onClick={onClose} aria-label="Close cart">×</button>
      </header>

      {items.length === 0 ? <div className="shop-cart-drawer-empty">
        <h3>Your cart is empty</h3>
        <p>Browse our items and add what you'd like to rent.</p>
        <button type="button" className="primary-button" data-customer-nav onClick={() => go("/shop/browse")}>Browse items</button>
      </div> : <>
        <div className="shop-cart-drawer-list">
          {items.map(x => <div className="shop-cart-drawer-item" key={x.item_id}>
            {x.image_url ? <img src={x.image_url} alt={x.name} /> : <div className="shop-cart-drawer-thumb">🌸</div>}
            <div className="shop-cart-drawer-item-info">
              <strong>{x.name}</strong>
              <small>{x.category} · {peso(x.daily_price)}/day</small>
              <div className="shop-cart-drawer-item-foot">
                <div className="shop-qty-stepper">
                  <button type="button" onClick={() => setQuantity(x.item_id, x.quantity - 1)} disabled={x.quantity <= 1} aria-label={`Decrease ${x.name} quantity`}>−</button>
                  <input type="number" min="1" max={x.available_quantity || undefined} value={x.quantity} onChange={e => setQuantity(x.item_id, Number(e.target.value) || 1)} aria-label={`${x.name} quantity`} />
                  <button type="button" onClick={() => setQuantity(x.item_id, x.quantity + 1)} disabled={x.quantity >= (x.available_quantity ?? Infinity)} aria-label={`Increase ${x.name} quantity`}>+</button>
                </div>
                <strong className="shop-cart-drawer-line-total">{peso(x.daily_price * x.quantity)}<span>/day</span></strong>
              </div>
            </div>
            <button type="button" className="shop-cart-drawer-remove" onClick={() => removeItem(x.item_id)} aria-label={`Remove ${x.name}`}>×</button>
          </div>)}
        </div>

        <footer className="shop-cart-drawer-foot">
          <div><span>Rental subtotal</span><strong>{peso(dailyTotal)}<small> /day</small></strong></div>
          <div><span>Security deposit</span><strong>{peso(depositTotal)}</strong></div>
          <p>Rental dates and the final total are set on the next step.</p>
          <button type="button" className="primary-button" data-customer-nav onClick={() => go("/shop/checkout")}>Proceed to Rental</button>
          <button type="button" className="secondary-button" onClick={onClose}>Continue Shopping</button>
        </footer>
      </>}
    </aside>
  </div>;
}
