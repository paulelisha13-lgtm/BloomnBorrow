import React, { Suspense, lazy } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { CartProvider } from "./context/CartContext";
import { InteractionFeedback } from "./components/InteractionFeedback";

// Each page is its own chunk, downloaded the first time it is opened, so a
// shop visitor never downloads the admin screens (and vice versa).
const page = (load, name) => lazy(() => load().then(m => ({ default: m[name] })));
const AccessManagement = page(() => import("./pages/AccessManagement"), "AccessManagement");
const AccountSettings = page(() => import("./pages/AccountSettings"), "AccountSettings");
const AddBooking = page(() => import("./pages/AddBooking"), "AddBooking");
const AuditLog = page(() => import("./pages/AuditLog"), "AuditLog");
const Bookings = page(() => import("./pages/Bookings"), "Bookings");
const Calendar = page(() => import("./pages/Calendar"), "Calendar");
const Customers = page(() => import("./pages/Customers"), "Customers");
const AdminDashboard = page(() => import("./pages/Dashboard"), "AdminDashboard");
const Expenses = page(() => import("./pages/Expenses"), "Expenses");
const Inventory = page(() => import("./pages/Inventory"), "Inventory");
const AccessLogin = page(() => import("./pages/Login"), "AccessLogin");
const Maintenance = page(() => import("./pages/Maintenance"), "Maintenance");
const Payments = page(() => import("./pages/Payments"), "Payments");
const ProfitLoss = page(() => import("./pages/ProfitLoss"), "ProfitLoss");
const Reports = page(() => import("./pages/Reports"), "Reports");
const Settings = page(() => import("./pages/Settings"), "Settings");
const CustomerHome = page(() => import("./pages/customer/Home"), "CustomerHome");
const CustomerCatalog = page(() => import("./pages/customer/Catalog"), "CustomerCatalog");
const CustomerItemDetail = page(() => import("./pages/customer/ItemDetail"), "CustomerItemDetail");
const CustomerCart = page(() => import("./pages/customer/Cart"), "CustomerCart");
const CustomerRentalForm = page(() => import("./pages/customer/RentalForm"), "CustomerRentalForm");
const CustomerBookingStatus = page(() => import("./pages/customer/BookingStatus"), "CustomerBookingStatus");
const CustomerPrivacyPolicy = page(() => import("./pages/customer/Policies"), "CustomerPrivacyPolicy");
const CustomerRentalTerms = page(() => import("./pages/customer/Policies"), "CustomerRentalTerms");

const pageFallback = <div className="customer-page-loading" role="status" aria-live="polite" aria-label="Loading page"><div className="customer-page-loading-dots" aria-hidden="true"><span/><span/><span/></div></div>;

function AdminRoutes({ location }) {
  return <Routes location={location}>
    <Route path="/access/login" element={<AccessLogin/>}/>
    <Route path="/admin/login" element={<Navigate to="/access/login" replace/>}/>
    <Route path="/shop" element={<CustomerHome/>}/>
    <Route path="/shop/browse" element={<CustomerCatalog/>}/>
    <Route path="/shop/cart" element={<CustomerCart/>}/>
    <Route path="/shop/checkout" element={<CustomerRentalForm/>}/>
    <Route path="/shop/status" element={<CustomerBookingStatus/>}/>
    <Route path="/shop/terms" element={<CustomerRentalTerms/>}/>
    <Route path="/shop/privacy" element={<CustomerPrivacyPolicy/>}/>
    <Route path="/shop/:id" element={<CustomerItemDetail/>}/>
    <Route path="/admin" element={<ProtectedRoute roles={["admin","manager","staff"]}><AdminDashboard/></ProtectedRoute>}/>
    <Route path="/admin/inventory" element={<ProtectedRoute roles={["admin","manager","staff"]}><Inventory/></ProtectedRoute>}/>
    <Route path="/admin/bookings" element={<ProtectedRoute roles={["admin","manager","staff"]}><Bookings/></ProtectedRoute>}/>
    <Route path="/admin/bookings/new" element={<ProtectedRoute roles={["admin","manager","staff"]}><AddBooking/></ProtectedRoute>}/>
    <Route path="/admin/customers" element={<ProtectedRoute roles={["admin","manager","staff"]}><Customers/></ProtectedRoute>}/>
    <Route path="/admin/payments" element={<ProtectedRoute roles={["admin","manager","staff"]}><Payments/></ProtectedRoute>}/>
    <Route path="/admin/calendar" element={<ProtectedRoute roles={["admin","manager","staff"]}><Calendar/></ProtectedRoute>}/>
    <Route path="/admin/reports" element={<ProtectedRoute roles={["admin","manager"]}><Reports/></ProtectedRoute>}/>
    <Route path="/admin/finance" element={<Navigate to="/admin/finance/expenses" replace/>}/>
    <Route path="/admin/finance/expenses" element={<ProtectedRoute roles={["admin","manager"]}><Expenses/></ProtectedRoute>}/>
    <Route path="/admin/finance/profit-loss" element={<ProtectedRoute roles={["admin","manager"]}><ProfitLoss/></ProtectedRoute>}/>
    <Route path="/admin/maintenance" element={<ProtectedRoute roles={["admin","manager","staff"]}><Maintenance/></ProtectedRoute>}/>
    <Route path="/admin/access" element={<ProtectedRoute roles={["admin"]}><AccessManagement/></ProtectedRoute>}/>
    <Route path="/admin/audit" element={<ProtectedRoute roles={["admin"]}><AuditLog/></ProtectedRoute>}/>
    <Route path="/admin/settings" element={<ProtectedRoute roles={["admin","manager"]}><Settings/></ProtectedRoute>}/>
    <Route path="/admin/account-settings" element={<ProtectedRoute roles={["admin","manager","staff"]}><AccountSettings/></ProtectedRoute>}/>
    <Route path="*" element={<Navigate to="/admin" replace/>}/>
  </Routes>
}

// /shop/* is the public Customer Side (home, browse, request a rental, check status) --
// everything else stays admin/staff-only, and unknown paths fall back to the
// dashboard (or login if signed out).
//
// Item detail opens as a popup over Browse/Home: when navigation carries a
// backgroundLocation (set by the page that opened it), the real page keeps
// rendering underneath and only the modal route renders on top -- the
// standard react-router "background location" pattern. A direct link or a
// refresh has no backgroundLocation, so it falls through to the normal full
// route instead.
export default function App() {
  const location = useLocation();
  const backgroundLocation = location.state?.backgroundLocation;
  return <CartProvider>
    <InteractionFeedback/>
    <Suspense fallback={pageFallback}>
      <AdminRoutes location={backgroundLocation || location}/>
    </Suspense>
    {backgroundLocation && <Suspense fallback={pageFallback}><Routes>
      <Route path="/shop/:id" element={<CustomerItemDetail/>}/>
    </Routes></Suspense>}
  </CartProvider>;
}
