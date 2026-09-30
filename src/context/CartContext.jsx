import React, { createContext, useContext, useEffect, useState } from "react";

// The cart is pre-checkout, per-browser state only -- there is no cart table
// in the existing schema, and none is needed: nothing here touches the
// database until "Proceed to Rental" submits the real booking. localStorage
// keeps it alive across page navigations (each /shop/* page mounts its own
// CartProvider) and browser refreshes.
const STORAGE_KEY = "bb_customer_cart";
const CartContext = createContext(null);

function readStoredCart() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(readStoredCart);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch { /* private mode etc. */ }
  }, [items]);

  const addItem = (item, quantity = 1) => setItems(prev => {
    const existing = prev.find(x => x.item_id === item.id);
    if (existing) return prev.map(x => x.item_id === item.id ? { ...x, quantity: x.quantity + quantity } : x);
    return [...prev, { item_id: item.id, name: item.name, category: item.category, image_url: item.image_url, daily_price: Number(item.daily_price), security_deposit: Number(item.security_deposit), quantity }];
  });
  const setQuantity = (itemId, quantity) => setItems(prev => prev.map(x => x.item_id === itemId ? { ...x, quantity: Math.max(1, quantity) } : x));
  const removeItem = itemId => setItems(prev => prev.filter(x => x.item_id !== itemId));
  const clear = () => setItems([]);
  const count = items.reduce((sum, x) => sum + x.quantity, 0);

  return <CartContext.Provider value={{ items, addItem, setQuantity, removeItem, clear, count }}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
