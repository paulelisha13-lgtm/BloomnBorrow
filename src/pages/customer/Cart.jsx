import React from "react";
import { Link } from "react-router-dom";
import { CustomerShell } from "../../components/customer/CustomerShell";
import { CartContents } from "../../components/customer/CartContents";
import { useCart } from "../../context/CartContext";

export function CustomerCart() {
  const { items } = useCart();

  return <CustomerShell title="Your cart" subtitle="Review your selected items before continuing.">
    {items.length === 0 ? <div className="admin-card inventory-empty">
      <h3>Your cart is empty</h3>
      <p>Browse our items and add what you'd like to rent.</p>
      <Link className="primary-button" to="/shop">Browse items</Link>
    </div> : <CartContents />}
  </CustomerShell>;
}
