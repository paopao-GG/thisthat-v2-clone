# Frontend-Backend Connection Guide

This guide explains how to connect your frontend to the backend API.

## 🔧 Setup

### 1. Environment Variables

Create a `.env` file in the `frontend` directory:

```env
VITE_API_BASE_URL=http://localhost:3001
```

This tells the frontend where your backend is running.

### 2. Start Both Servers

**Backend (Terminal 1):**
```bash
cd backend
npm run dev
```
The backend will run on `http://localhost:3001`

**Frontend (Terminal 2):**
```bash
cd frontend
npm run dev
```
The frontend will run on `http://localhost:5173`

## 📡 How It Works

### Data Flow

```
Frontend Component 
    ↓ (calls)
Frontend Service (e.g., marketService.ts)
    ↓ (HTTP request)
Backend API Endpoint (e.g., /api/v1/markets)
    ↓ (queries)
Database (PostgreSQL/MongoDB)
    ↓ (returns data)
Backend API
    ↓ (HTTP response)
Frontend Service
    ↓ (returns transformed data)
Frontend Component (displays data)
```

## 🎯 Using the Services

### Example 1: Fetching Markets

Replace your mock data with real API calls:

```typescript
import { useState, useEffect } from 'react';
import { fetchMarkets } from '@shared/services/marketService';
import type { Market } from '@shared/types';

function BettingPage() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadMarkets() {
      try {
        setLoading(true);
        // Backend fetches from PostgreSQL database
        const data = await fetchMarkets({ 
          status: 'open', 
          limit: 50 
        });
        setMarkets(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load markets');
      } finally {
        setLoading(false);
      }
    }

    loadMarkets();
  }, []);

  if (loading) return <div>Loading markets...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      {markets.map(market => (
        <MarketCard key={market.id} market={market} />
      ))}
    </div>
  );
}
```

### Example 2: Placing a Bet

```typescript
import { placeBet } from '@shared/services/bettingService';

async function handleBetPlacement(marketId: string, side: 'this' | 'that', amount: number) {
  try {
    // Backend locks credits and stores bet in PostgreSQL
    const bet = await placeBet({
      marketId,
      side,
      amount
    });
    
    console.log('Bet placed:', bet);
    alert(`Bet placed successfully! Bet ID: ${bet.id}`);
  } catch (error) {
    console.error('Failed to place bet:', error);
    alert('Failed to place bet. Please try again.');
  }
}
```

### Example 3: Fetching Leaderboard

```typescript
import { useState, useEffect } from 'react';
import { fetchLeaderboardByPnL } from '@shared/services/leaderboardService';
import type { LeaderboardEntry } from '@shared/types';

function LeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    async function loadLeaderboard() {
      try {
        // Backend queries PostgreSQL (cached in Redis)
        const data = await fetchLeaderboardByPnL(100);
        setLeaderboard(data);
      } catch (err) {
        console.error('Failed to load leaderboard:', err);
      }
    }

    loadLeaderboard();
  }, []);

  return (
    <LeaderboardTable entries={leaderboard} />
  );
}
```

### Example 4: Authentication

```typescript
import { initiateXAuth, handleOAuthCallback, getCurrentUser } from '@shared/services/authService';

// Redirect to Twitter OAuth
function handleLogin() {
  initiateXAuth();
}

// Handle callback after OAuth
function OAuthCallbackPage() {
  useEffect(() => {
    const tokens = handleOAuthCallback();
    if (tokens) {
      // User is now authenticated
      // Redirect to main app
      window.location.href = '/';
    }
  }, []);

  return <div>Logging in...</div>;
}

// Get current user profile
async function loadUserProfile() {
  try {
    // Backend fetches from PostgreSQL
    const user = await getCurrentUser();
    console.log('User:', user);
  } catch (error) {
    console.error('Not authenticated:', error);
  }
}
```

### Example 5: Daily Credits

```typescript
import { claimDailyCredits } from '@shared/services/economyService';

async function handleClaimDailyCredits() {
  try {
    // Backend checks eligibility and awards credits in PostgreSQL
    const result = await claimDailyCredits();
    
    alert(`Claimed ${result.data.creditsAwarded} credits! 
           Streak: ${result.data.currentStreak} days
           New Balance: ${result.data.newBalance}`);
  } catch (error) {
    console.error('Failed to claim credits:', error);
    alert('Already claimed today or error occurred');
  }
}
```

## 🔐 Authentication Flow

1. **User clicks "Login with X"**
   - Frontend calls `initiateXAuth()`
   - Redirects to backend OAuth endpoint
   - Backend redirects to Twitter

2. **User authorizes on Twitter**
   - Twitter redirects back to backend
   - Backend creates user in PostgreSQL
   - Backend redirects to frontend with tokens

3. **Frontend receives tokens**
   - Frontend calls `handleOAuthCallback()`
   - Tokens stored in localStorage
   - User is now authenticated

4. **Authenticated requests**
   - Services automatically add `Authorization: Bearer <token>` header
   - Backend validates token on protected routes
   - Backend fetches data from database

## 📦 Available Services

### `marketService.ts`
- `fetchMarkets()` - Get list of markets with filters
- `fetchRandomMarkets()` - Get curated/random markets
- `fetchMarketById(id)` - Get single market
- `fetchMarketWithLiveOdds(id)` - Get market with live Polymarket odds
- `fetchCategories()` - Get available categories
- `fetchMarketsByCategory(category)` - Filter by category

### `bettingService.ts`
- `placeBet(bet)` - Place a THIS/THAT bet
- `getUserBets()` - Get user's bet history
- `getBetById(id)` - Get single bet details
- `sellPosition(betId, amount)` - Early exit from position

### `authService.ts`
- `initiateXAuth()` - Start Twitter OAuth flow
- `handleOAuthCallback()` - Process OAuth callback
- `getCurrentUser()` - Get authenticated user profile
- `updateUserProfile(updates)` - Update user info
- `logout()` - Log out user

### `leaderboardService.ts`
- `fetchLeaderboardByPnL()` - Global rankings by profit/loss
- `fetchLeaderboardByVolume()` - Global rankings by trading volume
- `fetchMyLeaderboardPosition()` - Current user's rank

### `economyService.ts`
- `claimDailyCredits()` - Claim daily login reward
- `fetchCreditPackages()` - Get purchasable credit bundles
- `purchaseCredits(packageId)` - Buy credits
- `fetchPurchaseHistory()` - Get purchase history

### `transactionService.ts`
- `fetchTransactionHistory()` - Get credit transaction ledger

### `referralService.ts`
- `fetchReferralStats()` - Get referral code and stats
- `generateReferralLink(code)` - Create referral link

### `userService.ts`
- `fetchUserStats()` - Get user stats (PnL, volume, etc.)
- `fetchUserPositions()` - Get open positions

## 🛠️ Error Handling

All services throw `ApiError` which includes:
- `message` - Error description
- `statusCode` - HTTP status code
- `details` - Validation errors (if any)

```typescript
import { ApiError } from '@shared/services';

try {
  await placeBet({ marketId, side, amount });
} catch (error) {
  if (error instanceof ApiError) {
    console.error('API Error:', error.message);
    console.error('Status:', error.statusCode);
    console.error('Details:', error.details);
  }
}
```

## 🔄 Token Refresh

The API client automatically:
- Detects expired access tokens
- Uses refresh token to get new access token
- Retries the failed request
- Redirects to login if refresh fails

You don't need to handle this manually!

## 🚀 Next Steps

1. **Replace mock data** in your components with service calls
2. **Add loading states** for better UX
3. **Handle errors** gracefully
4. **Test the flow** by running both servers

## 📝 Example: Complete Component Update

Before (with mock data):
```typescript
const mockMarkets = [/* ... */];

function BettingPage() {
  const [markets] = useState(mockMarkets);
  
  return (
    <div>
      {markets.map(market => <MarketCard key={market.id} market={market} />)}
    </div>
  );
}
```

After (with real API):
```typescript
import { fetchMarkets } from '@shared/services';

function BettingPage() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        // Backend fetches from PostgreSQL
        const data = await fetchMarkets({ status: 'open' });
        setMarkets(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div>Loading...</div>;
  
  return (
    <div>
      {markets.map(market => <MarketCard key={market.id} market={market} />)}
    </div>
  );
}
```

## ✅ Checklist

- [ ] Create `.env` file with `VITE_API_BASE_URL=http://localhost:3001`
- [ ] Start backend server (`npm run dev` in backend folder)
- [ ] Start frontend server (`npm run dev` in frontend folder)
- [ ] Import services into your components
- [ ] Replace mock data with API calls
- [ ] Add loading and error states
- [ ] Test authentication flow
- [ ] Test placing bets
- [ ] Test viewing leaderboards

## 🐛 Troubleshooting

**CORS errors?**
- Backend already has CORS configured for `http://localhost:5173`
- Check that backend is running

**401 Unauthorized?**
- User needs to log in first
- Check that tokens are stored in localStorage
- Try logging in again

**500 Server Error?**
- Check backend console for errors
- Ensure database is running
- Check backend logs

**Network errors?**
- Verify backend is running on port 3001
- Check `.env` file has correct URL
- Try accessing `http://localhost:3001/health` in browser

## 📚 Additional Resources

- Backend API Documentation: `backend/docs/API_ENDPOINTS.md`
- Backend System Overview: `backend/docs/BACKEND_SYSTEM_OVERVIEW.md`
- Backend Quick Start: `backend/docs/QUICK_START.md`









































































