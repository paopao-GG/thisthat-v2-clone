/**
 * Automated Market Maker (AMM) Service
 * Implements Constant Product Market Maker (CPMM) formula: x * y = k
 *
 * This is the same mechanism used by Polymarket and Uniswap V2.
 *
 * @module amm.service
 */

export interface Pool {
  yesReserve: number;
  noReserve: number;
}

export interface TradeResult {
  newPool: Pool;
  sharesOut: number;
  priceBefore: number;
  priceAfter: number;
  probBefore: number;
  probAfter: number;
  priceImpact: number;
  effectivePrice: number;
}

/**
 * Get the probability that YES wins (based on reserves)
 * Formula: P(YES) = noReserve / (yesReserve + noReserve)
 */
export function getYesProbability(pool: Pool): number {
  const { yesReserve, noReserve } = pool;
  if (yesReserve + noReserve === 0) return 0.5; // Default to 50-50
  return noReserve / (yesReserve + noReserve);
}

/**
 * Get the probability that NO wins
 * Formula: P(NO) = yesReserve / (yesReserve + noReserve)
 */
export function getNoProbability(pool: Pool): number {
  return 1 - getYesProbability(pool);
}

/**
 * Get the current price of YES shares
 * Formula: price = noReserve / yesReserve
 *
 * Note: In traditional AMMs, price = reserve_out / reserve_in
 */
export function getYesPrice(pool: Pool): number {
  const { yesReserve, noReserve } = pool;
  if (yesReserve === 0) return Infinity;
  return noReserve / yesReserve;
}

/**
 * Get the current price of NO shares
 */
export function getNoPrice(pool: Pool): number {
  const { yesReserve, noReserve } = pool;
  if (noReserve === 0) return Infinity;
  return yesReserve / noReserve;
}

/**
 * Buy YES shares by providing credits
 *
 * When buying YES:
 * - User provides stake (credits)
 * - Stake goes into noReserve (increasing it)
 * - User receives YES shares from yesReserve (decreasing it)
 * - Formula: k = yesReserve * noReserve must remain constant
 *
 * @param pool Current pool state
 * @param stake Amount of credits user is spending
 * @param feeBps Fee in basis points (default 0, can be 30 = 0.3%)
 */
export function buyYes(pool: Pool, stake: number, feeBps = 0): TradeResult {
  if (stake <= 0) {
    throw new Error('Stake must be positive');
  }

  const { yesReserve, noReserve } = pool;

  // Calculate constant product
  const k = yesReserve * noReserve;

  // Apply fee (e.g., 0.3% fee = 30 bps)
  const feeMultiplier = 1 - feeBps / 10_000;
  const effectiveStake = stake * feeMultiplier;

  // Capture price before trade
  const priceBefore = getYesPrice(pool);
  const probBefore = getYesProbability(pool);

  // Add stake to noReserve
  const newNoReserve = noReserve + effectiveStake;

  // Calculate new yesReserve to maintain k
  const newYesReserve = k / newNoReserve;

  // Shares received = reduction in yesReserve
  const sharesOut = yesReserve - newYesReserve;

  // New pool state
  const newPool: Pool = {
    yesReserve: newYesReserve,
    noReserve: newNoReserve,
  };

  // Calculate metrics
  const priceAfter = getYesPrice(newPool);
  const probAfter = getYesProbability(newPool);
  const priceImpact = ((priceAfter - priceBefore) / priceBefore) * 100;
  const effectivePrice = stake / sharesOut;

  return {
    newPool,
    sharesOut,
    priceBefore,
    priceAfter,
    probBefore,
    probAfter,
    priceImpact,
    effectivePrice,
  };
}

/**
 * Buy NO shares by providing credits
 *
 * When buying NO:
 * - User provides stake (credits)
 * - Stake goes into yesReserve (increasing it)
 * - User receives NO shares from noReserve (decreasing it)
 */
export function buyNo(pool: Pool, stake: number, feeBps = 0): TradeResult {
  if (stake <= 0) {
    throw new Error('Stake must be positive');
  }

  const { yesReserve, noReserve } = pool;

  const k = yesReserve * noReserve;

  const feeMultiplier = 1 - feeBps / 10_000;
  const effectiveStake = stake * feeMultiplier;

  const priceBefore = getNoPrice(pool);
  const probBefore = getNoProbability(pool);

  // Add stake to yesReserve
  const newYesReserve = yesReserve + effectiveStake;

  // Calculate new noReserve to maintain k
  const newNoReserve = k / newYesReserve;

  // Shares received = reduction in noReserve
  const sharesOut = noReserve - newNoReserve;

  const newPool: Pool = {
    yesReserve: newYesReserve,
    noReserve: newNoReserve,
  };

  const priceAfter = getNoPrice(newPool);
  const probAfter = getNoProbability(newPool);
  const priceImpact = ((priceAfter - priceBefore) / priceBefore) * 100;
  const effectivePrice = stake / sharesOut;

  return {
    newPool,
    sharesOut,
    priceBefore,
    priceAfter,
    probBefore,
    probAfter,
    priceImpact,
    effectivePrice,
  };
}

/**
 * Sell YES shares to receive credits
 *
 * When selling YES:
 * - User provides YES shares
 * - Shares go back into yesReserve (increasing it)
 * - User receives credits from noReserve (decreasing it)
 */
export function sellYes(pool: Pool, shares: number, feeBps = 0): TradeResult {
  if (shares <= 0) {
    throw new Error('Shares must be positive');
  }

  const { yesReserve, noReserve } = pool;

  const k = yesReserve * noReserve;

  const priceBefore = getYesPrice(pool);
  const probBefore = getYesProbability(pool);

  // Add shares back to yesReserve
  const newYesReserve = yesReserve + shares;

  // Calculate new noReserve to maintain k
  const newNoReserve = k / newYesReserve;

  // Credits received = reduction in noReserve
  let creditsOut = noReserve - newNoReserve;

  // Apply fee
  const feeMultiplier = 1 - feeBps / 10_000;
  creditsOut = creditsOut * feeMultiplier;

  const newPool: Pool = {
    yesReserve: newYesReserve,
    noReserve: newNoReserve,
  };

  const priceAfter = getYesPrice(newPool);
  const probAfter = getYesProbability(newPool);
  const priceImpact = ((priceAfter - priceBefore) / priceBefore) * 100;
  const effectivePrice = creditsOut / shares;

  return {
    newPool,
    sharesOut: creditsOut, // In this case, sharesOut is actually creditsOut
    priceBefore,
    priceAfter,
    probBefore,
    probAfter,
    priceImpact,
    effectivePrice,
  };
}

/**
 * Sell NO shares to receive credits
 */
export function sellNo(pool: Pool, shares: number, feeBps = 0): TradeResult {
  if (shares <= 0) {
    throw new Error('Shares must be positive');
  }

  const { yesReserve, noReserve } = pool;

  const k = yesReserve * noReserve;

  const priceBefore = getNoPrice(pool);
  const probBefore = getNoProbability(pool);

  // Add shares back to noReserve
  const newNoReserve = noReserve + shares;

  // Calculate new yesReserve to maintain k
  const newYesReserve = k / newNoReserve;

  // Credits received = reduction in yesReserve
  let creditsOut = yesReserve - newYesReserve;

  // Apply fee
  const feeMultiplier = 1 - feeBps / 10_000;
  creditsOut = creditsOut * feeMultiplier;

  const newPool: Pool = {
    yesReserve: newYesReserve,
    noReserve: newNoReserve,
  };

  const priceAfter = getNoPrice(newPool);
  const probAfter = getNoProbability(newPool);
  const priceImpact = ((priceAfter - priceBefore) / priceBefore) * 100;
  const effectivePrice = creditsOut / shares;

  return {
    newPool,
    sharesOut: creditsOut,
    priceBefore,
    priceAfter,
    probBefore,
    probAfter,
    priceImpact,
    effectivePrice,
  };
}

/**
 * Initialize a pool with equal reserves (50-50 probability)
 *
 * @param initialLiquidity Initial amount of liquidity for each side
 */
export function initializePool(initialLiquidity: number): Pool {
  if (initialLiquidity <= 0) {
    throw new Error('Initial liquidity must be positive');
  }

  return {
    yesReserve: initialLiquidity,
    noReserve: initialLiquidity,
  };
}

/**
 * Initialize a pool with custom probabilities
 *
 * @param totalLiquidity Total liquidity to split between reserves
 * @param yesProbability Desired probability for YES (0-1)
 */
export function initializePoolWithProbability(
  totalLiquidity: number,
  yesProbability: number
): Pool {
  if (totalLiquidity <= 0) {
    throw new Error('Total liquidity must be positive');
  }
  if (yesProbability <= 0 || yesProbability >= 1) {
    throw new Error('YES probability must be between 0 and 1');
  }

  // P(YES) = noReserve / (yesReserve + noReserve)
  // If we want P(YES) = p, and yesReserve + noReserve = L:
  // noReserve = p * L
  // yesReserve = (1 - p) * L

  const noReserve = yesProbability * totalLiquidity;
  const yesReserve = (1 - yesProbability) * totalLiquidity;

  return {
    yesReserve,
    noReserve,
  };
}

/**
 * Calculate how many shares you would get for a given stake (without executing)
 * Useful for showing users what they'll receive before they commit
 */
export function quoteYes(pool: Pool, stake: number, feeBps = 0): number {
  const result = buyYes(pool, stake, feeBps);
  return result.sharesOut;
}

/**
 * Calculate how many shares you would get for a given stake (NO side)
 */
export function quoteNo(pool: Pool, stake: number, feeBps = 0): number {
  const result = buyNo(pool, stake, feeBps);
  return result.sharesOut;
}

/**
 * Calculate total liquidity in the pool
 */
export function getTotalLiquidity(pool: Pool): number {
  return pool.yesReserve + pool.noReserve;
}

/**
 * Calculate the constant product k
 */
export function getConstantProduct(pool: Pool): number {
  return pool.yesReserve * pool.noReserve;
}
