import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { bookings, items } from "./data";
import { api, clearAuth, getStoredUser, getToken, saveAuth } from "./api";
import logoImg from "./logo.png";

const peso = (value) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(value);

// Escape a value before putting it into an HTML string. Invoice printing opens a
// new document with document.write(), which does NOT auto-escape like React does,
// so customer-controlled text (name, email, notes) must be neutralised here.
function escHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));
}

// Build and print an invoice in a new window. Every interpolated value is escaped.
function openInvoice({ bookingNo, createdAt, customerName, customerEmail, customerPhone, method, type, status, amount, note }) {
  const win = window.open("", "_blank", "width=800,height=600");
  if (!win) return;
  const e = escHtml;
  const dateStr = createdAt
    ? new Date(createdAt).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })
    : "";
  const contactLines = [customerEmail, customerPhone].filter(Boolean).map(e).join("<br/>");
  win.document.write(`<!DOCTYPE html><html><head><title>Invoice ${e(bookingNo)}</title><style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Segoe UI',sans-serif;padding:40px;color:#1a1a1a}
    .invoice{max-width:600px;margin:auto}
    .header{display:flex;justify-content:space-between;align-items:start;border-bottom:3px solid #089b9d;padding-bottom:20px;margin-bottom:24px}
    .brand h1{font-size:24px;color:#089b9d;margin-bottom:4px}
    .brand p{font-size:12px;color:#666}
    .invoice-title{text-align:right}
    .invoice-title h2{font-size:28px;color:#089b9d}
    .invoice-title p{font-size:12px;color:#666}
    .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px}
    .info-box h3{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#089b9d;margin-bottom:8px}
    .info-box p{font-size:13px;line-height:1.6}
    table{width:100%;border-collapse:collapse;margin-bottom:24px}
    th{background:#f0f9f9;padding:10px 14px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#666}
    td{padding:12px 14px;border-bottom:1px solid #eee;font-size:13px}
    .amount{text-align:right;font-weight:700}
    .totals{margin-left:auto;width:260px}
    .totals div{display:flex;justify-content:space-between;padding:8px 0;font-size:13px}
    .totals .total-row{border-top:2px solid #089b9d;padding-top:10px;margin-top:4px;font-size:16px;font-weight:800;color:#089b9d}
    .footer{margin-top:40px;padding-top:16px;border-top:1px solid #ddd;text-align:center;font-size:11px;color:#888}
    @media print{body{padding:20px}}
  </style></head><body><div class="invoice">
    <div class="header">
      <div class="brand"><h1>Bloom &amp; Borrow</h1><p>Rental Business Management System</p></div>
      <div class="invoice-title"><h2>INVOICE</h2><p>${e(bookingNo)}</p><p>${e(dateStr)}</p></div>
    </div>
    <div class="info-grid">
      <div class="info-box"><h3>Bill To</h3><p><strong>${e(customerName)}</strong>${contactLines ? "<br/>" + contactLines : ""}</p></div>
      <div class="info-box"><h3>Payment Details</h3><p>Method: <strong>${e(String(method || "cash").toUpperCase())}</strong><br/>Type: <strong>${e(String(type || "rental").toUpperCase())}</strong><br/>Status: <strong>${e(String(status || "").toUpperCase())}</strong></p></div>
    </div>
    <table><thead><tr><th>Description</th><th class="amount">Amount</th></tr></thead><tbody>
      <tr><td>Payment for ${e(type || "rental")} &mdash; ${e(bookingNo)}</td><td class="amount">${e(peso(Number(amount)))}</td></tr>
      ${note ? `<tr><td>Note: ${e(note)}</td><td class="amount">&mdash;</td></tr>` : ""}
    </tbody></table>
    <div class="totals"><div class="total-row"><span>Total Paid</span><span>${e(peso(Number(amount)))}</span></div></div>
    <div class="footer"><p>Thank you for your business! &middot; Bloom &amp; Borrow Rental System</p></div>
  </div></body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 300);
}

// ---- shared client-side list sorting ----
function compareValues(a, b) {
  if (typeof a === "number" && typeof b === "number") {
    return (Number.isFinite(a) ? a : 0) - (Number.isFinite(b) ? b : 0);
  }
  return String(a ?? "").localeCompare(String(b ?? ""), undefined, { numeric: true, sensitivity: "base" });
}

function useSort(defaultKey, defaultDir = "asc") {
  const [sortKey, setSortKey] = useState(defaultKey);
  const [sortDir, setSortDir] = useState(defaultDir);
  const setSort = (key) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === defaultKey ? defaultDir : "asc"); }
  };
  return { sortKey, sortDir, setSort };
}

function sortRows(rows, sorts, sortKey, sortDir) {
  const accessor = sorts[sortKey] && sorts[sortKey].get;
  if (!accessor) return rows;
  const out = [...rows].sort((a, b) => compareValues(accessor(a), accessor(b)));
  return sortDir === "asc" ? out : out.reverse();
}

function SortControls({ sorts, sortKey, sortDir, setSort }) {
  const keys = Object.keys(sorts);
  if (!keys.length) return null;
  return (
    <div className="sort-controls">
      <span className="sort-controls-label">Sort</span>
      <select className="booking-status-select" value={sortKey} onChange={(e) => setSort(e.target.value)}>
        {keys.map((k) => <option key={k} value={k}>{sorts[k].label}</option>)}
      </select>
      <button type="button" className="sort-dir-btn" onClick={() => setSort(sortKey)}
        aria-label={`Sorted ${sortDir === "asc" ? "ascending" : "descending"} — toggle direction`}
        title={sortDir === "asc" ? "Ascending" : "Descending"}>
        {sortDir === "asc" ? "↑" : "↓"}
      </button>
    </div>
  );
}

// Per-module Cards/Table preference, remembered across sessions.
function useViewMode(storageKey, initial = "cards") {
  const [view, setView] = useState(() => {
    try { return localStorage.getItem(storageKey) || initial; } catch { return initial; }
  });
  const set = (v) => {
    setView(v);
    try { localStorage.setItem(storageKey, v); } catch {}
  };
  return [view, set];
}

function ViewToggle({ view, onChange }) {
  return (
    <div className="view-toggle" role="group" aria-label="View mode">
      <button type="button" className={view === "cards" ? "active" : ""} aria-pressed={view === "cards"}
        onClick={() => onChange("cards")} title="Card view" aria-label="Card view">▦</button>
      <button type="button" className={view === "table" ? "active" : ""} aria-pressed={view === "table"}
        onClick={() => onChange("table")} title="Table view" aria-label="Table view">☰</button>
    </div>
  );
}

function Logo({ light = false }) {
  return (
    <Link className={`logo ${light ? "logo-light" : ""}`} to="/">
      <img src={logoImg} alt="Bloom & Borrow" className="logo-img" />
      <span>Bloom<span>&amp;Borrow</span></span>
    </Link>
  );
}

function Icon({ children }) {
  return <span className="nav-icon">{children}</span>;
}

function CustomerHeader({ cartCount = 0 }) {
  return (
    <header className="customer-header">
      <div className="container customer-nav">
        <Logo />
        <nav className="top-links">
          <NavLink to="/">Home</NavLink>
          <NavLink to="/rentals">Browse Rentals</NavLink>
          <NavLink to="/track">Track Booking</NavLink>
        </nav>
        <div className="header-actions">
          <Link className="icon-button" to="/cart" aria-label="Rental cart">🛒<span>{cartCount}</span></Link>
          <Link className="outline-button" to="/track">Track Booking</Link>
        </div>
      </div>
    </header>
  );
}

function ProductCard({ item, onAdd }) {
  return (
    <article className="product-card">
      <Link to={`/rentals/${item.id}`} className="product-image-wrap">
        <img className="product-image" src={item.image} alt={item.name} />
        <span className="product-category">{item.category}</span>
        {item.isNew && <span className="new-badge">New</span>}
      </Link>
      <div className="product-body">
        <div>
          <h3><Link to={`/rentals/${item.id}`}>{item.name}</Link></h3>
          <p className="muted">{item.stock>0?`${item.stock} in stock`:"Out of stock"}</p>
        </div>
        <div className="product-price-row">
          <div><strong>{peso(item.price)}</strong><span>/day</span></div>
          <button className="mini-button" onClick={() => onAdd(item)}>+ Add</button>
        </div>
      </div>
    </article>
  );
}

function Home({ onAdd }) {
  const featured = items.slice(0, 4);
  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <span className="eyebrow">Simple rentals. Zero hassle.</span>
            <h1>Rent what you need, <span>when you need it.</span></h1>
            <p>Browse quality equipment, book in minutes, and choose delivery or pickup — no account required.</p>
            <div className="hero-actions">
              <Link className="primary-button" to="/rentals">Browse rentals →</Link>
              <Link className="ghost-button" to="/track">Track booking</Link>
            </div>
            <div className="trust-row">
              <span>✓ No login required</span><span>✓ Flexible dates</span><span>✓ Secure booking</span>
            </div>
          </div>
          <div className="hero-panel">
            <div className="floating-card card-one">
              <span>Popular today</span><strong>Canon EOS R50</strong><small>from ₱1,200/day</small>
            </div>
            <div className="hero-photo">
              <img src={items[0].image} alt="Featured rental camera" />
            </div>
            <div className="floating-card card-two">
              <span className="availability-dot" /> Available now
            </div>
          </div>
        </div>
      </section>

      <section className="section container">
        <div className="section-heading">
          <div><span className="eyebrow">Browse by category</span><h2>Everything you need in one place</h2></div>
        </div>
        <div className="category-grid">
          {[
            ["📷","Camera","Capture every moment"],
            ["🔊","Audio","Make events louder"],
            ["🎉","Events","Party essentials"],
            ["⛺","Outdoor","Adventure-ready gear"],
            ["🛠️","Tools","Get the job done"]
          ].map(([icon,title,text]) => (
            <Link to={`/rentals?category=${title}`} className="category-card" key={title}>
              <span className="category-icon">{icon}</span><strong>{title}</strong><small>{text}</small>
            </Link>
          ))}
        </div>
      </section>

      <section className="section soft-section">
        <div className="container">
          <div className="section-heading">
            <div><span className="eyebrow">Featured rentals</span><h2>Most rented this week</h2></div>
            <Link to="/rentals" className="text-link">View all rentals →</Link>
          </div>
          <div className="product-grid">{featured.map(item => <ProductCard key={item.id} item={item} onAdd={onAdd} />)}</div>
        </div>
      </section>

      <section className="section container">
        <div className="section-heading centered"><div><span className="eyebrow">How it works</span><h2>Rent in four simple steps</h2></div></div>
        <div className="steps">
          {[
            ["01","Browse","Find the item you need and choose your dates."],
            ["02","Book","Add your details and confirm the rental."],
            ["03","Receive","Choose pickup or convenient delivery."],
            ["04","Return","Return on time and get your deposit settled."]
          ].map(([n,t,d]) => <div className="step-card" key={n}><span>{n}</span><h3>{t}</h3><p>{d}</p></div>)}
        </div>
      </section>

      <section className="section container">
        <div className="promo-card">
          <div><span className="eyebrow light">Weekend special</span><h2>Rent 3 days, pay for only 2.</h2><p>Selected equipment only. Subject to availability.</p></div>
          <Link className="light-button" to="/rentals">See eligible rentals</Link>
        </div>
      </section>

      <section className="section container">
        <div className="section-heading centered"><div><span className="eyebrow">Customer stories</span><h2>Loved by renters</h2></div></div>
        <div className="testimonial-grid">
          {[
            ["“Super smooth booking and the camera arrived exactly on time.”","Andrea P."],
            ["“No account needed. I booked speakers for our event in just a few minutes.”","Carlo R."],
            ["“Clear pricing, fast support, and the equipment was in great condition.”","Mika S."]
          ].map(([quote,name]) => <article className="testimonial" key={name}><div className="stars">★★★★★</div><p>{quote}</p><strong>{name}</strong></article>)}
        </div>
      </section>
    </>
  );
}

function Browse({ onAdd }) {
  const [catalog,setCatalog] = useState([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState("popular");

  React.useEffect(()=>{
    api("/rentals").then(data=>{
      if(data.items?.length) setCatalog(data.items.map((x,i)=>({
        id:x.id,name:x.name,category:x.category,price:Number(x.daily_price),deposit:Number(x.security_deposit),
        stock:Math.max(0,Number(x.total_quantity)-Number(x.reserved||0)),popularity:100-i,isNew:false,image:x.image_url || items[i%items.length].image,
        description:x.description || "",addOns:[]
      })));
    }).catch(()=>setCatalog([]));
  },[]);

  const filtered = useMemo(() => {
    let result = catalog.filter(i => (category === "All" || i.category === category) && i.name.toLowerCase().includes(search.toLowerCase()));
    result = [...result].sort((a,b) => {
      if (sort === "low") return a.price - b.price;
      if (sort === "high") return b.price - a.price;
      if (sort === "new") return Number(b.isNew) - Number(a.isNew);
      return b.popularity - a.popularity;
    });
    return result;
  }, [catalog,search, category, sort]);

  return (
    <main className="page container">
      <div className="page-title-row"><div><span className="eyebrow">Rental catalog</span><h1>Browse rentals</h1><p>Live inventory from the Bloom&Borrow database.</p></div></div>
      <div className="catalog-layout">
        <div className="category-tabs">
          <button className={`tab${category==="All"?" active":""}`} onClick={()=>setCategory("All")}>All</button>
          {[...new Set(catalog.map(i=>i.category))].map(c=><button key={c} className={`tab${category===c?" active":""}`} onClick={()=>setCategory(c)}>{c}</button>)}
        </div>
        <section className="catalog-results">
          <div className="results-toolbar"><span><strong>{filtered.length}</strong> items found</span><select value={sort} onChange={e=>setSort(e.target.value)}><option value="popular">Most popular</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option><option value="new">Newest</option></select></div>
          <div className="product-grid">{filtered.map(item=><ProductCard key={item.id} item={item} onAdd={onAdd}/>)}</div>
        </section>
      </div>
    </main>
  );
}

function ProductDetails({ onAdd }) {
  const { id } = useParams();
  const fallback = items.find(i => i.id === Number(id)) || items[0];
  const [item,setItem] = useState(fallback);
  const [quantity,setQuantity] = useState(1);
  const [days, setDays] = useState(2);
  const [selectedImage, setSelectedImage] = useState(0);

  React.useEffect(()=>{
    api("/rentals").then(data=>{
      const x=(data.items||[]).find(r=>Number(r.id)===Number(id));
      if(x) setItem({id:x.id,name:x.name,category:x.category,price:Number(x.daily_price),deposit:Number(x.security_deposit),stock:Math.max(0,Number(x.total_quantity)-Number(x.reserved||0)),image:x.image_url||fallback.image,images:x.images||[],description:x.description||"",addOns:[],features:x.features||[]});
    }).catch(()=>{});
  },[id]);

  const inStock = item.stock > 0;
  const images = item.images?.length ? item.images : [item.image, item.image, item.image];

  return <main className="page container"><Link to="/rentals" className="text-link">← Back to rentals</Link><div className="detail-grid">
    <section className="gallery-card">
      <div className="main-image"><img src={images[selectedImage]} alt={item.name}/></div>
      <div className="thumbnail-row">{images.slice(0,3).map((img,i)=><div key={i} className={`thumb${selectedImage===i?" active":""}`} onClick={()=>setSelectedImage(i)}><img src={img} alt=""/></div>)}</div>
    </section>
    <section className="detail-panel">
      <span className="product-category inline">{item.category}</span>
      <h1>{item.name}</h1>
      <p className="detail-description">{item.description}</p>
      <div className="detail-price"><strong>{peso(item.price)}</strong><span>per day</span></div>
      <div className={`stock-badge ${inStock?"in-stock":"out-of-stock"}`}>{inStock?`${item.stock} unit(s) available`:"Out of stock"}</div>
      {item.features?.length>0 && <ul className="feature-list">{item.features.map((f,i)=><li key={i}>{f}</li>)}</ul>}
      <div className="quantity-selector">
        <label>Quantity</label>
        <div className="qty-controls">
          <button onClick={()=>setQuantity(Math.max(1,quantity-1))}>−</button>
          <span>{quantity}</span>
          <button onClick={()=>setQuantity(Math.min(item.stock,quantity+1))}>+</button>
        </div>
      </div>
      <div className="price-breakdown"><span>Rental ({days} day{days>1?"s":""}) <b>{peso(item.price*days*quantity)}</b></span><span>Security deposit <b>{peso(item.deposit*quantity)}</b></span><span className="grand-total">Estimated total <b>{peso(item.price*days*quantity+item.deposit*quantity)}</b></span></div>
      <button className="primary-button full" disabled={!inStock} onClick={()=>onAdd(item)}>Add to rental cart</button>
      <details><summary>Rental terms & conditions</summary><p>Valid ID may be required. Items must be returned on or before the agreed date and in the same condition.</p></details>
    </section></div></main>;
}

function Cart({ cart, updateQty, removeItem }) {
  const navigate = useNavigate();
  const rentalSubtotal = cart.reduce((s,x)=>s+x.price*x.qty*2,0);
  const deposit = cart.reduce((s,x)=>s+x.deposit*x.qty,0);
  const totalItems = cart.reduce((s,x)=>s+x.qty,0);
  return (
    <main className="page container narrow-page">
      <div className="page-title-row"><div><span className="eyebrow">Booking</span><h1>Your rental cart</h1><p>Review your selected items and rental dates.</p></div></div>
      {cart.length === 0 ? <div className="empty-state"><div>🛒</div><h2>Your cart is empty</h2><p>Add an item from our rental catalog to start a booking.</p><Link className="primary-button" to="/rentals">Browse rentals</Link></div> :
      <div className="checkout-layout">
        <section className="cart-list">
          <div className="cart-header">
            <h2>Cart Items</h2>
            <span className="cart-count">{totalItems} item{totalItems>1?"s":""}</span>
          </div>
          {cart.map(x=><article className="cart-item-card" key={x.id}>
            <div className="cart-item-image"><img src={x.image} alt={x.name}/></div>
            <div className="cart-item-details">
              <div className="cart-item-header">
                <span className="product-category">{x.category}</span>
                <h3>{x.name}</h3>
              </div>
              <div className="cart-item-pricing">
                <span className="price-per-day">{peso(x.price)}/day</span>
                <span className="rental-days">2 days</span>
              </div>
              <div className="cart-item-actions">
                <div className="qty-controls">
                  <button onClick={()=>updateQty(x.id,-1)}>−</button>
                  <span>{x.qty}</span>
                  <button onClick={()=>updateQty(x.id,1)} disabled={x.qty >= (x.stock||Infinity)}>+</button>
                </div>
                <span className="stock-hint">Available: {x.stock ?? "—"}</span>
                <button className="remove-button" onClick={()=>removeItem(x.id)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                  Remove
                </button>
              </div>
            </div>
            <div className="cart-item-total"><strong>{peso(x.price*x.qty*2)}</strong></div>
          </article>)}
        </section>
        <aside className="summary-card">
          <div className="summary-header">
            <h3>Booking summary</h3>
          </div>
          <div className="summary-body">
            <div className="summary-line">
              <span>Rental subtotal</span>
              <strong>{peso(rentalSubtotal)}</strong>
            </div>
            <div className="summary-line">
              <span>Security deposit</span>
              <strong>{peso(deposit)}</strong>
            </div>
            <div className="summary-line">
              <span>Delivery</span>
              <strong>Calculated next</strong>
            </div>
          </div>
          <div className="summary-total">
            <span>Total</span>
            <strong>{peso(rentalSubtotal+deposit)}</strong>
          </div>
          <button className="primary-button full" onClick={()=>navigate("/checkout")}>
            Guest checkout
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
          <Link to="/rentals" className="secondary-button full">Continue browsing</Link>
        </aside>
      </div>}
    </main>
  )
}

function Checkout({ cart, clearCart }) {
  const [done,setDone] = useState(null);
  const [error,setError] = useState("");
  const [submitting,setSubmitting] = useState(false);
  const [startDate,setStartDate] = useState("");
  const [endDate,setEndDate] = useState("");
  const [form,setForm] = useState({
    full_name:"",phone:"",email:"",
    address:"",city:"",province:"",postal_code:"",notes:"",
    fulfillment:"delivery",payment_method:"cash"
  });
  const [touched,setTouched] = useState({});

  const days = startDate && endDate ? Math.max(1,Math.floor((new Date(endDate+"T00:00:00")-new Date(startDate+"T00:00:00"))/86400000)+1) : 1;
  const rentalSubtotal = cart.reduce((s,x)=>s+x.price*x.qty*days,0);
  const deposit = cart.reduce((s,x)=>s+x.deposit*x.qty,0);
  const deliveryFee = form.fulfillment === "delivery" ? 300 : 0;
  const total = rentalSubtotal + deposit + deliveryFee;

  const validate = (field,value) => {
    if(field === "email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Please enter a valid email address";
    if(field === "phone" && value && !/^[\d\s\+\-\(\)]{10,}$/.test(value)) return "Please enter a valid phone number";
    if(field === "postal_code" && value && !/^\d{4}$/.test(value)) return "Postal code must be 4 digits";
    return "";
  };

  const handleBlur = (field) => {
    setTouched({...touched,[field]:true});
  };

  const getFieldError = (field) => {
    if(!touched[field]) return "";
    return validate(field,form[field]);
  };

  const isFormValid = () => {
    if(!form.full_name||!form.phone||!form.email||!form.city) return false;
    if(!startDate||!endDate) return false;
    if(form.fulfillment==="delivery"&&!form.address) return false;
    if(validate("email",form.email)||validate("phone",form.phone)) return false;
    return true;
  };

  const submit = async (e) => {
    e.preventDefault();
    if(!cart.length) { setError("Your rental cart is empty."); return; }
    setError(""); setSubmitting(true);
    try {
      const payload = {...form,start_date:startDate,end_date:endDate,items:cart.map(x=>({item_id:x.id,quantity:x.qty}))};
      const precheck = await api("/availability/check",{method:"POST",body:JSON.stringify(payload)});
      if(!precheck.available) {
        const failed = precheck.items.find(x=>!x.available);
        throw new Error(`${failed?.item_name || "An item"} is not available in the requested quantity for those dates.`);
      }
      const data = await api("/bookings/guest",{method:"POST",body:JSON.stringify(payload)});
      setDone(data.booking); clearCart();
    } catch(err) { setError(err.message); }
    finally { setSubmitting(false); }
  };

  if(done) return <Track booking={done}/>;

  return (
    <main className="page container">
      <div className="page-title-row">
        <div>
          <span className="eyebrow">No account required</span>
          <h1>Guest checkout</h1>
          <p>Complete your booking in just a few steps.</p>
        </div>
      </div>

      <div className="checkout-layout">
        <form className="checkout-form" onSubmit={submit}>
          {error && <div className="checkout-error"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>{error}</div>}

          <div className="checkout-section">
            <div className="section-header">
              <span className="section-number">1</span>
              <div>
                <h2>Rental Dates</h2>
                <p className="section-subtitle">Select your rental period</p>
              </div>
            </div>
            <div className="date-grid">
              <div className="form-group">
                <label htmlFor="startDate">Rental start <span className="required">*</span></label>
                <input id="startDate" required type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/>
              </div>
              <div className="form-group">
                <label htmlFor="endDate">Rental end <span className="required">*</span></label>
                <input id="endDate" required type="date" min={startDate||undefined} value={endDate} onChange={e=>setEndDate(e.target.value)}/>
              </div>
            </div>
          </div>

          <div className="checkout-section">
            <div className="section-header">
              <span className="section-number">2</span>
              <div>
                <h2>Customer Information</h2>
                <p className="section-subtitle">Tell us who you are</p>
              </div>
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="fullName">Full name <span className="required">*</span></label>
                <input id="fullName" required value={form.full_name} onChange={e=>setForm({...form,full_name:e.target.value})} onBlur={()=>handleBlur("full_name")} placeholder="Juan Dela Cruz"/>
                {getFieldError("full_name") && <span className="field-error">{getFieldError("full_name")}</span>}
              </div>
              <div className="form-group">
                <label htmlFor="phone">Contact number <span className="required">*</span></label>
                <input id="phone" required type="tel" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} onBlur={()=>handleBlur("phone")} placeholder="+63 9XX XXX XXXX"/>
                {getFieldError("phone") && <span className="field-error">{getFieldError("phone")}</span>}
              </div>
              <div className="form-group span-2">
                <label htmlFor="email">Email address <span className="required">*</span></label>
                <input id="email" required type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} onBlur={()=>handleBlur("email")} placeholder="you@example.com"/>
                {getFieldError("email") && <span className="field-error">{getFieldError("email")}</span>}
              </div>
            </div>
          </div>

          <div className="checkout-section">
            <div className="section-header">
              <span className="section-number">3</span>
              <div>
                <h2>Delivery Information</h2>
                <p className="section-subtitle">Where should we deliver?</p>
              </div>
            </div>
            <div className="form-grid">
              <div className="form-group span-2">
                <label htmlFor="address">Complete address <span className="required">*</span></label>
                <input id="address" required={form.fulfillment==="delivery"} value={form.address} onChange={e=>setForm({...form,address:e.target.value})} placeholder="House no., street, barangay"/>
              </div>
              <div className="form-group">
                <label htmlFor="city">City / Municipality <span className="required">*</span></label>
                <input id="city" required value={form.city} onChange={e=>setForm({...form,city:e.target.value})} placeholder="Quezon City"/>
              </div>
              <div className="form-group">
                <label htmlFor="province">Province</label>
                <input id="province" value={form.province} onChange={e=>setForm({...form,province:e.target.value})} placeholder="Metro Manila"/>
              </div>
              <div className="form-group">
                <label htmlFor="postalCode">Postal code</label>
                <input id="postalCode" value={form.postal_code} onChange={e=>setForm({...form,postal_code:e.target.value})} onBlur={()=>handleBlur("postal_code")} placeholder="1100"/>
                {getFieldError("postal_code") && <span className="field-error">{getFieldError("postal_code")}</span>}
              </div>
              <div className="form-group">
                <label htmlFor="notes">Additional notes</label>
                <textarea id="notes" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Landmark, gate code, etc." rows="2"/>
              </div>
            </div>
          </div>

          <div className="checkout-section">
            <div className="section-header">
              <span className="section-number">4</span>
              <div>
                <h2>Fulfillment Method</h2>
                <p className="section-subtitle">How would you like to receive your items?</p>
              </div>
            </div>
            <div className="fulfillment-grid">
              <label className={`fulfillment-card ${form.fulfillment==="delivery"?"selected":""}`}>
                <input type="radio" name="fulfillment" checked={form.fulfillment==="delivery"} onChange={()=>setForm({...form,fulfillment:"delivery"})}/>
                <div className="fulfillment-icon">🚚</div>
                <div className="fulfillment-info">
                  <strong>Delivery</strong>
                  <span>Delivered to your doorstep</span>
                  <span className="fulfillment-price">₱300 fee</span>
                </div>
                <div className="fulfillment-check">✓</div>
              </label>
              <label className={`fulfillment-card ${form.fulfillment==="pickup"?"selected":""}`}>
                <input type="radio" name="fulfillment" checked={form.fulfillment==="pickup"} onChange={()=>setForm({...form,fulfillment:"pickup"})}/>
                <div className="fulfillment-icon">📦</div>
                <div className="fulfillment-info">
                  <strong>Pickup</strong>
                  <span>Collect at our rental hub</span>
                  <span className="fulfillment-price">Free</span>
                </div>
                <div className="fulfillment-check">✓</div>
              </label>
            </div>
          </div>

          <div className="checkout-section">
            <div className="section-header">
              <span className="section-number">5</span>
              <div>
                <h2>Payment Method</h2>
                <p className="section-subtitle">How would you like to pay?</p>
              </div>
            </div>
            <div className="payment-grid">
              <label className={`payment-card ${form.payment_method==="cash"?"selected":""}`}>
                <input type="radio" name="payment" checked={form.payment_method==="cash"} onChange={()=>setForm({...form,payment_method:"cash"})}/>
                <div className="payment-icon">💵</div>
                <div className="payment-info">
                  <strong>Cash</strong>
                  <span>Pay on pickup or delivery</span>
                </div>
                <div className="payment-check">✓</div>
              </label>
              <label className={`payment-card ${form.payment_method==="gcash"?"selected":""}`}>
                <input type="radio" name="payment" checked={form.payment_method==="gcash"} onChange={()=>setForm({...form,payment_method:"gcash"})}/>
                <div className="payment-icon">📱</div>
                <div className="payment-info">
                  <strong>GCash</strong>
                  <span>Scan QR code to pay</span>
                </div>
                <div className="payment-check">✓</div>
              </label>
            </div>

            {form.payment_method === "gcash" && (
              <div className="gcash-panel">
                <div className="gcash-instructions">
                  <h4>GCash Payment Instructions</h4>
                  <ol>
                    <li>Open your GCash app</li>
                    <li>Tap <strong>Scan QR</strong> in the app</li>
                    <li>Scan the QR code shown beside</li>
                    <li>Enter the exact amount shown in your total</li>
                    <li>Confirm and complete the payment</li>
                  </ol>
                  <div className="gcash-note">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                    Your payment will be recorded and verified by our team. You will receive confirmation once payment is verified.
                  </div>
                </div>
                <div className="gcash-qr">
                  <div className="qr-placeholder">
                    <svg width="180" height="180" viewBox="0 0 180 180" fill="none">
                      <rect width="180" height="180" fill="#fff"/>
                      <rect x="10" y="10" width="50" height="50" rx="4" fill="#000"/>
                      <rect x="120" y="10" width="50" height="50" rx="4" fill="#000"/>
                      <rect x="10" y="120" width="50" height="50" rx="4" fill="#000"/>
                      <rect x="15" y="15" width="10" height="10" fill="#fff"/>
                      <rect x="35" y="15" width="10" height="10" fill="#fff"/>
                      <rect x="15" y="35" width="10" height="10" fill="#fff"/>
                      <rect x="35" y="35" width="20" height="20" fill="#fff"/>
                      <rect x="45" y="15" width="10" height="10" fill="#000"/>
                      <rect x="15" y="45" width="10" height="10" fill="#000"/>
                      <rect x="125" y="15" width="10" height="10" fill="#fff"/>
                      <rect x="145" y="15" width="10" height="10" fill="#fff"/>
                      <rect x="125" y="35" width="10" height="10" fill="#fff"/>
                      <rect x="145" y="35" width="20" height="20" fill="#fff"/>
                      <rect x="155" y="15" width="10" height="10" fill="#000"/>
                      <rect x="125" y="45" width="10" height="10" fill="#000"/>
                      <rect x="15" y="125" width="10" height="10" fill="#fff"/>
                      <rect x="35" y="125" width="10" height="10" fill="#fff"/>
                      <rect x="15" y="145" width="10" height="10" fill="#fff"/>
                      <rect x="35" y="145" width="20" height="20" fill="#fff"/>
                      <rect x="45" y="125" width="10" height="10" fill="#000"/>
                      <rect x="15" y="155" width="10" height="10" fill="#000"/>
                      <rect x="70" y="70" width="40" height="40" rx="4" fill="#000"/>
                      <rect x="80" y="80" width="20" height="20" fill="#fff"/>
                    </svg>
                  </div>
                  <p className="qr-label">Scan to Pay with GCash</p>
                </div>
              </div>
            )}
          </div>

          <div className="checkout-section">
            <label className="agree-checkbox">
              <input type="checkbox" required/>
              <span className="checkmark"></span>
              <span>I agree to the <a href="#" onClick={e=>e.preventDefault()}>rental terms</a> and <a href="#" onClick={e=>e.preventDefault()}>cancellation policy</a>.</span>
            </label>
          </div>

          <button className="checkout-submit" type="submit" disabled={submitting||!isFormValid()}>
            {submitting ? (
              <span className="loading-state"><span className="spinner"></span>Processing...</span>
            ) : (
              <>
                Place Booking
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </>
            )}
          </button>
        </form>

        <aside className="order-summary">
          <div className="summary-header">
            <h3>Order Summary</h3>
            <span className="item-count">{cart.reduce((s,x)=>s+x.qty,0)} item{cart.reduce((s,x)=>s+x.qty,0)>1?"s":""}</span>
          </div>

          <div className="summary-items">
            {cart.map(x=>(
              <div className="summary-item" key={x.id}>
                <img src={x.image} alt={x.name}/>
                <div className="summary-item-info">
                  <h4>{x.name}</h4>
                  <span className="summary-item-meta">{peso(x.price)}/day × {days} days × {x.qty}</span>
                </div>
                <strong>{peso(x.price*days*x.qty)}</strong>
              </div>
            ))}
          </div>

          <div className="summary-details">
            <div className="summary-line">
              <span>Rental subtotal</span>
              <strong>{peso(rentalSubtotal)}</strong>
            </div>
            <div className="summary-line">
              <span>Security deposit</span>
              <strong>{peso(deposit)}</strong>
            </div>
            <div className="summary-line">
              <span>Delivery fee</span>
              <strong>{deliveryFee > 0 ? peso(deliveryFee) : "Free"}</strong>
            </div>
          </div>

          <div className="summary-total">
            <span>Grand Total</span>
            <strong>{peso(total)}</strong>
          </div>

          <div className="summary-note">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            Final prices are verified by the backend before booking confirmation.
          </div>
        </aside>
      </div>
    </main>
  )
}

function Track({ booking: bookingProp }) {
  return <main className="page container narrow-page"><div className="track-card">
    <div className="greeting-card">
      <div className="greeting-header">
        <span className="greeting-icon">🎉</span>
        <h1>Thank You for Choosing Our Business Rental!</h1>
        <p>We're happy to have you! Your booking request has been successfully submitted.</p>
      </div>

      {bookingProp&&<div className="greeting-booking-summary">
        <div className="greeting-booking-row"><span>Booking number</span><strong>{bookingProp.booking_no}</strong></div>
        <div className="greeting-booking-row"><span>Rental dates</span><strong>{String(bookingProp.start_date).slice(0,10)} → {String(bookingProp.end_date).slice(0,10)}</strong></div>
        <div className="greeting-booking-row"><span>Total amount</span><strong>{peso(Number(bookingProp.grand_total))}</strong></div>
        <div className="greeting-booking-row"><span>Payment method</span><strong className="capitalize">{bookingProp.payment_method||"Cash"}</strong></div>
      </div>}

      <div className="greeting-status">
        <h2>Booking Status</h2>
        <div className="greeting-status-badge">
          <span className="status-pending-icon">⏳</span>
          <div>
            <strong>Waiting for Admin Approval</strong>
            <p>Your booking is currently being reviewed by our Admin. Please wait for an official confirmation through Gmail or SMS.</p>
          </div>
        </div>
        <div className="greeting-warning">
          <strong>Important:</strong> Your booking is not yet fully confirmed until you receive an approval message from our Admin.
        </div>
      </div>

      {bookingProp?.payment_method==="gcash"&&<div className="greeting-section">
        <h2>💳 If You Paid via GCash</h2>
        <p>If you selected GCash as your payment method, please:</p>
        <ol>
          <li>Wait for the Admin's message with payment instructions.</li>
          <li>Send your GCash Proof of Payment as instructed by the Admin.</li>
          <li>Make sure your proof of payment is clear and shows the transaction details.</li>
          <li>Wait for the Admin to verify your payment and confirm your booking.</li>
        </ol>
      </div>}

      <div className="greeting-section">
        <h2>📩 What Happens Next?</h2>
        <p>Once your booking and payment have been verified, you will receive an official Booking Confirmation through Gmail or SMS.</p>
      </div>

      <div className="greeting-footer">
        <p>Thank you for your patience and for choosing our Business Rental! We look forward to serving you.</p>
        <Link to="/rentals" className="primary-button">Browse More Rentals</Link>
      </div>
    </div>
  </div></main>;
}

// Customer self-service is guest booking + the Track page; there is no customer
// account/login. This route only redirects old /account links to /track.
function Account() {
  return <Navigate to="/track" replace />;
}

function CustomerSite({ cart, onAdd, updateQty, removeItem, clearCart }) {
  return <>
    <CustomerHeader cartCount={cart.reduce((s,x)=>s+x.qty,0)}/>
    <Routes>
      <Route path="/" element={<Home onAdd={onAdd}/>}/>
      <Route path="/rentals" element={<Browse onAdd={onAdd}/>}/>
      <Route path="/rentals/:id" element={<ProductDetails onAdd={onAdd}/>}/>
      <Route path="/cart" element={<Cart cart={cart} updateQty={updateQty} removeItem={removeItem}/>}/>
      <Route path="/checkout" element={<Checkout cart={cart} clearCart={clearCart}/>}/>
      <Route path="/track" element={<Track/>}/>
      <Route path="/account" element={<Account/>}/>
    </Routes>
    <footer><div className="container footer-grid"><Logo light/><p>Easy rentals for everyday needs, events, projects, and adventures.</p><div><strong>Quick links</strong><Link to="/rentals">Browse Rentals</Link><Link to="/track">Track Booking</Link></div><div><strong>Contact</strong><span>hello@bloom_borrow.test</span><span>+63 917 000 0000</span></div></div></footer>
  </>
}



function useAuthSnapshot() {
  return { token: getToken(), user: getStoredUser() };
}

// Where a signed-in staff user should land: an intended deep link if it points
// into the admin area, otherwise the dashboard.
function staffDestination(search) {
  const wanted = new URLSearchParams(search).get("redirect");
  return wanted && wanted.startsWith("/admin") ? wanted : "/admin";
}

function AccessLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (getToken() && getStoredUser()) {
    return <Navigate to={staffDestination(location.search)} replace />;
  }

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      saveAuth(data.token, data.user);
      navigate(staffDestination(location.search), { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="admin-login-page">
      <section className="admin-login-visual">
        <div>
          <Logo light />
          <span className="eyebrow light">Bloom & Borrow</span>
          <h1>Rental Business Management System</h1>
          <p>A complete platform for managing equipment rentals, bookings, inventory, and customer transactions — all in one place.</p>
          <div className="login-feature-grid">
            <span>✓ Real-time inventory tracking</span>
            <span>✓ Automated booking management</span>
            <span>✓ Customer & payment records</span>
            <span>✓ Revenue reports & analytics</span>
          </div>
        </div>
      </section>

      <section className="admin-login-panel">
        <form className="admin-login-card" onSubmit={submit}>
          <div className="mobile-login-logo"><Logo /></div>
          <span className="eyebrow">Staff access</span>
          <h2>Sign in</h2>
          <p>Use your assigned Admin account.</p>

          {error && <div className="login-error">{error}</div>}

          <label>Email address
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required />
          </label>
          <label>Password
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} required />
          </label>

          <button className="primary-button full" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}

function ProtectedRoute({ children, roles }) {
  const location = useLocation();
  const token = getToken();
  const user = getStoredUser();
  if (!token || !user) {
    // Remember where they were headed so login can send them straight back.
    return <Navigate to={`/access/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }
  if (roles && !roles.includes(user.role)) {
    // Signed in but wrong role: back to sign-in (not /admin, which would loop).
    return <Navigate to="/access/login" replace />;
  }
  return children;
}

function SignOutButton({ className = "" }) {
  const navigate = useNavigate();
  const logout = async () => {
    try { await api("/auth/logout", { method: "POST" }); } catch {}
    clearAuth();
    navigate("/access/login");
  };
  return <button className={className} onClick={logout}>Sign out</button>;
}

const adminNav = [
  ["◫","Dashboard","/admin"],
  ["▦","Inventory","/admin/inventory"],
  ["▣","Bookings","/admin/bookings"],
  ["♟","Customers","/admin/customers"],
  ["₱","Payments","/admin/payments"],
  ["⚠","Incidents","/admin/incidents"],
  ["▥","Reports","/admin/reports"],
  ["🔧","Maintenance","/admin/maintenance"],
  ["♟","Access","/admin/access"],
  ["⚙","Settings","/admin/settings"]
];

function AdminSidebar({ collapsed = false, onToggle }) {
  const user = getStoredUser() || {};
  const initials = (user.full_name || "Admin User").split(" ").map(x=>x[0]).join("").slice(0,2).toUpperCase();
  return <aside className={`admin-sidebar ${collapsed ? "collapsed" : ""}`}>
    <button type="button" className="admin-brand-toggle" onClick={onToggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
      <img src={logoImg} alt="Bloom & Borrow" className="logo-img" />
      <span className="admin-brand-text">Bloom<span>&amp;Borrow</span></span>
    </button>
    <nav>{adminNav.map(([icon,label,path])=><NavLink end={path==="/admin"} to={path} key={label} aria-label={label} data-tooltip={label}><span className="nav-label">{label}</span></NavLink>)}</nav>
    <div className="sidebar-bottom"><div className="admin-mini" aria-label={`${user.full_name || "Admin User"} profile`} data-tooltip={user.full_name || "Admin User"}><div className="avatar">{initials}</div><div className="admin-mini-copy"><strong>{user.full_name || "Admin User"}</strong><small>{user.role || "admin"}</small></div></div></div>
  </aside>
}

function AdminProfileMenu() {
  const navigate = useNavigate();
  const user = getStoredUser() || {};
  const [open,setOpen] = useState(false);
  const [signingOut,setSigningOut] = useState(false);
  const menuRef = useRef(null);
  const initials = (user.full_name || "Admin User").split(" ").filter(Boolean).map(x=>x[0]).join("").slice(0,2).toUpperCase() || "AD";

  useEffect(()=>{
    const onPointerDown = e => { if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false); };
    const onKeyDown = e => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown",onPointerDown);
    document.addEventListener("keydown",onKeyDown);
    return ()=>{ document.removeEventListener("pointerdown",onPointerDown); document.removeEventListener("keydown",onKeyDown); };
  },[]);

  const logout = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try { await api("/auth/logout", { method:"POST" }); } catch {}
    finally {
      clearAuth();
      setOpen(false);
      navigate("/access/login",{replace:true});
    }
  };

  return <div className="admin-profile-menu" ref={menuRef}>
    <button type="button" className="admin-profile-trigger" aria-haspopup="menu" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>
      <div className="avatar">{initials}</div>
      <div className="admin-profile-copy"><strong>{user.full_name || "Admin User"}</strong><small>{user.role || "admin"}</small></div>
      <span className={`profile-chevron ${open?"open":""}`}>⌄</span>
    </button>
    {open && <div className="admin-profile-dropdown" role="menu">
      <button type="button" role="menuitem" onClick={()=>{setOpen(false);navigate("/admin/account-settings")}}>
        <span>⚙</span><div><strong>Account Settings</strong><small>Profile and password</small></div>
      </button>
      <div className="profile-menu-divider"/>
      <button type="button" role="menuitem" className="profile-signout" disabled={signingOut} onClick={logout}>
        <span>↪</span><div><strong>{signingOut?"Signing out…":"Sign Out"}</strong><small>End this session</small></div>
      </button>
    </div>}
  </div>;
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const menuRef = useRef(null);

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const [bookingsData, inventoryData, escalationsData] = await Promise.all([
        api("/admin/bookings").catch(()=>({bookings:[]})),
        api("/admin/inventory").catch(()=>({items:[]})),
        api("/admin/escalations").catch(()=>({escalated:[]}))
      ]);
      const bookings = (bookingsData.bookings || []).slice(0, 10);
      const notifs = bookings.map(b => ({
        id: `b-${b.id}`,
        type: b.status === "pending" ? "booking_new" : b.status === "overdue" ? "booking_overdue" : "booking_update",
        title: b.status === "pending" ? "New Booking" : b.status === "overdue" ? "Overdue Rental" : "Booking Updated",
        message: `${b.customer_name} — ${b.items || "No items"}`,
        detail: `${peso(Number(b.grand_total))} · ${String(b.start_date).slice(0,10)} → ${String(b.end_date).slice(0,10)}`,
        status: b.status,
        time: b.created_at,
        read: false
      }));
      const lowStockItems = (inventoryData.items || []).filter(x => x.status === "active" && Number(x.total_quantity) < 5);
      lowStockItems.forEach((item, i) => {
        notifs.push({
          id: `lowstock-${item.id}`,
          type: "low_stock",
          title: "Low Stock Alert",
          message: `${item.name} — only ${item.total_quantity} unit(s) left`,
          detail: `SKU: ${item.sku || "N/A"} · Restock recommended`,
          time: new Date().toISOString(),
          read: false
        });
      });
      (escalationsData.escalated||[]).slice(0,5).forEach(e => {
        notifs.push({
          id: `esc-${e.id}`,
          type: "escalation",
          title: e.level==="final"?"Final Notice Due":e.level==="formal"?"Formal Demand Due":"Follow-up Needed",
          message: `${e.customer_name} — ${e.daysText}`,
          detail: `${e.booking_no} · Late fee: ${peso(e.lateFee)}`,
          status: e.level,
          time: new Date().toISOString(),
          read: false
        });
      });
      notifs.sort((a, b) => new Date(b.time) - new Date(a.time));
      setNotifications(notifs.slice(0, 20));
    } catch (e) {}
    finally { setLoading(false); }
  };

  useEffect(() => { loadNotifications(); }, []);
  useEffect(() => {
    const interval = setInterval(loadNotifications, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const onPointerDown = e => { if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false); };
    const onKeyDown = e => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("pointerdown", onPointerDown); document.removeEventListener("keydown", onKeyDown); };
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllRead = () => setNotifications(prev => prev.map(n => ({ ...n, read: true })));

  const getIcon = (type) => {
    if (type === "booking_new") return "📋";
    if (type === "booking_overdue") return "⚠";
    if (type === "low_stock") return "🔴";
    return "🔄";
  };

  const getTypeClass = (type) => {
    if (type === "booking_new") return "notif-new";
    if (type === "booking_overdue") return "notif-overdue";
    if (type === "low_stock") return "notif-lowstock";
    return "notif-update";
  };

  return <div className="notification-bell" ref={menuRef}>
    <button type="button" className="notification-trigger" aria-label="Notifications" onClick={() => setOpen(v => !v)}>
      🔔
      {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
    </button>
    {open && <div className="notification-dropdown">
      <div className="notification-header">
        <div><strong>Notifications</strong><small>{unreadCount} unread</small></div>
        {unreadCount > 0 && <button onClick={markAllRead}>Mark all read</button>}
      </div>
      <div className="notification-list">
        {loading && notifications.length === 0 ? <div className="notification-empty">Loading notifications...</div> :
        notifications.length === 0 ? <div className="notification-empty">No notifications yet.</div> :
        notifications.map(n => <div className={`notification-item ${n.read ? "read" : ""} ${getTypeClass(n.type)}`} key={n.id} onClick={() => { n.read = true; setNotifications([...notifications]); }}>
          <span className="notification-icon">{getIcon(n.type)}</span>
          <div className="notification-content">
            <strong>{n.title}</strong>
            <p>{n.message}</p>
            <small>{n.detail}</small>
          </div>
          {!n.read && <span className="notification-dot"></span>}
        </div>)}
      </div>
      <div className="notification-footer">
        {notifications.some(n=>n.type==="low_stock")?
          <Link to="/admin/inventory" onClick={() => setOpen(false)}>View inventory →</Link>:
          <Link to="/admin/bookings" onClick={() => setOpen(false)}>View all bookings</Link>}
      </div>
    </div>}
  </div>;
}

function AdminSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState({ bookings: [], inventory: [], customers: [] });
  const [loading, setLoading] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const onPointerDown = e => { if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false); };
    const onKeyDown = e => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("pointerdown", onPointerDown); document.removeEventListener("keydown", onKeyDown); };
  }, []);

  const search = async (q) => {
    if (!q.trim()) { setResults({ bookings: [], inventory: [], customers: [] }); return; }
    setLoading(true);
    try {
      const [bookingsData, inventoryData, customersData] = await Promise.all([
        api("/admin/bookings").catch(() => ({ bookings: [] })),
        api("/admin/inventory").catch(() => ({ items: [] })),
        api("/admin/customers").catch(() => ({ customers: [] }))
      ]);
      const lq = q.toLowerCase();
      setResults({
        bookings: (bookingsData.bookings || []).filter(b => (b.booking_no || "").toLowerCase().includes(lq) || (b.customer_name || "").toLowerCase().includes(lq)).slice(0, 5),
        inventory: (inventoryData.items || []).filter(i => (i.name || "").toLowerCase().includes(lq) || (i.sku || "").toLowerCase().includes(lq)).slice(0, 5),
        customers: (customersData.customers || []).filter(c => (c.full_name || "").toLowerCase().includes(lq) || (c.email || "").toLowerCase().includes(lq)).slice(0, 5)
      });
    } catch (e) {}
    finally { setLoading(false); }
  };

  const handleInput = (e) => {
    const val = e.target.value;
    setQuery(val);
    setOpen(true);
    search(val);
  };

  const hasResults = results.bookings.length || results.inventory.length || results.customers.length;

  return <div className="admin-search-wrap" ref={menuRef}>
    <div className={`admin-search ${open ? "focused" : ""}`}>
      <span>⌕</span>
      <input placeholder="Search bookings, items, customers..." value={query} onChange={handleInput} onFocus={() => { if (query) setOpen(true); }} />
    </div>
    {open && query && <div className="search-dropdown">
      {loading ? <div className="search-empty">Searching...</div> :
      !hasResults ? <div className="search-empty">No results for "{query}"</div> :
      <>
        {results.bookings.length > 0 && <div className="search-section">
          <span className="search-section-label">📋 Bookings</span>
          {results.bookings.map(b => <div className="search-item" key={`b-${b.id}`} onClick={() => { setOpen(false); setQuery(""); navigate("/admin/bookings"); }}>
            <strong>{b.booking_no}</strong><small>{b.customer_name} · {peso(Number(b.grand_total))}</small>
          </div>)}
        </div>}
        {results.inventory.length > 0 && <div className="search-section">
          <span className="search-section-label">📦 Inventory</span>
          {results.inventory.map(i => <div className="search-item" key={`i-${i.id}`} onClick={() => { setOpen(false); setQuery(""); navigate("/admin/inventory"); }}>
            <strong>{i.name}</strong><small>{i.sku} · {peso(Number(i.daily_price))}/day</small>
          </div>)}
        </div>}
        {results.customers.length > 0 && <div className="search-section">
          <span className="search-section-label">👤 Customers</span>
          {results.customers.map(c => <div className="search-item" key={`c-${c.id}`} onClick={() => { setOpen(false); setQuery(""); navigate("/admin/customers"); }}>
            <strong>{c.full_name}</strong><small>{c.email}</small>
          </div>)}
        </div>}
      </>}
    </div>}
  </div>;
}

function AdminShell({ children, title, subtitle }) {
  const [sidebarCollapsed,setSidebarCollapsed] = useState(()=>{
    try { return localStorage.getItem("bloom_borrow_sidebar_collapsed") === "true"; } catch { return false; }
  });
  const toggleSidebar = () => setSidebarCollapsed(prev=>{
    const next = !prev;
    try { localStorage.setItem("bloom_borrow_sidebar_collapsed",String(next)); } catch {}
    return next;
  });
  return <div className={`admin-app ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}><AdminSidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar}/><main className="admin-main"><header className="admin-topbar"><div className="admin-topbar-left"><small>Welcome back, Admin 👋</small><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div><div className="admin-actions"><AdminSearch/><NotificationBell/><AdminProfileMenu/></div></header>{children}</main></div>
}

function AccountSettings() {
  const stored = getStoredUser() || {};
  const [profile,setProfile] = useState({full_name:stored.full_name||"",email:stored.email||"",phone:stored.phone||""});
  const [passwords,setPasswords] = useState({current_password:"",new_password:"",confirm_password:""});
  const [profileMsg,setProfileMsg] = useState("");
  const [passwordMsg,setPasswordMsg] = useState("");
  const [error,setError] = useState("");
  const [saving,setSaving] = useState(false);

  useEffect(()=>{
    api("/auth/me").then(({user})=>{
      const next={full_name:user.full_name||"",email:user.email||"",phone:user.phone||""};
      setProfile(next);
      saveAuth(null,user);
    }).catch(()=>{});
  },[]);

  const saveProfile = async e => {
    e.preventDefault(); setError(""); setProfileMsg(""); setSaving(true);
    try {
      const {user}=await api("/auth/profile",{method:"PATCH",body:JSON.stringify(profile)});
      saveAuth(null,user);
      setProfile({full_name:user.full_name||"",email:user.email||"",phone:user.phone||""});
      setProfileMsg("Profile updated successfully.");
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const changePassword = async e => {
    e.preventDefault(); setError(""); setPasswordMsg("");
    if (passwords.new_password !== passwords.confirm_password) return setError("New password and confirmation do not match.");
    if (passwords.new_password.length < 12) return setError("New password must be at least 12 characters.");
    setSaving(true);
    try {
      await api("/auth/change-password",{method:"PATCH",body:JSON.stringify({current_password:passwords.current_password,new_password:passwords.new_password})});
      setPasswords({current_password:"",new_password:"",confirm_password:""});
      setPasswordMsg("Password changed successfully.");
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return <AdminShell title="Account Settings" subtitle="Manage your staff profile and account security.">
    {error && <div className="login-error account-settings-alert">{error}</div>}
    <div className="account-settings-grid">
      <form className="admin-card account-settings-card" onSubmit={saveProfile}>
        <div className="card-heading"><div><span>Profile</span><h2>Personal information</h2></div></div>
        <label>Full name<input required value={profile.full_name} onChange={e=>setProfile({...profile,full_name:e.target.value})}/></label>
        <label>Email address<input type="email" required value={profile.email} onChange={e=>setProfile({...profile,email:e.target.value})}/></label>
        <label>Phone<input value={profile.phone} onChange={e=>setProfile({...profile,phone:e.target.value})}/></label>
        {profileMsg && <div className="settings-success">{profileMsg}</div>}
        <button className="primary-button" disabled={saving}>{saving?"Saving…":"Save profile"}</button>
      </form>
      <form className="admin-card account-settings-card" onSubmit={changePassword}>
        <div className="card-heading"><div><span>Security</span><h2>Change password</h2></div></div>
        <label>Current password<input type="password" autoComplete="current-password" required value={passwords.current_password} onChange={e=>setPasswords({...passwords,current_password:e.target.value})}/></label>
        <label>New password<input type="password" autoComplete="new-password" minLength="12" required value={passwords.new_password} onChange={e=>setPasswords({...passwords,new_password:e.target.value})}/></label>
        <label>Confirm new password<input type="password" autoComplete="new-password" minLength="12" required value={passwords.confirm_password} onChange={e=>setPasswords({...passwords,confirm_password:e.target.value})}/></label>
        <small className="password-help">Use at least 12 characters. Avoid predictable or reused passwords.</small>
        {passwordMsg && <div className="settings-success">{passwordMsg}</div>}
        <button className="primary-button" disabled={saving}>{saving?"Updating…":"Change password"}</button>
      </form>
    </div>
  </AdminShell>;
}

function AnimatedKpiValue({ value=0, format=(n)=>String(n), delay=0, duration=850 }) {
  const numeric=Number(value)||0;
  const [display,setDisplay]=useState(0);
  const reduceMotion=useRef(false);

  useEffect(()=>{
    reduceMotion.current=window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches||false;
    if(reduceMotion.current){setDisplay(numeric);return;}
    let raf;
    let timer;
    const startAnimation=()=>{
      const started=performance.now();
      const tick=(now)=>{
        const progress=Math.min(1,(now-started)/duration);
        const eased=1-Math.pow(1-progress,3);
        setDisplay(Math.round(numeric*eased));
        if(progress<1) raf=requestAnimationFrame(tick);
      };
      raf=requestAnimationFrame(tick);
    };
    timer=setTimeout(startAnimation,delay);
    return()=>{clearTimeout(timer);cancelAnimationFrame(raf)};
  },[numeric,delay,duration]);

  return <>{format(display)}</>;
}

function Kpi({ label, value, detail, index=0, currency=false }) {
  const delay=index*110;
  const numeric=Number(value)||0;
  return <article className="kpi-card kpi-card-animated" style={{"--kpi-delay":`${delay}ms`}}>
    <div>
      <span>{label}</span>
      <strong className="kpi-animated-value"><AnimatedKpiValue value={numeric} delay={delay+80} format={currency?peso:(n)=>String(n)}/></strong>
      <small>{detail}</small>
    </div>
  </article>
}

function DashboardRevenueBarChart({ rows=[] }) {
  const max=Math.max(1,...rows.map(x=>Number(x.revenue)||0));
  const [hovered,setHovered]=useState(null);
  return <div className="revenue-bars" role="img" aria-label="Revenue collections for the last seven days">
    {rows.map((row,index)=>{
      const revenue=Number(row.revenue)||0;
      const height=revenue===0?0:Math.max(5,(revenue/max)*100);
      return <div className="revenue-bar-col" key={row.date} onMouseEnter={()=>setHovered(index)} onMouseLeave={()=>setHovered(null)} onFocus={()=>setHovered(index)} onBlur={()=>setHovered(null)} tabIndex="0" aria-label={`${row.label}: ${peso(revenue)}`}>
        <div className="revenue-bar-track">
          {hovered===index&&<div className="revenue-bar-tooltip"><small>{row.label}</small><strong>{peso(revenue)}</strong></div>}
          <span className={`revenue-bar-fill ${hovered===index?"hovered":""}`} style={{height:`${height}%`,animationDelay:`${index*80}ms`}}/>
        </div>
        <small className="revenue-bar-label">{row.label}</small>
      </div>;
    })}
  </div>;
}

function DashboardBookingAreaChart({ rows=[] }) {
  const width=620, height=210, padX=26, padTop=18, padBottom=32;
  const values=rows.map(row=>Number(row.bookings)||0);
  const max=Math.max(1,...values);
  const usableW=width-padX*2, usableH=height-padTop-padBottom;
  const points=rows.map((row,index)=>({x:padX+(rows.length>1?(index*usableW)/(rows.length-1):usableW/2),y:padTop+usableH-((Number(row.bookings)||0)/max)*usableH,row}));
  const linePoints=points.map(point=>`${point.x},${point.y}`).join(" ");
  const areaPoints=points.length?`${padX},${height-padBottom} ${linePoints} ${padX+usableW},${height-padBottom}`:"";
  const [hover,setHover]=useState(null);
  return <div className="dash-chart-wrap">
    <svg className="dash-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Booking activity for the last seven days">
      <defs><linearGradient id="bookingAreaGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#12aaa7" stopOpacity=".42"/><stop offset="48%" stopColor="#12aaa7" stopOpacity=".16"/><stop offset="100%" stopColor="#12aaa7" stopOpacity="0"/></linearGradient></defs>
      {[0,.5,1].map((ratio,index)=><line key={index} x1={padX} y1={padTop+usableH*ratio} x2={width-padX} y2={padTop+usableH*ratio} className="chart-grid-line"/>)}
      {areaPoints&&<polygon points={areaPoints} className="booking-area"/>}
      {linePoints&&<polyline points={linePoints} className="booking-line" pathLength="1"/>}
      {points.map((point,index)=><g key={point.row.date} className="booking-point-group" tabIndex="0" onMouseEnter={()=>setHover(index)} onMouseLeave={()=>setHover(null)} onFocus={()=>setHover(index)} onBlur={()=>setHover(null)} aria-label={`${point.row.label}: ${Number(point.row.bookings||0)} bookings`}>
        <circle cx={point.x} cy={point.y} r={hover===index?6:4} className={hover===index?"booking-point active":"booking-point"}/>
        <rect x={point.x-25} y={padTop} width="50" height={usableH} fill="transparent"/>
        <text x={point.x} y={height-8} textAnchor="middle" className="chart-axis-label">{point.row.label}</text>
      </g>)}
    </svg>
    {hover!==null&&points[hover]&&<div className="dash-chart-tooltip" style={{left:`${(points[hover].x/width)*100}%`}}><b>{points[hover].row.label}</b><span>{Number(points[hover].row.bookings||0)} bookings</span></div>}
  </div>;
}

function AdminDashboard() {
  const [data,setData]=useState(null);
  const [updatedAt,setUpdatedAt]=useState(null);
  const [escalations,setEscalations]=useState(null);
  const load=React.useCallback(()=>api("/admin/dashboard").then(d=>{setData(d);setUpdatedAt(new Date())}).catch(()=>{}),[]);
  const loadEscalations=React.useCallback(()=>api("/admin/escalations").then(d=>setEscalations(d)).catch(()=>{}),[]);
  React.useEffect(()=>{load();loadEscalations();const id=setInterval(()=>{load();loadEscalations()},60000);return()=>clearInterval(id)},[load,loadEscalations]);
  const s=data?.stats || {};
  const daily=data?.daily||[];
  const sevenDayRevenue=daily.reduce((sum,x)=>sum+Number(x.revenue||0),0);
  const sevenDayBookings=daily.reduce((sum,x)=>sum+Number(x.bookings||0),0);
  const escStats=escalations?.stats||{};

  return <AdminShell title="Dashboard" subtitle="Live overview of your rental business.">
    <section className="kpi-grid">
      <Kpi index={0} icon="▣" label="Today's bookings" value={s.today_bookings ?? 0} detail={`${s.upcoming_reservations ?? 0} upcoming`}/>
      <Kpi index={1} icon="↗" label="Active rentals" value={s.active_rentals ?? 0} detail="Currently rented"/>
      <Kpi index={2} icon="!" pulseIcon label="Overdue rentals" value={s.overdue_rentals ?? 0} detail="Needs attention"/>
      <Kpi index={3} icon="₱" currency label="Revenue today" value={Number(s.revenue_today ?? 0)} detail={`${s.pending_payments ?? 0} pending payments`}/>
    </section>

    <div className="dashboard-layout">
      <div className="dashboard-analytics-row">
        <section className="admin-card dashboard-chart-card">
          <div className="card-heading"><div><span>Revenue · last 7 days</span><h2>Collections trend</h2></div><button className="chart-refresh" onClick={load}>Refresh</button></div>
          <div className="chart-summary"><strong>{peso(sevenDayRevenue)}</strong><small>{updatedAt?"Updated just now":"Loading…"}</small></div>
          <DashboardRevenueBarChart rows={daily}/>
          {daily.length>0&&daily.every(row=>Number(row.revenue||0)===0)&&<p className="chart-empty">No revenue activity for this period.</p>}
        </section>

        <section className="admin-card dashboard-chart-card">
          <div className="card-heading"><div><span>Bookings · last 7 days</span><h2>Booking activity</h2></div><Link to="/admin/bookings">View bookings</Link></div>
          <div className="chart-summary"><strong>{sevenDayBookings}</strong><small>Valid bookings</small></div>
          <DashboardBookingAreaChart rows={daily}/>
          {daily.length>0&&daily.every(row=>Number(row.bookings||0)===0)&&<p className="chart-empty">No booking activity for this period.</p>}
        </section>
      </div>

      <div className="dashboard-support-row">
        <section className="admin-card bookings-card">
          <div className="card-heading"><div><span>Recent bookings</span><h2>Latest reservations</h2></div><Link to="/admin/bookings">View all</Link></div>
          <BookingTable rows={(data?.recent||[]).map(b=>({id:b.booking_no,customer:b.customer_name,item:b.items||"—",dates:`${String(b.start_date).slice(0,10)} → ${String(b.end_date).slice(0,10)}`,total:Number(b.grand_total),status:b.status[0].toUpperCase()+b.status.slice(1)}))}/>
        </section>
        <section className="admin-card inventory-card"><div className="card-heading"><div><span>Operations</span><h2>Attention needed</h2></div></div><div className="ops-summary"><span><b>{s.unavailable_items ?? 0}</b> unavailable / maintenance items</span><span><b>{s.pending_payments ?? 0}</b> bookings with balance</span><span><b>{s.overdue_rentals ?? 0}</b> overdue rentals</span></div></section>
        <section className="admin-card upcoming-card"><div className="card-heading"><div><span>Workflow</span><h2>Quick actions</h2></div></div><div className="quick-actions">
          <Link className="quick-action-card" to="/admin/bookings">
            <span className="quick-action-icon">📅</span>
            <span>Manage bookings</span>
          </Link>
          <Link className="quick-action-card" to="/admin/inventory">
            <span className="quick-action-icon">🛒</span>
            <span>Manage inventory</span>
          </Link>
          <Link className="quick-action-card" to="/admin/payments">
            <span className="quick-action-icon">🧾</span>
            <span>Payments</span>
          </Link>
          <Link className="quick-action-card" to="/admin/maintenance">
            <span className="quick-action-icon">🔧</span>
            <span>Maintenance</span>
          </Link>
        </div></section>
      </div>

      {escStats.total>0&&<div className="dashboard-escalation-row">
        <section className="admin-card escalation-card">
          <div className="card-heading"><div><span>⚠ Overdue Escalation</span><h2>Rentals requiring follow-up</h2></div><Link to="/admin/bookings">View all</Link></div>
          <div className="escalation-stats">
            <div className="escalation-stat gentle"><span className="esc-badge gentle">●</span><b>{escStats.gentle||0}</b><small>Gentle</small></div>
            <div className="escalation-stat reminder"><span className="esc-badge reminder">●</span><b>{escStats.reminder||0}</b><small>Reminder</small></div>
            <div className="escalation-stat formal"><span className="esc-badge formal">●</span><b>{escStats.formal||0}</b><small>Formal</small></div>
            <div className="escalation-stat final"><span className="esc-badge final">●</span><b>{escStats.final||0}</b><small>Final Notice</small></div>
          </div>
          <div className="escalation-list">
            {(escalations?.escalated||[]).slice(0,5).map(e=><div className="escalation-row" key={e.id}>
              <div className="esc-row-main">
                <span className={`esc-badge ${e.level}`}>{e.level}</span>
                <div className="esc-row-info">
                  <strong>{e.customer_name}</strong>
                  <small>{e.booking_no} · {e.daysText}</small>
                </div>
              </div>
              <div className="esc-row-actions">
                <span className="esc-fee">{peso(e.lateFee)}</span>
                <Link className="secondary-button" to="/admin/bookings">View</Link>
              </div>
            </div>)}
          </div>
        </section>
      </div>}
    </div>
  </AdminShell>;
}

function BookingTable({ rows=bookings }) {
  return <div className="table-wrap"><table><thead><tr><th>Booking</th><th>Customer</th><th>Item</th><th>Dates</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody>{rows.map(b=><tr key={b.id}><td><strong>{b.id}</strong></td><td>{b.customer}</td><td>{b.item}</td><td>{b.dates}</td><td>{peso(b.total)}</td><td><span className={`status-pill ${b.status.toLowerCase()}`}>{b.status}</span></td><td>•••</td></tr>)}</tbody></table></div>
}

function Inventory() {
  const [rows,setRows]=useState([]);
  const [modal,setModal]=useState(false);
  const [editing,setEditing]=useState(null);
  const [error,setError]=useState("");
  const [search,setSearch]=useState("");
  const [categoryFilter,setCategoryFilter]=useState("All");
  const [statusFilter,setStatusFilter]=useState("All");
  const [deleteModal,setDeleteModal]=useState(null);
  const [deleteLoading,setDeleteLoading]=useState(false);
  const [conditionItem,setConditionItem]=useState(null);
  const [conditions,setConditions]=useState([]);
  const [conditionLoading,setConditionLoading]=useState(false);
  const [addConditionModal,setAddConditionModal]=useState(false);
  const [conditionForm,setConditionForm]=useState({condition_status:"good",condition_type:"after_return",notes:"",booking_id:""});
  const blank={sku:"",name:"",category:"Events",description:"",daily_price:"",security_deposit:"",total_quantity:1,status:"active",image_url:""};
  const [form,setForm]=useState(blank);

  const load=()=>api("/admin/inventory").then(d=>setRows(d.items||[])).catch(e=>setError(e.message));
  React.useEffect(()=>{load();},[]);
  const openNew=()=>{setEditing(null);setForm(blank);setModal(true)};
  const openEdit=(x)=>{setEditing(x);setForm({...x});setModal(true)};
  const save=async(e)=>{e.preventDefault();setError("");try{await api(editing?`/admin/inventory/${editing.id}`:"/admin/inventory",{method:editing?"PATCH":"POST",body:JSON.stringify(form)});setModal(false);load()}catch(err){setError(err.message)}};
  const confirmDelete=(x)=>{setDeleteModal(x)};
  const remove=async()=>{if(!deleteModal)return;setDeleteLoading(true);try{await api(`/admin/inventory/${deleteModal.id}`,{method:"DELETE"});setDeleteModal(null);load()}catch(e){setError(e.message)}finally{setDeleteLoading(false)}};

  const viewConditions=async(item)=>{
    setConditionItem(item);
    setConditionLoading(true);
    try{
      const data=await api(`/admin/items/${item.id}/conditions`);
      setConditions(data.conditions||[]);
    }catch(e){setError(e.message)}
    finally{setConditionLoading(false)}
  };

  const addCondition=async()=>{
    if(!conditionItem)return;
    try{
      await api(`/admin/items/${conditionItem.id}/conditions`,{method:"POST",body:JSON.stringify(conditionForm)});
      setAddConditionModal(false);
      setConditionForm({condition_status:"good",condition_type:"after_return",notes:"",booking_id:""});
      viewConditions(conditionItem);
    }catch(e){setError(e.message)}
  };

  const categories=["All",...new Set(rows.map(x=>x.category))];
  const statuses=["All","active","inactive","maintenance"];
  const filtered=rows.filter(x=>{
    const matchSearch=x.name.toLowerCase().includes(search.toLowerCase())||x.sku.toLowerCase().includes(search.toLowerCase());
    const matchCat=categoryFilter==="All"||x.category===categoryFilter;
    const matchStatus=statusFilter==="All"||x.status===statusFilter;
    return matchSearch&&matchCat&&matchStatus;
  });
  const sorts={
    created_at:{label:"Date added",get:x=>Date.parse(x.created_at)||0},
    name:{label:"Name",get:x=>x.name||""},
    sku:{label:"SKU",get:x=>x.sku||""},
    category:{label:"Category",get:x=>x.category||""},
    daily_price:{label:"Daily price",get:x=>Number(x.daily_price)||0},
    available:{label:"Available units",get:x=>Number(x.total_quantity||0)-Number(x.reserved_all||0)},
    reserved_all:{label:"Reserved",get:x=>Number(x.reserved_all)||0},
    status:{label:"Status",get:x=>x.status||""}
  };
  const {sortKey,sortDir,setSort}=useSort("created_at","desc");
  const sorted=sortRows(filtered,sorts,sortKey,sortDir);
  const [view,setView]=useViewMode("bb.view.inventory");

  const stats={
    total:rows.length,
    active:rows.filter(x=>x.status==="active").length,
    maintenance:rows.filter(x=>x.status==="maintenance").length,
    totalStock:rows.reduce((s,x)=>s+Number(x.total_quantity||0),0),
    totalReserved:rows.reduce((s,x)=>s+Number(x.reserved_all||0),0)
  };

  return <AdminShell title="Rental Inventory" subtitle="Manage your rental items, pricing, stock levels, and availability.">
    {error&&<div className="login-error">{error}</div>}

    <section className="kpi-grid">
      <Kpi index={0} icon="📦" label="Total items" value={stats.total} detail="All rental items"/>
      <Kpi index={1} icon="✓" label="Active" value={stats.active} detail="Available for rent"/>
      <Kpi index={2} icon="🔧" label="Maintenance" value={stats.maintenance} detail="Under maintenance"/>
      <Kpi index={3} icon="📊" label="Available" value={stats.totalStock-stats.totalReserved} detail={`${stats.totalReserved} reserved`}/>
    </section>

    <div className="admin-page-toolbar">
      <div className="admin-search">
        <span>⌕</span>
        <input placeholder="Search by name or SKU..." value={search} onChange={e=>setSearch(e.target.value)}/>
      </div>
      <div className="inventory-filters">
        <select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}>
          {categories.map(c=><option key={c}>{c}</option>)}
        </select>
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          {statuses.map(s=><option key={s}>{s==="All"?"All statuses":s}</option>)}
        </select>
        <SortControls sorts={sorts} sortKey={sortKey} sortDir={sortDir} setSort={setSort}/>
        <ViewToggle view={view} onChange={setView}/>
      </div>
      <button className="primary-button" onClick={openNew}>+ Add rental item</button>
    </div>

    <section className="admin-card">
      {filtered.length===0?<div className="inventory-empty">
        <span>📭</span>
        <h3>No items found</h3>
        <p>{search||categoryFilter!=="All"||statusFilter!=="All"?"Try adjusting your filters.":"Add your first rental item to get started."}</p>
      </div>:view==="table"?<div className="table-wrap"><table>
        <thead><tr><th>Item</th><th>Category</th><th className="num">Price/day</th><th className="num">Deposit</th><th className="num">Available</th><th className="num">Reserved</th><th>Status</th><th></th></tr></thead>
        <tbody>{sorted.map(item=><tr key={item.id}>
          <td><strong>{item.name}</strong><br/><small>{item.sku}</small></td>
          <td>{item.category}</td>
          <td className="num">{peso(Number(item.daily_price))}</td>
          <td className="num">{peso(Number(item.security_deposit))}</td>
          <td className={`num ${Number(item.total_quantity)-Number(item.reserved_all||0)<5?"cell-low":""}`}>{Math.max(0,Number(item.total_quantity)-Number(item.reserved_all||0))}</td>
          <td className="num">{item.reserved_all||0} / {item.total_quantity}</td>
          <td><span className={`status-pill ${item.status==="active"?"confirmed":item.status==="maintenance"?"pending":""}`}>{item.status}</span></td>
          <td><div className="table-actions">
            <button className="mini-button" onClick={()=>openEdit(item)}>Edit</button>
            <button className="mini-button" onClick={()=>viewConditions(item)}>History</button>
            <button className="mini-button danger" onClick={()=>confirmDelete(item)}>Delete</button>
          </div></td>
        </tr>)}</tbody>
      </table></div>:<div className="inventory-grid">
        {sorted.map(item=><article className="inventory-card-item" key={item.id}>
          <div className="inventory-card-image">
            <img src={item.image_url||items[0].image} alt={item.name}/>
            <span className={`inventory-status-badge ${item.status}`}>{item.status}</span>
          </div>
          <div className="inventory-card-body">
            <div className="inventory-card-header">
              <div>
                <h3>{item.name}</h3>
                <small>{item.sku} · {item.category}</small>
              </div>
            </div>
            <p className="inventory-card-desc">{item.description||"No description available."}</p>
            <div className="inventory-card-stats">
              <div><span>Price</span><strong>{peso(Number(item.daily_price))}/day</strong></div>
              <div><span>Deposit</span><strong>{peso(Number(item.security_deposit))}</strong></div>
              <div className={Number(item.total_quantity)-Number(item.reserved_all||0)<5?"low-stock":""}><span>Available</span><strong>{Math.max(0,Number(item.total_quantity)-Number(item.reserved_all||0))} units</strong></div>
              <div><span>Reserved</span><strong>{item.reserved_all||0} of {item.total_quantity}</strong></div>
            </div>
            <div className="inventory-card-actions">
              <button className="secondary-button" onClick={()=>openEdit(item)}>Edit</button>
              <button className="secondary-button" onClick={()=>viewConditions(item)}>📋 History</button>
              <button className="danger-button" onClick={()=>confirmDelete(item)}>Delete</button>
            </div>
          </div>
        </article>)}
      </div>}
    </section>

    {modal&&<div className="modal-backdrop" onClick={()=>setModal(false)}><form className="modal" onSubmit={save} onClick={e=>e.stopPropagation()}>
      <div className="modal-head"><div><span className="eyebrow">Inventory</span><h2>{editing?"Edit":"Add"} rental item</h2></div><button type="button" onClick={()=>setModal(false)}>×</button></div>
      <div className="form-grid">
        <label>SKU<input required value={form.sku} onChange={e=>setForm({...form,sku:e.target.value})}/></label><label>Item name<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
        <label>Category<input required value={form.category} onChange={e=>setForm({...form,category:e.target.value})}/></label><label>Status<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option>active</option><option>inactive</option><option>maintenance</option></select></label>
        <label>Daily price<input required type="number" min="0" value={form.daily_price} onChange={e=>setForm({...form,daily_price:e.target.value})}/></label><label>Security deposit<input required type="number" min="0" value={form.security_deposit} onChange={e=>setForm({...form,security_deposit:e.target.value})}/></label>
        <label>Quantity<input required type="number" min="1" value={form.total_quantity} onChange={e=>setForm({...form,total_quantity:e.target.value})}/></label><label>Image URL<input value={form.image_url||""} onChange={e=>setForm({...form,image_url:e.target.value})}/></label>
        <label className="span-2">Description<textarea value={form.description||""} onChange={e=>setForm({...form,description:e.target.value})}/></label>
      </div><div className="modal-actions"><button type="button" className="secondary-button" onClick={()=>setModal(false)}>Cancel</button><button className="primary-button">Save item</button></div>
    </form></div>}

    {deleteModal&&<div className="modal-backdrop" onClick={()=>setDeleteModal(null)}><div className="modal delete-confirm-modal" onClick={e=>e.stopPropagation()}>
      <div className="modal-head"><div><span className="eyebrow">Confirm deletion</span><h2>Delete {deleteModal.name}?</h2></div><button type="button" onClick={()=>setDeleteModal(null)}>×</button></div>
      <div className="delete-confirm-body">
        <div className="delete-warning-icon">⚠</div>
        <p>This will permanently remove <strong>{deleteModal.name}</strong> ({deleteModal.sku}) from your inventory. This action cannot be undone.</p>
      </div>
      <div className="modal-actions"><button className="secondary-button" onClick={()=>setDeleteModal(null)}>Cancel</button><button className="danger-button" onClick={remove} disabled={deleteLoading}>{deleteLoading?"Deleting...":"Delete item"}</button></div>
    </div></div>}

    {conditionItem&&<div className="modal-backdrop" onClick={()=>{setConditionItem(null);setConditions([])}}><div className="modal condition-history-modal" onClick={e=>e.stopPropagation()}>
      <div className="modal-head"><div><span className="eyebrow">Condition History</span><h2>{conditionItem.name}</h2><small>{conditionItem.sku}</small></div><button type="button" onClick={()=>{setConditionItem(null);setConditions([])}}>×</button></div>
      <div className="condition-history-actions">
        <button className="primary-button" onClick={()=>setAddConditionModal(true)}>+ Add Record</button>
      </div>
      {conditionLoading?<div className="inventory-empty"><p>Loading...</p></div>
      :conditions.length===0?<div className="inventory-empty"><span>📋</span><h3>No condition records</h3><p>This item has no condition history yet.</p></div>
      :<div className="condition-timeline">
        {conditions.map(c=><div className="condition-record" key={c.id}>
          <div className={`condition-badge condition-${c.condition_status}`}>{c.condition_status}</div>
          <div className="condition-record-info">
            <div className="condition-record-type">{c.condition_type.replace("_"," ")}</div>
            {c.notes&&<div className="condition-record-notes">{c.notes}</div>}
            <div className="condition-record-meta">
              {c.booking_no&&<span>📦 {c.booking_no}</span>}
              {c.recorded_by&&<span>👤 {c.recorded_by}</span>}
              <span>📅 {new Date(c.created_at).toLocaleDateString("en-PH",{year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}</span>
            </div>
          </div>
        </div>)}
      </div>}
    </div></div>}

    {addConditionModal&&conditionItem&&<div className="modal-backdrop" onClick={()=>setAddConditionModal(false)}><div className="modal" onClick={e=>e.stopPropagation()}>
      <div className="modal-head"><div><span className="eyebrow">Add Condition Record</span><h2>{conditionItem.name}</h2></div><button type="button" onClick={()=>setAddConditionModal(false)}>×</button></div>
      <div className="form-grid">
        <label>Condition
          <select value={conditionForm.condition_status} onChange={e=>setConditionForm({...conditionForm,condition_status:e.target.value})}>
            <option value="excellent">Excellent</option>
            <option value="good">Good</option>
            <option value="fair">Fair</option>
            <option value="poor">Poor</option>
            <option value="damaged">Damaged</option>
            <option value="lost">Lost</option>
          </select>
        </label>
        <label>Type
          <select value={conditionForm.condition_type} onChange={e=>setConditionForm({...conditionForm,condition_type:e.target.value})}>
            <option value="before_rental">Before Rental</option>
            <option value="after_return">After Return</option>
            <option value="damage_report">Damage Report</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </label>
        <label className="span-2">Notes<textarea value={conditionForm.notes} onChange={e=>setConditionForm({...conditionForm,notes:e.target.value})} placeholder="Optional notes about the condition..."/></label>
      </div>
      <div className="modal-actions"><button className="secondary-button" onClick={()=>setAddConditionModal(false)}>Cancel</button><button className="primary-button" onClick={addCondition}>Save Record</button></div>
    </div></div>}
  </AdminShell>
}

function Incidents() {
  const [incidents,setIncidents]=useState([]);
  const [error,setError]=useState("");
  const [search,setSearch]=useState("");
  const [statusFilter,setStatusFilter]=useState("All");
  const [typeFilter,setTypeFilter]=useState("All");
  const [detail,setDetail]=useState(null);
  const [showNew,setShowNew]=useState(false);
  const [newForm,setNewForm]=useState({rental_item_id:"",booking_id:"",customer_id:"",incident_type:"damaged_minor",description:"",replacement_cost:"",charge_amount:"",insurance_claim_amount:""});
  const [items,setItems]=useState([]);
  const [customers,setCustomers]=useState([]);

  const load=()=>{
    api("/admin/incidents").then(d=>setIncidents(d.incidents||[])).catch(e=>setError(e.message));
    api("/admin/inventory").then(d=>setItems(d.items||[])).catch(()=>{});
    api("/admin/customers").then(d=>setCustomers(d.customers||[])).catch(()=>{});
  };
  React.useEffect(()=>{load()},[]);

  const filtered=incidents.filter(i=>{
    const matchSearch=(i.incident_no||"").toLowerCase().includes(search.toLowerCase())||(i.item_name||"").toLowerCase().includes(search.toLowerCase())||(i.customer_name||"").toLowerCase().includes(search.toLowerCase());
    const matchStatus=statusFilter==="All"||i.status===statusFilter;
    const matchType=typeFilter==="All"||i.incident_type===typeFilter;
    return matchSearch&&matchStatus&&matchType;
  });
  const sorts={
    reported_at:{label:"Date",get:i=>Date.parse(i.reported_at)||0},
    incident_no:{label:"Incident #",get:i=>i.incident_no||""},
    item_name:{label:"Item",get:i=>i.item_name||""},
    customer_name:{label:"Customer",get:i=>i.customer_name||""},
    incident_type:{label:"Type",get:i=>i.incident_type||""},
    charge_amount:{label:"Charge",get:i=>Number(i.charge_amount)||0},
    status:{label:"Status",get:i=>i.status||""}
  };
  const {sortKey,sortDir,setSort}=useSort("reported_at","desc");
  const sorted=sortRows(filtered,sorts,sortKey,sortDir);

  const stats={
    total:incidents.length,
    open:incidents.filter(i=>["reported","investigating"].includes(i.status)).length,
    resolved:incidents.filter(i=>i.status.startsWith("resolved_")).length,
    totalCharged:incidents.reduce((s,i)=>s+Number(i.charge_amount||0),0)
  };

  const createIncident=async()=>{
    if(!newForm.rental_item_id||!newForm.description)return;
    try{
      await api("/admin/incidents",{method:"POST",body:JSON.stringify(newForm)});
      setShowNew(false);
      setNewForm({rental_item_id:"",booking_id:"",customer_id:"",incident_type:"damaged_minor",description:"",replacement_cost:"",charge_amount:"",insurance_claim_amount:""});
      load();
    }catch(e){setError(e.message)}
  };

  const updateStatus=async(incident,status)=>{
    try{
      await api(`/admin/incidents/${incident.id}`,{method:"PATCH",body:JSON.stringify({status})});
      load();
      if(detail&&detail.id===incident.id)setDetail({...detail,status});
    }catch(e){setError(e.message)}
  };

  const typeLabels={lost:"Lost",damaged_minor:"Minor Damage",damaged_major:"Major Damage",partially_missing:"Partially Missing",other:"Other"};
  const statusLabels={reported:"Reported",investigating:"Investigating",resolved_charged:"Resolved (Charged)",resolved_insurance:"Resolved (Insurance)",written_off:"Written Off",dismissed:"Dismissed"};

  return <AdminShell title="Incidents" subtitle="Track lost, damaged, and missing items across rentals.">
    {error&&<div className="login-error">{error}</div>}

    <section className="kpi-grid">
      <Kpi index={0} icon="⚠" label="Total incidents" value={stats.total} detail="All time"/>
      <Kpi index={1} icon="🔴" label="Open" value={stats.open} detail="Needs attention"/>
      <Kpi index={2} icon="✓" label="Resolved" value={stats.resolved} detail="Handled cases"/>
      <Kpi index={3} icon="💰" label="Total charged" value={peso(stats.totalCharged)} detail="Customer charges"/>
    </section>

    <div className="admin-page-toolbar">
      <div className="admin-search">
        <span>⌕</span>
        <input placeholder="Search by incident #, item, or customer..." value={search} onChange={e=>setSearch(e.target.value)}/>
      </div>
      <div className="payment-filters">
        <select className="booking-status-select" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="All">All Status</option>
          {Object.entries(statusLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}
        </select>
        <select className="booking-status-select" value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}>
          <option value="All">All Types</option>
          {Object.entries(typeLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}
        </select>
        <SortControls sorts={sorts} sortKey={sortKey} sortDir={sortDir} setSort={setSort}/>
        <button className="primary-button" onClick={()=>setShowNew(true)}>+ Report Incident</button>
      </div>
    </div>

    <section className="admin-card">
      {filtered.length===0?<div className="inventory-empty">
        <span>⚠</span>
        <h3>No incidents found</h3>
        <p>{search||statusFilter!=="All"||typeFilter!=="All"?"Try adjusting your filters.":"No incidents reported yet."}</p>
      </div>:<div className="table-wrap"><table><thead><tr><th>Incident</th><th>Item</th><th>Customer</th><th>Type</th><th>Charge</th><th>Status</th><th>Date</th><th></th></tr></thead><tbody>
        {sorted.map(i=><tr key={i.id}>
          <td><strong>{i.incident_no}</strong></td>
          <td>{i.item_name||"—"}<br/><small>{i.item_sku||""}</small></td>
          <td>{i.customer_name||"—"}</td>
          <td><span className="status-pill">{typeLabels[i.incident_type]||i.incident_type}</span></td>
          <td>{peso(Number(i.charge_amount||0))}</td>
          <td><span className={`status-pill ${i.status.startsWith("resolved")?"confirmed":i.status==="dismissed"?"":"pending"}`}>{statusLabels[i.status]||i.status}</span></td>
          <td><small>{new Date(i.reported_at).toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"})}</small></td>
          <td><button className="mini-button" onClick={()=>setDetail(i)}>View</button></td>
        </tr>)}
      </tbody></table></div>}
    </section>

    {detail&&<div className="modal-backdrop" onClick={()=>setDetail(null)}><div className="modal" onClick={e=>e.stopPropagation()}>
      <button className="booking-modal-close" onClick={()=>setDetail(null)}>×</button>
      <div className="modal-head"><div><span className="eyebrow">{detail.incident_no}</span><h2>{typeLabels[detail.incident_type]||detail.incident_type}</h2></div></div>
      <div className="detail-grid" style={{gridTemplateColumns:"1fr 1fr",gap:"12px",marginBottom:"16px"}}>
        <div><small>Item</small><strong>{detail.item_name} ({detail.item_sku})</strong></div>
        <div><small>Customer</small><strong>{detail.customer_name||"—"}</strong></div>
        <div><small>Booking</small><strong>{detail.booking_no||"—"}</strong></div>
        <div><small>Reported by</small><strong>{detail.reported_by||"—"}</strong></div>
        <div><small>Replacement cost</small><strong>{peso(Number(detail.replacement_cost||0))}</strong></div>
        <div><small>Charge amount</small><strong>{peso(Number(detail.charge_amount||0))}</strong></div>
        <div><small>Insurance claim</small><strong>{peso(Number(detail.insurance_claim_amount||0))}</strong></div>
        <div><small>Status</small><strong>{statusLabels[detail.status]||detail.status}</strong></div>
      </div>
      <div style={{marginBottom:"16px"}}><small>Description</small><p style={{margin:"4px 0",fontSize:"13px",lineHeight:"1.5"}}>{detail.description}</p></div>
      {detail.resolution_notes&&<div style={{marginBottom:"16px"}}><small>Resolution notes</small><p style={{margin:"4px 0",fontSize:"13px",lineHeight:"1.5"}}>{detail.resolution_notes}</p></div>}
      <div className="booking-actions" style={{flexWrap:"wrap",gap:"8px"}}>
        {detail.status==="reported"&&<button className="secondary-button" onClick={()=>updateStatus(detail,"investigating")}>🔍 Start Investigation</button>}
        {["reported","investigating"].includes(detail.status)&&<>
          <button className="primary-button" onClick={()=>updateStatus(detail,"resolved_charged")}>✓ Resolve (Charged)</button>
          <button className="secondary-button" onClick={()=>updateStatus(detail,"resolved_insurance")}>✓ Resolve (Insurance)</button>
          <button className="secondary-button" onClick={()=>updateStatus(detail,"written_off")}>📄 Write Off</button>
          <button className="secondary-button danger" onClick={()=>updateStatus(detail,"dismissed")}>✕ Dismiss</button>
        </>}
      </div>
    </div></div>}

    {showNew&&<div className="modal-backdrop" onClick={()=>setShowNew(false)}><div className="modal" onClick={e=>e.stopPropagation()}>
      <div className="modal-head"><div><span className="eyebrow">New Incident</span><h2>Report Incident</h2></div><button type="button" onClick={()=>setShowNew(false)}>×</button></div>
      <div className="form-grid">
        <label>Item<select required value={newForm.rental_item_id} onChange={e=>setNewForm({...newForm,rental_item_id:e.target.value})}><option value="">Select item...</option>{items.map(i=><option key={i.id} value={i.id}>{i.name} ({i.sku})</option>)}</select></label>
        <label>Type<select value={newForm.incident_type} onChange={e=>setNewForm({...newForm,incident_type:e.target.value})}>{Object.entries(typeLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
        <label>Booking ID (optional)<input type="number" value={newForm.booking_id} onChange={e=>setNewForm({...newForm,booking_id:e.target.value})} placeholder="Link to booking..."/></label>
        <label>Customer (optional)<select value={newForm.customer_id} onChange={e=>setNewForm({...newForm,customer_id:e.target.value})}><option value="">Select customer...</option>{customers.map(c=><option key={c.id} value={c.id}>{c.full_name}</option>)}</select></label>
        <label className="span-2">Description<textarea required value={newForm.description} onChange={e=>setNewForm({...newForm,description:e.target.value})} placeholder="Describe the incident..."/></label>
        <label>Replacement cost<input type="number" min="0" value={newForm.replacement_cost} onChange={e=>setNewForm({...newForm,replacement_cost:e.target.value})}/></label>
        <label>Charge to customer<input type="number" min="0" value={newForm.charge_amount} onChange={e=>setNewForm({...newForm,charge_amount:e.target.value})}/></label>
        <label>Insurance claim<input type="number" min="0" value={newForm.insurance_claim_amount} onChange={e=>setNewForm({...newForm,insurance_claim_amount:e.target.value})}/></label>
      </div>
      <div className="modal-actions"><button className="secondary-button" onClick={()=>setShowNew(false)}>Cancel</button><button className="primary-button" onClick={createIncident}>Report Incident</button></div>
    </div></div>}
  </AdminShell>
}

function Bookings() {
  const navigate=useNavigate();
  const [rows,setRows]=useState([]);
  const [detail,setDetail]=useState(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [search,setSearch]=useState("");
  const [statusFilter,setStatusFilter]=useState("All");
  const [showPaymentModal,setShowPaymentModal]=useState(false);
  const [paymentForm,setPaymentForm]=useState({amount:"",method:"cash",payment_type:"rental",notes:""});
  const [paymentSubmitting,setPaymentSubmitting]=useState(false);
  const [deleteBookingTarget,setDeleteBookingTarget]=useState(null);
  const [deletingBooking,setDeletingBooking]=useState(false);

  const load=()=>api("/admin/bookings").then(d=>setRows(d.bookings||[])).catch(e=>setError(e.message));
  React.useEffect(()=>{load()},[]);
  const open=async(id)=>{setError("");try{setDetail((await api(`/admin/bookings/${id}`)).booking)}catch(e){setError(e.message)}};
  const act=async(path,body={})=>{setBusy(true);setError("");try{await api(path,{method:"PATCH",body:JSON.stringify(body)});if(detail)await open(detail.id);load()}catch(e){setError(e.message)}finally{setBusy(false)}};

  const deleteBooking=async()=>{
    if(!deleteBookingTarget)return;
    setDeletingBooking(true);
    try{
      await api(`/admin/bookings/${deleteBookingTarget.id}`,{method:"DELETE"});
      setDeleteBookingTarget(null);
      setDetail(null);
      load();
    }catch(e){setError(e.message)}
    finally{setDeletingBooking(false)}
  };

  const openPaymentModal=()=>{
    const total=Number(detail?.grand_total||0);
    const paid=(detail?.payments||[]).filter(p=>p.status==="completed").reduce((s,p)=>s+Number(p.amount||0),0);
    const balance=total-paid;
    setPaymentForm({amount:String(balance>0?balance:total),method:"cash",payment_type:"rental",notes:""});
    setShowPaymentModal(true);
  };

  const submitPayment=async()=>{
    if(!paymentForm.amount||Number(paymentForm.amount)<=0)return;
    setPaymentSubmitting(true);
    try{
      await api(`/admin/bookings/${detail.id}/payments`,{method:"POST",body:JSON.stringify({amount:Number(paymentForm.amount),payment_type:paymentForm.payment_type,method:paymentForm.method,notes:paymentForm.notes})});
      setShowPaymentModal(false);
      await open(detail.id);
      load();
    }catch(e){setError(e.message)}
    finally{setPaymentSubmitting(false)}
  };

  const reschedule=async()=>{const start=window.prompt("New start date (YYYY-MM-DD):",String(detail.start_date).slice(0,10));if(!start)return;const end=window.prompt("New end date (YYYY-MM-DD):",String(detail.end_date).slice(0,10));if(!end)return;await act(`/admin/bookings/${detail.id}/reschedule`,{start_date:start,end_date:end})};
  const inspect=async()=>{const condition=window.prompt("Condition after return:","Good");if(!condition)return;const damage=Number(window.prompt("Damage charge:","0")||0);const maintenance=window.confirm("Does this item require maintenance?");try{const r=await api(`/admin/bookings/${detail.id}/return-inspection`,{method:"POST",body:JSON.stringify({condition_after:condition,damage_charge:damage,maintenance_required:maintenance})});if(maintenance){window.alert(`Return recorded. Maintenance records created.`);navigate("/admin/maintenance")}else{window.alert(`Return recorded. Deposit refund: ${peso(Number(r.deposit_refund))}`);await open(detail.id);load()}}catch(e){setError(e.message)}};

  const statuses=["All","pending","confirmed","ready","rented","overdue","returned","completed","cancelled","rejected"];
  const statusCounts=Object.fromEntries(statuses.map(s=>[s,s==="All"?rows.length:rows.filter(b=>b.status===s).length]));
  const filtered=rows.filter(b=>{
    const matchSearch=(b.booking_no||"").toLowerCase().includes(search.toLowerCase())||(b.customer_name||"").toLowerCase().includes(search.toLowerCase());
    const matchStatus=statusFilter==="All"||b.status===statusFilter;
    return matchSearch&&matchStatus;
  });
  const sorts={
    start_date:{label:"Start date",get:b=>Date.parse(b.start_date)||0},
    end_date:{label:"End date",get:b=>Date.parse(b.end_date)||0},
    booking_no:{label:"Booking #",get:b=>b.booking_no||""},
    customer_name:{label:"Customer",get:b=>b.customer_name||""},
    grand_total:{label:"Total",get:b=>Number(b.grand_total)||0},
    status:{label:"Status",get:b=>b.status||""}
  };
  const {sortKey,sortDir,setSort}=useSort("start_date","desc");
  const sorted=sortRows(filtered,sorts,sortKey,sortDir);
  const [view,setView]=useViewMode("bb.view.bookings");

  const stats={
    total:rows.length,
    pending:rows.filter(b=>b.status==="pending").length,
    active:rows.filter(b=>["confirmed","ready","rented"].includes(b.status)).length,
    overdue:rows.filter(b=>b.status==="overdue").length,
    revenue:rows.filter(b=>["completed","returned"].includes(b.status)).reduce((s,b)=>s+Number(b.grand_total||0),0)
  };

  return <AdminShell title="Booking Management" subtitle="Approve, reject, reschedule, collect payment, return and complete rentals.">
    {error&&<div className="login-error">{error}</div>}

    <section className="kpi-grid">
      <Kpi index={0} icon="📋" label="Total bookings" value={stats.total} detail="All time"/>
      <Kpi index={1} icon="⏳" label="Pending" value={stats.pending} detail="Awaiting approval"/>
      <Kpi index={2} icon="🔄" label="Active" value={stats.active} detail="Confirmed / ready / rented"/>
      <Kpi index={3} icon="⚠" pulseIcon label="Overdue" value={stats.overdue} detail="Needs attention"/>
    </section>

    <div className="admin-page-toolbar">
      <div className="admin-search">
        <span>⌕</span>
        <input placeholder="Search by booking # or customer..." value={search} onChange={e=>setSearch(e.target.value)}/>
      </div>
      <div className="booking-filter-group">
        <select className="booking-status-select" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          {statuses.map(s=><option key={s} value={s}>{s==="All"?"All Status":s.charAt(0).toUpperCase()+s.slice(1)} ({statusCounts[s]})</option>)}
        </select>
        <SortControls sorts={sorts} sortKey={sortKey} sortDir={sortDir} setSort={setSort}/>
        <ViewToggle view={view} onChange={setView}/>
      </div>
    </div>

    <section className="admin-card">
      {filtered.length===0?<div className="inventory-empty">
        <span>📭</span>
        <h3>No bookings found</h3>
        <p>{search||statusFilter!=="All"?"Try adjusting your search or filter.":"No bookings have been made yet."}</p>
      </div>:view==="table"?<div className="table-wrap"><table>
        <thead><tr><th>Booking</th><th>Customer</th><th>Items</th><th>Dates</th><th>Payment</th><th>Status</th><th className="num">Total</th><th></th></tr></thead>
        <tbody>{sorted.map(b=><tr key={b.id} className="row-clickable" onClick={()=>open(b.id)}>
          <td><strong>{b.booking_no}</strong></td>
          <td>{b.customer_name}</td>
          <td className="cell-wrap"><small>{b.items||"—"}</small></td>
          <td>{new Date(b.start_date).toLocaleDateString("en-PH",{month:"short",day:"numeric"})} → {new Date(b.end_date).toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"})}</td>
          <td><span className={`status-pill ${b.payment_status==="paid"?"confirmed":b.payment_status==="partial"?"pending":""}`}>{b.payment_status||"unpaid"}</span></td>
          <td><span className={`status-pill ${b.status==="pending"?"pending":b.status==="overdue"?"overdue":b.status==="cancelled"||b.status==="rejected"?"overdue":"confirmed"}`}>{b.status}</span></td>
          <td className="num">{peso(Number(b.grand_total))}</td>
          <td><button className="mini-button" onClick={e=>{e.stopPropagation();open(b.id)}}>Manage →</button></td>
        </tr>)}</tbody>
      </table></div>:<div className="booking-card-grid">
        {sorted.map(b=><article className="booking-card" key={b.id} onClick={()=>open(b.id)}>
          <div className="booking-card-top">
            <div className="booking-card-id">
              <span className="booking-avatar-sm">{b.customer_name.split(" ").map(x=>x[0]).join("").slice(0,2)}</span>
              <div><strong>{b.booking_no}</strong><small>{b.customer_name}</small></div>
            </div>
            <span className={`status-pill ${b.status==="pending"?"pending":b.status==="overdue"?"overdue":b.status==="cancelled"||b.status==="rejected"?"overdue":"confirmed"}`}>{b.status}</span>
          </div>
          <div className="booking-card-body">
            <div className="booking-card-info"><span>📦</span><small>{b.items||"—"}</small></div>
            <div className="booking-card-info"><span>📅</span><small>{new Date(b.start_date).toLocaleDateString("en-PH",{month:"short",day:"numeric"})} → {new Date(b.end_date).toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"})}</small></div>
            <div className={`booking-card-info ${b.payment_status==="paid"?"payment-paid":b.payment_status==="partial"?"payment-partial":""}`}><span>{b.payment_status==="paid"?"✅":b.payment_status==="partial"?"⏳":"💳"}</span><small>{b.payment_status==="paid"?"Paid in full":b.payment_status==="partial"?"Partial payment":b.payment_status||"Unpaid"}</small></div>
          </div>
          <div className="booking-card-footer">
            <span className="booking-card-total">{peso(Number(b.grand_total))}</span>
            <button className="mini-button">Manage →</button>
          </div>
        </article>)}
      </div>}
    </section>

    {detail&&(()=>{
      const totalPaid=(detail.payments||[]).filter(p=>p.status==="completed").reduce((s,p)=>s+Number(p.amount||0),0);
      const grandTotal=Number(detail.grand_total||0);
      const balance=grandTotal-totalPaid;
      const isPaid=balance<=0;
      const isPartial=totalPaid>0&&!isPaid;

      return <div className="modal-backdrop" onClick={()=>setDetail(null)}><div className="modal booking-modal" onClick={e=>e.stopPropagation()}>
      <button className="booking-modal-close" onClick={()=>setDetail(null)}>×</button>
      <div className="booking-modal-header">
        <div className="booking-modal-customer">
          <div className="booking-avatar">{detail.customer_name.split(" ").map(x=>x[0]).join("").slice(0,2)}</div>
          <div><span className="eyebrow">{detail.booking_no}</span><h2>{detail.customer_name}</h2><p>{detail.customer_email} · {detail.customer_phone}</p></div>
        </div>
      </div>

      {isPaid&&<div className="booking-paid-banner"><span className="paid-banner-icon">✓</span><div><strong>Payment Complete</strong><small>Customer has fully paid this booking</small></div></div>}
      {!isPaid&&isPartial&&<div className="booking-partial-banner"><span className="partial-banner-icon">⏳</span><div><strong>Partial Payment</strong><small>{peso(totalPaid)} paid — {peso(balance)} balance remaining</small></div></div>}
      {!isPaid&&!isPartial&&<div className="booking-unpaid-banner"><span className="unpaid-banner-icon">!</span><div><strong>Unpaid</strong><small>{peso(grandTotal)} total amount due</small></div></div>}

      <div className="booking-detail-grid">
        <div className="booking-stat-card"><span className="booking-stat-icon status">📋</span><div><small>Status</small><b>{detail.status}</b></div></div>
        <div className="booking-stat-card"><span className="booking-stat-icon payment">💳</span><div><small>Payment</small><b>{detail.payment_status}</b></div></div>
        <div className="booking-stat-card"><span className="booking-stat-icon dates">📅</span><div><small>Dates</small><b>{new Date(detail.start_date).toLocaleDateString("en-PH",{month:"short",day:"numeric"})} → {new Date(detail.end_date).toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"})}</b></div></div>
        <div className="booking-stat-card"><span className="booking-stat-icon total">💰</span><div><small>Total</small><b>{peso(grandTotal)}</b></div></div>
      </div>

      <div className="booking-modal-section">
        <div className="booking-section-header"><span>💰</span><strong>Payment Summary</strong></div>
        <div className="booking-payment-summary">
          <div className="payment-summary-row"><span>Total Amount</span><strong>{peso(grandTotal)}</strong></div>
          <div className="payment-summary-row"><span>Amount Paid</span><strong className="paid-text">{peso(totalPaid)}</strong></div>
          <div className={`payment-summary-row payment-summary-balance ${isPaid?"fully-paid":""}`}><span>{isPaid?"Status":"Balance Due"}</span><strong>{isPaid?"✓ PAID IN FULL":peso(balance)}</strong></div>
        </div>
      </div>

      <div className="booking-modal-section">
        <div className="booking-section-header"><span>📦</span><strong>Items</strong></div>
        <div className="booking-items-list">{detail.items.map(x=><div className="booking-item-row" key={x.id}><div className="booking-item-info"><strong>{x.item_name}</strong><small>× {x.quantity} · {peso(Number(x.daily_price))}/day</small></div><span className="booking-item-subtotal">{peso(Number(x.daily_price)*x.quantity)}</span></div>)}</div>
      </div>
      <div className="booking-modal-section">
        <div className="booking-section-header"><span>⚡</span><strong>Actions</strong></div>
        <div className="booking-actions">
          {detail.status==="pending"&&<><button className="primary-button" disabled={busy} onClick={()=>act(`/admin/bookings/${detail.id}/status`,{status:"confirmed"})}>✓ Approve</button><button className="secondary-button danger" onClick={()=>act(`/admin/bookings/${detail.id}/status`,{status:"rejected"})}>✕ Reject</button></>}
          {["pending","confirmed","ready"].includes(detail.status)&&<button className="secondary-button" onClick={reschedule}>📅 Reschedule</button>}
          {detail.status==="confirmed"&&<button className="primary-button" onClick={()=>act(`/admin/bookings/${detail.id}/status`,{status:"ready"})}>✓ Mark Ready</button>}
          {detail.status==="ready"&&detail.fulfillment==="pickup"&&<button className="primary-button" onClick={()=>act(`/admin/bookings/${detail.id}/status`,{status:"rented"})}>📦 Record Pickup</button>}
          {["rented","overdue","returned"].includes(detail.status)&&<button className="primary-button" onClick={inspect}>🔍 Record Return</button>}
          {detail.status==="returned"&&detail.inspection&&<button className="primary-button" onClick={()=>api(`/admin/bookings/${detail.id}/complete`,{method:"POST",body:JSON.stringify({})}).then(()=>{open(detail.id);load()}).catch(e=>setError(e.message))}>✓ Complete</button>}
          {!["cancelled","rejected","completed","returned"].includes(detail.status)&&<button className="secondary-button danger" onClick={()=>act(`/admin/bookings/${detail.id}/status`,{status:"cancelled"})}>✕ Cancel</button>}
          <button className="primary-button" onClick={openPaymentModal}>💰 Record Payment</button>
          <button className="danger-button" onClick={()=>setDeleteBookingTarget(detail)}>🗑 Delete Booking</button>
        </div>
      </div>
      <div className="booking-modal-section">
        <div className="booking-section-header"><span>💳</span><strong>Payments</strong></div>
        {detail.payments.length?<div className="booking-payments-list">{detail.payments.map(p=><div className="booking-payment-row" key={p.id}><div className="booking-payment-info"><strong>{peso(Number(p.amount))}</strong><small>{p.payment_type} · {p.method}{p.notes?` · ${p.notes}`:""}</small></div><div className="booking-payment-actions"><span className={`status-pill ${p.status==="completed"?"confirmed":"pending"}`}>{p.status}</span><button className="mini-button" onClick={()=>openInvoice({bookingNo:detail.booking_no,createdAt:p.created_at,customerName:detail.customer_name,customerEmail:detail.customer_email,customerPhone:detail.customer_phone,method:p.method,type:p.payment_type,status:p.status,amount:p.amount,note:p.notes})}>🖨</button></div></div>)}</div>:<div className="booking-empty-state">No payments recorded yet.</div>}
      </div>
      <div className="booking-modal-section">
        <div className="booking-section-header"><span>🕐</span><strong>Status History</strong></div>
        <div className="booking-timeline">{detail.history.map((h,i)=><div className="booking-timeline-item" key={h.id}><div className="booking-timeline-dot"></div><div className="booking-timeline-content"><strong>{h.to_status}</strong><small>{new Date(h.created_at).toLocaleString()}{h.changed_by?` · ${h.changed_by}`:""}</small></div></div>)}</div>
      </div>
    </div></div>})()}

    {showPaymentModal&&detail&&<div className="modal-backdrop" onClick={()=>setShowPaymentModal(false)}><div className="modal payment-modal" onClick={e=>e.stopPropagation()}>
      <button className="booking-modal-close" onClick={()=>setShowPaymentModal(false)}>×</button>
      <div className="payment-modal-header">
        <div className="payment-modal-icon">💰</div>
        <span className="eyebrow">Record Payment</span>
        <h2>{detail.booking_no}</h2>
        <p>{detail.customer_name}</p>
      </div>
      <div className="payment-modal-balance">
        <div className="payment-balance-row"><span>Total amount</span><strong>{peso(Number(detail.grand_total))}</strong></div>
        <div className="payment-balance-row"><span>Already paid</span><strong>{peso((detail.payments||[]).filter(p=>p.status==="completed").reduce((s,p)=>s+Number(p.amount||0),0))}</strong></div>
        <div className="payment-balance-row payment-balance-due"><span>Balance due</span><strong>{peso(Number(detail.grand_total)-(detail.payments||[]).filter(p=>p.status==="completed").reduce((s,p)=>s+Number(p.amount||0),0))}</strong></div>
      </div>
      <div className="payment-modal-form">
        <label className="payment-label">Payment type
          <div className="payment-type-grid">
            {[{id:"rental",icon:"💵",label:"Rental"},{id:"deposit",icon:"🔒",label:"Deposit"},{id:"refund",icon:"↩",label:"Refund"}].map(t=><button type="button" key={t.id} className={`payment-type-btn ${paymentForm.payment_type===t.id?"active":""}`} onClick={()=>setPaymentForm({...paymentForm,payment_type:t.id})}><span>{t.icon}</span><strong>{t.label}</strong></button>)}
          </div>
        </label>
        <label className="payment-label">Payment method
          <div className="payment-method-grid">
            {[{id:"cash",icon:"💵",label:"Cash"},{id:"gcash",icon:"📱",label:"GCash"},{id:"bank_transfer",icon:"🏦",label:"Bank"},{id:"other",icon:"💳",label:"Other"}].map(m=><button type="button" key={m.id} className={`payment-method-btn ${paymentForm.method===m.id?"active":""}`} onClick={()=>setPaymentForm({...paymentForm,method:m.id})}><span>{m.icon}</span><strong>{m.label}</strong></button>)}
          </div>
        </label>
        <label className="payment-label">Amount
          <div className="payment-amount-wrap"><span className="payment-currency">₱</span><input type="number" min="1" value={paymentForm.amount} onChange={e=>setPaymentForm({...paymentForm,amount:e.target.value})} placeholder="0.00" className="payment-amount-input"/></div>
        </label>
        <label className="payment-label">Notes (optional)
          <input type="text" value={paymentForm.notes} onChange={e=>setPaymentForm({...paymentForm,notes:e.target.value})} placeholder="Add a note about this payment..." className="payment-notes-input"/>
        </label>
      </div>
      <div className="payment-modal-footer">
        <button className="secondary-button" onClick={()=>setShowPaymentModal(false)}>Cancel</button>
        <button className="primary-button" disabled={paymentSubmitting||!paymentForm.amount||Number(paymentForm.amount)<=0} onClick={submitPayment}>{paymentSubmitting?"Processing...":`Confirm ${peso(Number(paymentForm.amount||0))}`}</button>
      </div>
    </div></div>}

    {deleteBookingTarget&&<div className="modal-backdrop" onClick={()=>setDeleteBookingTarget(null)}><div className="modal confirm-modal" onClick={e=>e.stopPropagation()}>
      <div className="confirm-modal-icon">🗑</div>
      <h3>Delete Booking</h3>
      <p>Are you sure you want to delete <strong>{deleteBookingTarget.booking_no}</strong>?</p>
      <small>This will permanently remove the booking, all its payments, and status history. This action cannot be undone.</small>
      <div className="confirm-modal-actions">
        <button className="secondary-button" onClick={()=>setDeleteBookingTarget(null)}>Cancel</button>
        <button className="danger-button" disabled={deletingBooking} onClick={deleteBooking}>{deletingBooking?"Deleting...":"Delete Booking"}</button>
      </div>
    </div></div>}
  </AdminShell>
}

function Customers() {
  const [rows,setRows]=useState([]);
  const [error,setError]=useState("");
  const [search,setSearch]=useState("");
  const [statusFilter,setStatusFilter]=useState("All");
  const [detail,setDetail]=useState(null);
  const [renterScore,setRenterScore]=useState(null);

  const load=()=>api("/admin/customers").then(d=>setRows(d.customers||[])).catch(e=>setError(e.message));
  React.useEffect(()=>{load()},[]);
  const toggle=async(c)=>{try{await api(`/admin/customers/${c.id}/status`,{method:"PATCH",body:JSON.stringify({status:c.status==="active"?"blocked":"active"})});if(detail&&detail.id===c.id)setDetail({...c,status:c.status==="active"?"blocked":"active"});load()}catch(e){setError(e.message)}};
  const del=async(c)=>{if(!confirm(`Delete customer "${c.full_name}"? This cannot be undone.`))return;try{await api(`/admin/customers/${c.id}`,{method:"DELETE"});if(detail&&detail.id===c.id)setDetail(null);load()}catch(e){setError(e.message)}};
  const clearAll=async()=>{if(!confirm("Delete ALL customers? This cannot be undone."))return;try{await api("/admin/customers",{method:"DELETE"});setDetail(null);load()}catch(e){setError(e.message)}};

  const loadScore=async(c)=>{
    try{
      const data=await api(`/admin/customers/${c.id}/score`);
      setRenterScore(data);
    }catch(e){setRenterScore(null)}
  };

  const openDetail=async(c)=>{
    setDetail(c);
    setRenterScore(null);
    loadScore(c);
  };

  const filtered=rows.filter(c=>{
    const matchSearch=(c.full_name||"").toLowerCase().includes(search.toLowerCase())||(c.email||"").toLowerCase().includes(search.toLowerCase())||(c.phone||"").includes(search);
    const matchStatus=statusFilter==="All"||c.status===statusFilter;
    return matchSearch&&matchStatus;
  });
  const sorts={
    created_at:{label:"Date joined",get:c=>Date.parse(c.created_at)||0},
    full_name:{label:"Name",get:c=>c.full_name||""},
    email:{label:"Email",get:c=>c.email||""},
    booking_count:{label:"Bookings",get:c=>Number(c.booking_count)||0},
    lifetime_value:{label:"Lifetime value",get:c=>Number(c.lifetime_value)||0},
    last_booking_at:{label:"Last booking",get:c=>Date.parse(c.last_booking_at)||0},
    status:{label:"Status",get:c=>c.status||""}
  };
  const {sortKey,sortDir,setSort}=useSort("created_at","desc");
  const sorted=sortRows(filtered,sorts,sortKey,sortDir);
  const [view,setView]=useViewMode("bb.view.customers");

  const stats={
    total:rows.length,
    active:rows.filter(c=>c.status==="active").length,
    blocked:rows.filter(c=>c.status!=="active").length,
    totalValue:rows.reduce((s,c)=>s+Number(c.lifetime_value||0),0)
  };

  return <AdminShell title="Customer Management" subtitle="Customer profiles, booking activity, status, and lifetime value.">
    {error&&<div className="login-error">{error}</div>}

    <section className="kpi-grid">
      <Kpi index={0} icon="👤" label="Total customers" value={stats.total} detail="All registered"/>
      <Kpi index={1} icon="✓" label="Active" value={stats.active} detail="Allowed to book"/>
      <Kpi index={2} icon="🚫" label="Blocked" value={stats.blocked} detail="Restricted accounts"/>
      <Kpi index={3} icon="💰" label="Total value" value={peso(stats.totalValue)} detail="Lifetime revenue"/>
    </section>

    <div className="admin-page-toolbar">
      <div className="admin-search">
        <span>⌕</span>
        <input placeholder="Search by name, email, or phone..." value={search} onChange={e=>setSearch(e.target.value)}/>
      </div>
      <select className="booking-status-select" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
        <option value="All">All Status ({rows.length})</option>
        <option value="active">Active ({rows.filter(c=>c.status==="active").length})</option>
        <option value="blocked">Blocked ({rows.filter(c=>c.status!=="active").length})</option>
      </select>
      <SortControls sorts={sorts} sortKey={sortKey} sortDir={sortDir} setSort={setSort}/>
      <ViewToggle view={view} onChange={setView}/>
      {rows.length>0&&<button className="danger-button" onClick={clearAll}>Clear All Customers</button>}
    </div>

    <section className="admin-card">
      {filtered.length===0?<div className="inventory-empty">
        <span>👤</span>
        <h3>No customers found</h3>
        <p>{search||statusFilter!=="All"?"Try adjusting your search or filter.":"No customers registered yet."}</p>
      </div>:view==="table"?<div className="table-wrap"><table>
        <thead><tr><th>Customer</th><th>Phone</th><th>City</th><th className="num">Bookings</th><th className="num">Lifetime value</th><th>Last booking</th><th>Status</th><th></th></tr></thead>
        <tbody>{sorted.map(c=><tr key={c.id} className="row-clickable" onClick={()=>openDetail(c)}>
          <td><strong>{c.full_name}</strong><br/><small>{c.email}</small></td>
          <td>{c.phone||"—"}</td>
          <td>{c.city||"—"}</td>
          <td className="num">{c.booking_count||0}</td>
          <td className="num">{peso(Number(c.lifetime_value||0))}</td>
          <td>{c.last_booking_at?new Date(c.last_booking_at).toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"}):"—"}</td>
          <td><span className={`status-pill ${c.status==="active"?"confirmed":"overdue"}`}>{c.status}</span></td>
          <td onClick={e=>e.stopPropagation()}><div className="table-actions">
            <button className="mini-button" onClick={()=>toggle(c)}>{c.status==="active"?"Block":"Unblock"}</button>
            <button className="mini-button danger" onClick={()=>del(c)}>Delete</button>
          </div></td>
        </tr>)}</tbody>
      </table></div>:<div className="customer-card-grid">
        {sorted.map(c=><article className="customer-detail-card" key={c.id} onClick={()=>openDetail(c)}>
          <div className="customer-card-header">
            <div className="customer-avatar-lg">{c.full_name.split(" ").map(x=>x[0]).join("").slice(0,2)}</div>
            <div className="customer-card-title">
              <h3>{c.full_name}</h3>
              <small>{c.email}</small>
            </div>
            <span className={`status-pill ${c.status==="active"?"confirmed":"overdue"}`}>{c.status}</span>
          </div>
          <div className="customer-card-body">
            <div className="customer-card-row"><span>📱</span><small>{c.phone||"No phone"}</small></div>
            <div className="customer-card-row"><span>📍</span><small>{c.city||"No city"}</small></div>
          </div>
          <div className="customer-card-stats">
            <div className="customer-stat-item"><span className="customer-stat-num">{c.booking_count||0}</span><span className="customer-stat-label">Bookings</span></div>
            <div className="customer-stat-divider"></div>
            <div className="customer-stat-item"><span className="customer-stat-num">{peso(Number(c.lifetime_value||0))}</span><span className="customer-stat-label">Revenue</span></div>
          </div>
          <div className="customer-card-footer" onClick={e=>e.stopPropagation()}>
            <button className={c.status==="active"?"danger-button":"secondary-button"} onClick={()=>toggle(c)}>{c.status==="active"?"Block":"Unblock"}</button>
            <button className="danger-button" onClick={()=>del(c)}>Delete</button>
            <button className="secondary-button" onClick={()=>openDetail(c)}>View Details →</button>
          </div>
        </article>)}
      </div>}
    </section>

    {detail&&<div className="modal-backdrop" onClick={()=>setDetail(null)}><div className="modal customer-detail-modal" onClick={e=>e.stopPropagation()}>
      <button className="booking-modal-close" onClick={()=>setDetail(null)}>×</button>
      <div className="customer-detail-header">
        <div className="customer-avatar-xl">{detail.full_name.split(" ").map(x=>x[0]).join("").slice(0,2)}</div>
        <div>
          <span className={`status-pill ${detail.status==="active"?"confirmed":"overdue"}`}>{detail.status}</span>
          <h2>{detail.full_name}</h2>
          <p>{detail.email}</p>
        </div>
      </div>
      <div className="customer-detail-grid">
        <div className="customer-detail-stat"><span className="booking-stat-icon status">📱</span><div><small>Phone</small><b>{detail.phone||"—"}</b></div></div>
        <div className="customer-detail-stat"><span className="booking-stat-icon dates">📍</span><div><small>City</small><b>{detail.city||"—"}</b></div></div>
        <div className="customer-detail-stat"><span className="booking-stat-icon payment">📋</span><div><small>Bookings</small><b>{detail.booking_count||0}</b></div></div>
        <div className="customer-detail-stat"><span className="booking-stat-icon total">💰</span><div><small>Lifetime value</small><b>{peso(Number(detail.lifetime_value||0))}</b></div></div>
      </div>
      {renterScore&&<div className="booking-modal-section">
        <div className="booking-section-header"><span>⭐</span><strong>Reliability Score</strong></div>
        <div className="renter-score-card">
          <div className="renter-score-main">
            <div className={`renter-score-circle score-${renterScore.rating.toLowerCase().replace(" ","-")}`}>
              <span className="renter-score-num">{renterScore.score}</span>
              <span className="renter-score-label">/100</span>
            </div>
            <div className="renter-score-rating">{renterScore.rating}</div>
          </div>
          <div className="renter-score-details">
            <div className="renter-score-row"><span>Total bookings</span><strong>{renterScore.totalBookings}</strong></div>
            <div className="renter-score-row"><span>Completed</span><strong>{renterScore.completedBookings}</strong></div>
            <div className="renter-score-row"><span>Late returns</span><strong className={renterScore.lateReturns>0?"text-warning":""}>{renterScore.lateReturns}</strong></div>
            <div className="renter-score-row"><span>Damage incidents</span><strong className={renterScore.damages>0?"text-danger":""}>{renterScore.damages}</strong></div>
            <div className="renter-score-row"><span>Total spent</span><strong>{peso(Number(renterScore.totalSpent))}</strong></div>
          </div>
        </div>
      </div>}
      {detail.address&&<div className="booking-modal-section">
        <div className="booking-section-header"><span>📍</span><strong>Address</strong></div>
        <div className="customer-address-box">{detail.address}</div>
      </div>}
      <div className="booking-modal-section">
        <div className="booking-section-header"><span>📦</span><strong>Recent Bookings</strong></div>
        {detail.recent_bookings&&detail.recent_bookings.length?detail.recent_bookings.map(b=><div className="customer-booking-row" key={b.id}>
          <div className="customer-booking-info"><strong>{b.booking_no}</strong><small>{new Date(b.start_date).toLocaleDateString("en-PH",{month:"short",day:"numeric"})} → {new Date(b.end_date).toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"})}</small></div>
          <div className="customer-booking-meta"><span className={`status-pill ${b.status==="pending"?"pending":b.status==="overdue"?"overdue":"confirmed"}`}>{b.status}</span><strong>{peso(Number(b.grand_total))}</strong></div>
        </div>):<div className="booking-empty-state">No booking history.</div>}
      </div>
      <div className="booking-modal-section">
        <div className="booking-section-header"><span>⚡</span><strong>Actions</strong></div>
        <div className="booking-actions">
          <button className={detail.status==="active"?"danger-button":"primary-button"} onClick={()=>toggle(detail)}>{detail.status==="active"?"🚫 Block Customer":"✓ Unblock Customer"}</button>
          <button className="danger-button" onClick={()=>del(detail)}>Delete Customer</button>
        </div>
      </div>
    </div></div>}
  </AdminShell>
}

function Payments() {
  const [rows,setRows]=useState([]);
  const [error,setError]=useState("");
  const [search,setSearch]=useState("");
  const [typeFilter,setTypeFilter]=useState("All");
  const [statusFilter,setStatusFilter]=useState("All");
  const [expanded,setExpanded]=useState(null);
  const [deleteTarget,setDeleteTarget]=useState(null);
  const [deleting,setDeleting]=useState(false);

  const load=()=>api("/admin/payments").then(d=>setRows(d.payments||[])).catch(e=>setError(e.message));
  React.useEffect(()=>{load()},[]);

  const deletePayment=async()=>{
    if(!deleteTarget)return;
    setDeleting(true);
    try{
      await api(`/admin/payments/${deleteTarget.id}`,{method:"DELETE"});
      setDeleteTarget(null);
      load();
    }catch(e){setError(e.message)}
    finally{setDeleting(false)}
  };

  const filtered=rows.filter(p=>{
    const matchSearch=(p.booking_no||"").toLowerCase().includes(search.toLowerCase())||(p.customer_name||"").toLowerCase().includes(search.toLowerCase());
    const matchType=typeFilter==="All"||p.payment_type===typeFilter;
    const matchStatus=statusFilter==="All"||p.status===statusFilter;
    return matchSearch&&matchType&&matchStatus;
  });

  const grouped=React.useMemo(()=>{
    const map=new Map();
    filtered.forEach(p=>{
      const key=p.booking_id;
      if(!map.has(key)){
        map.set(key,{booking_id:key,booking_no:p.booking_no,customer_name:p.customer_name,payments:[],totalPaid:0,latestDate:p.created_at,hasPending:false,hasRefund:false,primaryMethod:p.method});
      }
      const g=map.get(key);
      g.payments.push(p);
      if(p.status==="completed"){
        g.totalPaid+=(p.payment_type==="refund"?-1:1)*Number(p.amount);
      }
      if(p.status==="pending")g.hasPending=true;
      if(p.payment_type==="refund")g.hasRefund=true;
      if(new Date(p.created_at)>new Date(g.latestDate))g.latestDate=p.created_at;
      if(p.status==="completed")g.primaryMethod=p.method;
    });
    return Array.from(map.values());
  },[filtered]);

  const sorts={
    latestDate:{label:"Latest activity",get:g=>Date.parse(g.latestDate)||0},
    booking_no:{label:"Booking #",get:g=>g.booking_no||""},
    customer_name:{label:"Customer",get:g=>g.customer_name||""},
    totalPaid:{label:"Amount",get:g=>Number(g.totalPaid)||0},
    count:{label:"# payments",get:g=>g.payments.length}
  };
  const {sortKey,sortDir,setSort}=useSort("latestDate","desc");
  const sortedGroups=sortRows(grouped,sorts,sortKey,sortDir);
  const [view,setView]=useViewMode("bb.view.payments");

  const net=rows.filter(x=>x.status==="completed").reduce((s,x)=>s+(x.payment_type==="refund"?-1:1)*Number(x.amount),0);
  const stats={
    net,
    refunds:rows.filter(x=>x.payment_type==="refund"&&x.status==="completed").reduce((s,x)=>s+Number(x.amount),0),
    completed:rows.filter(x=>x.status==="completed").length,
    pending:rows.filter(x=>x.status==="pending").length
  };

  const printInvoice=(p)=>openInvoice({
    bookingNo:p.booking_no,
    createdAt:p.created_at,
    customerName:p.customer_name,
    method:p.method,
    type:p.payment_type,
    status:p.status,
    amount:p.amount,
    note:p.notes
  });

  return <AdminShell title="Payments" subtitle="Payment, deposit and refund transaction history with invoicing.">
    {error&&<div className="login-error">{error}</div>}

    <section className="kpi-grid">
      <Kpi index={0} icon="💰" label="Net collections" value={peso(stats.net)} detail={`${rows.length} transactions`}/>
      <Kpi index={1} icon="↩" label="Refunds" value={peso(stats.refunds)} detail="Deposit/refund transactions"/>
      <Kpi index={2} icon="✓" label="Completed" value={stats.completed} detail="Valid transactions"/>
      <Kpi index={3} icon="⏳" label="Pending" value={stats.pending} detail="Awaiting confirmation"/>
    </section>

    <div className="admin-page-toolbar">
      <div className="admin-search">
        <span>⌕</span>
        <input placeholder="Search by booking # or customer..." value={search} onChange={e=>setSearch(e.target.value)}/>
      </div>
      <div className="payment-filters">
        <select className="booking-status-select" value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}>
          <option value="All">All Types</option>
          <option value="rental">Rental</option>
          <option value="deposit">Deposit</option>
          <option value="refund">Refund</option>
        </select>
        <select className="booking-status-select" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="All">All Status</option>
          <option value="completed">Completed</option>
          <option value="pending">Pending</option>
          <option value="void">Void</option>
        </select>
        <SortControls sorts={sorts} sortKey={sortKey} sortDir={sortDir} setSort={setSort}/>
        <ViewToggle view={view} onChange={setView}/>
      </div>
    </div>

    <section className="admin-card">
      {grouped.length===0?<div className="inventory-empty">
        <span>💳</span>
        <h3>No payments found</h3>
        <p>{search||typeFilter!=="All"||statusFilter!=="All"?"Try adjusting your filters.":"No payment transactions yet."}</p>
      </div>:view==="table"?<div className="table-wrap"><table>
        <thead><tr><th>Booking</th><th>Customer</th><th className="num">Payments</th><th>Method</th><th>Latest activity</th><th>Status</th><th className="num">Amount</th><th></th></tr></thead>
        <tbody>{sortedGroups.map(g=>[
          <tr key={g.booking_id} className="row-clickable" onClick={()=>setExpanded(expanded===g.booking_id?null:g.booking_id)}>
            <td><strong>{g.booking_no}</strong></td>
            <td>{g.customer_name}</td>
            <td className="num">{g.payments.length}</td>
            <td>{(g.primaryMethod||"cash").replace("_"," ")}</td>
            <td>{new Date(g.latestDate).toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"})}</td>
            <td><span className={`status-pill ${g.hasPending?"pending":"confirmed"}`}>{g.hasPending?"pending":"completed"}</span></td>
            <td className="num">{peso(Number(g.totalPaid))}</td>
            <td onClick={e=>e.stopPropagation()}><div className="table-actions">
              <button className="mini-button" onClick={()=>setExpanded(expanded===g.booking_id?null:g.booking_id)}>{expanded===g.booking_id?"Hide":"Details"}</button>
              <button className="mini-button" onClick={()=>printInvoice(g.payments[0])}>Invoice</button>
            </div></td>
          </tr>,
          expanded===g.booking_id&&<tr key={g.booking_id+"-x"} className="table-subrow"><td colSpan="8">
            {g.payments.map(p=><div className="payment-transaction-row" key={p.id}>
              <div className="payment-tx-info">
                <span className={`status-pill status-tiny ${p.status==="completed"?"confirmed":p.status==="void"?"overdue":"pending"}`}>{p.status}</span>
                <small>{p.payment_type}</small>
                <small>{(p.method||"cash").replace("_"," ")}</small>
                {p.notes&&<small className="payment-tx-note">{p.notes}</small>}
              </div>
              <div className="payment-tx-actions">
                <div className="payment-tx-meta">
                  <strong className={p.payment_type==="refund"?"refund-amount":""}>{p.payment_type==="refund"?"-":"+"}{peso(Number(p.amount))}</strong>
                  <small>{new Date(p.created_at).toLocaleDateString("en-PH",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}</small>
                </div>
                <button className="tx-delete-btn" title="Delete payment" onClick={()=>setDeleteTarget(p)}>🗑</button>
              </div>
            </div>)}
          </td></tr>
        ])}</tbody>
      </table></div>:<div className="payment-card-grid">
        {sortedGroups.map(g=><article className={`payment-card ${expanded===g.booking_id?"payment-card-expanded":""}`} key={g.booking_id}>
          <div className="payment-card-top" onClick={()=>setExpanded(expanded===g.booking_id?null:g.booking_id)}>
            <div className="payment-card-icon-wrap">
              <span className="payment-card-icon">{g.hasRefund?"↩":g.payments[0]?.payment_type==="deposit"?"🔒":"💵"}</span>
            </div>
            <div className="payment-card-info">
              <strong>{g.booking_no}</strong>
              <small>{g.customer_name}</small>
            </div>
            <div className="payment-card-amount">
              <strong>{peso(Number(g.totalPaid))}</strong>
              <span className={`status-pill ${g.hasPending?"pending":"confirmed"}`}>{g.hasPending?"pending":"completed"}</span>
            </div>
          </div>
          <div className="payment-card-body">
            <div className="payment-card-detail"><span>📋</span><small>{g.payments.length} payment{g.payments.length>1?"s":""}</small></div>
            <div className="payment-card-detail"><span>💳</span><small>Method: {(g.primaryMethod||"cash").replace("_"," ")}</small></div>
            <div className="payment-card-detail"><span>📅</span><small>{new Date(g.latestDate).toLocaleDateString("en-PH",{year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}</small></div>
          </div>
          {expanded===g.booking_id&&<div className="payment-card-transactions">
            {g.payments.map(p=><div className="payment-transaction-row" key={p.id}>
              <div className="payment-tx-info">
                <span className={`status-pill status-tiny ${p.status==="completed"?"confirmed":p.status==="void"?"overdue":"pending"}`}>{p.status}</span>
                <small>{p.payment_type}</small>
                <small>{(p.method||"cash").replace("_"," ")}</small>
                {p.notes&&<small className="payment-tx-note">{p.notes}</small>}
              </div>
              <div className="payment-tx-actions">
                <div className="payment-tx-meta">
                  <strong className={p.payment_type==="refund"?"refund-amount":""}>{p.payment_type==="refund"?"-":"+"}{peso(Number(p.amount))}</strong>
                  <small>{new Date(p.created_at).toLocaleDateString("en-PH",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}</small>
                </div>
                <button className="tx-delete-btn" title="Delete payment" onClick={()=>setDeleteTarget(p)}>🗑</button>
              </div>
            </div>)}
          </div>}
          <div className="payment-card-footer">
            <button className="secondary-button" onClick={()=>setExpanded(expanded===g.booking_id?null:g.booking_id)}>{expanded===g.booking_id?"Hide Details":"View Details"}</button>
            <button className="secondary-button" onClick={()=>printInvoice(g.payments[0])}>🖨 Print Invoice</button>
          </div>
        </article>)}
      </div>}
    </section>

    {deleteTarget&&<div className="modal-backdrop" onClick={()=>setDeleteTarget(null)}><div className="modal confirm-modal" onClick={e=>e.stopPropagation()}>
      <div className="confirm-modal-icon">🗑</div>
      <h3>Delete Payment</h3>
      <p>Are you sure you want to delete this <strong>{deleteTarget.payment_type}</strong> payment of <strong>{peso(Number(deleteTarget.amount))}</strong>?</p>
      <small>This action cannot be undone.</small>
      <div className="confirm-modal-actions">
        <button className="secondary-button" onClick={()=>setDeleteTarget(null)}>Cancel</button>
        <button className="danger-button" disabled={deleting} onClick={deletePayment}>{deleting?"Deleting...":"Delete Payment"}</button>
      </div>
    </div></div>}
  </AdminShell>
}

function formatReportCurrency(value, currency="PHP") {
  try {
    return new Intl.NumberFormat("en-PH", { style:"currency", currency, maximumFractionDigits:0 }).format(Number(value || 0));
  } catch {
    return peso(Number(value || 0));
  }
}

function changeLabel(value, suffix="vs last month") {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "No previous-period data";
  const n = Number(value);
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}% ${suffix}`;
}

function AnimatedRevenueChart({ data=[], currency="PHP" }) {
  const [hovered,setHovered] = useState(null);
  const reduceMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const width=760, height=260, pad={l:54,r:18,t:18,b:42};
  const values=data.map(x=>Number(x.revenue||0));
  const max=Math.max(0,...values);
  const yMax=max>0 ? max*1.12 : 1;
  const innerW=width-pad.l-pad.r, innerH=height-pad.t-pad.b;
  const points=data.map((d,i)=>({
    ...d,
    x: pad.l + (data.length<=1?0:(i/(data.length-1))*innerW),
    y: pad.t + innerH - (Number(d.revenue||0)/yMax)*innerH
  }));
  const linePath=points.length?`M ${points.map(p=>`${p.x} ${p.y}`).join(" L ")}`:"";
  const areaPath=points.length?`${linePath} L ${points[points.length-1].x} ${pad.t+innerH} L ${points[0].x} ${pad.t+innerH} Z`:"";
  const grid=[0,.25,.5,.75,1];
  const noRevenue=max===0;

  return <div className="revenue-chart-wrap" aria-label="Revenue for the last 12 months">
    <svg className="revenue-line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-describedby="revenue-chart-desc">
      <defs>
        <linearGradient id="revenueAreaGradient" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity=".28"/>
          <stop offset="100%" stopColor="currentColor" stopOpacity=".02"/>
        </linearGradient>
      </defs>
      {grid.map((g,i)=>{
        const y=pad.t+innerH-(g*innerH);
        const val=yMax*g;
        return <g key={i}><line className="chart-grid-line" x1={pad.l} x2={width-pad.r} y1={y} y2={y}/><text className="chart-y-label" x={pad.l-9} y={y+4} textAnchor="end">{val===0?"0":new Intl.NumberFormat("en",{notation:"compact",maximumFractionDigits:1}).format(val)}</text></g>
      })}
      {areaPath && <path className={`revenue-area ${reduceMotion?"no-motion":""}`} d={areaPath} fill="url(#revenueAreaGradient)"/>}
      {linePath && <path className={`revenue-line ${reduceMotion?"no-motion":""}`} d={linePath} pathLength="1"/>}
      {points.map((p,i)=><g key={p.month}>
        <text className="chart-x-label" x={p.x} y={height-14} textAnchor="middle">{p.label}</text>
        <circle className={`revenue-hit ${hovered===i?"active":""}`} cx={p.x} cy={p.y} r="14" onMouseEnter={()=>setHovered(i)} onMouseLeave={()=>setHovered(null)} onFocus={()=>setHovered(i)} onBlur={()=>setHovered(null)} tabIndex="0" aria-label={`${p.full_label}: ${formatReportCurrency(p.revenue,currency)}`}/>
        <circle className={`revenue-dot ${hovered===i?"active":""}`} cx={p.x} cy={p.y} r={hovered===i?5:3}/>
      </g>)}
    </svg>
    <span id="revenue-chart-desc" className="sr-only">{data.map(x=>`${x.full_label}: ${formatReportCurrency(x.revenue,currency)}`).join("; ")}</span>
    {hovered!==null && points[hovered] && <div className="revenue-tooltip" style={{left:`${(points[hovered].x/width)*100}%`,top:`${(points[hovered].y/height)*100}%`}}><strong>{points[hovered].full_label}</strong><span>{formatReportCurrency(points[hovered].revenue,currency)}</span></div>}
    {noRevenue && <div className="chart-empty-message">No revenue recorded for this period</div>}
  </div>
}

function Reports() {
  const [report,setReport]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [updatedAt,setUpdatedAt]=useState(null);

  const load=async({silent=false}={})=>{
    if(!silent) setLoading(true);
    try {
      const data=await api("/admin/reports");
      setReport(data); setError(""); setUpdatedAt(new Date());
    } catch(e) { setError(e.message || "Unable to load report data."); }
    finally { if(!silent) setLoading(false); }
  };

  React.useEffect(()=>{
    load();
    const timer=setInterval(()=>load({silent:true}),60000);
    return ()=>clearInterval(timer);
  },[]);

  const summary=report?.summary || {};
  const currency=report?.currency || "PHP";
  const top=summary.top_item;

  return <AdminShell title="Reports" subtitle="Revenue, rental performance, utilization, and overdue insights.">
    {error&&<div className="login-error">Unable to load report data: {error}</div>}
    {loading&&!report ? <section className="admin-card report-loading">Loading report data...</section> : <>
      <section className="kpi-grid">
        <Kpi icon="↗" label="Monthly revenue" value={formatReportCurrency(summary.monthly_revenue,currency)} detail={changeLabel(summary.monthly_revenue_change)}/>
        <Kpi icon="▦" label="Total rentals" value={Number(summary.total_rentals||0)} detail={changeLabel(summary.rental_change)}/>
        <Kpi icon="★" label="Top item" value={top?.item_name || "No data"} detail={`${Number(top?.rented_quantity||0)} rented units`}/>
        <Kpi icon="%" label="Utilization" value={`${Number(summary.utilization||0).toFixed(1)}%`} detail={`${Number(summary.currently_rented_units||0)} of ${Number(summary.total_rentable_units||0)} units rented`}/>
      </section>
      <div className="dashboard-grid reports-grid">
        <section className="admin-card stat-card revenue-report-card">
          <div className="card-heading report-chart-heading"><div><span>Revenue trend</span><h2>Last 12 months</h2></div><div className="report-updated"><span>{updatedAt?"Updated just now":"Waiting for data"}</span><button className="report-refresh" onClick={()=>load()} disabled={loading}>{loading?"Refreshing…":"Refresh"}</button></div></div>
          <AnimatedRevenueChart data={report?.revenue_trend||[]} currency={currency}/>
        </section>
        <section className="admin-card">
          <div className="card-heading"><div><span>Most rented</span><h2>Top-performing items</h2></div></div>
          {(report?.top_items||[]).length ? report.top_items.map((x,i)=><div className="rank-row" key={x.rental_item_id || `${x.item_name}-${i}`}><span>{String(i+1).padStart(2,"0")}</span>{x.image_url?<img src={x.image_url} alt=""/>:<div className="rank-image-placeholder">B</div>}<div><strong>{x.item_name}</strong><small>{x.category}</small></div><b>{Number(x.rented_quantity||0)} rented</b></div>) : <div className="reports-empty">No rental activity yet.</div>}
        </section>
      </div>
    </>}
  </AdminShell>
}


function AccessManagement() {
  const [users,setUsers] = useState([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [modal,setModal] = useState(false);
  const [form,setForm] = useState({full_name:"",email:"",phone:"",role:"admin",password:"[removed-demo-credential]"});
  const [search,setSearch] = useState("");
  const [roleFilter,setRoleFilter] = useState("All");
  const [statusFilter,setStatusFilter] = useState("All");

  const load = async () => {
    setLoading(true);
    try { setUsers((await api("/users")).users || []); setError(""); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  React.useEffect(()=>{ load(); },[]);

  const create = async (e) => {
    e.preventDefault();
    try {
      await api("/users",{method:"POST",body:JSON.stringify(form)});
      setModal(false);
      setForm({full_name:"",email:"",phone:"",role:"admin",password:"[removed-demo-credential]"});
      await load();
    } catch(e){ setError(e.message); }
  };

  const toggleStatus = async (u) => {
    try {
      await api(`/users/${u.id}/status`,{
        method:"PATCH",
        body:JSON.stringify({status:u.status==="active"?"disabled":"active"})
      });
      await load();
    } catch(e){ setError(e.message); }
  };

  const resetPassword = async (u) => {
    const next = window.prompt(`New password for ${u.full_name}:`, "ChangeMe123!");
    if(!next) return;
    try {
      await api(`/users/${u.id}/reset-password`,{method:"PATCH",body:JSON.stringify({password:next})});
      window.alert("Password reset successfully.");
    } catch(e){ setError(e.message); }
  };

  const roles=["All",...Array.from(new Set(users.map(u=>u.role).filter(Boolean)))];
  const filtered=users.filter(u=>{
    const q=search.toLowerCase();
    const matchSearch=!q||[u.full_name,u.email,u.phone].some(v=>String(v||"").toLowerCase().includes(q));
    const matchRole=roleFilter==="All"||u.role===roleFilter;
    const matchStatus=statusFilter==="All"||u.status===statusFilter;
    return matchSearch&&matchRole&&matchStatus;
  });
  const sorts={
    full_name:{label:"User",get:u=>u.full_name||""},
    email:{label:"Email",get:u=>u.email||""},
    role:{label:"Role",get:u=>u.role||""},
    status:{label:"Status",get:u=>u.status||""},
    last_login_at:{label:"Last login",get:u=>Date.parse(u.last_login_at)||0},
    created_at:{label:"Date added",get:u=>Date.parse(u.created_at)||0}
  };
  const {sortKey,sortDir,setSort}=useSort("full_name","asc");
  const sorted=sortRows(filtered,sorts,sortKey,sortDir);

  return <AdminShell title="Access Management" subtitle="Manage Admin accounts, status, roles, and access security.">
    <section className="kpi-grid">
      <Kpi icon="♜" label="Total staff" value={users.length} detail="Admin accounts"/>
      <Kpi icon="✓" label="Active accounts" value={users.filter(x=>x.status==="active").length} detail="Allowed to sign in"/>
      <Kpi icon="A" label="Admins" value={users.filter(x=>x.role==="admin").length} detail="Full system access"/>
    </section>

    <div className="admin-page-toolbar">
      <div className="admin-search"><span>⌕</span><input placeholder="Search by name, email, or phone..." value={search} onChange={e=>setSearch(e.target.value)}/></div>
      <div className="payment-filters">
        <select className="booking-status-select" value={roleFilter} onChange={e=>setRoleFilter(e.target.value)}>
          {roles.map(r=><option key={r} value={r}>{r==="All"?"All roles":r}</option>)}
        </select>
        <select className="booking-status-select" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          <option value="All">All statuses</option>
          <option value="active">Active</option>
          <option value="disabled">Disabled</option>
        </select>
        <SortControls sorts={sorts} sortKey={sortKey} sortDir={sortDir} setSort={setSort}/>
        <button className="primary-button" onClick={()=>setModal(true)}>+ Add account</button>
      </div>
    </div>

    {error && <div className="login-error">{error}</div>}

    <section className="admin-card">
      {loading ? <p>Loading accounts...</p> :
      <div className="table-wrap"><table>
        <thead><tr><th>User</th><th>Email</th><th>Phone</th><th>Role</th><th>Status</th><th>Last login</th><th>Actions</th></tr></thead>
        <tbody>{sorted.map(u=><tr key={u.id}>
          <td><strong>{u.full_name}</strong></td>
          <td>{u.email}</td>
          <td>{u.phone || "—"}</td>
          <td><span className={`role-pill ${u.role}`}>{u.role}</span></td>
          <td><span className={`status-pill ${u.status==="active"?"confirmed":"overdue"}`}>{u.status}</span></td>
          <td>{u.last_login_at ? new Date(u.last_login_at).toLocaleString() : "Never"}</td>
          <td><div className="access-actions">
            <button className="mini-button" onClick={()=>resetPassword(u)}>Reset password</button>
            <button className="secondary-button small" onClick={()=>toggleStatus(u)}>{u.status==="active"?"Disable":"Enable"}</button>
          </div></td>
        </tr>)}{sorted.length===0&&<tr><td colSpan="7" className="muted" style={{textAlign:"center",padding:"24px"}}>No accounts match your filters.</td></tr>}</tbody>
      </table></div>}
    </section>

    <section className="admin-card access-policy-card">
      <div className="card-heading"><div><span>Permissions</span><h2>Role access policy</h2></div></div>
      <div className="permission-grid">
        <div><strong>Admin</strong><span>Dashboard</span><span>Inventory</span><span>Bookings</span><span>Customers</span><span>Payments</span><span>Reports</span><span>Access Management</span><span>Settings</span></div>
      </div>
    </section>

    {modal && <div className="modal-backdrop" onClick={()=>setModal(false)}><form className="modal" onSubmit={create} onClick={e=>e.stopPropagation()}>
      <div className="modal-head"><div><span className="eyebrow">Staff access</span><h2>Create account</h2></div><button type="button" onClick={()=>setModal(false)}>×</button></div>
      <div className="form-grid">
        <label>Full name<input required value={form.full_name} onChange={e=>setForm({...form,full_name:e.target.value})}/></label>
        <label>Email<input type="email" required value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label>
        <label>Phone<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label>
        <label>Role<select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}><option value="admin">Admin</option></select></label>
        <label className="span-2">Temporary password<input required minLength="8" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/></label>
      </div>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={()=>setModal(false)}>Cancel</button><button className="primary-button">Create account</button></div>
    </form></div>}
  </AdminShell>
}

function Maintenance() {
  const [rows,setRows]=useState([]); const [error,setError]=useState("");
  const [search,setSearch]=useState(""); const [statusFilter,setStatusFilter]=useState("All");
  const load=()=>api("/admin/maintenance").then(d=>setRows(d.records||[])).catch(e=>setError(e.message));
  React.useEffect(()=>{load()},[]);
  const update=async(r,status)=>{try{await api(`/admin/maintenance/${r.id}`,{method:"PATCH",body:JSON.stringify({status,cost:r.cost||0,notes:r.notes||""})});load()}catch(e){setError(e.message)}};
  const statuses=["All",...Array.from(new Set(rows.map(r=>r.status).filter(Boolean)))];
  const filtered=rows.filter(r=>{
    const q=search.toLowerCase();
    const matchSearch=!q||[r.item_name,r.sku,r.booking_no,r.reason].some(v=>String(v||"").toLowerCase().includes(q));
    const matchStatus=statusFilter==="All"||r.status===statusFilter;
    return matchSearch&&matchStatus;
  });
  const sorts={
    opened_at:{label:"Opened",get:r=>Date.parse(r.opened_at)||0},
    item_name:{label:"Item",get:r=>r.item_name||""},
    booking_no:{label:"Booking",get:r=>r.booking_no||""},
    reason:{label:"Reason",get:r=>r.reason||""},
    status:{label:"Status",get:r=>r.status||""}
  };
  const {sortKey,sortDir,setSort}=useSort("opened_at","desc");
  const sorted=sortRows(filtered,sorts,sortKey,sortDir);
  return <AdminShell title="Maintenance" subtitle="Items flagged during returns remain unavailable until maintenance is completed.">
    {error&&<div className="login-error">{error}</div>}
    <div className="admin-page-toolbar">
      <div className="admin-search"><span>⌕</span><input placeholder="Search by item, SKU, booking, or reason..." value={search} onChange={e=>setSearch(e.target.value)}/></div>
      <div className="payment-filters">
        <select className="booking-status-select" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
          {statuses.map(s=><option key={s} value={s}>{s==="All"?"All statuses":String(s).replace("_"," ")}</option>)}
        </select>
        <SortControls sorts={sorts} sortKey={sortKey} sortDir={sortDir} setSort={setSort}/>
      </div>
    </div>
    <section className="admin-card"><div className="table-wrap"><table><thead><tr><th>Item</th><th>Booking</th><th>Reason</th><th>Opened</th><th>Status</th><th>Action</th></tr></thead><tbody>{sorted.map(r=><tr key={r.id}><td><strong>{r.item_name}</strong><br/><small>{r.sku}</small></td><td>{r.booking_no||"—"}</td><td>{r.reason}</td><td>{new Date(r.opened_at).toLocaleString()}</td><td><span className={`status-pill ${r.status==="completed"?"completed":r.status==="in_progress"?"ready":"pending"}`}>{r.status}</span></td><td>{r.status!=="completed"&&<><button className="mini-button" onClick={()=>update(r,"in_progress")}>In progress</button> <button className="mini-button" onClick={()=>update(r,"completed")}>Complete</button></>}</td></tr>)}{sorted.length===0&&<tr><td colSpan="6" className="muted" style={{textAlign:"center",padding:"24px"}}>No maintenance records found.</td></tr>}</tbody></table></div></section>
  </AdminShell>
}

function Settings() {
  const [form,setForm]=useState({}); const [saved,setSaved]=useState(false); const [error,setError]=useState("");
  React.useEffect(()=>{api("/admin/settings").then(d=>setForm(d.settings||{})).catch(e=>setError(e.message))},[]);
  const save=async(e)=>{e.preventDefault();try{await api("/admin/settings",{method:"PUT",body:JSON.stringify(form)});setSaved(true);setTimeout(()=>setSaved(false),2000)}catch(e){setError(e.message)}};
  return <AdminShell title="Settings" subtitle="Business information, fees, policies, and notification configuration.">{error&&<div className="login-error">{error}</div>}<form className="admin-card settings-form" onSubmit={save}><div className="form-grid">
    <label>Business name<input value={form.business_name||""} onChange={e=>setForm({...form,business_name:e.target.value})}/></label><label>Currency<input value={form.currency||"PHP"} onChange={e=>setForm({...form,currency:e.target.value})}/></label>
    <label>Email<input value={form.business_email||""} onChange={e=>setForm({...form,business_email:e.target.value})}/></label><label>Phone<input value={form.business_phone||""} onChange={e=>setForm({...form,business_phone:e.target.value})}/></label>
    <label className="span-2">Address<input value={form.business_address||""} onChange={e=>setForm({...form,business_address:e.target.value})}/></label>
    <label>Delivery fee<input type="number" value={form.delivery_fee||0} onChange={e=>setForm({...form,delivery_fee:e.target.value})}/></label><label>Late fee / day<input type="number" value={form.late_fee_per_day||0} onChange={e=>setForm({...form,late_fee_per_day:e.target.value})}/></label>
    <label className="span-2">Cancellation policy<textarea value={form.cancellation_policy||""} onChange={e=>setForm({...form,cancellation_policy:e.target.value})}/></label>
  </div><button className="primary-button">{saved?"Saved ✓":"Save settings"}</button></form></AdminShell>
}

function AdminRoutes() {
  return <Routes>
    <Route path="/access/login" element={<AccessLogin/>}/>
    <Route path="/admin/login" element={<Navigate to="/access/login" replace/>}/>
    <Route path="/admin" element={<ProtectedRoute roles={["admin"]}><AdminDashboard/></ProtectedRoute>}/>
    <Route path="/admin/inventory" element={<ProtectedRoute roles={["admin"]}><Inventory/></ProtectedRoute>}/>
    <Route path="/admin/bookings" element={<ProtectedRoute roles={["admin"]}><Bookings/></ProtectedRoute>}/>
    <Route path="/admin/customers" element={<ProtectedRoute roles={["admin"]}><Customers/></ProtectedRoute>}/>
    <Route path="/admin/payments" element={<ProtectedRoute roles={["admin"]}><Payments/></ProtectedRoute>}/>
    <Route path="/admin/incidents" element={<ProtectedRoute roles={["admin"]}><Incidents/></ProtectedRoute>}/>
    <Route path="/admin/reports" element={<ProtectedRoute roles={["admin"]}><Reports/></ProtectedRoute>}/>
    <Route path="/admin/maintenance" element={<ProtectedRoute roles={["admin"]}><Maintenance/></ProtectedRoute>}/>
    <Route path="/admin/access" element={<ProtectedRoute roles={["admin"]}><AccessManagement/></ProtectedRoute>}/>
    <Route path="/admin/settings" element={<ProtectedRoute roles={["admin"]}><Settings/></ProtectedRoute>}/>
    <Route path="/admin/account-settings" element={<ProtectedRoute roles={["admin"]}><AccountSettings/></ProtectedRoute>}/>
  </Routes>
}

export default function App() {
  const [cart,setCart] = useState([]);
  const add = item => setCart(prev => {
    const exists = prev.find(x=>x.id===item.id);
    return exists ? prev.map(x=>x.id===item.id ? {...x,qty:Math.min(x.stock||Infinity,x.qty+1)}:x) : [...prev,{...item,qty:1}];
  });
  const updateQty = (id,delta) => setCart(prev=>prev.map(x=>x.id===id?{...x,qty:Math.max(1,Math.min(x.stock||Infinity,x.qty+delta))}:x));
  const removeItem = id => setCart(prev=>prev.filter(x=>x.id!==id));
  const clearCart = ()=>setCart([]);
  const isAdmin = window.location.pathname.startsWith("/admin") || window.location.pathname.startsWith("/access");

  return isAdmin
    ? <AdminRoutes/>
    : <CustomerSite cart={cart} onAdd={add} updateQty={updateQty} removeItem={removeItem} clearCart={clearCart}/>;
}