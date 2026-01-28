// Event-Market Group routes
import type { FastifyInstance } from 'fastify';
import * as controller from './event-market-group.controllers.js';

export default async function eventMarketGroupRoutes(fastify: FastifyInstance) {
  // Fetch events with markets from Polymarket and save to MongoDB
  fastify.get('/fetch', controller.fetchEventMarketGroups);
  fastify.post('/fetch', controller.fetchEventMarketGroups);

  // Get all event-market groups from MongoDB
  fastify.get('/', controller.getEventMarketGroups);

  // Get a single event-market group by ID
  fastify.get('/:eventId', controller.getEventMarketGroup);

  // Get event-market group statistics
  fastify.get('/stats', controller.getEventMarketGroupStats);
}
