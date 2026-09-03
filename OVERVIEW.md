# 🌿 SPICE GARDEN — Restaurant POS & Hospitality Suite
## Complete Technical Overview, Architecture & Daily Changelog

> **Official Brand**: Spice Garden — Hospitality & Point of Sale  
> **Repository**: `d:\Hotel`  
> **Last Updated**: 2026-09-03  

---

## 📑 Table of Contents
1. [Tech Stack & Technologies Used](#-tech-stack--technologies-used)
2. [Database & Cloud Infrastructure](#-database--cloud-infrastructure)
3. [Architecture & Folder Structure](#-architecture--folder-structure)
4. [Portals & Feature Breakdown](#-portals--feature-breakdown)
5. [Visual Design & Typography System](#-visual-design--typography-system)
6. [Real-time System & Notifications](#-real-time-system--notifications)
7. [Daily Changelog & Update History](#-daily-changelog--update-history)

---

## 🚀 Tech Stack & Technologies Used

### Frontend Architecture (`/frontend`)
- **Core Framework**: React 19 + TypeScript + Vite
- **Routing**: React Router DOM (v7) with role-based Route Guards (`ADMIN`, `WAITER`, `KITCHEN`)
- **Styling**: TailwindCSS v4 with custom Luxury Hospitality theme (`@theme`)
- **Typography**: `Manrope` (weights 400–800) with `Inter` and system fallbacks
- **State Management & Contexts**:
  - `AuthContext`: JWT token persistence, session renewal, user role segregation
  - `NotificationContext`: Real-time WebSocket connection, audio chimes, unread badges
  - `ToastProvider`: Dynamic alert notifications with timer bars
- **Charts & Analytics**: Recharts (lazy-loaded for reports & revenue statistics)
- **Icons**: Custom SVG Lucide-compatible icon library (`Icons.tsx`)
- **QR Code Engine**: Dynamic UPI URI QR Code Generator (`api.qrserver.com` + custom image uploads)

### Backend Architecture (`/backend`)
- **Core Framework**: Python 3.12+ with **FastAPI**
- **ASGI Server**: Uvicorn with auto-reload
- **Database Driver**: Motor (Async MongoDB driver for asyncio) + PyMongo
- **Data Validation & Schemas**: Pydantic v2 (Strict typing, JSON schema validation)
- **Security & Cryptography**:
  - Passwords: `bcrypt` hashing with salt rounds
  - Authentication: `PyJWT` (JSON Web Tokens) with HMAC-SHA256
  - Security Headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Permissions-Policy`
- **Real-time WebSockets**: FastAPI WebSocket endpoint (`/ws`) for instant kitchen-waiter event dispatching
- **Static File Engine**: FastAPI `StaticFiles` mounted at `/uploads` for photos and QR graphics

---

## 🗄️ Database & Cloud Infrastructure

- **Database Engine**: **MongoDB Atlas (Cloud Cluster)**
- **Cluster Connection**: `cluster0.z9vmrax.mongodb.net`
- **Database Name**: `hotel_billing`
- **Driver**: Async Motor Client with connection pooling and automated index creation

### Primary MongoDB Collections:
1. `users`: Staff credentials, roles (`ADMIN`, `WAITER`, `KITCHEN`), personal tip UPI settings.
2. `categories`: Food and beverage menu groupings with order sort indices.
3. `products`: Menu items, pricing, GST tax rates, food types (`VEG`, `NON_VEG`, `EGG`), meal times.
4. `tables`: Dining room tables with real-time status (`FREE`, `OCCUPIED`).
5. `orders`: Live and archived orders, items list, kitchen preparation statuses, totals, discounts.
6. `payments`: Payment transactions, split tenders (`CASH`, `UPI`, `CARD`), reference numbers, timestamps.
7. `tips`: Waiter digital tips logged per order and staff member.
8. `audit_logs`: Immutable trail of actions (staff logins, order edits, cancellations, voids).
9. `settings`: Single-source restaurant legal profile, GSTIN, FSSAI, brand name, and UPI QR graphics.

---

## 📂 Architecture & Folder Structure

```
d:\Hotel
├── OVERVIEW.md                     # Central system documentation (This file)
├── backend/
│   ├── app/
│   │   ├── core/
│   │   │   ├── config.py           # Environment variables & configuration
│   │   │   ├── database.py         # MongoDB connection & index automation
│   │   │   ├── deps.py             # FastAPI dependency injection & Auth guards
│   │   │   ├── security.py         # Password hashing & JWT generation
│   │   │   └── utils.py            # Date, currency, and string helpers
│   │   ├── models/
│   │   │   └── enums.py            # Canonical system enums (Roles, Statuses)
│   │   ├── routers/                # REST API Endpoints
│   │   │   ├── auth.py             # Login, register, profile
│   │   │   ├── orders.py           # Order lifecycle & item modifications
│   │   │   ├── kitchen.py          # KDS ticket feeds & stage transitions
│   │   │   ├── payments.py         # Billing settlements & split payments
│   │   │   ├── products.py         # Menu item management
│   │   │   ├── categories.py       # Menu category management
│   │   │   ├── tables.py           # Dining floor management
│   │   │   ├── reports.py          # Revenue & sales aggregations
│   │   │   ├── settings.py         # Restaurant legal & UPI profile
│   │   │   ├── uploads.py          # Image upload receiver
│   │   │   ├── tips.py             # Waiter digital tip logging
│   │   │   └── ws.py               # Real-time WebSocket dispatcher
│   │   └── schemas/                # Pydantic request/response schemas
│   └── uploads/images/             # Uploaded menu photos & QR assets
│
└── frontend/
    ├── src/
    │   ├── assets/                 # Official brand logo & graphics
    │   ├── components/             # Reusable UI component library
    │   │   ├── BrandLogo.tsx       # Official Spice Garden logo component
    │   │   ├── Button.tsx          # Pressable ripple-enabled button
    │   │   ├── Modal.tsx           # Accessible responsive dialogs (92dvh)
    │   │   ├── StatCard.tsx        # Financial metrics & KPI card
    │   │   ├── OrderStatusBadge.tsx# Color-coded status pills
    │   │   ├── NotificationBell.tsx# Unread alerts dropdown with pulse
    │   │   ├── SplitPaymentModal.tsx# Multi-tender split payment modal
    │   │   └── WhatsAppShareModal.tsx# Pre-filled WhatsApp bill sharing
    │   ├── context/
    │   │   ├── AuthContext.tsx     # Authentication state
    │   │   └── NotificationContext.tsx# Real-time WebSockets & audio
    │   ├── layouts/
    │   │   ├── AppLayout.tsx       # Primary responsive shell with pinned sidebar
    │   │   └── AuthLayout.tsx      # Sign-in/Register shell
    │   ├── pages/
    │   │   ├── admin/              # Admin Portal (Dashboard, Staff, Reports, etc.)
    │   │   ├── waiter/             # Waiter Station (Take Order, Billing, etc.)
    │   │   ├── kitchen/            # Kitchen Display System (KDS)
    │   │   └── auth/               # Login & Register screens
    │   ├── services/               # Axios API client services
    │   ├── types/                  # Shared TypeScript interfaces
    │   └── utils/                  # Formatting, sound, WhatsApp helpers
    └── index.html                  # HTML entry, Manrope fonts, favicon
```

---

## 🖥️ Portals & Feature Breakdown

### 1. Admin Portal (`/admin`)
- **Executive Dashboard**: Live revenue, today's sales, active orders count, occupied tables, average ticket size.
- **Menu & Product Management**: Photo upload, food types (`Veg`/`Non-Veg`/`Egg`), meal timings, tax brackets, search & filter.
- **Categories & Table Layouts**: Custom sections and capacity tracking.
- **Staff Accounts**: Role assignment (`Admin`, `Waiter`, `Kitchen`), activation toggles.
- **Financial Reports & Analytics**: Daily/weekly/monthly revenue graphs, category performance, payment breakdown charts.
- **Audit Trail**: Real-time logging of cancellations, voids, staff logins, price adjustments.
- **Restaurant Settings & UPI**: Legal business info, GSTIN, FSSAI, **Dynamic Restaurant UPI VPA & QR graphic upload**.

### 2. Waiter Station (`/waiter`)
- **Floor Plan / Tables View**: Color-coded table tiles (`Free`, `Occupied`, `Food Ready`) with search & occupancy filters.
- **Mobile POS & Take Order**:
  - Category chips horizontal swipe.
  - Floating bottom ticket bar (< 1024px) with live item count and subtotal.
  - Slide-up cart drawer with instant quantity modifications and kitchen dispatch.
- **Order Ready Queue**: Instant audio-visual alerts when food is prepared by the chef.
- **Billing & Settlement**:
  - Single-tender (`Cash`, `UPI`, `Card`) and Multi-Tender Split payments.
  - **Dynamic UPI Payment QR**: Auto-fills the exact bill amount (e.g. ₹336.00) and Spice Garden merchant name on customer's GPay/PhonePe.
  - Cash tender change calculator.
  - WhatsApp digital receipt pre-fill (`*SPICE GARDEN*` formatted text).
  - Thermal receipt printing with clean print CSS rules.

### 3. Kitchen Display System (`/kitchen`)
- **4-Stage Kanban Workflow**: `New Orders` → `In Preparation` → `Ready for Pickup` → `Served & Done`.
- **Single-Screen Fit**: Fitted viewport height with smooth internal column scrolling.
- **Mobile / Tablet Tabs**: Quick stage filter chips on touch screens.
- **Touch Targets**: 48px+ quick action buttons ("Accept Order", "Ready", "Served").
- **Audio Chimes**: Web Audio API sound alerts when new tickets arrive.

---

## 🎨 Visual Design & Typography System

- **Palette**: Warm Luxury Champagne (`#FAF7F2` to `#805C2B`), Graphite Charcoal (`#161817` to `#202322`), Emerald Green (`#276B49`), Crimson Amber.
- **Typography**: **Manrope** primary font stack:
  - Page Titles: `Manrope` 700/800
  - Card & Section Titles: `Manrope` 600/700
  - Body Text: `Manrope` 400/500
  - Currency & Financial Figures: `Manrope` 700 with `.tabular-nums`
- **Branding**: Official **Spice Garden** crest logo incorporated across login, headers, sidebar badge, invoices, and tab favicon.

---

## 🔄 Real-time System & Notifications

- **WebSocket Protocol**: `/ws` bi-directional event stream.
- **Real-time Events**:
  - `ORDER_CREATED`: Notifies Kitchen when a waiter sends items.
  - `ORDER_UPDATED`: Live sync across all waiter tables.
  - `ORDER_READY`: Triggers waiter bell pulse and audio chime.
  - `ORDER_CLOSED`: Frees up tables across all devices instantly.
- **Shift Memory Guard**: Bounded 100-notification FIFO state with pulse timer unmount cleanups for 8+ hour continuous uptime.

---

## 📅 Daily Changelog & Update History

- **Table Status Sync & Auto-Reconciliation**: Implemented backend table auto-healing startup routine (`reconcile_table_statuses`) to release orphaned table statuses back to `FREE` in MongoDB, and synchronized frontend `WaiterTablesPage` counts, filters, and cards to match real active orders.
- **Admin UPI & QR Engine**: Added primary UPI ID configuration and device photo upload in Admin Settings with live dynamic amount QR code generation on the Waiter Billing screen.
- **Waiter Close Order UX**: Removed redundant "Open Bill" button and made "Pay Bill →" a full-width primary CTA.
- **Mouse-Wheel Scroll Containment**: Fixed sidebar scroll leakage to main page using `overscroll-contain` and tuned KDS viewport height.
- **Sidebar Fixed Profile**: Anchored "Super Admin / Staff Profile" and "Sign Out" permanently at the bottom of the sidebar with independent navigation scrolling for Admin, Waiter, and Kitchen portals.
- **Manrope Typography System**: Upgraded whole application typography to `Manrope` font with tabular numbers and responsive tracking.
- **Spice Garden Official Logo**: Integrated official gold crest logo across Login, Navigation Drawer, Sidebar, Invoice Receipts, WhatsApp templates, and Favicon.
- **Mobile Take Order Layout & Bottom Cart Clearance**: Added `pb-32` scroll clearance, floating cart drawer, and card self-stretch ergonomics.
- **Split Billing Fix**: Implemented sequential split payment execution in `billing.ts`.
