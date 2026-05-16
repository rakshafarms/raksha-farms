# Raksha Farms — Farm Fresh Grocery Delivery

A full-stack grocery ordering platform for **Raksha Farms** (www.rakshafarms.com).
Customers can browse fresh produce, place orders, and track deliveries.
Admins manage inventory, orders, and subscriptions through a separate dashboard.

---

## Architecture

```
raksha-farms/
├── frontend/   # Customer-facing React + Vite app  → www.rakshafarms.com
├── backend/    # Express + PostgreSQL REST API      → raksha-farms.onrender.com
└── admin/      # Next.js admin dashboard            → raksha-farms-vxa5.vercel.app
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Customer frontend | React 18, Vite, Tailwind CSS, React Router v6 |
| Admin dashboard | Next.js 14 (App Router), Tailwind CSS |
| Backend API | Node.js, Express, PostgreSQL |
| Authentication | JWT (30-day expiry) + Google One Tap (FedCM) |
| Payments | Razorpay (UPI, cards, net banking) |
| File uploads | Multer → Render persistent disk at `/uploads` |
| Security | Helmet.js, express-rate-limit, CORS whitelist |
| Frontend hosting | Vercel |
| Backend hosting | Render (free tier — cold-start up to 40s on first request) |

---

## Local Development Setup

### 1. Database (PostgreSQL)

```bash
createdb raksha_farms
```

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env   # fill in your values — see Environment Variables below
node src/config/migrate.js   # create all DB tables
node src/config/seed.js      # (optional) seed sample products
npm run dev                  # runs on http://localhost:4000
```

### 3. Admin Dashboard

```bash
cd admin
npm install
# create admin/.env.local with NEXT_PUBLIC_API_URL=http://localhost:4000/api
npm run dev   # runs on http://localhost:3001
```

### 4. Customer Frontend

```bash
cd frontend
npm install
# create frontend/.env with VITE_API_URL=http://localhost:4000
npm run dev   # runs on http://localhost:5173
```

---

## Environment Variables

### backend/.env

```env
PORT=4000
NODE_ENV=development

# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=raksha_farms
DB_USER=postgres
DB_PASSWORD=yourpassword

# JWT — use a random 64-character string in production
JWT_SECRET=your_super_secret_jwt_key_min_32_chars

# CORS origins (comma-separated if needed)
ADMIN_URL=http://localhost:3001
CLIENT_URL=http://localhost:5173

# Upload directory (Render persistent disk in production)
UPLOAD_DIR=/var/data/uploads
```

### frontend/.env (local) / frontend/.env.production (Vercel)

```env
VITE_API_URL=https://raksha-farms.onrender.com
```

> **Important:** Remove `VITE_ADMIN_PASSWORD` from `.env.production` — it is not used and exposes a secret.

### admin/.env.local (local) / admin/.env.production (Vercel)

```env
NEXT_PUBLIC_API_URL=https://raksha-farms.onrender.com/api
```

---

## Project Structure

### backend/src/

```
config/
  database.js        # pg Pool singleton
  initDb.js          # runs migrate.js on server start
  migrate.js         # CREATE TABLE IF NOT EXISTS for all tables
  seed.js            # optional sample data seeder

routes/              # one file per resource (auth, products, orders, …)
controllers/         # business logic, one file per resource
middleware/
  auth.js            # verifyToken — validates JWT Bearer token
uploads/             # local dev upload dir (Render uses /var/data/uploads)
server.js            # Express app, CORS, rate-limiting, route mounting
```

### frontend/src/

```
context/
  AuthContext.jsx     # login / Google OAuth / logout / JWT storage
  CartContext.jsx     # cart state + localStorage persistence
  ProductsContext.jsx # product list + category list from API
  OrdersContext.jsx   # customer's order history
  AddressContext.jsx  # saved delivery addresses
  WishlistContext.jsx # saved wishlist products
  ToastContext.jsx    # toast notification queue

pages/
  HomePage.jsx              # hero, featured products, shop grid
  ProductPage.jsx           # single product detail + add to cart
  CartPage.jsx              # cart review + coupon code
  CheckoutPage.jsx          # address → payment → confirm (Razorpay)
  OrderConfirmationPage.jsx # post-order success screen
  OrderTrackingPage.jsx     # real-time order status
  MyOrdersPage.jsx          # customer's order history
  WishlistPage.jsx          # saved wishlist
  ProfilePage.jsx           # account details + subscription info
  LoginPage.jsx             # email/password + Google One Tap

components/                 # Navbar, Footer, ProductCard, CartDrawer, …

data/
  products2.js       # fallback product list used before API loads

utils/
  constants.js       # shared values (free delivery threshold, etc.)
```

### admin/src/app/

```
login/          # admin email + password authentication
orders/         # order list, status updates (locked after final status)
products/       # CRUD with image upload
customers/      # customer list + details
subscriptions/  # recurring order management
analytics/      # revenue charts, KPIs
coupons/        # discount code management
settings/       # store configuration
```

---

## API Overview

All endpoints are prefixed with `/api/`.

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/auth/register` | — | Register customer |
| POST | `/auth/login` | — | Login (returns JWT) |
| POST | `/auth/google` | — | Google One Tap login |
| POST | `/auth/logout` | JWT | Invalidate token |
| GET | `/products` | — | Active products (stock > 0) |
| GET | `/products/admin` | JWT | All products incl. inactive |
| POST | `/products` | JWT | Create product + image upload |
| PUT | `/products/:id` | JWT | Update product |
| DELETE | `/products/:id` | JWT | Soft-delete (archive) |
| GET | `/orders` | JWT | All orders (admin) |
| POST | `/orders` | JWT | Place order (validates stock) |
| PATCH | `/orders/:id/status` | JWT | Update status (locked after final) |
| GET | `/orders/by-phone/:phone` | JWT | Customer's own orders |
| GET | `/orders/events` | JWT | SSE stream for real-time notifications |
| GET | `/analytics` | JWT | Dashboard KPIs + chart data |
| GET | `/categories` | — | Product categories |
| GET/POST/DELETE | `/cart` | JWT | Persistent server-side cart |
| GET/POST/DELETE | `/wishlist` | JWT | Wishlist |
| GET/POST | `/addresses` | JWT | Saved delivery addresses |
| GET/POST | `/coupons` | — / JWT | Validate / manage coupons |
| GET/POST | `/subscriptions` | JWT | Recurring orders |
| GET/POST | `/subscription-plans` | JWT | Plan management |
| POST | `/payments/create-order` | JWT | Create Razorpay order |
| POST | `/payments/verify` | JWT | Verify payment signature |
| GET | `/settings` | — / JWT | Store settings |
| GET | `/health` | — | Health check |

---

## Order Status Flow

```
placed → confirmed → out_for_delivery → delivered
                  ↘ cancelled (by customer)
                  ↘ rejected  (by admin)
```

Once an order reaches `out_for_delivery`, `delivered`, `cancelled`, or `rejected`, the status is **locked** — admin cannot change it.

Customers see:
- `cancelled` → "Cancelled by you"
- `rejected`  → "Rejected by Admin"

---

## Deployment

### Backend → Render

1. Connect your GitHub repo to Render.
2. `render.yaml` in the project root configures the service automatically.
3. Set these environment variables in the Render dashboard:
   - `DATABASE_URL` — your Render PostgreSQL connection string
   - `JWT_SECRET` — random 64-character string (generate: `openssl rand -hex 32`)
   - `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` — live keys from Razorpay dashboard
   - `ADMIN_URL` — `https://raksha-farms-vxa5.vercel.app`
   - `CLIENT_URL` — `https://www.rakshafarms.com`
   - `UPLOAD_DIR` — `/var/data/uploads` (Render persistent disk mount path)
4. Add a **Render Disk** (persistent storage) mounted at `/var/data/uploads` for product images.

> Render free-tier services sleep after 15 minutes of inactivity. The first request after sleep takes 20–40 seconds. The frontend handles this automatically with a built-in retry (0 / 8 / 16 second delays) and shows "Connecting… please wait."

### Frontend → Vercel

1. Connect `frontend/` directory to Vercel.
2. Set `VITE_API_URL=https://raksha-farms.onrender.com` in Vercel environment variables.
3. Vercel auto-deploys on every push to `master`.

### Admin Dashboard → Vercel

1. Connect `admin/` directory to Vercel (separate Vercel project).
2. Set `NEXT_PUBLIC_API_URL=https://raksha-farms.onrender.com/api` in Vercel environment variables.
3. Vercel auto-deploys on every push to `master`.

---

## Security Notes

- JWT tokens expire after **30 days**. Admin sessions auto-logout after **30 minutes of inactivity**.
- Rate limits: auth endpoints — 20 req/15 min; coupon validation & by-phone lookup — 5 req/min; all other API — 200 req/min.
- Product images are served from `/uploads` on the backend (not the frontend origin), protected by `crossOriginResourcePolicy: cross-origin`.
- Internal error details are never sent to the client — all 500 responses return `{ error: "Something went wrong" }`.
- CORS is restricted to an explicit list: `rakshafarms.com`, `raksha-farms-vxa5.vercel.app`, and localhost origins.
- Admin login uses `sameSite: strict` cookies so the token cannot be sent by cross-site requests.

---

## Database Utilities

```bash
# Apply schema changes (safe to run repeatedly — all statements use IF NOT EXISTS)
node backend/src/config/migrate.js

# Seed the database with sample products and categories
node backend/src/config/seed.js
```

---

## Features

- Browse fresh vegetables, fruits, and grocery products
- Category and search filtering
- Add to cart / wishlist with persistent server-side storage
- 3-step checkout: address → payment (Razorpay) → confirm
- Real-time order status tracking
- Coupon / discount code support
- Recurring subscription orders
- Customer profile with saved addresses
- Google One Tap login
- Admin dashboard: orders, products (with image upload), customers, analytics, subscriptions, coupons, settings
- Real-time admin order notifications via Server-Sent Events (SSE)
- Mobile-first responsive design
