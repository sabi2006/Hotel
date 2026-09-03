import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { BrandLogo } from "@/components/BrandLogo";
import { LogOutIcon } from "@/components/Icons";
import { NotificationBell } from "@/components/NotificationBell";
import { useAuth } from "@/hooks/useAuth";
import { useRipple } from "@/hooks/useRipple";
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

export function AppLayout({ title, navItems }: AppLayoutProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const spawnRipple = useRipple();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [timeStr, setTimeStr] = useState("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(
        now.toLocaleDateString("en-IN", {
          weekday: "short",
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 30_000);
    return () => clearInterval(interval);
  }, []);

  // Lock body scroll when mobile drawer is open & handle Escape
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

  // Close mobile drawer on route navigation
  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  const navLinkClasses = ({ isActive }: { isActive: boolean }) =>
    [
      "ripple-host pressable group relative flex items-center gap-3 rounded-xl px-3.5 py-2.5",
      "text-sm font-semibold transition-all duration-150 select-none",
      isActive
        ? "bg-gradient-to-r from-brand-600 to-brand-700 text-white shadow-md shadow-brand-950/30 font-bold"
        : "text-[#9E9F9B] hover:bg-[#252827] hover:text-[#FAF8F5]",
    ].join(" ");

  const sidebar = (
    <nav className="flex h-full max-h-full flex-col p-4 select-none bg-[#161817] text-[#FAF8F5] overflow-hidden overscroll-contain">
      {/* Brand Header - Fixed at Top */}
      <div className="shrink-0 mb-4 px-1 pt-1">
        <BrandLogo variant="sidebar" stationTitle={title} />
      </div>

      {/* Nav items - Dedicated Independent Scrollable Middle Section */}
      <div className="space-y-1.5 overflow-y-auto flex-1 sidebar-scrollbar pr-1 min-h-0 overscroll-contain">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onPointerDown={spawnRipple}
            onClick={() => setIsSidebarOpen(false)}
            className={navLinkClasses}
          >
            {({ isActive }) => (
              <>
                <span
                  aria-hidden
                  className={[
                    "absolute left-0 h-5 w-1 rounded-r-full bg-brand-300 transition-transform duration-200 ease-out",
                    isActive ? "scale-y-100" : "scale-y-0",
                  ].join(" ")}
                />
                <span
                  aria-hidden
                  className={[
                    "flex size-5 shrink-0 items-center justify-center transition-transform duration-150 group-hover:scale-110",
                    isActive ? "text-white" : "text-[#8E908C] group-hover:text-[#FAF8F5]",
                  ].join(" ")}
                >
                  {typeof item.icon === "string" ? (
                    <span className="text-base">{item.icon}</span>
                  ) : (
                    item.icon
                  )}
                </span>
                <span className="truncate flex-1">{item.label}</span>
                {item.badge !== undefined && item.badge !== null && Number(item.badge) > 0 && (
                  <span
                    className={[
                      "ml-auto inline-flex items-center justify-center px-2 py-0.5 text-xs font-extrabold rounded-full tabular-nums shadow-xs transition-transform",
                      isActive
                        ? "bg-white text-brand-800 ring-1 ring-white/40"
                        : "bg-emerald-600 text-white animate-pulse ring-1 ring-emerald-400/40",
                    ].join(" ")}
                  >
                    {item.badge}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </div>

      {/* User Footer - Fixed / Stable at Bottom */}
      <div className="shrink-0 mt-3 pt-3 border-t border-[#2A2D2C]">
        <div className="mb-2.5 flex items-center gap-3 rounded-xl bg-[#202322] p-2.5 ring-1 ring-[#323634]">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-600 to-amber-600 text-xs font-bold text-white shadow-sm ring-1 ring-brand-300/30">
            {user ? initialsOf(user.name) : "?"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-[#FAF8F5]">{user?.name}</p>
            <div className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-emerald-400" />
              <p className="truncate text-[11px] font-medium text-[#9E9F9B]">
                {user ? humanizeEnum(user.role) : ""}
              </p>
            </div>
          </div>
        </div>

        <button
          onPointerDown={spawnRipple}
          onClick={handleLogout}
          className="ripple-host pressable group flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-[#8E908C] hover:bg-red-500/10 hover:text-red-400 transition-colors"
        >
          <LogOutIcon size={16} className="transition-transform group-hover:translate-x-0.5" />
          <span>Sign Out</span>
        </button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen bg-[#F6F4EE] lg:flex">
      {/* Desktop Sidebar - Sticky viewport height */}
      <aside className="sticky top-0 hidden h-screen max-h-screen w-64 shrink-0 overflow-hidden border-r border-[#2A2D2C] bg-[#161817] shadow-xl lg:block overscroll-contain">
        {sidebar}
      </aside>

      {/* Mobile Drawer */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Close menu"
            className="absolute inset-0 animate-fade-in bg-black/60 backdrop-blur-sm"
            onClick={() => setIsSidebarOpen(false)}
          />
          <aside className="relative flex h-full max-h-screen w-72 max-w-[80vw] flex-col overflow-hidden bg-[#161817] shadow-2xl animate-drawer-in">
            {sidebar}
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile Header */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-[#E8E3D8] bg-[#FAF8F3]/95 px-3.5 py-2.5 sm:px-4 sm:py-3 backdrop-blur-md lg:hidden shadow-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              aria-label="Open menu"
              onPointerDown={spawnRipple}
              onClick={() => setIsSidebarOpen(true)}
              className="ripple-host pressable flex size-9 items-center justify-center rounded-xl bg-white text-[#202322] ring-1 ring-[#E8E3D8] hover:bg-[#F3ECE0]"
            >
              ☰
            </button>
            <BrandLogo variant="mark" size="xs" />
            <span className="font-extrabold text-[#1F2220] text-base font-sans truncate">{title}</span>
          </div>
          {user?.role === "WAITER" && <NotificationBell dark={false} />}
        </header>

        {/* Desktop Sticky Header Bar */}
        <header className="sticky top-0 z-30 hidden items-center justify-between border-b border-[#E8E3D8] bg-[#FAF8F3]/95 px-6 lg:px-8 py-3.5 backdrop-blur-md lg:flex shadow-xs">
          <div className="flex items-center gap-3">
            <BrandLogo variant="mark" size="sm" />
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#8E908C]">
                <span>Spice Garden</span>
                <span>/</span>
                <span className="text-brand-700 font-bold">{title}</span>
              </div>
              <h2 className="text-lg font-extrabold tracking-tight text-[#1F2220] font-sans">{title}</h2>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Live Clock / Shift context */}
            {timeStr && (
              <span className="text-xs font-semibold text-[#5F615D] bg-white px-3.5 py-1.5 rounded-full ring-1 ring-[#E8E3D8] shadow-2xs tabular-nums">
                🕒 {timeStr}
              </span>
            )}

            {/* Notification Bell */}
            {user?.role === "WAITER" && <NotificationBell dark={false} />}

            {/* User Profile Pill */}
            <div className="flex items-center gap-2.5 rounded-full bg-white py-1 pl-1.5 pr-3.5 ring-1 ring-[#E8E3D8] shadow-2xs">
              <span className="flex size-7 items-center justify-center rounded-full bg-gradient-to-tr from-brand-600 to-amber-600 text-xs font-bold text-white shadow-xs">
                {user ? initialsOf(user.name) : "?"}
              </span>
              <div className="text-left">
                <p className="text-xs font-bold text-[#1F2220] leading-none">{user?.name}</p>
                <p className="text-[10px] font-semibold text-brand-700 leading-tight">
                  {user ? humanizeEnum(user.role) : ""}
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content with safe padding and max width */}
        <main key={location.pathname} className="flex-1 animate-rise p-3.5 sm:p-5 lg:p-7 pb-safe">
          <div className="mx-auto w-full max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
