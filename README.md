# ThisThat v2 - Testing Clone

A standalone clone of ThisThat v2 for testing Polymarket integration, betting system, ICPay payments, and X authentication.

**Excludes:** Supabase (replaced with local PostgreSQL)

**Includes:**
- ✅ Betting system with Polymarket CLOB integration
- ✅ Market fetching and ingestion
- ✅ ICPay credit purchase system
- ✅ X (Twitter) OAuth authentication
- ✅ Full frontend UI
- ✅ Local PostgreSQL databases
- ✅ Redis caching

---

## Prerequisites

1. **PostgreSQL** (v14+)
   - Install from: https://www.postgresql.org/download/
   - Default port: 5432

2. **Redis** (v6+)
   - Option A: Local Redis - https://redis.io/download
   - Option B: Upstash (free tier) - https://upstash.com/

3. **Node.js** (v18+)
   - Install from: https://nodejs.org/

4. **API Keys** (required):
   - **ICPay:** Get from https://icpay.com/dashboard
   - **X OAuth:** Get from https://developer.twitter.com/
   - **Polymarket:** Optional (read-only endpoints work without keys)

---

## Quick Start

### 1. Database Setup

Create two PostgreSQL databases:

```bash
# Connect to PostgreSQL
psql -U postgres

# Create databases
CREATE DATABASE thisthat_markets;
CREATE DATABASE thisthat_users;

# Exit
\q
```

### 2. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Copy environment template
cp .env.local .env

# Edit .env and add your credentials:
# - Update POSTGRES_PASSWORD if different from 'postgres'
# - Add ICPAY_SECRET_KEY
# - Add X_CLIENT_ID and X_CLIENT_SECRET
# - Add POLYMARKET_API_KEY (optional)
# - Update REDIS_URL if using local Redis

# Run Prisma migrations
npx prisma migrate deploy --schema=prisma/schema.users.prisma
npx prisma migrate deploy --schema=prisma/schema.markets.prisma

# Seed credit packages
npx prisma db seed

# Generate Prisma clients
npx prisma generate --schema=prisma/schema.users.prisma
npx prisma generate --schema=prisma/schema.markets.prisma

# Start backend
npm run dev
```

Backend will run on `http://localhost:3001`

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start frontend
npm run dev
```

Frontend will run on `http://localhost:5173`

---

## Environment Variables

### Required

```env
# Database
MARKETS_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/thisthat_markets
USERS_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/thisthat_users

# Redis
REDIS_URL=redis://localhost:6379

# JWT (generate random strings for production)
JWT_ACCESS_SECRET=your-secret-here
JWT_REFRESH_SECRET=your-secret-here

# ICPay
ICPAY_SECRET_KEY=your-icpay-key
ICPAY_WEBHOOK_SECRET=your-webhook-secret

# X OAuth
X_CLIENT_ID=your-x-client-id
X_CLIENT_SECRET=your-x-client-secret
X_REDIRECT_URI=http://localhost:3001/api/v1/auth/x/callback

# Frontend URL
FRONTEND_URL=http://localhost:5173
```

### Optional

```env
# Polymarket (for market data - optional)
POLYMARKET_API_KEY=
POLYMARKET_API_SECRET=
POLYMARKET_API_PASSPHRASE=

# PostHog Analytics (optional)
POSTHOG_KEY=
POSTHOG_HOST=https://us.i.posthog.com
```

---

## Database Schema

### Markets Database (`thisthat_markets`)

**Market** - Polymarket market data
- `id`, `polymarketId`, `title`, `description`
- `thisOption`, `thatOption` (binary outcomes)
- `thisTokenId`, `thatTokenId` (for CLOB pricing)
- `thisOdds`, `thatOdds` (cached prices)
- `liquidity`, `volume`, `category`, `status`

### Users Database (`thisthat_users`)

**User** - User accounts
- OAuth integration (X/Twitter)
- Credit balances (free + purchased)
- P&L tracking, rankings

**Bet** - User bets
- AMM-based share trading
- Idempotency keys to prevent duplicates
- Status tracking (pending/won/lost)

**Payment** - ICPay transactions
- Credit purchases
- Transaction history
- Webhook event tracking

**CreditPackage** - Predefined packages
- Bonus percentages
- 2x multipliers

---

## Key Features

### 1. Polymarket Integration

**Data Flow:**
```
Gamma API (metadata) → PostgreSQL (static data)
CLOB API (live prices) → Redis cache → User bets
```

**Files:**
- `/backend/src/lib/polymarket-client.ts` - Gamma API client
- `/backend/src/services/polymarket-price.service.ts` - CLOB pricing
- `/backend/src/services/market-ingestion.service.ts` - Market sync job

**Endpoints:**
- `GET /api/v1/markets` - Get markets
- `GET /api/v1/markets/:id/live` - Live prices
- `GET /api/v1/markets/:id/price-history` - Price charts

### 2. Betting System

**Share-Based AMM:**
- User bets at current Polymarket price
- Receives shares: `shares = amount / price`
- Each share pays $1 if outcome wins
- No impact on Polymarket order book (read-only)

**Files:**
- `/backend/src/features/betting/betting.services.amm.ts` - AMM logic
- `/frontend/src/features/betting/components/SwipeableCard.tsx` - Swipe UI

**Endpoints:**
- `POST /api/v1/bets` - Place bet
- `GET /api/v1/bets/user/:userId` - User bets
- `POST /api/v1/bets/:id/sell` - Sell position

### 3. ICPay Integration

**Credit Purchase Flow:**
```
User selects package → Create payment intent → ICPay widget
→ User pays → Webhook → Credits awarded
```

**Files:**
- `/backend/src/features/payments/payments.services.ts` - Payment logic
- `/frontend/src/shared/components/PaymentModal.tsx` - ICPay widget

**Endpoints:**
- `GET /api/v1/payments/packages` - Get packages
- `POST /api/v1/payments/intent` - Create payment
- `POST /api/v1/payments/webhook` - ICPay webhook

### 4. X Authentication

**OAuth Flow:**
```
User clicks "Login with X" → Redirect to X → Callback → Create/login user
```

**Files:**
- `/backend/src/features/auth/oauth.services.ts` - OAuth logic
- `/frontend/src/app/pages/AuthCallback.tsx` - Callback handler

**Endpoints:**
- `GET /api/v1/auth/oauth/init` - Start OAuth
- `GET /api/v1/auth/oauth/callback` - Handle callback
- `GET /api/v1/auth/me` - Get current user

---

## Background Jobs

Jobs run via `node-cron`:

1. **Market Ingestion** (`*/15 * * * *`) - Sync markets from Polymarket
2. **Market Resolution** - Close expired markets
3. **Daily Credits** - Award daily rewards
4. **Leaderboard Update** - Calculate rankings
5. **Category Prefetch** - Cache popular markets

To run jobs, set `WORKER_MODE=true` in `.env` and start a separate worker process.

---

## Project Structure

```
thisthat-v2-clone/
├── backend/
│   ├── prisma/
│   │   ├── schema.users.prisma      # Users database
│   │   ├── schema.markets.prisma    # Markets database
│   │   └── migrations/              # Database migrations
│   ├── src/
│   │   ├── features/
│   │   │   ├── betting/             # Betting system
│   │   │   ├── markets/             # Market endpoints
│   │   │   ├── payments/            # ICPay integration
│   │   │   ├── auth/                # X OAuth
│   │   │   └── users/               # User management
│   │   ├── lib/
│   │   │   ├── polymarket-client.ts # Polymarket API
│   │   │   ├── database.ts          # Prisma clients
│   │   │   ├── redis.ts             # Redis client
│   │   │   └── error-handler.ts     # Circuit breakers
│   │   ├── services/
│   │   │   ├── market-ingestion.service.ts
│   │   │   └── polymarket-price.service.ts
│   │   └── jobs/                    # Background jobs
│   └── .env                         # Environment config
│
└── frontend/
    ├── src/
    │   ├── app/
    │   │   └── pages/               # Page components
    │   ├── features/
    │   │   ├── betting/             # Betting UI
    │   │   ├── profile/             # User profile
    │   │   └── leaderboard/         # Rankings
    │   ├── shared/
    │   │   ├── components/          # Shared components
    │   │   ├── contexts/            # React contexts
    │   │   ├── hooks/               # Custom hooks
    │   │   └── services/            # API clients
    │   └── index.css                # Global styles
    └── package.json
```

---

## API Documentation

### Authentication

All protected endpoints require JWT in Authorization header:
```
Authorization: Bearer <access_token>
```

### Markets API

**GET /api/v1/markets**
- Query: `?category=sports&limit=50`
- Returns: Array of markets with static data

**GET /api/v1/markets/:id/live**
- Returns: Live prices from CLOB API
```json
{
  "thisOdds": 0.65,
  "thatOdds": 0.35,
  "lastUpdated": "2025-01-28T..."
}
```

### Betting API

**POST /api/v1/bets**
```json
{
  "marketId": "uuid",
  "side": "this",
  "amount": 100
}
```

Returns:
```json
{
  "bet": {...},
  "sharesReceived": 153.85,
  "priceAtBet": 0.65
}
```

### Payments API

**GET /api/v1/payments/packages**
Returns available credit packages

**POST /api/v1/payments/intent**
```json
{
  "packageId": "uuid"
}
```

Returns payment intent for ICPay widget

---

## Testing

### Manual Testing

1. **Auth Flow:**
   - Visit http://localhost:5173
   - Click "Login with X"
   - Complete OAuth flow
   - Should redirect back with user session

2. **Betting:**
   - Browse markets
   - Swipe to place bet
   - Check portfolio for open positions

3. **Payments:**
   - Go to "Buy Credits"
   - Select package
   - Complete payment (testnet or real)

### Database Inspection

```bash
# Markets database
psql -U postgres -d thisthat_markets

# List markets
SELECT id, title, "thisOption", "thatOption", volume FROM "Market" LIMIT 10;

# Users database
psql -U postgres -d thisthat_users

# List users
SELECT id, username, "creditBalance" FROM "User";

# List bets
SELECT id, "userId", "marketId", amount, side, status FROM "Bet";
```

---

## Troubleshooting

### Database Connection Errors

```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Solution:** Ensure PostgreSQL is running
```bash
# Windows
services.msc → PostgreSQL → Start

# Mac
brew services start postgresql

# Linux
sudo systemctl start postgresql
```

### Redis Connection Errors

```
Error: connect ECONNREFUSED 127.0.0.1:6379
```

**Solution:** Start Redis or use Upstash
```bash
# Local Redis
redis-server

# Or update REDIS_URL in .env to use Upstash
```

### Prisma Migration Errors

```
Error: P3009: Migrations directory not found
```

**Solution:** Run migrations with correct schema
```bash
npx prisma migrate deploy --schema=prisma/schema.users.prisma
npx prisma migrate deploy --schema=prisma/schema.markets.prisma
```

### ICPay Webhook Not Working

1. Check `ICPAY_WEBHOOK_SECRET` is set
2. Ensure webhook URL is configured in ICPay dashboard
3. For local dev, use ngrok to expose localhost:
   ```bash
   ngrok http 3001
   # Update webhook URL to: https://xxx.ngrok.io/api/v1/payments/webhook
   ```

---

## Differences from Production

| Feature | Production | This Clone |
|---------|-----------|------------|
| Database | Supabase | Local PostgreSQL |
| Analytics Backup | Supabase | Disabled |
| Redis | Upstash | Local or Upstash |
| Deployment | Render + Vercel | Local dev |
| SSL | Enforced | Disabled |

---

## Next Steps

1. **Add Tests:** Create integration tests for betting flow
2. **Improve UI:** Customize frontend branding
3. **Add Features:** Implement your own features on top
4. **Deploy:** Deploy to your preferred hosting platform

---

## Support & Resources

- **Polymarket API Docs:** https://docs.polymarket.com/
- **ICPay Documentation:** https://docs.icpay.com/
- **X OAuth Guide:** https://developer.twitter.com/en/docs/authentication/oauth-2-0
- **Prisma Docs:** https://www.prisma.io/docs
- **Fastify Docs:** https://www.fastify.io/docs/latest/

---

## License

This is a testing clone. Refer to the original ThisThat v2 repository for licensing information.
