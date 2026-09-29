import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AccessManagement } from "./pages/AccessManagement";
import { AccountSettings } from "./pages/AccountSettings";
import { AddBooking } from "./pages/AddBooking";
import { AuditLog } from "./pages/AuditLog";
import { Bookings } from "./pages/Bookings";
import { Customers } from "./pages/Customers";
import { AdminDashboard } from "./pages/Dashboard";
import { Incidents } from "./pages/Incidents";
import { Inventory } from "./pages/Inventory";
import { AccessLogin } from "./pages/Login";
import { Maintenance } from "./pages/Maintenance";
import { Payments } from "./pages/Payments";
import { Reports } from "./pages/Reports";
import { Settings } from "./pages/Settings";

function AdminRoutes() {
  return <Routes>
    <Route path="/access/login" element={<AccessLogin/>}/>
    <Route path="/admin/login" element={<Navigate to="/access/login" replace/>}/>
    <Route path="/admin" element={<ProtectedRoute roles={["admin","staff"]}><AdminDashboard/></ProtectedRoute>}/>
    <Route path="/admin/inventory" element={<ProtectedRoute roles={["admin","staff"]}><Inventory/></ProtectedRoute>}/>
    <Route path="/admin/bookings" element={<ProtectedRoute roles={["admin","staff"]}><Bookings/></ProtectedRoute>}/>
    <Route path="/admin/bookings/new" element={<ProtectedRoute roles={["admin","staff"]}><AddBooking/></ProtectedRoute>}/>
    <Route path="/admin/customers" element={<ProtectedRoute roles={["admin","staff"]}><Customers/></ProtectedRoute>}/>
    <Route path="/admin/payments" element={<ProtectedRoute roles={["admin","staff"]}><Payments/></ProtectedRoute>}/>
    <Route path="/admin/incidents" element={<ProtectedRoute roles={["admin","staff"]}><Incidents/></ProtectedRoute>}/>
    <Route path="/admin/reports" element={<ProtectedRoute roles={["admin"]}><Reports/></ProtectedRoute>}/>
    <Route path="/admin/maintenance" element={<ProtectedRoute roles={["admin","staff"]}><Maintenance/></ProtectedRoute>}/>
    <Route path="/admin/access" element={<ProtectedRoute roles={["admin"]}><AccessManagement/></ProtectedRoute>}/>
    <Route path="/admin/audit" element={<ProtectedRoute roles={["admin"]}><AuditLog/></ProtectedRoute>}/>
    <Route path="/admin/settings" element={<ProtectedRoute roles={["admin"]}><Settings/></ProtectedRoute>}/>
    <Route path="/admin/account-settings" element={<ProtectedRoute roles={["admin","staff"]}><AccountSettings/></ProtectedRoute>}/>
    <Route path="*" element={<Navigate to="/admin" replace/>}/>
  </Routes>
}

// Admin-only system: there is no public customer site, so every path is part of
// the admin area and unknown paths go to the dashboard (or login if signed out).
export default function App() {
  return <AdminRoutes/>;
}
