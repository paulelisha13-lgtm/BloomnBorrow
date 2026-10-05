import React from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AccessManagement } from "./pages/AccessManagement";
import { AccountSettings } from "./pages/AccountSettings";
import { AddBooking } from "./pages/AddBooking";
import { AuditLog } from "./pages/AuditLog";
import { Bookings } from "./pages/Bookings";
import { Calendar } from "./pages/Calendar";
import { Customers } from "./pages/Customers";
import { AdminDashboard } from "./pages/Dashboard";
import { Inventory } from "./pages/Inventory";
import { AccessLogin } from "./pages/Login";
import { Maintenance } from "./pages/Maintenance";
import { Payments } from "./pages/Payments";
import { Reports } from "./pages/Reports";
import { Settings } from "./pages/Settings";
import { CustomerHome } from "./pages/customer/Home";
import { CustomerCatalog } from "./pages/customer/Catalog";
import { CustomerItemDetail } from "./pages/customer/ItemDetail";
import { CustomerCart } from "./pages/customer/Cart";
import { CustomerRentalForm } from "./pages/customer/RentalForm";
import { CustomerBookingStatus } from "./pages/customer/BookingStatus";
import { CartProvider } from "./context/CartContext";
import { InteractionFeedback } from "./components/InteractionFeedback";

function AdminRoutes({ location }) {
  return <Routes location={location}>
    <Route path="/access/login" element={<AccessLogin/>}/>
    <Route path="/admin/login" element={<Navigate to="/access/login" replace/>}/>
    <Route path="/shop" element={<CustomerHome/>}/>
    <Route path="/shop/browse" element={<CustomerCatalog/>}/>
    <Route path="/shop/cart" element={<CustomerCart/>}/>
    <Route path="/shop/checkout" element={<CustomerRentalForm/>}/>
    <Route path="/shop/status" element={<CustomerBookingStatus/>}/>
    <Route path="/shop/:id" element={<CustomerItemDetail/>}/>
    <Route path="/admin" element={<ProtectedRoute roles={["admin","manager","staff"]}><AdminDashboard/></ProtectedRoute>}/>
    <Route path="/admin/inventory" element={<ProtectedRoute roles={["admin","manager","staff"]}><Inventory/></ProtectedRoute>}/>
    <Route path="/admin/bookings" element={<ProtectedRoute roles={["admin","manager","staff"]}><Bookings/></ProtectedRoute>}/>
    <Route path="/admin/bookings/new" element={<ProtectedRoute roles={["admin","manager","staff"]}><AddBooking/></ProtectedRoute>}/>
    <Route path="/admin/customers" element={<ProtectedRoute roles={["admin","manager","staff"]}><Customers/></ProtectedRoute>}/>
    <Route path="/admin/payments" element={<ProtectedRoute roles={["admin","manager","staff"]}><Payments/></ProtectedRoute>}/>
    <Route path="/admin/calendar" element={<ProtectedRoute roles={["admin","manager","staff"]}><Calendar/></ProtectedRoute>}/>
    <Route path="/admin/reports" element={<ProtectedRoute roles={["admin","manager"]}><Reports/></ProtectedRoute>}/>
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
    <AdminRoutes location={backgroundLocation || location}/>
    {backgroundLocation && <Routes>
      <Route path="/shop/:id" element={<CustomerItemDetail/>}/>
    </Routes>}
  </CartProvider>;
}
