import React, { createContext, useContext, useState } from "react";
import { Routes, Route, Navigate, NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, ReceiptText, Building2, ClipboardCheck, CreditCard,
  ShoppingCart, FileBarChart, LogOut, Menu, X, Search, Bell, UserCircle, PackageCheck, Users
} from "lucide-react";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Invoices from "./pages/Invoices";
import Vendors from "./pages/Vendors";
import PurchaseOrders from "./pages/PurchaseOrders";
import GoodsReceipts from "./pages/GoodsReceipts";
import Approvals from "./pages/Approvals";
import Payments from "./pages/Payments";
import Reports from "./pages/Reports";
import Employees from "./pages/Employees";
import api from "./services/api";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

function Shell({ children }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notificationError, setNotificationError] = useState("");
  const navigate = useNavigate();
  const loadNotifications = async () => {
    try {
      const {data} = await api.get("/notifications/");
      setNotifications(data.results || data);
      setNotificationError("");
    } catch (error) {
      setNotificationError(error.response?.data?.detail || "Unable to load notifications.");
    }
  };
  const toggleNotifications = async () => {
    const next = !notificationsOpen;
    setNotificationsOpen(next);
    if (next) await loadNotifications();
  };
  const openNotification = async (item) => {
    try {
      if (!item.read_at) await api.post(`/notifications/${item.id}/mark_read/`);
    } catch (error) {
      setNotificationError(error.response?.data?.detail || "Unable to mark notification as read.");
      return;
    }
    setNotificationsOpen(false);
    if (item.entity_type === "Vendor") navigate("/vendors");
    else navigate("/invoices");
  };
  const items = [
    ["/", "Dashboard", LayoutDashboard],
    ["/invoices", "Invoices", ReceiptText, ["ADMIN","AP_CLERK","APPROVER","ACCOUNTANT","AUDITOR"]],
    ["/vendors", "Vendors", Building2, ["ADMIN","AP_CLERK","ACCOUNTANT","AUDITOR"]],
    ["/purchase-orders", "Purchase Orders", ShoppingCart, ["ADMIN","AP_CLERK","AUDITOR"]],
    ["/goods-receipts", "Goods Receipts", PackageCheck, ["ADMIN","AP_CLERK","AUDITOR"]],
    ["/approvals", "Approvals", ClipboardCheck, ["ADMIN","APPROVER","AUDITOR"]],
    ["/payments", "Payments", CreditCard, ["ADMIN","ACCOUNTANT","AUDITOR"]],
    ["/reports", "Reports", FileBarChart, ["ADMIN","ACCOUNTANT","AUDITOR"]],
    ["/employees", "Employees", Users, ["ADMIN"]],
  ];
  return (
    <div className="app-shell">
      <aside className={open ? "sidebar open" : "sidebar"}>
        <div className="brand"><span className="brand-mark">AP</span><span>PayFlow</span></div>
        <button className="sidebar-close" onClick={() => setOpen(false)}><X size={20}/></button>
        <nav>
          {items.filter(([, , ,roles])=>!roles||roles.includes(user?.role)).map(([path, label, Icon]) => (
            <NavLink key={path} to={path} end={path === "/"} onClick={() => setOpen(false)}>
              <Icon size={19}/><span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="menu-btn" onClick={() => setOpen(true)}><Menu size={22}/></button>
          <div className="global-search"><Search size={17}/><input placeholder="Search records..." /></div>
          <div className="header-actions">
            <div className="notification-wrap">
              <button className="icon-btn" onClick={toggleNotifications} aria-label="Notifications"><Bell size={19}/>{notifications.some(item=>!item.read_at)&&<i />}</button>
              {notificationsOpen&&<div className="notification-menu">
                <div className="notification-title"><b>Notifications</b><button className="link" onClick={loadNotifications}>Refresh</button></div>
                {notificationError&&<div className="alert error">{notificationError}</div>}
                {notifications.length?notifications.slice(0,8).map(item=><button className={`notification-item ${item.read_at?"read":""}`} key={item.id} onClick={()=>openNotification(item)}><b>{item.title}</b><span>{item.message}</span><small>{new Date(item.created_at).toLocaleString()}</small></button>):!notificationError&&<div className="notification-empty">No notifications</div>}
              </div>}
            </div>
            <div className="profile"><UserCircle size={29}/><div><strong>{user?.first_name || user?.username}</strong><small>{user?.role}</small></div></div>
            <button className="icon-btn" title="Logout" onClick={() => { logout(); navigate("/login"); }}><LogOut size={19}/></button>
          </div>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}

function Protected({ children, roles }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <Shell>{children}</Shell>;
}

export default function App() {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("user")); } catch { return null; }
  });
  const logout = () => { localStorage.removeItem("access"); localStorage.removeItem("refresh"); localStorage.removeItem("user"); setUser(null); };
  return (
    <AuthContext.Provider value={{ user, setUser, logout }}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Protected><Dashboard /></Protected>} />
        <Route path="/invoices" element={<Protected><Invoices /></Protected>} />
        <Route path="/vendors" element={<Protected><Vendors /></Protected>} />
        <Route path="/purchase-orders" element={<Protected><PurchaseOrders /></Protected>} />
        <Route path="/goods-receipts" element={<Protected><GoodsReceipts /></Protected>} />
        <Route path="/approvals" element={<Protected><Approvals /></Protected>} />
        <Route path="/payments" element={<Protected><Payments /></Protected>} />
        <Route path="/reports" element={<Protected><Reports /></Protected>} />
        <Route path="/employees" element={<Protected roles={["ADMIN"]}><Employees /></Protected>} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </AuthContext.Provider>
  );
}
