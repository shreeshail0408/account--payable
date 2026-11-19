import {
  Building2,
  ClipboardCheck,
  CreditCard,
  FileBarChart,
  LayoutDashboard,
  PackageCheck,
  Palette,
  ReceiptText,
  ShoppingCart,
  Users,
} from "lucide-react";

/*
 * Single source for navigation, route access and breadcrumbs.
 * `roles` mirror the read permissions in backend/ap_app/permissions.py; the server
 * still enforces access, this only decides what the UI shows.
 */
export const ALL_ROLES = ["ADMIN", "AP_CLERK", "APPROVER", "ACCOUNTANT", "AUDITOR"];

export const NAV_ITEMS = {
  dashboard: { path: "/", label: "Dashboard", icon: LayoutDashboard, roles: ALL_ROLES },
  invoices: { path: "/invoices", label: "Invoices", icon: ReceiptText, roles: ALL_ROLES },
  purchaseOrders: {
    path: "/purchase-orders",
    label: "Purchase Orders",
    icon: ShoppingCart,
    roles: ["ADMIN", "AP_CLERK", "AUDITOR"],
  },
  goodsReceipts: {
    path: "/goods-receipts",
    label: "Goods Receipts",
    icon: PackageCheck,
    roles: ["ADMIN", "AP_CLERK", "AUDITOR"],
  },
  approvals: {
    path: "/approvals",
    label: "Approvals",
    icon: ClipboardCheck,
    roles: ["ADMIN", "APPROVER", "AUDITOR"],
    badge: "pendingApprovals",
  },
  payments: {
    path: "/payments",
    label: "Payments",
    icon: CreditCard,
    roles: ["ADMIN", "ACCOUNTANT", "AUDITOR"],
  },
  reports: {
    path: "/reports",
    label: "Reports",
    icon: FileBarChart,
    roles: ["ADMIN", "ACCOUNTANT", "AUDITOR"],
  },
  vendors: {
    path: "/vendors",
    label: "Vendors",
    icon: Building2,
    roles: ["ADMIN", "AP_CLERK", "ACCOUNTANT", "AUDITOR"],
  },
  employees: { path: "/employees", label: "Employees", icon: Users, roles: ["ADMIN"] },
  styleguide: { path: "/styleguide", label: "Styleguide", icon: Palette, roles: ["ADMIN"] },
};

export const NAV_GROUPS = [
  { label: null, items: [NAV_ITEMS.dashboard] },
  { label: "Capture", items: [NAV_ITEMS.invoices] },
  { label: "Procure", items: [NAV_ITEMS.purchaseOrders, NAV_ITEMS.goodsReceipts] },
  { label: "Workflow", items: [NAV_ITEMS.approvals] },
  { label: "Finance", items: [NAV_ITEMS.payments, NAV_ITEMS.reports] },
  { label: "Admin", items: [NAV_ITEMS.vendors, NAV_ITEMS.employees, NAV_ITEMS.styleguide] },
];

/** Mobile bottom tabs (filtered by role like everything else). */
export const MOBILE_TABS = [
  NAV_ITEMS.dashboard,
  NAV_ITEMS.invoices,
  NAV_ITEMS.approvals,
  NAV_ITEMS.payments,
];

export function canAccess(item, role) {
  return Boolean(item && role && item.roles.includes(role));
}

export function visibleGroups(role) {
  return NAV_GROUPS
    .map((group) => ({ ...group, items: group.items.filter((item) => canAccess(item, role)) }))
    .filter((group) => group.items.length > 0);
}

/** { group, item } for the current pathname, used by the breadcrumb and document title. */
export function findRoute(pathname) {
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (item.path === "/" ? pathname === "/" : pathname.startsWith(item.path)) {
        return { group: group.label, item };
      }
    }
  }
  return { group: null, item: null };
}
