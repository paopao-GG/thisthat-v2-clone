// Event data models with Zod validation
import { z } from 'zod';

// Zod schema for event validation
export const EventDataSchema = z.object({
  eventId: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string().optional(),
  imageUrl: z.string().url().optional(),
  iconUrl: z.string().url().optional(),
  category: z.string().optional(),
  status: z.enum(['active', 'closed', 'archived']),
  featured: z.boolean().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  marketCount: z.number().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type EventData = z.infer<typeof EventDataSchema>;

// Flattened event structure for MongoDB
export interface FlattenedEvent {
  // Core identifiers
  eventId: string;
  slug: string;

  // Event content
  title: string;
  description?: string;

  // Media
  imageUrl?: string;
  iconUrl?: string;

  // Metadata
  category?: string;
  status: 'active' | 'closed' | 'archived';
  featured?: boolean;

  // Dates
  startDate?: string;
  endDate?: string;

  // Market relationship
  marketCount?: number;
  marketIds?: string[]; // Array of associated market condition IDs

  // Source tracking
  source: 'polymarket';
  rawData?: any; // Original Polymarket data for debugging

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

// Statistics for event data
export interface EventStats {
  totalEvents: number;
  activeEvents: number;
  closedEvents: number;
  archivedEvents: number;
  featuredEvents: number;
  categoryCounts: Record<string, number>;
  lastUpdated: Date;
}
