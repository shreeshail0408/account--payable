import React, { lazy, Suspense } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import { AppShell } from "./layout/AppShell";
import { PageFallback } from "./layout/PageFallback";
import { RouteErrorBoundary } from "./layout/RouteErrorBoundary";
import { NAV_ITEMS, canAccess } from "./layout/nav";

// Each page is its own chunk.
const Login = lazy(() => import("./pages/Login"));
const ChangePasswordPage = lazy(() => import("./features/account/ChangePasswordPage"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Invoices = lazy(() => import("./pages/Invoices"));
const Vendors = lazy(() => import("./pages/Vendors"));
const PurchaseOrders = lazy(() => import("./pages/PurchaseOrders"));
const GoodsReceipts = lazy(() => import("./pages/GoodsReceipts"));
const Approvals = lazy(() => import("./pages/Approvals"));
const Payments = lazy(() => import("./pages/Payments"));
const Reports = lazy(() => import("./pages/Reports"));
const Employees = lazy(() => import("./pages/Employees"));
const Styleguide = lazy(() => import("./pages/Styleguide"));

const PAGE_ROUTES = [
  { nav: NAV_ITEMS.dashboard, Component: Dashboard },
  { nav: NAV_ITEMS.invoices, Component: Invoices },
  { nav: NAV_ITEMS.vendors, Component: Vendors },
  { nav: NAV_ITEMS.purchaseOrders, Component: PurchaseOrders },
  { nav: NAV_ITEMS.goodsReceipts, Component: GoodsReceipts },
  { nav: NAV_ITEMS.approvals, Component: Approvals },
  { nav: NAV_ITEMS.payments, Component: Payments },
  { nav: NAV_ITEMS.reports, Component: Reports },
  { nav: NAV_ITEMS.employees, Component: Employees },
  { nav: NAV_ITEMS.styleguide, Component: Styleguide },
];

function RequireAuth() {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  if (user.must_change_password) {
    return <Navigate to="/change-password" replace />;
  }
  return <AppShell />;
}

/** /change-password: only while the administrator-set password still has to be replaced. */
function RequirePasswordChange() {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (!user.must_change_password) {
    return <Navigate to="/" replace />;
  }
  return (
    <StandaloneScreen>
      <ChangePasswordPage />
    </StandaloneScreen>
  );
}

/** Full-screen pages outside the app shell (sign-in, forced password change). */
function StandaloneScreen({ children }) {
  const location = useLocation();
  return (
    <RouteErrorBoundary resetKey={location.pathname}>
      <Suspense fallback={<div data-ui="" className="min-h-dvh bg-background" />}>
        {children}
      </Suspense>
    </RouteErrorBoundary>
  );
}

function RequireRole({ item, children }) {
  const { user } = useAuth();
  if (!canAccess(item, user?.role)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function PublicOnly() {
  const { user } = useAuth();
  if (user) {
    return <Navigate to="/" replace />;
  }
  return (
    <StandaloneScreen>
      <Outlet />
    </StandaloneScreen>
  );
}

function pageElement({ nav, Component }) {
  return (
    <RequireRole item={nav}>
      <Component />
    </RequireRole>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicOnly />}>
        <Route path="/login" element={<Login />} />
      </Route>
      <Route path="/change-password" element={<RequirePasswordChange />} />
      <Route element={<RequireAuth />}>
        {PAGE_ROUTES.map((route) => (
          <Route
            key={route.nav.path}
            index={route.nav.path === "/"}
            path={route.nav.path === "/" ? undefined : route.nav.path}
            element={pageElement(route)}
          />
        ))}
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
