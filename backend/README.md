# THISTHAT Backend V1 - Credits System

Backend API for THISTHAT prediction market platform.

## V1 Scope

- ✅ Credits-based betting (NO real money)
- ✅ JWT authentication (Signup/Login/Refresh/Logout)
- ✅ Polymarket API integration (READ-ONLY)
- ✅ Leaderboards (PnL & Volume)
- ✅ Daily rewards system (PRD-aligned: 1000→1500→2000... up to 10,000)
- ✅ Referral system (referral codes, +200 credit bonuses)
- ✅ Credit purchase system (predefined packages)
- ✅ Market resolution & automatic payouts
- ✅ Transaction history

## Tech Stack

- **Runtime:** Node.js 20+
- **Framework:** Fastify 5.6.2
- **Database:** PostgreSQL 15+
- **Cache:** Redis 7+
- **ORM:** Prisma 5+
- **Language:** TypeScript 5.9.3

## Prerequisites

- Node.js 20+ installed
- PostgreSQL 15+ running locally or remote
- Redis 7+ running locally or remote
- npm or yarn

## Quick Start

For detailed setup instructions, see **[docs/QUICK_START.md](./docs/QUICK_START.md)**.

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Configuration

See **[docs/ENV_FILE_CONTENT.md](./docs/ENV_FILE_CONTENT.md)** for environment variable setup.

Edit `.env` and configure:

- `DATABASE_URL`: Your PostgreSQL connection string
- `REDIS_URL`: Your Redis connection string
- `JWT_ACCESS_SECRET`: Generate a random secret
- `JWT_REFRESH_SECRET`: Generate a different random secret

### 3. Database Setup

Initialize Prisma and create the database schema:

```bash
# Generate Prisma Client
npx prisma generate

# Run migrations (creates tables)
npx prisma migrate dev --name init

# (Optional) Open Prisma Studio to view database
npx prisma studio
```

### 4. Run the Server

Development mode (with hot reload):

```bash
npm run dev
```

Production build:

```bash
npm run build
npm start
```

## Project Structure

```
backend/
├── src/                          # Source code
│   ├── app/
│   │   └── index.ts              # Fastify server setup
│   ├── features/
│   │   ├── auth/                 # Authentication
│   │   ├── fetching/             # Market & event data
│   │   │   ├── market-data/
│   │   │   └── event-data/
│   │   └── database/             # Database & credits
│   ├── lib/                      # Shared libraries (Prisma, Redis)
│   └── __tests__/                # Integration tests
├── docs/                         # 📚 All documentation
│   ├── API_ENDPOINTS.md          # API documentation
│   ├── QUICK_START.md            # Getting started guide
│   ├── TESTING_QUICK_START.md    # Testing guide
│   └── ...                       # See docs/README.md for full list
├── scripts/                      # 🔧 Utility scripts
│   ├── test-api.ps1              # API testing script
│   ├── view-database.ps1         # Database viewer
│   └── ...                       # See scripts/README.md for full list
├── memory-bank/                  # 📖 Project memory bank
│   ├── backend_roadmap.md         # Development roadmap
│   ├── progress.md               # Project progress
│   └── ...                       # Project context files
├── prisma/
│   └── schema.prisma             # Database schema
├── .env                          # Environment variables (gitignored)
└── package.json
```

**📚 Documentation:** See [docs/README.md](./docs/README.md) for all documentation  
**🔧 Scripts:** See [scripts/README.md](./scripts/README.md) for utility scripts

## Available Scripts

### Development
- `npm run dev` - Run development server with hot reload
- `npm run build` - Build for production
- `npm start` - Run production server
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint errors
- `npm run type-check` - Check TypeScript types

### Testing
- `npm test` - Run tests in watch mode
- `npm run test:run` - Run tests once
- `npm run test:ui` - Run tests with UI
- `npm run test:coverage` - Generate coverage report

### Database
- `npm run db:generate` - Generate Prisma Client
- `npm run db:migrate` - Run database migrations
- `npm run db:studio` - Open Prisma Studio
- `npm run db:push` - Push schema changes

### Utility Scripts
See **[scripts/README.md](./scripts/README.md)** for PowerShell and Node.js utility scripts.

## API Endpoints (V1)

For request/response details see **[docs/API_ENDPOINTS.md](./docs/API_ENDPOINTS.md)** or the high-level **[docs/BACKEND_SYSTEM_OVERVIEW.md](./docs/BACKEND_SYSTEM_OVERVIEW.md)**.

### Authentication
- GET `/api/v1/auth/x` – Kick off the X (Twitter) OAuth flow.
- GET `/api/v1/auth/x/callback` – OAuth callback that redirects to the frontend with JWTs.
- POST `/api/v1/auth/refresh` – Exchange a refresh token for a new access token.
- POST `/api/v1/auth/logout` – Revoke a refresh token.
- GET `/api/v1/auth/me` – Return the authenticated user profile.

> Email/password signup & login handlers exist but are not wired to routes yet. Wire them through `auth.routes.ts` when enabling that flow.

### Users
- PATCH `/api/v1/users/me` – Update profile (requires JWT).
- GET `/api/v1/users/:userId` – Public profile lookup.

### Markets
- GET `/api/v1/markets` – List markets with filtering/pagination.
- GET `/api/v1/markets/random` – Random discovery set.
- GET `/api/v1/markets/categories` – Available categories.
- GET `/api/v1/markets/category/:category` – Filter by category slug.
- GET `/api/v1/markets/:id` – Static market payload.
- GET `/api/v1/markets/:id/live` – Live odds direct from Polymarket.
- GET `/api/v1/markets/:id/full` – Static + live bundle.
- POST `/api/v1/markets/ingest` – Manually trigger Polymarket ingestion.

### Betting
- POST `/api/v1/bets` – Place a bet.
- GET `/api/v1/bets/me` – Current user’s bets.
- GET `/api/v1/bets/:betId` – Detailed bet view.
- POST `/api/v1/bets/:betId/sell` – Sell back an open bet (secondary market).

### Leaderboard
- GET `/api/v1/leaderboard/pnl`
- GET `/api/v1/leaderboard/volume`
- GET `/api/v1/leaderboard/me`

### Economy
- POST `/api/v1/economy/daily-credits` – Claim reward manually.
- POST `/api/v1/economy/buy` – Buy virtual stocks.
- POST `/api/v1/economy/sell` – Sell holdings.
- GET `/api/v1/economy/portfolio` – Authenticated user holdings.
- GET `/api/v1/economy/stocks` – Public stock catalog.

### Transactions
- GET `/api/v1/transactions/me`

### Referrals
- GET `/api/v1/referrals/me`

### Purchases
- GET `/api/v1/purchases/packages`
- POST `/api/v1/purchases`
- GET `/api/v1/purchases/me`

## Database Schema

See [prisma/schema.prisma](prisma/schema.prisma) for the complete schema.

**Main Tables:**
- `users` - User accounts with credit balances
- `markets` - Prediction markets (Polymarket + admin-created)
- `bets` - User bets on markets
- `credit_transactions` - Audit trail for credit movements
- `daily_rewards` - Daily login rewards tracking
- `refresh_tokens` - JWT refresh tokens

## Development Notes

### Credits System
- Starting balance: 1000 credits
- Daily reward: 100 credits
- Bet limits: 10-10,000 credits per bet
- All credit operations use atomic database transactions

### Database Migrations

When you change the schema:

```bash
npx prisma migrate dev --name description_of_change
```

### Prisma Studio

View and edit database records:

```bash
npx prisma studio
```

Opens at http://localhost:5555

## Worker Pattern Architecture

The application uses a **worker pattern** to separate HTTP API servers from background job processing:

### Architecture

- **API Servers** (`backend` service): Handle HTTP requests only, no background jobs
  - Scalable: Run 1-N replicas (default: 5)
  - Environment: `WORKER_MODE=false`

- **Worker** (`worker` service): Runs background jobs only, no HTTP traffic (except health checks)
  - Single instance: Always 1 replica
  - Environment: `WORKER_MODE=true`
  - Handles: Market ingestion, resolution, leaderboard updates, analytics

### Why This Pattern?

**Problem:** Running jobs on all API replicas causes:
- Duplicate job execution (5 replicas = 5x API calls)
- Rate limit violations on Polymarket API
- Wasted resources

**Solution:** Dedicated worker ensures:
- Jobs run exactly once
- Single source of Polymarket API calls
- Proper rate limiting
- Independent scaling (API vs background jobs)

### Distributed State Management

All shared state uses Redis for coordination:

- **Price Cache**: 10-second TTL in Redis (shared across all API servers)
- **Circuit Breaker**: Polymarket API health state (shared)
- **Rate Limiter**: Polymarket API request tracking (shared)
- **Distributed Locks**: Job execution locks (prevents duplicate runs)

### Scaling

```bash
# Scale API servers (more HTTP capacity)
docker-compose up --scale backend=10

# Worker always stays at 1 replica
# Configured in docker-compose.yml
```

### Local Development

For local development, you can run in API mode or worker mode:

```bash
# API mode (default)
WORKER_MODE=false npm run dev

# Worker mode (runs background jobs)
WORKER_MODE=true npm run dev
```

### Monitoring

Check rate limit and circuit breaker status:

```bash
# Rate limit status
curl http://localhost:3001/api/v1/monitoring/polymarket-rate-limit

# Circuit breaker status
curl http://localhost:3001/api/v1/monitoring/polymarket-circuit-breaker

# Combined external API health
curl http://localhost:3001/api/v1/monitoring/external-apis
```

## Documentation

- **[Backend Overview](./docs/BACKEND_SYSTEM_OVERVIEW.md)** – Setup, APIs, features, jobs, and schema overview.
- **[Quick Start](./docs/QUICK_START.md)** – Step-by-step environment/bootstrap instructions.
- **[Run Server](./docs/RUN_SERVER.md)** – Dev/prod server commands & troubleshooting.
- **[API Endpoints](./docs/API_ENDPOINTS.md)** – Full endpoint reference with examples.
- **[Env Vars](./docs/ENV_FILE_CONTENT.md)** – Environment configuration details.
- **[Testing Quick Start](./docs/TESTING_QUICK_START.md)** – Running Vitest, coverage, and linting instructions.
- **[Project Roadmap](./memory-bank/backend_roadmap.md)** – Historical planning context.

## Troubleshooting

### Database Connection Issues
- Ensure PostgreSQL is running
- Check `DATABASE_URL` in `.env`
- Test connection: `npx prisma db pull`

### Redis Connection Issues
- Ensure Redis is running
- Check `REDIS_URL` in `.env`
- Test: `redis-cli ping` should return "PONG"

### TypeScript Errors
- Run `npm run type-check`
- Ensure Prisma Client is generated: `npx prisma generate`

### API Testing
- Use `scripts/test-api.ps1` to test endpoints
- See **[docs/API_ENDPOINTS.md](./docs/API_ENDPOINTS.md)** for examples

## V1 Exclusions (Not Implemented)

- ❌ Wallet integration (MetaMask, WalletConnect)
- ❌ USDC/real-money betting
- ❌ Real payment processing (Stripe, on-chain settlement)
- ❌ Creator markets
- ❌ Social features (friends, chat)
- ❌ Push notifications
- ❌ Email notifications

**Note:** Credit purchases are implemented with simulated settlement (manual provider) for V1. Real payment processing is V2.

See [backend_prd.md](../docs/backend_prd.md) for full V1 scope.

## License

MIT
