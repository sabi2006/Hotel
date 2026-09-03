import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import {
  ArmchairIcon,
  BarChartIcon,
  BellIcon,
  ChefHatIcon,
  CreditCardIcon,
  GridIcon,
  HandCoinsIcon,
  LayoutDashboardIcon,
  ReceiptIcon,
  SearchCheckIcon,
  SettingsIcon,
  UserIcon,
  UsersIcon,
  UtensilsIcon,
} from "@/components/Icons";
import { FullScreenLoader } from "@/components/Spinner";
import { HOME_ROUTE_BY_ROLE } from "@/context/auth-context";
import { useAuth } from "@/hooks/useAuth";
import { useNotifications } from "@/hooks/useNotifications";
import { AppLayout } from "@/layouts/AppLayout";
import type { NavItem } from "@/layouts/AppLayout";
import { AuthLayout } from "@/layouts/AuthLayout";
import ProfilePage from "@/pages/ProfilePage";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import AuditPage from "@/pages/admin/AuditPage";
import CategoriesPage from "@/pages/admin/CategoriesPage";
import PaymentsPage from "@/pages/admin/PaymentsPage";
import ProductsPage from "@/pages/admin/ProductsPage";
import SettingsPage from "@/pages/admin/SettingsPage";
import StaffPage from "@/pages/admin/StaffPage";
import TablesPage from "@/pages/admin/TablesPage";
import TipsPage from "@/pages/admin/TipsPage";
import LoginPage from "@/pages/auth/LoginPage";
import RegisterPage from "@/pages/auth/RegisterPage";
import KitchenDashboard from "@/pages/kitchen/KitchenDashboard";
import BillingPage from "@/pages/waiter/BillingPage";
import CloseOrderPage from "@/pages/waiter/CloseOrderPage";
import OrderPage from "@/pages/waiter/OrderPage";
import OrderReadyPage from "@/pages/waiter/OrderReadyPage";
import WaiterDashboard from "@/pages/waiter/WaiterDashboard";
import WaiterOrdersPage from "@/pages/waiter/WaiterOrdersPage";
import WaiterTablesPage from "@/pages/waiter/WaiterTablesPage";
import { ProtectedRoute, PublicOnlyRoute } from "@/routes/ProtectedRoute";
import { UserRole } from "@/types";

// Recharts is a large dependency and only the reports screen needs it, so it
// loads on demand rather than in the main bundle.
const ReportsPage = lazy(() => import("@/pages/admin/ReportsPage"));

const ADMIN_NAV: NavItem[] = [
  { to: "/admin", label: "Dashboard", icon: <LayoutDashboardIcon size={18} />, end: true },
  { to: "/admin/categories", label: "Categories", icon: <GridIcon size={18} /> },
  { to: "/admin/products", label: "Products", icon: <UtensilsIcon size={18} /> },
  { to: "/admin/tables", label: "Tables", icon: <ArmchairIcon size={18} /> },
  { to: "/admin/staff", label: "Staff", icon: <UsersIcon size={18} /> },
  { to: "/admin/payments", label: "Payments", icon: <CreditCardIcon size={18} /> },
  { to: "/admin/tips", label: "Tips", icon: <HandCoinsIcon size={18} /> },
  { to: "/admin/reports", label: "Reports", icon: <BarChartIcon size={18} /> },
  { to: "/admin/audit", label: "Audit Trail", icon: <SearchCheckIcon size={18} /> },
  { to: "/admin/settings", label: "Settings", icon: <SettingsIcon size={18} /> },
  { to: "/admin/profile", label: "Profile", icon: <UserIcon size={18} /> },
];

const KITCHEN_NAV: NavItem[] = [
  { to: "/kitchen", label: "Orders", icon: <ChefHatIcon size={18} />, end: true },
  { to: "/kitchen/profile", label: "Profile", icon: <UserIcon size={18} /> },
];

function WaiterLayout() {
  const { readyOrdersCount, closeOrdersCount } = useNotifications();

  const waiterNav: NavItem[] = [
    { to: "/waiter", label: "Dashboard", icon: <LayoutDashboardIcon size={18} />, end: true },
    { to: "/waiter/tables", label: "Take Order", icon: <UtensilsIcon size={18} /> },
    { to: "/waiter/orders", label: "Orders", icon: <ReceiptIcon size={18} /> },
    {
      to: "/waiter/order-ready",
      label: "Order Ready",
      icon: <BellIcon size={18} />,
      badge: readyOrdersCount,
    },
    {
      to: "/waiter/close-order",
      label: "Close Order",
      icon: <CreditCardIcon size={18} />,
      badge: closeOrdersCount,
    },
    { to: "/waiter/profile", label: "Profile", icon: <UserIcon size={18} /> },
  ];

  return <AppLayout title="Waiter" navItems={waiterNav} />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicOnlyRoute />}>
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute allowedRoles={[UserRole.ADMIN]} />}>
        <Route element={<AppLayout title="Admin" navItems={ADMIN_NAV} />}>
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/categories" element={<CategoriesPage />} />
          <Route path="/admin/products" element={<ProductsPage />} />
          <Route path="/admin/tables" element={<TablesPage />} />
          <Route path="/admin/staff" element={<StaffPage />} />
          <Route path="/admin/payments" element={<PaymentsPage />} />
          <Route path="/admin/tips" element={<TipsPage />} />
          <Route path="/admin/audit" element={<AuditPage />} />
          <Route
            path="/admin/reports"
            element={
              <Suspense fallback={<FullScreenLoader label="Loading reports" />}>
                <ReportsPage />
              </Suspense>
            }
          />
          <Route path="/admin/settings" element={<SettingsPage />} />
          <Route path="/admin/profile" element={<ProfilePage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute allowedRoles={[UserRole.WAITER]} />}>
        <Route element={<WaiterLayout />}>
          <Route path="/waiter" element={<WaiterDashboard />} />
          <Route path="/waiter/tables" element={<WaiterTablesPage />} />
          <Route path="/waiter/orders" element={<WaiterOrdersPage />} />
          <Route path="/waiter/order-ready" element={<OrderReadyPage />} />
          <Route path="/waiter/close-order" element={<CloseOrderPage />} />
          <Route path="/waiter/order/:orderId" element={<OrderPage />} />
          <Route path="/waiter/billing/:orderId" element={<BillingPage />} />
          <Route path="/waiter/profile" element={<ProfilePage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute allowedRoles={[UserRole.KITCHEN]} />}>
        <Route element={<AppLayout title="Kitchen" navItems={KITCHEN_NAV} />}>
          <Route path="/kitchen" element={<KitchenDashboard />} />
          <Route path="/kitchen/profile" element={<ProfilePage />} />
        </Route>
      </Route>

      {/* Any unknown path or root path bounces through the guard, which redirects by role. */}
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<RoleHome />} />
        <Route path="*" element={<RoleHome />} />
      </Route>
    </Routes>
  );
}

/** Reached only when authenticated; sends the user to their own panel. */
function RoleHome() {
  const { user } = useAuth();
  return <Navigate to={user ? HOME_ROUTE_BY_ROLE[user.role] : "/login"} replace />;
}
