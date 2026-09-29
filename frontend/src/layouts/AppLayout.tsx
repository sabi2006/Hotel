import { Suspense, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { BrandLogo } from "@/components/BrandLogo";
import { LogOutIcon, MenuIcon } from "@/components/Icons";
import { NotificationBell } from "@/components/NotificationBell";
import { PageLoader } from "@/components/Spinner";
import { useAuth } from "@/hooks/useAuth";
import { humanizeEnum, initialsOf } from "@/utils/format";

export interface NavItem {
  to: string;
  label: string;
  icon: string | ReactNode;
  end?: boolean;
  badge?: number | string | null;
}

interface AppLayoutProps {
  title: string;
  navItems: NavItem[];
}

function formatNow(): string {
  return new Date().toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AppLayout({ title, navItems }: AppLayoutProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [timeStr, setTimeStr] = useState(formatNow);

  useEffect(() => {
    const interval = setInterval(() => setTimeStr(formatNow()), 30_000);
    return () => clearInterval(interval);
  }, []);

  // Lock body scroll when the mobile drawer is open, and close it on Escape.
  useEffect(() => {
    if (!isSidebarOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setIsSidebarOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isSidebarOpen]);

  // Close the mobile drawer after navigating.
  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  // The current page's label, so the header says "Products" rather than "Admin".
  const activeItem =
    navItems.find((item) =>
      item.end ? location.pathname === item.to : location.pathname.startsWith(item.to),
    ) ?? null;
  const pageTitle = activeItem?.label ?? title;

  const navLinkClasses = ({ isActive }: { isActive: boolean }) =>
    [
      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-ring",
      isActive
        ? "bg-brand-50 text-brand-800"
        : "text-muted hover:bg-surface-sunken hover:text-ink",
    ].join(" ");

  const sidebar = (
    <nav className="flex h-full max-h-full flex-col bg-white overflow-hidden overscroll-contain">
      <div className="shrink-0 border-b border-line px-4 py-4">
        <BrandLogo variant="sidebar" stationTitle={title} />
      </div>

      <div className="flex-1 min-h-0 space-y-0.5 overflow-y-auto overscroll-contain px-3 py-3 sidebar-scrollbar">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={() => setIsSidebarOpen(false)}
            className={navLinkClasses}
          >
            {({ isActive }) => (
              <>
                <span
                  aria-hidden
                  className={[
                    "flex size-5 shrink-0 items-center justify-center",
                    isActive ? "text-brand-700" : "text-subtle",
                  ].join(" ")}
                >
                  {item.icon}
                </span>
                <span className="truncate flex-1">{item.label}</span>
                {item.badge !== undefined && item.badge !== null && Number(item.badge) > 0 && (
                  <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-success px-1.5 py-0.5 text-[11px] font-semibold text-white tabular-nums">
                    {item.badge}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </div>

      <div className="shrink-0 border-t border-line p-3">
        <div className="flex items-center gap-3 px-2 py-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800">
            {user ? initialsOf(user.name) : "?"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{user?.name}</p>
            <p className="truncate text-xs text-subtle">{user ? humanizeEnum(user.role) : ""}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-muted transition-colors hover:bg-danger-soft hover:text-danger focus-ring"
        >
          <LogOutIcon size={16} />
          <span>Sign out</span>
        </button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen bg-canvas lg:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen max-h-screen w-60 shrink-0 overflow-hidden border-r border-line lg:block">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 animate-fade-in bg-ink/40"
            onClick={() => setIsSidebarOpen(false)}
          />
          <aside className="relative flex h-full max-h-screen w-72 max-w-[80vw] flex-col overflow-hidden shadow-lg animate-drawer-in">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-line bg-white px-3.5 sm:px-5 lg:px-8">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              aria-label="Open menu"
              onClick={() => setIsSidebarOpen(true)}
              className="flex size-9 items-center justify-center rounded-lg text-ink hover:bg-surface-sunken focus-ring lg:hidden"
            >
              <MenuIcon size={20} />
            </button>
            <p className="truncate text-base font-semibold text-ink">{pageTitle}</p>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted tabular-nums sm:inline">{timeStr}</span>
            {user?.role === "WAITER" && <NotificationBell dark={false} />}
          </div>
        </header>

        <main className="flex-1 p-3.5 sm:p-5 lg:p-8 pb-safe">
          <div className="mx-auto w-full max-w-7xl">
            <Suspense fallback={<PageLoader />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}
