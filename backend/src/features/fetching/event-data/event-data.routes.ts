// Event data routes
import type { FastifyInstance } from 'fastify';
import * as controller from './event-data.controllers.js';

export default async function eventDataRoutes(fastify: FastifyInstance) {
  // Fetch events from Polymarket and save to MongoDB
  // Changed to GET to match Polymarket API (POST was causing 415 error)
  fastify.get('/fetch', controller.fetchEvents);
  // Keep POST for backward compatibility
  fastify.post('/fetch', controller.fetchEvents);
  
  // Get events from MongoDB
  fastify.get('/', controller.getEvents);
  
  // Get event statistics
  fastify.get('/stats', controller.getEventStats);
}
