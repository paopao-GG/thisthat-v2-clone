# Database Migration Instructions

## ICPay Payment System Removal

All ICPay payment system code has been removed from the codebase. To complete the removal, you need to run a database migration.

### Steps to Apply Migration:

1. **Set up your database connection** by ensuring your `.env` file has the `DATABASE_URL` configured:
   ```
   DATABASE_URL="postgresql://..."
   ```

2. **Generate and apply the migration**:
   ```bash
   cd backend
   npx prisma migrate dev --name remove_icpay_payment_system
   ```

### Changes Included in This Migration:

#### Removed Database Models:
- `Payment` - ICPay payment records
- `CreditPackage` - Credit package definitions
- `WebhookEvent` - Webhook event tracking

#### Removed User Fields:
- `multiplierExpiresAt` - 2x multiplier expiration timestamp
- `multiplierPackageId` - Package that granted multiplier
- `payments` relation - Link to Payment records

#### Preserved Fields (Still in Use):
- `creditBalance` - Total credits (used for free credits now)
- `availableCredits` - Credits available for trading
- `lastDailyRewardAt` - Last daily credit claim
- `consecutiveDaysOnline` - Streak tracking
- `lastLoginAt` - Last login timestamp

### What Was Removed:

#### Backend:
- `/src/features/payments/` - All payment controllers, services, routes, webhooks
- Payment routes from app/index.ts
- Payment multiplier logic from market resolution
- Payment analytics from jobs
- Utility scripts: `fix-pending-payments.cjs`, `check-user.cjs`, `check-webhooks.cjs`
- Documentation: Payment system docs, failover docs, webhook testing guides

#### Frontend:
- `PaymentModal.tsx` - ICPay payment widget integration
- `DailyCreditsSection.tsx` - Moved to profile/components (daily credits remain as free feature)
- `paymentService.ts` - Payment API client
- `icpay-sdk.d.ts` - Type definitions
- `icpay-diagnostic.js` - Diagnostic tool
- `BuyCreditsPage.tsx` - Credit purchase page
- `/app/buy-credits` route
- ICPay dependencies from package.json
- Purchased credits display from TopBar

### What Remains:

#### Free Credits System (Core Feature):
- Daily credit claims (500 on first day, 100+ with streaks)
- Streak bonuses (+50 every 2 days)
- DailyCreditsSection component (now in features/profile/components/)
- Economy service daily credit allocation

#### Manual Credit Purchase:
- Simple CreditPurchase model (for manual admin grants)
- Purchase routes and services (manual only, no payment gateway)

### After Migration:

The application will function with:
- Free credits only (daily claims + streaks)
- No payment system
- No purchased credits tracking
- Simplified credit balance display
- All betting and market functionality intact

### Rollback:

If you need to rollback, you can restore from git:
```bash
git checkout HEAD -- backend/src/features/payments
git checkout HEAD -- backend/prisma/schema.prisma
git checkout HEAD -- frontend/src/shared/components/PaymentModal.tsx
# ... etc
```
