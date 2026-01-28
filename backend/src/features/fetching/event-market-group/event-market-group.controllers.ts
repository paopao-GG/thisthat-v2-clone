// Event-Market Group controllers
import type { FastifyRequest, FastifyReply } from 'fastify';
import * as eventMarketGroupService from './event-market-group.services.js';

/**
 * Fetch events with markets from Polymarket and save to MongoDB
 */
export async function fetchEventMarketGroups(
  request: FastifyRequest<{
    Querystring: {
      active?: string;
      limit?: string;
    };
  }>,
  reply: FastifyReply
) {
  try {
    const active = request.query.active !== undefined
      ? request.query.active === 'true'
      : undefined;
    const limit = request.query.limit ? parseInt(request.query.limit) : 50;

    const result = await eventMarketGroupService.fetchAndSaveEventMarketGroups({ active, limit });

    return reply.send({
      success: true,
      message: `Fetched and saved ${result.saved} event-market groups`,
      data: result,
    });
  } catch (error) {
    return reply.status(500).send({
      success: false,
      error: 'Failed to fetch event-market groups',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Get all event-market groups from MongoDB
 */
export async function getEventMarketGroups(
  request: FastifyRequest<{
    Querystring: {
      status?: 'active' | 'closed' | 'archived';
      category?: string;
      limit?: string;
      skip?: string;
    };
  }>,
  reply: FastifyReply
) {
  try {
    const filter = {
      status: request.query.status,
      category: request.query.category,
      limit: request.query.limit ? parseInt(request.query.limit) : 50,
      skip: request.query.skip ? parseInt(request.query.skip) : 0,
    };

    const eventGroups = await eventMarketGroupService.getAllEventMarketGroups(filter);

    return reply.send({
      success: true,
      count: eventGroups.length,
      data: eventGroups,
    });
  } catch (error) {
    return reply.status(500).send({
      success: false,
      error: 'Failed to get event-market groups',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Get a single event-market group by ID
 */
export async function getEventMarketGroup(
  request: FastifyRequest<{
    Params: {
      eventId: string;
    };
  }>,
  reply: FastifyReply
) {
  try {
    const eventGroup = await eventMarketGroupService.getEventMarketGroup(request.params.eventId);

    if (!eventGroup) {
      return reply.status(404).send({
        success: false,
        error: 'Event-market group not found',
      });
    }

    return reply.send({
      success: true,
      data: eventGroup,
    });
  } catch (error) {
    return reply.status(500).send({
      success: false,
      error: 'Failed to get event-market group',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Get event-market group statistics
 */
export async function getEventMarketGroupStats(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const stats = await eventMarketGroupService.getEventMarketGroupStats();

    return reply.send({
      success: true,
      data: stats,
    });
  } catch (error) {
    return reply.status(500).send({
      success: false,
      error: 'Failed to get event-market group stats',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
