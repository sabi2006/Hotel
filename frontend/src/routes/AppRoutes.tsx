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
import LoginPage from "@/pages/auth/LoginPage";
import { ProtectedRoute, PublicOnlyRoute } from "@/routes/ProtectedRoute";
import { UserRole } from "@/types";

// Every screen loads on demand, so a waiter's phone never downloads the admin
// or kitchen code. AppLayout wraps the outlet in <Suspense>. Only the login
// screen stays in the main bundle, because it is the first thing anyone sees.
const RegisterPage = lazy(() => import("@/pages/auth/RegisterPage"));
const ProfilePage = lazy(() => import("@/pages/ProfilePage"));

const AdminDashboard = lazy(() => import("@/pages/admin/AdminDashboard"));
const AuditPage = lazy(() => import("@/pages/admin/AuditPage"));
const CategoriesPage = lazy(() => import("@/pages/admin/CategoriesPage"));
const PaymentsPage = lazy(() => import("@/pages/admin/PaymentsPage"));
const ProductsPage = lazy(() => import("@/pages/admin/ProductsPage"));
const SettingsPage = lazy(() => import("@/pages/admin/SettingsPage"));
const StaffPage = lazy(() => import("@/pages/admin/StaffPage"));
const TablesPage = lazy(() => import("@/pages/admin/TablesPage"));
const TipsPage = lazy(() => import("@/pages/admin/TipsPage"));
const ReportsPage = lazy(() => import("@/pages/admin/ReportsPage"));

const KitchenDashboard = lazy(() => import("@/pages/kitchen/KitchenDashboard"));

const BillingPage = lazy(() => import("@/pages/waiter/BillingPage"));
const CloseOrderPage = lazy(() => import("@/pages/waiter/CloseOrderPage"));
const OrderPage = lazy(() => import("@/pages/waiter/OrderPage"));
const OrderReadyPage = lazy(() => import("@/pages/waiter/OrderReadyPage"));
const WaiterDashboard = lazy(() => import("@/pages/waiter/WaiterDashboard"));
const WaiterOrdersPage = lazy(() => import("@/pages/waiter/WaiterOrdersPage"));
const WaiterTablesPage = lazy(() => import("@/pages/waiter/WaiterTablesPage"));

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
          <Route
            path="/register"
            element={
              <Suspense fallback={<FullScreenLoader label="Loading" />}>
                <RegisterPage />
              </Suspense>
            }
          />
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
