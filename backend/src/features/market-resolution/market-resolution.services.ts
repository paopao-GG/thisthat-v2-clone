import { marketsPrisma, usersPrisma } from '../../lib/database.js';
import { getPolymarketClient } from '../../lib/polymarket-client.js';

/**
 * Check if a market is resolved on Polymarket
 * Returns resolution: 'this', 'that', 'invalid', or null if not resolved
 */
export async function checkMarketResolution(polymarketId: string): Promise<'this' | 'that' | 'invalid' | null> {
  try {
    const client = getPolymarketClient();
    const markets = await client.getMarkets({ limit: 1000 });
    
    const market = markets.find((m) => m.conditionId === polymarketId || m.condition_id === polymarketId);
    
    if (!market) {
      return null; // Market not found
    }
    
    // Check if market is closed/resolved
    if (market.closed || market.archived) {
      // Check tokens for winner
      if (market.tokens && market.tokens.length > 0) {
        const winnerToken = market.tokens.find((t) => t.winner === true);
        if (winnerToken) {
          // Map winner token to 'this' or 'that'
          // Assuming first outcome is 'this' (YES) and second is 'that' (NO)
          const outcomes = Array.isArray(market.outcomes) 
            ? market.outcomes 
            : typeof market.outcomes === 'string' 
              ? JSON.parse(market.outcomes) 
              : ['YES', 'NO'];
          
          if (outcomes.length >= 2) {
            if (winnerToken.outcome === outcomes[0] || winnerToken.outcome === 'YES') {
              return 'this';
            } else if (winnerToken.outcome === outcomes[1] || winnerToken.outcome === 'NO') {
              return 'that';
            }
          }
        }
      }
      
      // If closed but no winner found, return null (not resolved yet)
      // Only return 'invalid' if explicitly marked as such
      return null;
    }
    
    return null; // Market still open
  } catch (error) {
    console.error(`Error checking market resolution for ${polymarketId}:`, error);
    return null;
  }
}

/**
 * Resolve a market and process all pending bets
 */
export async function resolveMarket(marketId: string, resolution: 'this' | 'that' | 'invalid'): Promise<{
  resolved: number;
  won: number;
  lost: number;
  cancelled: number;
  errors: number;
}> {
  const stats = {
    resolved: 0,
    won: 0,
    lost: 0,
    cancelled: 0,
    errors: 0,
  };

  try {
    // Update market status (markets database)
    await marketsPrisma.market.update({
      where: { id: marketId },
      data: {
        status: 'resolved',
        resolution,
        resolvedAt: new Date(),
      },
    });

    // Get all pending bets for this market (users database)
    const pendingBets = await usersPrisma.bet.findMany({
      where: {
        marketId,
        status: 'pending',
      },
      include: {
        user: true,
      },
    });

    // Process bets in batches
    for (const bet of pendingBets) {
      try {
        await usersPrisma.$transaction(async (tx) => {
          if (resolution === 'invalid') {
            // P5: Refund to the wallet that funded the original bet
            const creditSource = bet.creditSource || 'free';
            const refundUpdateData = creditSource === 'free'
              ? {
                  freeCreditsBalance: { increment: bet.amount },
                  creditBalance: { increment: bet.amount },
                  availableCredits: { increment: bet.amount },
                }
              : {
                  purchasedCreditsBalance: { increment: bet.amount },
                  creditBalance: { increment: bet.amount },
                  availableCredits: { increment: bet.amount },
                };

            const updatedUser = await tx.user.update({
              where: { id: bet.userId },
              data: refundUpdateData,
              select: {
                freeCreditsBalance: true,
                purchasedCreditsBalance: true,
                creditBalance: true,
              },
            });

            console.log(`[Resolution] Refund ${bet.amount} credits to ${creditSource} wallet for bet ${bet.id}`);

            await tx.bet.update({
              where: { id: bet.id },
              data: {
                status: 'cancelled',
                resolvedAt: new Date(),
              },
            });

            // P5: Track balance for the specific wallet that was refunded
            await tx.creditTransaction.create({
              data: {
                userId: bet.userId,
                amount: bet.amount,
                transactionType: 'bet_refund',
                referenceId: bet.id,
                balanceAfter: creditSource === 'free'
                  ? Number(updatedUser.freeCreditsBalance)
                  : Number(updatedUser.purchasedCreditsBalance),
              },
            });

            stats.cancelled++;
          } else {
            const isWinner = bet.side === resolution;

            if (isWinner) {
              // Determine if this is an AMM bet (share-based) or legacy bet (odds-based)
              const isAMMBet = Number(bet.sharesReceived) > 0;

              let basePayout: number;
              if (isAMMBet) {
                // AMM: Winning shares pay 1 credit each
                basePayout = Number(bet.sharesReceived);
              } else {
                // Legacy: Use potentialPayout from odds
                basePayout = Number(bet.potentialPayout);
              }

              const betAmount = Number(bet.amount);
              const baseProfit = basePayout - betAmount;
              const finalPayout = basePayout;
              const finalProfit = finalPayout - betAmount;

              // P5: Route payout to the wallet that funded the original bet
              const creditSource = bet.creditSource || 'free'; // Default to 'free' for legacy bets

              // Check if this is a new biggest win
              const currentUser = await tx.user.findUnique({
                where: { id: bet.userId },
                select: { biggestWin: true },
              });
              const currentBiggestWin = Number(currentUser?.biggestWin ?? 0);
              const shouldUpdateBiggestWin = finalProfit > currentBiggestWin;

              const payoutUpdateData = creditSource === 'free'
                ? {
                    freeCreditsBalance: { increment: finalPayout },
                    creditBalance: { increment: finalPayout },
                    availableCredits: { increment: finalPayout },
                    overallPnL: { increment: finalProfit },
                    ...(shouldUpdateBiggestWin && { biggestWin: finalProfit }),
                  }
                : {
                    purchasedCreditsBalance: { increment: finalPayout },
                    creditBalance: { increment: finalPayout },
                    availableCredits: { increment: finalPayout },
                    overallPnL: { increment: finalProfit },
                    ...(shouldUpdateBiggestWin && { biggestWin: finalProfit }),
                  };

              const updatedUser = await tx.user.update({
                where: { id: bet.userId },
                data: payoutUpdateData,
                select: {
                  freeCreditsBalance: true,
                  purchasedCreditsBalance: true,
                  creditBalance: true,
                },
              });

              console.log(`[Resolution] Payout ${finalPayout} credits to ${creditSource} wallet for bet ${bet.id}`);

              await tx.bet.update({
                where: { id: bet.id },
                data: {
                  status: 'won',
                  actualPayout: finalPayout,
                  resolvedAt: new Date(),
                },
              });

              // P5: Track balance for the specific wallet that received the payout
              await tx.creditTransaction.create({
                data: {
                  userId: bet.userId,
                  amount: finalPayout,
                  transactionType: userHasMultiplier ? 'bet_payout_multiplied' : 'bet_payout',
                  referenceId: bet.id,
                  balanceAfter: creditSource === 'free'
                    ? Number(updatedUser.freeCreditsBalance)
                    : Number(updatedUser.purchasedCreditsBalance),
                },
              });

              stats.won++;
            } else {
              // Losing bet - update PnL (shares become worthless)
              await tx.user.update({
                where: { id: bet.userId },
                data: {
                  overallPnL: { decrement: bet.amount },
                },
              });

              await tx.bet.update({
                where: { id: bet.id },
                data: {
                  status: 'lost',
                  actualPayout: 0, // Losing shares are worth 0
                  resolvedAt: new Date(),
                },
              });

              stats.lost++;
            }
          }

          stats.resolved++;
        });
      } catch (error) {
        console.error(`Error processing bet ${bet.id}:`, error);
        stats.errors++;
      }
    }
  } catch (error) {
    console.error(`Error resolving market ${marketId}:`, error);
    throw error;
  }

  return stats;
}

/**
 * Check and resolve markets that are ready
 */
export async function checkAndResolveMarkets(): Promise<{
  checked: number;
  resolved: number;
  errors: number;
}> {
  const result = {
    checked: 0,
    resolved: 0,
    errors: 0,
  };

  try {
    // Find markets that are closed but not yet resolved (markets database)
    const marketsToCheck = await marketsPrisma.market.findMany({
      where: {
        status: 'open',
        polymarketId: { not: null },
        expiresAt: { lte: new Date() },
      },
      take: 50, // Process in batches
    });

    result.checked = marketsToCheck.length;

    for (const market of marketsToCheck) {
      try {
        if (!market.polymarketId) {
          continue;
        }

        const resolution = await checkMarketResolution(market.polymarketId);
        
        if (resolution) {
          await resolveMarket(market.id, resolution);
          result.resolved++;
        }
      } catch (error) {
        console.error(`Error checking market ${market.id}:`, error);
        result.errors++;
      }
    }
  } catch (error) {
    console.error('Error in checkAndResolveMarkets:', error);
    result.errors++;
  }

  return result;
}

