/**
 * Fetches images from Picsum Photos with deterministic seeds based on keywords
 * This provides consistent, high-quality placeholder images
 */

// Simple hash function to convert keywords to a number (seed)
const hashString = (str: string): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
};

export const getImageUrl = (keywords: string, width: number = 800, height: number = 600): string => {
  // Clean keywords
  const cleanKeywords = keywords
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .substring(0, 50);
  
  // Generate a seed from keywords for consistent images
  const seed = hashString(cleanKeywords) % 1000;
  
  // Use Picsum Photos with seed for consistent images
  return `https://picsum.photos/seed/${seed}/${width}/${height}`;
};

export const getImageUrlForMarket = (market: {
  title: string;
  thisOption?: string;
  thatOption?: string;
  category?: string;
}): string => {
  // Extract keywords from title and category
  const keywords = [market.title, market.category].filter(Boolean).join(' ');
  return getImageUrl(keywords, 800, 450);
};

export const getImageUrlForOption = (option: string, category?: string): string => {
  const keywords = [option, category].filter(Boolean).join(' ');
  return getImageUrl(keywords, 600, 600);
};

