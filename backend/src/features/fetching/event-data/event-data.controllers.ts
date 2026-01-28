// Event data controllers
import type { FastifyRequest, FastifyReply } from 'fastify';
import * as eventService from './event-data.services.js';

export async function fetchEvents(request: FastifyRequest<{ Querystring: { active?: string; limit?: string } }>, reply: FastifyReply) {
  try {
    const active = request.query.active === 'true';
    const limit = request.query.limit ? parseInt(request.query.limit) : 100;
    const result = await eventService.fetchAndSaveEvents({ active, limit });
    return reply.send({ success: true, message: `Fetched and saved ${result.saved} events`, data: result });
  } catch (error) {
    return reply.status(500).send({ success: false, error: 'Failed to fetch events', details: error instanceof Error ? error.message : 'Unknown error' });
  }
}

export async function getEvents(request: FastifyRequest<{ Querystring: { status?: 'active' | 'closed' | 'archived'; category?: string; featured?: string; limit?: string; skip?: string } }>, reply: FastifyReply) {
  try {
    const filter = {
      status: request.query.status,
      category: request.query.category,
      featured: request.query.featured === 'true' ? true : undefined,
      limit: request.query.limit ? parseInt(request.query.limit) : 100,
      skip: request.query.skip ? parseInt(request.query.skip) : 0,
    };
    const events = await eventService.getAllEvents(filter);
    return reply.send({ success: true, count: events.length, data: events });
  } catch (error) {
    return reply.status(500).send({ success: false, error: 'Failed to get events', details: error instanceof Error ? error.message : 'Unknown error' });
  }
}

export async function getEventStats(request: FastifyRequest, reply: FastifyReply) {
  try {
    const stats = await eventService.getEventStats();
    return reply.send({ success: true, data: stats });
  } catch (error) {
    return reply.status(500).send({ success: false, error: 'Failed to get event stats', details: error instanceof Error ? error.message : 'Unknown error' });
  }
}
