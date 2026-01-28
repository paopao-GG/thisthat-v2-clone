/**
 * Bet Configuration Utilities
 * Handles minimum and maximum bet limits for V1 credit system
 */

import type { BetConfig } from '@shared/types';

// Default bet configuration for V1
export const DEFAULT_BET_CONFIG: BetConfig = {
  minBet: 1,
  maxBet: 10000, // Can be adjusted based on user credits or platform settings
};

/**
 * Get effective max bet (considering user credits and platform limits)
 */
export function getEffectiveMaxBet(userCredits: number, config: BetConfig = DEFAULT_BET_CONFIG): number {
  return Math.min(userCredits, config.maxBet);
}

/**
 * Validate bet amount
 */
export function isValidBetAmount(amount: number, userCredits: number, config: BetConfig = DEFAULT_BET_CONFIG): boolean {
  const effectiveMax = getEffectiveMaxBet(userCredits, config);
  return amount >= config.minBet && amount <= effectiveMax && amount <= userCredits;
}

/**
 * Get bet amount suggestions based on user credits
 */
export function getBetAmountSuggestions(userCredits: number, config: BetConfig = DEFAULT_BET_CONFIG): number[] {
  const effectiveMax = getEffectiveMaxBet(userCredits, config);
  const suggestions: number[] = [];
  
  // Always include min bet
  if (config.minBet <= effectiveMax) {
    suggestions.push(config.minBet);
  }
  
  // Add common bet amounts if they fit
  const commonAmounts = [100, 250, 500, 1000, 2500, 5000];
  for (const amount of commonAmounts) {
    if (amount >= config.minBet && amount <= effectiveMax && !suggestions.includes(amount)) {
      suggestions.push(amount);
    }
  }
  
  // Always include max if it's different
  if (effectiveMax > config.minBet && !suggestions.includes(effectiveMax)) {
    suggestions.push(effectiveMax);
  }
  
  return suggestions.sort((a, b) => a - b);
}

