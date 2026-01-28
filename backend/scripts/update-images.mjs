/**
 * Script to update market images from Polymarket events
 * Run: node scripts/update-images.mjs
 */

import { createRequire } from 'module';
import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Use the markets-specific Prisma client
const require = createRequire(import.meta.url);
const { PrismaClient } = require('../node_modules/.prisma/client-markets');
const prisma = new PrismaClient();

const GAMMA_API_URL = process.env.POLYMARKET_BASE_URL || 'https://gamma-api.polymarket.com';

/**
 * Validate image URL from external API before storing
 * Prevents storing malicious or malformed URLs
 */
function isValidImageUrl(url) {
  if (!url || typeof url !== 'string') return false;

  // Must be HTTPS
  if (!url.startsWith('https://')) return false;

  // Basic URL format validation
  try {
    const parsed = new URL(url);
    // Must have a valid hostname
    if (!parsed.hostname || parsed.hostname.length < 3) return false;
    return true;
  } catch {
    return false;
  }
}

async function getEvents(params = {}) {
  const queryParams = new URLSearchParams();
  if (params.closed !== undefined) queryParams.set('closed', params.closed.toString());
  if (params.featured !== undefined) queryParams.set('featured', params.featured.toString());
  if (params.limit) queryParams.set('limit', params.limit.toString());

  const url = `${GAMMA_API_URL}/events?${queryParams.toString()}`;
  console.log(`Fetching: ${url}`);

  const response = await axios.get(url, {
    headers: { 'Accept': 'application/json' },
    timeout: 30000
  });

  return Array.isArray(response.data) ? response.data : (response.data?.data || response.data?.events || []);
}

async function getEventMarkets(eventId) {
  try {
    const response = await axios.get(`${GAMMA_API_URL}/events/${eventId}/markets`, {
      headers: { 'Accept': 'application/json' },
      timeout: 30000
    });
    return response.data || [];
  } catch (error) {
    console.error(`Error fetching markets for event ${eventId}:`, error.message);
    return [];
  }
}

async function updateMarketImagesFromEvents() {
  const result = {
    eventsProcessed: 0,
    marketsUpdated: 0,
    errors: 0,
  };

  try {
    console.log('[Image Update] Fetching events from Polymarket...');

    // Fetch ALL active events (not just featured) to get more images
    const featuredEvents = await getEvents({ closed: false, featured: true, limit: 100 });
    const allEvents = await getEvents({ closed: false, limit: 500 });

    // Combine and deduplicate by event ID
    const eventMap = new Map();
    for (const event of featuredEvents) {
      eventMap.set(event.id, event);
    }
    for (const event of allEvents) {
      if (!eventMap.has(event.id)) {
        eventMap.set(event.id, event);
      }
    }

    const events = Array.from(eventMap.values());
    console.log(`[Image Update] Processing ${events.length} unique events (${featuredEvents.length} featured, ${allEvents.length} total fetched)`);

    for (const event of events) {
      try {
        result.eventsProcessed++;

        // Extract image URL (prefer 'image' over 'icon')
        const rawImageUrl = event.image || event.icon || event.image_url || event.icon_url || null;

        // Validate URL before using it
        if (!isValidImageUrl(rawImageUrl)) {
          continue; // Skip events with invalid or missing images
        }

        const imageUrl = rawImageUrl; // Type narrowing after validation

        // Get markets in this event
        let markets = event.markets || [];

        if (markets.length === 0 && event.id) {
          markets = await getEventMarkets(event.id);
        }

        for (const market of markets) {
          try {
            const conditionId = market.conditionId || market.condition_id;
            if (!conditionId) continue;

            // Update market imageUrl if market exists and doesn't have an image
            const updated = await prisma.market.updateMany({
              where: {
                polymarketId: conditionId,
                imageUrl: null,
              },
              data: { imageUrl },
            });

            if (updated.count > 0) {
              result.marketsUpdated += updated.count;
              console.log(`  Updated market ${conditionId} with image from event ${event.id}`);
            }
          } catch (marketError) {
            console.error(`[Image Update] Error updating market ${market.conditionId}:`, marketError.message);
            result.errors++;
          }
        }
      } catch (eventError) {
        console.error(`[Image Update] Error processing event ${event.id}:`, eventError.message);
        result.errors++;
      }
    }

    console.log(
      `\n[Image Update] Complete: ${result.eventsProcessed} events processed, ${result.marketsUpdated} markets updated, ${result.errors} errors`
    );
  } catch (error) {
    console.error('[Image Update] Fatal error:', error?.message || error);
  }

  return result;
}

async function checkImageStats() {
  const total = await prisma.market.count();
  const withImages = await prisma.market.count({ where: { imageUrl: { not: null } } });
  const withoutImages = await prisma.market.count({ where: { imageUrl: null } });

  console.log('\n=== Market Image Statistics ===');
  console.log(`Total markets: ${total}`);
  console.log(`With images: ${withImages} (${((withImages/total)*100).toFixed(1)}%)`);
  console.log(`Without images: ${withoutImages} (${((withoutImages/total)*100).toFixed(1)}%)`);
  console.log('================================\n');
}

async function main() {
  console.log('=== Polymarket Image Update Script ===\n');

  // Show stats before
  await checkImageStats();

  // Run update
  await updateMarketImagesFromEvents();

  // Show stats after
  await checkImageStats();

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Script failed:', err);
  prisma.$disconnect();
  process.exit(1);
});
