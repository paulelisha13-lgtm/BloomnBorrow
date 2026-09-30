import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
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
import { CustomerCatalog } from "./pages/customer/Catalog";
import { CustomerItemDetail } from "./pages/customer/ItemDetail";
import { CustomerCart } from "./pages/customer/Cart";
import { CustomerRentalForm } from "./pages/customer/RentalForm";
import { CustomerBookingStatus } from "./pages/customer/BookingStatus";
import { CartProvider } from "./context/CartContext";

function AdminRoutes() {
  return <Routes>
    <Route path="/access/login" element={<AccessLogin/>}/>
    <Route path="/admin/login" element={<Navigate to="/access/login" replace/>}/>
    <Route path="/shop" element={<CartProvider><CustomerCatalog/></CartProvider>}/>
    <Route path="/shop/cart" element={<CartProvider><CustomerCart/></CartProvider>}/>
    <Route path="/shop/checkout" element={<CartProvider><CustomerRentalForm/></CartProvider>}/>
    <Route path="/shop/status" element={<CartProvider><CustomerBookingStatus/></CartProvider>}/>
    <Route path="/shop/:id" element={<CartProvider><CustomerItemDetail/></CartProvider>}/>
    <Route path="/admin" element={<ProtectedRoute roles={["admin","staff"]}><AdminDashboard/></ProtectedRoute>}/>
    <Route path="/admin/inventory" element={<ProtectedRoute roles={["admin","staff"]}><Inventory/></ProtectedRoute>}/>
    <Route path="/admin/bookings" element={<ProtectedRoute roles={["admin","staff"]}><Bookings/></ProtectedRoute>}/>
    <Route path="/admin/bookings/new" element={<ProtectedRoute roles={["admin","staff"]}><AddBooking/></ProtectedRoute>}/>
    <Route path="/admin/customers" element={<ProtectedRoute roles={["admin","staff"]}><Customers/></ProtectedRoute>}/>
    <Route path="/admin/payments" element={<ProtectedRoute roles={["admin","staff"]}><Payments/></ProtectedRoute>}/>
    <Route path="/admin/calendar" element={<ProtectedRoute roles={["admin","staff"]}><Calendar/></ProtectedRoute>}/>
    <Route path="/admin/reports" element={<ProtectedRoute roles={["admin"]}><Reports/></ProtectedRoute>}/>
    <Route path="/admin/maintenance" element={<ProtectedRoute roles={["admin","staff"]}><Maintenance/></ProtectedRoute>}/>
    <Route path="/admin/access" element={<ProtectedRoute roles={["admin"]}><AccessManagement/></ProtectedRoute>}/>
    <Route path="/admin/audit" element={<ProtectedRoute roles={["admin"]}><AuditLog/></ProtectedRoute>}/>
    <Route path="/admin/settings" element={<ProtectedRoute roles={["admin"]}><Settings/></ProtectedRoute>}/>
    <Route path="/admin/account-settings" element={<ProtectedRoute roles={["admin","staff"]}><AccountSettings/></ProtectedRoute>}/>
    <Route path="*" element={<Navigate to="/admin" replace/>}/>
  </Routes>
}

// /shop/* is the public Customer Side (browse, request a rental, check status) --
// everything else stays admin/staff-only, and unknown paths fall back to the
// dashboard (or login if signed out).
export default function App() {
  return <AdminRoutes/>;
}
