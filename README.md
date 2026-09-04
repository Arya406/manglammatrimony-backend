# Manglam Matrimony — Backend API Service

Production REST API service for Manglam Matrimony built with **Node.js**, **Express**, **TypeScript**, **Prisma ORM**, and **PostgreSQL**.

---

## Deployment on Render

### Method 1: Using Render Blueprint (Fastest & Recommended)

This repository includes a [`render.yaml`](./render.yaml) blueprint specification.

1. Log in to your [Render Dashboard](https://dashboard.render.com).
2. Click **New +** $\rightarrow$ **Blueprint**.
3. Connect your GitHub repository (`Arya406/manglammatrimony-backend`).
4. Render will parse `render.yaml` and configure the Web Service automatically:
   - **Runtime**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm run db:deploy && npm start`
   - **Health Check Path**: `/api/health`
5. Fill in the required environment variables:
   - `DATABASE_URL`: Your production PostgreSQL connection string (from Render Postgres, Supabase, Neon, etc.).
   - `RESEND_API_KEY`: Your Resend API key (`re_...`).
   - `RESEND_FROM_EMAIL`: Verified sender domain (e.g., `Manglam Matrimony <auth@manglammatrimony.com>`).
   - `CLIENT_ORIGIN`: Your Vercel frontend domain (e.g., `https://manglammatrimony-frontend.vercel.app`).
6. Click **Apply**. Render will build, migrate, and deploy your service.

---

### Method 2: Manual Web Service Setup on Render

If you prefer to configure manually:

1. In Render Dashboard, click **New +** $\rightarrow$ **Web Service**.
2. Select your GitHub repository: `Arya406/manglammatrimony-backend`.
3. Configure settings:
   | Setting | Value |
   |---|---|
   | **Name** | `manglammatrimony-backend` |
   | **Region** | `Oregon (US West)` (or closest to users) |
   | **Branch** | `main` |
   | **Runtime** | `Node` |
   | **Build Command** | `npm install && npm run build` |
   | **Start Command** | `npm run db:deploy && npm start` |
   | **Plan** | `Free` or `Starter` |

4. Under **Advanced** $\rightarrow$ **Health Check Path**, enter: `/api/health`.
5. Under **Environment Variables**, add the variables listed below.
6. Click **Create Web Service**.

---

## Required Production Environment Variables

| Variable | Description | Example |
|---|---|---|
| `NODE_ENV` | Application environment | `production` |
| `PORT` | Service port (Render sets this automatically) | `10000` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/dbname?sslmode=require` |
| `JWT_SECRET` | Secret key for signing JWT tokens | `<strong-random-secret-key>` |
| `JWT_EXPIRY` | JWT session expiration | `7d` |
| `CLIENT_ORIGIN` | Allowed CORS origins (comma-separated) | `https://manglammatrimony-frontend.vercel.app,http://localhost:3000` |
| `RESEND_API_KEY` | Resend API Key | `re_123456789...` |
| `RESEND_FROM_EMAIL` | Verified sender email | `Manglam Matrimony <auth@manglammatrimony.com>` |
| `OTP_EXPIRY_SECONDS` | OTP lifespan | `600` (10 minutes) |
| `OTP_RESEND_COOLDOWN_SECONDS` | Cooldown before resend | `60` (60 seconds) |
| `OTP_MAX_ATTEMPTS` | Maximum failed verification attempts | `5` |
| `OTP_PROVIDER` | OTP provider engine | `resend` |
| `DEV_PHOTO_APPROVAL_ENABLED` | Bypass moderation (MUST be false in prod) | `false` |

---

## Local Development

```bash
# 1. Install dependencies
npm install

# 2. Run database migrations
npm run db:migrate

# 3. Seed database (reference lists & mock profiles)
npm run db:seed

# 4. Start development server with hot-reload
npm run dev
```

---

## Testing & Quality Assurance

```bash
# Run focused Email OTP test suite (20 core scenarios)
npx tsx scripts/test-email-auth-resend.ts

# TypeScript compilation check
npm run lint
```
