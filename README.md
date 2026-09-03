# Restaurant Billing & Order Management System

A single React application with three role-based panels — **Admin**, **Waiter**, **Kitchen** —
backed by a FastAPI + MongoDB API.

| Layer    | Stack                                                              |
| -------- | ------------------------------------------------------------------ |
| Frontend | React 19, Vite, TypeScript, Tailwind CSS v4, React Router, Axios     |
| Realtime | Native WebSockets (`/ws`), role-scoped broadcast rooms               |
| Backend  | Python, FastAPI, Pydantic v2, PyMongo (async driver), JWT            |
| Database | MongoDB                                                             |

---

## Build status

| Phase | Scope                                                             | Status |
| ----- | ----------------------------------------------------------------- | ------ |
| 1     | Project setup, JWT auth, roles, route protection, staff management | ✅ Done |
| 2     | Categories, products, tables, admin CRUD                           | ✅ Done |
| 3     | Waiter tables, cart, order creation                                | ✅ Done |
| 4     | Kitchen panel, real-time order flow                                | ✅ Done |
| 5     | Billing, GST, cash / UPI / card / split payments                   | ✅ Done |
| 6     | Tips, WhatsApp bill sharing, QR codes                              | ✅ Done |
| 7     | Reports and charts                                                 | ✅ Done |
| 8     | Audit logs, hardening, tests, performance                          | ✅ Done |

---

## Prerequisites

- **Node.js** 20+ (tested on 24)
- **Python** 3.11+ (tested on 3.14)
- **MongoDB** — either a local `mongod` on `localhost:27017`, or a free
  [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) cluster.
  Nothing else needs installing; the backend creates its own collections and indexes.

---

## Setup

### 1. Backend

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate          # Windows;  source .venv/bin/activate on macOS/Linux
pip install -r requirements.txt

cp .env.example .env            # then edit .env — see below
uvicorn app.main:app --reload --port 8000
```

API docs: <http://localhost:8000/docs> · Health check: <http://localhost:8000/api/health>

**Edit `backend/.env` before first run:**

| Variable                   | Notes                                                              |
| -------------------------- | ------------------------------------------------------------------ |
| `MONGODB_URI`              | `mongodb://localhost:27017` or your Atlas `mongodb+srv://...` URI    |
| `MONGODB_DB`               | Database name (default `hotel_billing`)                             |
| `JWT_SECRET`               | **Change this.** `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `BOOTSTRAP_ADMIN_EMAIL`    | First admin, created only when no admin exists yet                  |
| `BOOTSTRAP_ADMIN_PASSWORD` | Change immediately after the first login                            |
| `CORS_ORIGINS`             | Comma-separated allowed origins                                     |

On first startup with an empty database the backend creates one admin account and logs a
warning. Default credentials: **admin@myhotel.com / Admin@123** — change the password from
*Profile → Change password* right away.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

App: <http://localhost:5173>

The dev server proxies `/api` and `/socket.io` to `http://localhost:8000`, so no CORS setup is
needed locally. For a split deployment, set `VITE_API_URL` in `frontend/.env` instead.

---

## Tests

```bash
cd backend
.venv/Scripts/python.exe -m pytest tests -q
```

The suite runs against an in-memory MongoDB stand-in (`tests/fake_mongo.py`), so **no running
MongoDB is required**. It covers registration, login, JWT validation, disabled accounts,
role-based access and password changes; category/product/table CRUD with their uniqueness and
referential rules; and the whole order workflow — GST maths, price snapshots, add-on rounds,
the table lifecycle, derived order status, and the cancellation rules; and the kitchen board,
item-level transitions, kitchen permissions, and the WebSocket handshake and broadcasts; and
billing — split payments, change calculation, overpayment and void rules, and the conditions
for closing an order; and tips — that they never touch the food bill, per-waiter visibility,
and the tip QR endpoints; and the reports — every total, the local-day windowing, and that
cancelled orders and voided payments stay out of revenue; and the audit trail plus the
hardening — that every money-touching action is recorded with before/after values, that the log
is admin-only and append-only, and that throttling stops a brute force without locking out the
rest of the floor.

---

## Project structure

```
backend/
├── app/
│   ├── core/          config, database, security (hashing + JWT), dependencies, ratelimit
│   ├── models/        enums.py — the shared domain vocabulary
│   ├── schemas/       Pydantic request/response models
│   ├── routers/       auth, users, categories, products, tables, orders,
│   │                  kitchen, payments, tips, reports, audit, settings, ws
│   ├── realtime.py    WebSocket connection manager and broadcast rooms
│   ├── services/      users, orders (money, status derivation, invoice numbers),
│   │                  payments, reports (aggregation), audit
│   └── main.py        app factory, lifespan, CORS, admin bootstrap
└── tests/

frontend/src/
├── components/        Button, Input, Alert, Spinner, StatCard, EmptyState, Modal,
│                      ConfirmDialog, charts/ (theme, ChartCard, Charts)
├── context/           AuthContext — session state and role home routes
├── hooks/             useAuth
├── layouts/           AuthLayout, AppLayout (responsive sidebar)
├── pages/             auth/, admin/, waiter/, kitchen/, ProfilePage
├── routes/            ProtectedRoute, PublicOnlyRoute, AppRoutes
├── services/          axios instance + api modules
├── types/             enums and interfaces mirroring the backend
└── utils/             currency, date and enum formatting
```

---

## API (Phase 1)

| Method                | Endpoint                          | Access               |
| --------------------- | --------------------------------- | -------------------- |
| `POST`                | `/api/auth/register`              | Public (WAITER / KITCHEN only) |
| `POST`                | `/api/auth/login`                 | Public               |
| `GET`                 | `/api/auth/me`                    | Any signed-in user   |
| `POST`                | `/api/auth/change-password`       | Any signed-in user   |
| `POST`                | `/api/auth/logout`                | Any signed-in user   |
| `GET` / `POST`        | `/api/users`                      | Admin                |
| `GET`/`PATCH`/`DELETE`| `/api/users/{id}`                 | Admin                |
| `POST`                | `/api/users/{id}/reset-password`  | Admin                |
| `GET`                 | `/api/health`                     | Public               |

**Phase 2 — catalog**

| Method                 | Endpoint                  | Access                    |
| ---------------------- | ------------------------- | ------------------------- |
| `GET`                  | `/api/categories`         | Any signed-in user        |
| `POST`                 | `/api/categories`         | Admin                     |
| `GET`/`PATCH`/`DELETE` | `/api/categories/{id}`    | Read: any · Write: admin  |
| `GET`                  | `/api/products`           | Any signed-in user        |
| `POST`                 | `/api/products`           | Admin                     |
| `GET`/`PATCH`/`DELETE` | `/api/products/{id}`      | Read: any · Write: admin  |
| `GET`                  | `/api/tables`             | Any signed-in user        |
| `POST`                 | `/api/tables`             | Admin                     |
| `GET`/`PATCH`/`DELETE` | `/api/tables/{id}`        | Read: any · Write: admin  |

`GET /api/products` supports `search`, `categoryId`, `foodType`, `mealType`, `isAvailable`,
`page` and `pageSize`. `GET /api/tables` supports `status` and `isActive`.

**Phase 3 — orders**

| Method   | Endpoint                                | Notes                                     |
| -------- | --------------------------------------- | ----------------------------------------- |
| `GET`    | `/api/orders`                           | Filter by status, table, waiter, `openOnly` |
| `POST`   | `/api/orders`                           | Opens an order and occupies the table      |
| `GET`    | `/api/orders/by-table/{tableId}`        | The live order on an occupied table        |
| `GET`    | `/api/orders/{id}`                      |                                            |
| `PATCH`  | `/api/orders/{id}`                      | Customer details, discount                 |
| `DELETE` | `/api/orders/{id}`                      | Discards an unsent draft only              |
| `POST`   | `/api/orders/{id}/items`                | Add item (snapshots name, price, GST)      |
| `PATCH`  | `/api/orders/{id}/items/{itemId}`       | Change quantity; 0 removes                 |
| `DELETE` | `/api/orders/{id}/items/{itemId}`       | Unsent items only                          |
| `POST`   | `/api/orders/{id}/send-kitchen`         | Sends only items not yet sent              |
| `POST`   | `/api/orders/{id}/serve`                | Marks ready items as served                |
| `POST`   | `/api/orders/{id}/cancel`               | Requires a reason; frees the table         |

**Phase 4 — kitchen and live updates**

| Method  | Endpoint                                            | Notes                              |
| ------- | --------------------------------------------------- | ---------------------------------- |
| `GET`   | `/api/kitchen/orders`                               | The four board columns in one call |
| `POST`  | `/api/kitchen/orders/{id}/accept`                   | Start cooking the whole ticket     |
| `POST`  | `/api/kitchen/orders/{id}/ready`                    | Everything cooking is done         |
| `PATCH` | `/api/kitchen/orders/{id}/items/{itemId}`           | Move one line only                 |
| `POST`  | `/api/kitchen/orders/{id}/items/{itemId}/cancel`    | Out of stock, with a reason        |
| `WS`    | `/ws?token=<jwt>`                                   | Live events (see below)            |

### Live events

The JWT in the query string decides which rooms a socket joins — kitchen staff cannot
subscribe to a feed they are not entitled to. Browsers cannot set headers on a WebSocket
handshake, which is why the token travels as a query parameter; it is validated exactly like a
REST bearer token.

| Event           | Sent to           | When                                    |
| --------------- | ----------------- | --------------------------------------- |
| `order:new`     | kitchen, admin    | A waiter sends items to the kitchen     |
| `order:updated` | all rooms         | Any kitchen or serving movement         |
| `order:ready`   | waiters, admin    | An order flips to READY — the bell      |
| `order:closed`  | all rooms         | An order is cancelled or closed         |

The client (`src/services/realtime.ts`) keeps one shared socket for the whole app, pings every
25s, and reconnects with exponential backoff.

**Phase 5 — billing and payments**

| Method  | Endpoint                          | Notes                                        |
| ------- | --------------------------------- | -------------------------------------------- |
| `GET`   | `/api/orders/{id}/payments`       | Total, paid, due, and every tender           |
| `POST`  | `/api/orders/{id}/payments`       | One tender; call twice to split              |
| `POST`  | `/api/orders/{id}/close`          | Requires full payment; frees the table       |
| `GET`   | `/api/payments`                   | Admin; filter by method, include voided      |
| `POST`  | `/api/payments/{id}/void`         | Admin; reason required, record is kept       |
| `GET`   | `/api/settings`                   | Any signed-in user (the waiter prints bills) |
| `PATCH` | `/api/settings`                   | Admin                                        |

**Phase 6 — tips and sharing**

| Method  | Endpoint                       | Notes                                          |
| ------- | ------------------------------ | ---------------------------------------------- |
| `GET`   | `/api/orders/{id}/tips`        | Tips on one order                              |
| `POST`  | `/api/orders/{id}/tips`        | Cash or UPI, against the order waiter          |
| `GET`   | `/api/tips`                    | Admin sees all; a waiter sees only their own   |
| `POST`  | `/api/tips/{id}/void`          | Admin; reason required, record is kept         |
| `PATCH` | `/api/auth/me/tip-qr`          | A waiter maintains their own tip QR            |
| `GET`   | `/api/users/{id}/tip-qr`       | Name and QR only, for showing at the table     |

**Phase 7 — reports** (all admin-only)

| Endpoint                       | Returns                                              |
| ------------------------------ | ---------------------------------------------------- |
| `/api/reports/summary`         | Sales, GST, discounts, cash/UPI/card, pending, tips  |
| `/api/reports/series`          | Time series; `granularity=hour｜day｜month`           |
| `/api/reports/peak-hours`      | All 24 hours, so the chart has no gaps               |
| `/api/reports/products`        | Top products by revenue (`limit`)                    |
| `/api/reports/categories`      | Revenue rolled up to menu section                    |
| `/api/reports/waiters`         | Orders, sales, average order value, tips             |
| `/api/reports/tables`          | Orders, sales, average order value                   |
| `/api/reports/payment-methods` | Amount and count per method                          |
| `/api/reports/kitchen`         | Pickup time, cook time, slowest ticket               |

Every one takes `fromDate`, `toDate` (UTC, ISO with a trailing `Z`) and `tzOffsetMinutes`.
**The client computes the window from its own clock**, which is the only way "today" can mean
the restaurant's local day rather than a UTC one — an evening service would otherwise land on
the wrong date. Presets (today, yesterday, this/last week, this/last month, this year, custom)
live in `src/services/reports.ts`.

**Phase 8 — audit trail**

| Method | Endpoint           | Notes                                                     |
| ------ | ------------------ | --------------------------------------------------------- |
| `GET`  | `/api/audit-logs`  | Admin only. Filter by action, entity, user, date, search.  |

There is deliberately no POST, PATCH or DELETE. The collection is append-only, and the API
offers no way to alter or remove a row.

Logged actions: order opened / item removed / cancelled / closed, payment taken / voided,
tip recorded / voided, product price changed, staff added / disabled / password reset. Each row
carries who did it, the entity it touched, and the before and after values.

### Security

- **Login throttling, two tiers.** Eight failures per *account*, fifty per *address*. The gap is
  deliberate: every till and tablet in a restaurant shares one public IP, so a tight per-IP limit
  would let one waiter mistyping their password lock the whole floor out mid-service. The address
  tier is there to stop a script working through many accounts, not to police one person. A
  correct password clears the counter, so an honest typo costs nothing.
- **Security headers** on every response: `X-Content-Type-Options: nosniff`, `X-Frame-Options:
  DENY`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`.
- **Unhandled errors never leak a stack trace.** The detail goes to the server log; the caller
  gets a generic message.
- **Startup config check.** The server logs a loud `INSECURE CONFIG` warning for a default
  `JWT_SECRET`, a default admin password, open staff registration, or wildcard CORS.

The rate limiter is in-process, which is the honest scope for a single-restaurant deployment.
Behind several uvicorn workers each keeps its own count — that loosens the limit without breaking
it, and a shared store is the upgrade path.

The WhatsApp share is the official click-to-chat deep link (`wa.me`), built in
`src/utils/whatsapp.ts` — no unofficial automation. It normalises locally-typed numbers
(`98765 43210`, `09876543210`, `+91 98765 43210`) against the configurable
`whatsappCountryCode`, and the button hides itself when there is no usable number.

Example:

```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@myhotel.com","password":"Admin@123"}'
```

---

## Design decisions carried through every phase

- **Roles are enforced on the backend.** Frontend route guards are UX only; every protected
  endpoint re-checks the role from the JWT.
- **Accounts are disabled, never deleted** — orders reference staff forever. A disabled user is
  rejected at login *and* on their existing token.
- **Tables cycle `FREE → OCCUPIED → FREE`.** They are never permanently closed.
- **Order status and per-item kitchen status are separate** (`app/models/enums.py`), so one
  order can hold items that are `READY`, `PREPARING` and `PENDING` at once.
- **Order items store the price and GST rate used at billing time**, so historical bills never
  change when a product price changes.
- **Each payment is its own record**, which is what makes split payments (₹800 UPI + ₹200 cash)
  add up correctly.
- **Tips are stored separately from the food bill**, against the waiter. A tip never changes
  `grandTotal` or `amountPaid`, and a generous tip can never settle an unpaid bill.
- **The audit trail is append-only and never blocks the till.** A failure writing a log is
  logged and swallowed: a working till that lost one audit row beats a till that stopped
  mid-service.
- **Charts use a colourblind-safe palette, not the brand orange.** The three series hues are
  validated for colour-vision deficiency (worst-pair deltaE 9.2) rather than chosen by eye, colour
  always follows the entity rather than its rank, sales and order counts get separate charts
  instead of a second y-axis, and every chart has a table view — which is also what makes the
  lightest hue safe to use.
- **Realtime uses native WebSockets, not Socket.IO.** The payloads are one-way broadcasts into
  role rooms, which needs none of the Socket.IO protocol, and it keeps the browser side free of
  an extra dependency.
- **Displaying a UPI QR never marks a payment as successful** — a waiter confirms it, and the
  payment model leaves room for a gateway later.
