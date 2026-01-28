/**
 * Market Verification Script
 * 
 * Verifies if a given market is real and valid on Polymarket by:
 * 1. Fetching the market from Polymarket API
 * 2. Validating market structure and required fields
 * 3. Checking if market exists and is accessible
 * 4. Comparing data from multiple sources (if available)
 * 5. Validating market integrity (odds, outcomes, etc.)
 * 
 * Usage:
 *   npm run verify:market -- <conditionId>
 *   or
 *   tsx scripts/verify-market.ts <conditionId>
 * 
 * Example:
 *   tsx scripts/verify-market.ts 0x4319532e181605cb15b1bd677759a3bc7f7394b2fdf145195b700eeaedfd5221
 */

import { getPolymarketClient } from '../src/lib/polymarket-client.js';
import axios from 'axios';
import * as fs from 'fs/promises';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config();

interface VerificationResult {
  marketId: string;
  isValid: boolean;
  exists: boolean;
  checks: {
    apiAccessible: boolean;
    hasRequiredFields: boolean;
    hasValidStructure: boolean;
    hasValidOutcomes: boolean;
    hasValidPrices: boolean;
    pricesSumToOne: boolean;
    isActive: boolean;
    isTradeable: boolean;
    hasValidDates: boolean;
  };
  errors: string[];
  warnings: string[];
  marketData?: any;
  comparison?: {
    publicApi: any;
    authenticatedApi?: any;
    match: boolean;
  };
}

/**
 * Validate market structure
 */
function validateMarketStructure(market: any): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  const requiredFields = ['conditionId', 'question'];
  requiredFields.forEach((field) => {
    if (!market[field] && !market[field.toLowerCase()] && !market[field.replace(/([A-Z])/g, '_$1').toLowerCase()]) {
      errors.push(`Missing required field: ${field}`);
    }
  });

  // Check conditionId format (should be hex string starting with 0x)
  const conditionId = market.conditionId || market.condition_id || market.conditionID;
  if (conditionId) {
    if (!conditionId.startsWith('0x')) {
      errors.push(`Invalid conditionId format: should start with '0x'`);
    }
    if (conditionId.length < 10) {
      errors.push(`Invalid conditionId format: too short`);
    }
  }

  // Validate outcomes
  let outcomes: string[] = [];
  if (Array.isArray(market.outcomes)) {
    outcomes = market.outcomes;
  } else if (typeof market.outcomes === 'string') {
    try {
      outcomes = JSON.parse(market.outcomes);
    } catch {
      errors.push('Invalid outcomes format: not a valid JSON string');
    }
  }

  if (outcomes.length < 2) {
    errors.push('Market must have at least 2 outcomes');
  }

  // Validate prices/odds
  if (market.tokens && Array.isArray(market.tokens)) {
    const prices = market.tokens.map((t: any) => parseFloat(t.price) || 0);
    const sum = prices.reduce((a: number, b: number) => a + b, 0);
    
    if (sum < 0.99 || sum > 1.01) {
      warnings.push(`Prices don't sum to 1.0 (sum: ${sum.toFixed(4)})`);
    }

    // Check if prices are in valid range [0, 1]
    prices.forEach((price: number, index: number) => {
      if (price < 0 || price > 1) {
        errors.push(`Invalid price at index ${index}: ${price} (must be between 0 and 1)`);
      }
    });
  } else if (market.outcomePrices) {
    let prices: number[] = [];
    if (Array.isArray(market.outcomePrices)) {
      prices = market.outcomePrices.map((p: any) => parseFloat(p) || 0);
    } else if (typeof market.outcomePrices === 'string') {
      try {
        prices = JSON.parse(market.outcomePrices).map((p: any) => parseFloat(p) || 0);
      } catch {
        errors.push('Invalid outcomePrices format');
      }
    }

    const sum = prices.reduce((a: number, b: number) => a + b, 0);
    if (sum < 0.99 || sum > 1.01) {
      warnings.push(`Prices don't sum to 1.0 (sum: ${sum.toFixed(4)})`);
    }
  }

  // Validate dates
  const endDate = market.endDate || market.end_date_iso || market.endDateIso;
  if (endDate) {
    const date = new Date(endDate);
    if (isNaN(date.getTime())) {
      warnings.push(`Invalid end date format: ${endDate}`);
    }
  }

  // Check if market is closed/resolved
  if (market.closed === true && market.active === true) {
    warnings.push('Market is both closed and active (inconsistent state)');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Fetch market from public Gamma API
 */
async function fetchFromPublicAPI(conditionId: string): Promise<any> {
  const client = getPolymarketClient();
  return await client.getMarket(conditionId);
}

/**
 * Fetch market from authenticated CLOB API (if credentials available)
 */
async function fetchFromAuthenticatedAPI(conditionId: string): Promise<any | null> {
  const apiKey = process.env.POLYMARKET_API_KEY;
  const apiSecret = process.env.POLYMARKET_API_SECRET;
  const apiPassphrase = process.env.POLYMARKET_API_PASSPHRASE;

  if (!apiKey || !apiSecret || !apiPassphrase) {
    return null;
  }

  try {
    // Try to fetch from CLOB API markets endpoint
    const timestamp = Date.now().toString();
    const crypto = await import('crypto');
    const signature = crypto
      .createHmac('sha256', apiSecret)
      .update(timestamp + 'GET' + '/markets')
      .digest('base64');

    const response = await axios.get('https://clob.polymarket.com/markets', {
      headers: {
        'POLYMARKET-API-KEY': apiKey,
        'POLYMARKET-API-PASSPHRASE': apiPassphrase,
        'POLYMARKET-API-TIMESTAMP': timestamp,
        'POLYMARKET-API-SIGNATURE': signature,
      },
      timeout: 10000,
    });

    // Find market by conditionId
    const markets = Array.isArray(response.data) ? response.data : response.data?.data || [];
    return markets.find((m: any) => 
      (m.conditionId || m.condition_id) === conditionId
    ) || null;
  } catch (error: any) {
    // Authenticated API may not have markets endpoint, that's okay
    return null;
  }
}

/**
 * Verify a market
 */
async function verifyMarket(conditionId: string): Promise<VerificationResult> {
  const result: VerificationResult = {
    marketId: conditionId,
    isValid: false,
    exists: false,
    checks: {
      apiAccessible: false,
      hasRequiredFields: false,
      hasValidStructure: false,
      hasValidOutcomes: false,
      hasValidPrices: false,
      pricesSumToOne: false,
      isActive: false,
      isTradeable: false,
      hasValidDates: false,
    },
    errors: [],
    warnings: [],
  };

  console.log(`🔍 Verifying market: ${conditionId}\n`);

  // ============================================
  // STEP 1: Fetch from Public API
  // ============================================
  console.log('📡 Step 1: Fetching from Public Gamma API...');
  let publicMarket: any = null;
  try {
    publicMarket = await fetchFromPublicAPI(conditionId);
    if (publicMarket) {
      result.exists = true;
      result.checks.apiAccessible = true;
      result.marketData = publicMarket;
      console.log('   ✅ Market found in public API');
      console.log(`   📋 Question: ${publicMarket.question || 'N/A'}`);
    } else {
      result.errors.push('Market not found in public API');
      console.log('   ❌ Market not found');
    }
  } catch (error: any) {
    result.errors.push(`Failed to fetch from public API: ${error.message}`);
    console.log(`   ❌ Error: ${error.message}`);
  }

  if (!publicMarket) {
    console.log('\n❌ Cannot verify market - not found in public API\n');
    return result;
  }

  // ============================================
  // STEP 2: Validate Structure
  // ============================================
  console.log('\n🔬 Step 2: Validating market structure...');
  const validation = validateMarketStructure(publicMarket);
  result.checks.hasValidStructure = validation.valid;
  result.errors.push(...validation.errors);
  result.warnings.push(...validation.warnings);

  if (validation.valid) {
    console.log('   ✅ Market structure is valid');
  } else {
    console.log(`   ❌ Validation failed (${validation.errors.length} errors)`);
    validation.errors.forEach((err) => console.log(`      - ${err}`));
  }

  if (validation.warnings.length > 0) {
    console.log(`   ⚠️  Warnings (${validation.warnings.length}):`);
    validation.warnings.forEach((warn) => console.log(`      - ${warn}`));
  }

  // ============================================
  // STEP 3: Check Required Fields
  // ============================================
  console.log('\n📋 Step 3: Checking required fields...');
  const hasConditionId = !!(publicMarket.conditionId || publicMarket.condition_id);
  const hasQuestion = !!publicMarket.question;
  const hasOutcomes = !!(publicMarket.outcomes || publicMarket.tokens);

  result.checks.hasRequiredFields = hasConditionId && hasQuestion && hasOutcomes;

  console.log(`   ${hasConditionId ? '✅' : '❌'} Condition ID: ${hasConditionId}`);
  console.log(`   ${hasQuestion ? '✅' : '❌'} Question: ${hasQuestion}`);
  console.log(`   ${hasOutcomes ? '✅' : '❌'} Outcomes: ${hasOutcomes}`);

  // ============================================
  // STEP 4: Validate Outcomes
  // ============================================
  console.log('\n🎯 Step 4: Validating outcomes...');
  let outcomes: string[] = [];
  if (Array.isArray(publicMarket.outcomes)) {
    outcomes = publicMarket.outcomes;
  } else if (typeof publicMarket.outcomes === 'string') {
    try {
      outcomes = JSON.parse(publicMarket.outcomes);
    } catch {
      // Try tokens
      if (publicMarket.tokens) {
        outcomes = publicMarket.tokens.map((t: any) => t.outcome);
      }
    }
  } else if (publicMarket.tokens) {
    outcomes = publicMarket.tokens.map((t: any) => t.outcome);
  }

  result.checks.hasValidOutcomes = outcomes.length >= 2;
  console.log(`   📊 Outcomes (${outcomes.length}): ${outcomes.join(', ')}`);

  // ============================================
  // STEP 5: Validate Prices
  // ============================================
  console.log('\n💰 Step 5: Validating prices...');
  let prices: number[] = [];
  
  if (publicMarket.tokens && Array.isArray(publicMarket.tokens)) {
    prices = publicMarket.tokens.map((t: any) => parseFloat(t.price) || 0);
    result.checks.hasValidPrices = prices.every((p) => p >= 0 && p <= 1);
    
    const sum = prices.reduce((a, b) => a + b, 0);
    result.checks.pricesSumToOne = Math.abs(sum - 1.0) < 0.01;
    
    console.log(`   💵 Prices: ${prices.map((p) => p.toFixed(4)).join(', ')}`);
    console.log(`   📊 Sum: ${sum.toFixed(4)} ${result.checks.pricesSumToOne ? '✅' : '❌'}`);
  } else if (publicMarket.outcomePrices) {
    if (Array.isArray(publicMarket.outcomePrices)) {
      prices = publicMarket.outcomePrices.map((p: any) => parseFloat(p) || 0);
    } else if (typeof publicMarket.outcomePrices === 'string') {
      try {
        prices = JSON.parse(publicMarket.outcomePrices).map((p: any) => parseFloat(p) || 0);
      } catch {
        prices = [];
      }
    }
    
    result.checks.hasValidPrices = prices.length > 0 && prices.every((p) => p >= 0 && p <= 1);
    const sum = prices.reduce((a, b) => a + b, 0);
    result.checks.pricesSumToOne = Math.abs(sum - 1.0) < 0.01;
    
    console.log(`   💵 Prices: ${prices.map((p) => p.toFixed(4)).join(', ')}`);
    console.log(`   📊 Sum: ${sum.toFixed(4)} ${result.checks.pricesSumToOne ? '✅' : '❌'}`);
  } else {
    console.log('   ⚠️  No price data found');
  }

  // ============================================
  // STEP 6: Check Market Status
  // ============================================
  console.log('\n📊 Step 6: Checking market status...');
  result.checks.isActive = publicMarket.active === true;
  result.checks.isTradeable = publicMarket.acceptingOrders === true || publicMarket.accepting_orders === true;
  
  console.log(`   ${result.checks.isActive ? '✅' : '❌'} Active: ${result.checks.isActive}`);
  console.log(`   ${result.checks.isTradeable ? '✅' : '❌'} Accepting Orders: ${result.checks.isTradeable}`);
  console.log(`   ${publicMarket.closed ? '🔒' : '🔓'} Closed: ${publicMarket.closed || false}`);
  console.log(`   ${publicMarket.archived ? '📦' : '📋'} Archived: ${publicMarket.archived || false}`);

  // ============================================
  // STEP 7: Validate Dates
  // ============================================
  console.log('\n📅 Step 7: Validating dates...');
  const endDate = publicMarket.endDate || publicMarket.end_date_iso || publicMarket.endDateIso;
  if (endDate) {
    const date = new Date(endDate);
    result.checks.hasValidDates = !isNaN(date.getTime());
    console.log(`   📆 End Date: ${endDate}`);
    console.log(`   ${result.checks.hasValidDates ? '✅' : '❌'} Valid: ${result.checks.hasValidDates}`);
    
    if (result.checks.hasValidDates) {
      const now = new Date();
      const isExpired = date < now;
      console.log(`   ${isExpired ? '⏰' : '⏳'} ${isExpired ? 'Expired' : 'Active'}: ${isExpired ? 'Yes' : 'No'}`);
    }
  } else {
    console.log('   ⚠️  No end date found');
  }

  // ============================================
  // STEP 8: Compare with Authenticated API (if available)
  // ============================================
  console.log('\n🔐 Step 8: Comparing with authenticated API...');
  const authMarket = await fetchFromAuthenticatedAPI(conditionId);
  
  if (authMarket) {
    result.comparison = {
      publicApi: publicMarket,
      authenticatedApi: authMarket,
      match: (authMarket.conditionId || authMarket.condition_id) === conditionId,
    };
    console.log('   ✅ Found in authenticated API');
    console.log(`   ${result.comparison.match ? '✅' : '❌'} Condition IDs match: ${result.comparison.match}`);
  } else {
    console.log('   ℹ️  Not available in authenticated API (or credentials not set)');
  }

  // ============================================
  // FINAL VALIDATION
  // ============================================
  result.isValid =
    result.exists &&
    result.checks.apiAccessible &&
    result.checks.hasRequiredFields &&
    result.checks.hasValidStructure &&
    result.checks.hasValidOutcomes &&
    result.checks.hasValidPrices &&
    result.errors.length === 0;

  return result;
}

/**
 * Main function
 */
async function main() {
  const conditionId = process.argv[2];

  if (!conditionId) {
    console.error('❌ Error: Please provide a market condition ID');
    console.error('\nUsage:');
    console.error('  npm run verify:market -- <conditionId>');
    console.error('  tsx scripts/verify-market.ts <conditionId>');
    console.error('\nExample:');
    console.error('  tsx scripts/verify-market.ts 0x4319532e181605cb15b1bd677759a3bc7f7394b2fdf145195b700eeaedfd5221');
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('🔍 POLYMARKET MARKET VERIFICATION');
  console.log('='.repeat(60));
  console.log('');

  const result = await verifyMarket(conditionId);

  // Save results
  const outputDir = path.join(process.cwd(), 'polymarket-export');
  await fs.mkdir(outputDir, { recursive: true });
  const resultFile = path.join(outputDir, `verification-${conditionId.substring(0, 20)}.json`);
  await fs.writeFile(resultFile, JSON.stringify(result, null, 2), 'utf-8');

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 VERIFICATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`\nMarket ID: ${result.marketId}`);
  console.log(`Status: ${result.isValid ? '✅ VALID' : '❌ INVALID'}`);
  console.log(`Exists: ${result.exists ? '✅ Yes' : '❌ No'}`);
  
  console.log('\nChecks:');
  Object.entries(result.checks).forEach(([key, value]) => {
    const icon = value ? '✅' : '❌';
    const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase());
    console.log(`   ${icon} ${label}`);
  });

  if (result.errors.length > 0) {
    console.log(`\n❌ Errors (${result.errors.length}):`);
    result.errors.forEach((err) => console.log(`   - ${err}`));
  }

  if (result.warnings.length > 0) {
    console.log(`\n⚠️  Warnings (${result.warnings.length}):`);
    result.warnings.forEach((warn) => console.log(`   - ${warn}`));
  }

  if (result.marketData) {
    console.log('\n📋 Market Info:');
    console.log(`   Question: ${result.marketData.question || 'N/A'}`);
    console.log(`   Active: ${result.marketData.active || false}`);
    console.log(`   Accepting Orders: ${result.marketData.acceptingOrders || result.marketData.accepting_orders || false}`);
    if (result.marketData.liquidity) {
      console.log(`   Liquidity: ${result.marketData.liquidity}`);
    }
    if (result.marketData.volume) {
      console.log(`   Volume: ${result.marketData.volume}`);
    }
  }

  console.log(`\n💾 Full results saved to: ${resultFile}`);
  console.log('');

  process.exit(result.isValid ? 0 : 1);
}

main().catch((error) => {
  console.error('\n❌ Fatal error:', error.message);
  if (error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});




