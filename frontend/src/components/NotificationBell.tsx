import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";

import { useNotifications } from "@/hooks/useNotifications";
import { useRipple } from "@/hooks/useRipple";
import { timeAgo } from "@/utils/format";

interface NotificationBellProps {
  dark?: boolean;
}

export function NotificationBell({ dark = false }: NotificationBellProps) {
  const {
    notifications,
    unreadCount,
    isSoundEnabled,
    toggleSound,
    isBellPulsing,
    markAsRead,
    markAllAsRead,
  } = useNotifications();

  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; right: number }>({ top: 60, right: 16 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const spawnRipple = useRipple();
  const navigate = useNavigate();

  // Recalculate position when opened or window resized
  const updatePosition = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const rightSpacing = Math.max(16, window.innerWidth - rect.right);
      const topSpacing = rect.bottom + 8;
      setCoords({ top: topSpacing, right: rightSpacing });
    }
  };

  function handleToggleOpen() {
    updatePosition();
    setIsOpen((prev) => !prev);
  }

  // Handle outside click, window resize, and Escape key
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    function handleResize() {
      updatePosition();
    }

    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleResize, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleResize, true);
    };
  }, [isOpen]);

  function handleNotificationClick(notifId: string, orderId: string) {
    void markAsRead(notifId);
    setIsOpen(false);
    if (orderId) {
      navigate(`/waiter/order/${orderId}`);
    }
  }

  const dropdownContent = isOpen && typeof document !== "undefined" ? (
    createPortal(
      <div className="fixed inset-0 z-[100] overflow-hidden">
        {/* Invisible Backdrop to close dropdown on click outside */}
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-[1px] transition-opacity animate-fade-in"
          onClick={() => setIsOpen(false)}
        />

        {/* Floating Notification Panel */}
        <div
          ref={panelRef}
          style={{
            top: `${coords.top}px`,
            right: window.innerWidth < 640 ? "12px" : `${coords.right}px`,
            left: window.innerWidth < 640 ? "12px" : "auto",
          }}
          className={[
            "fixed z-[101] w-auto sm:w-96 max-w-[calc(100vw-24px)] rounded-2xl bg-white shadow-2xl ring-1 ring-[#202322]/15 border border-[#EBE7DF]",
            "animate-pop flex flex-col max-h-[calc(100dvh-85px)] overflow-hidden",
          ].join(" ")}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#F0EBE1] bg-[#FAF8F5] px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-base font-extrabold text-[#1F2220] font-sans">Notifications</span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-[#EBF5EE] px-2 py-0.5 text-xs font-bold text-[#276B49] ring-1 ring-[#BCE2CD]">
                  {unreadCount} unread
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {/* Sound Toggle Button */}
              <button
                type="button"
                onClick={toggleSound}
                title={isSoundEnabled ? "Notification sound is ON" : "Notification sound is MUTED"}
                aria-label={isSoundEnabled ? "Mute notification sound" : "Enable notification sound"}
                className={[
                  "pressable rounded-lg px-2.5 py-1 text-xs font-bold transition ring-1",
                  isSoundEnabled
                    ? "bg-[#EBF5EE] text-[#276B49] ring-[#BCE2CD] hover:bg-[#D4EBDC]"
                    : "bg-white text-[#8E908C] ring-[#E8E3D8] hover:bg-[#F3ECE0]",
                ].join(" ")}
              >
                {isSoundEnabled ? "🔊 Sound ON" : "🔇 Sound OFF"}
              </button>

              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => void markAllAsRead()}
                  className="pressable rounded-lg px-2.5 py-1 text-xs font-bold text-brand-700 hover:bg-[#FAF6EE]"
                >
                  Mark all read
                </button>
              )}
            </div>
          </div>

          {/* List of Notifications */}
          <div className="flex-1 overflow-y-auto divide-y divide-[#F0EBE1]">
            {notifications.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <span className="text-3xl">🔕</span>
                <p className="mt-2 text-sm font-bold text-[#1F2220]">No notifications yet</p>
                <p className="mt-1 text-xs text-[#8E908C]">
                  When the kitchen finishes preparing your food, you'll receive real-time alerts here.
                </p>
              </div>
            ) : (
              notifications.map((notif) => (
                <button
                  key={notif._id}
                  type="button"
                  onClick={() => handleNotificationClick(notif._id, notif.orderId)}
                  className={[
                    "w-full text-left px-4 py-3.5 flex items-start gap-3 transition group cursor-pointer",
                    notif.isRead
                      ? "bg-white hover:bg-[#FAF8F5]"
                      : "bg-[#EBF5EE]/50 hover:bg-[#EBF5EE]/90 font-medium",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "flex size-9 shrink-0 items-center justify-center rounded-xl text-base",
                      notif.isRead
                        ? "bg-[#FAF8F5] text-[#8E908C]"
                        : "bg-[#EBF5EE] text-[#276B49] ring-1 ring-[#BCE2CD] shadow-sm",
                    ].join(" ")}
                  >
                    🔔
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-sm font-bold text-[#1F2220] truncate">
                        Table {notif.tableNumber} {notif.invoiceNumber ? `· ${notif.invoiceNumber}` : notif.orderNumber ? `· #${notif.orderNumber}` : ""}
                      </p>
                      <span className="text-[11px] text-[#8E908C] shrink-0 font-normal">
                        {timeAgo(notif.createdAt)}
                      </span>
                    </div>

                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="inline-flex rounded-full bg-[#EBF5EE] px-2 py-0.2 text-[11px] font-bold text-[#276B49]">
                        Ready to serve
                      </span>
                    </div>

                    <p className="mt-1 text-xs text-[#5F615D] line-clamp-2">
                      {notif.message}
                    </p>
                  </div>

                  {!notif.isRead && (
                    <span
                      aria-label="Unread"
                      className="mt-2 size-2.5 shrink-0 rounded-full bg-[#276B49] ring-2 ring-[#BCE2CD] shadow-sm"
                    />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      </div>,
      document.body,
    )
  ) : null;

  return (
    <>
      {/* Bell Trigger Button in Header */}
      <button
        ref={buttonRef}
        type="button"
        aria-label="Notifications"
        aria-expanded={isOpen}
        onPointerDown={spawnRipple}
        onClick={handleToggleOpen}
        className={[
          "ripple-host pressable relative flex size-10 items-center justify-center rounded-xl transition-colors select-none",
          dark
            ? isOpen
              ? "bg-[#252827] text-white shadow-sm ring-1 ring-[#323634]"
              : "text-[#FAF8F5] hover:bg-[#202322] hover:text-white"
            : isOpen
              ? "bg-white text-[#1F2220] shadow-sm ring-1 ring-[#E8E3D8]"
              : "text-[#424541] hover:bg-white hover:text-[#1F2220]",
        ].join(" ")}
      >
        <span
          className={[
            "text-xl transition-transform",
            isBellPulsing ? "animate-bounce scale-125" : "",
          ].join(" ")}
        >
          🔔
        </span>

        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-[#276B49] px-1.5 py-0.5 text-[11px] font-black text-white shadow-md ring-2 ring-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {dropdownContent}
    </>
  );
}
