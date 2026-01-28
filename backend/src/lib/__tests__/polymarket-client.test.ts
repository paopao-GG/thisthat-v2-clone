// Unit tests for PolymarketClient
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PolymarketClient, type PolymarketMarket, type PolymarketEvent } from '../polymarket-client.js';
import axios from 'axios';

// Mock axios module
vi.mock('axios');

// Type-safe mock helper
const mockedAxios = vi.mocked(axios);

describe('PolymarketClient', () => {
  let client: PolymarketClient;
  let mockAxiosInstance: any;

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Create a mock axios instance
    mockAxiosInstance = {
      get: vi.fn(),
    };

    // Mock axios.create to return our mock instance
    mockedAxios.create.mockReturnValue(mockAxiosInstance as any);

    // Create client instance
    client = new PolymarketClient(undefined, 'https://test-api.polymarket.com');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should create client with default base URL', () => {
      const defaultClient = new PolymarketClient();
      expect(mockedAxios.create).toHaveBeenCalled();
    });

    it('should create client with custom base URL', () => {
      const customClient = new PolymarketClient(undefined, 'https://custom-api.com');
      expect(mockedAxios.create).toHaveBeenCalled();
    });

    it('should configure axios with correct headers', () => {
      new PolymarketClient();
      const createCall = mockedAxios.create.mock.calls[0];
      expect(createCall[0]).toMatchObject({
        baseURL: expect.any(String),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        timeout: 30000,
      });
    });
  });

  describe('getMarkets', () => {
    it('should fetch markets successfully', async () => {
      // Arrange
      const mockMarkets: PolymarketMarket[] = [
        {
          condition_id: '0x123',
          question: 'Will Bitcoin reach $100k?',
          outcomes: ['Yes', 'No'],
          end_date_iso: '2025-12-31T23:59:59Z',
          question_id: 'q1',
          market_slug: 'bitcoin-100k',
          tokens: [
            { token_id: 't1', outcome: 'Yes', price: 0.65 },
            { token_id: 't2', outcome: 'No', price: 0.35 },
          ],
        },
        {
          condition_id: '0x456',
          question: 'Will Ethereum reach $5k?',
          outcomes: ['Yes', 'No'],
          end_date_iso: '2025-12-31T23:59:59Z',
          question_id: 'q2',
          market_slug: 'ethereum-5k',
          tokens: [
            { token_id: 't3', outcome: 'Yes', price: 0.40 },
            { token_id: 't4', outcome: 'No', price: 0.60 },
          ],
        },
      ];

      mockAxiosInstance.get.mockResolvedValue({ data: mockMarkets });

      // Act
      const result = await client.getMarkets();

      // Assert
      expect(result).toEqual(mockMarkets);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/markets', {
        params: { closed: 'false' },
      });
    });

    it('should handle wrapped response format', async () => {
      // Arrange - Some APIs wrap data in { data: [...] }
      const mockMarkets: PolymarketMarket[] = [
        {
          condition_id: '0x123',
          question: 'Test?',
          outcomes: ['Yes', 'No'],
          end_date_iso: '2025-12-31T23:59:59Z',
          question_id: 'q1',
          market_slug: 'test',
        },
      ];

      mockAxiosInstance.get.mockResolvedValue({ data: { data: mockMarkets } });

      // Act
      const result = await client.getMarkets();

      // Assert
      expect(result).toEqual(mockMarkets);
    });

    it('should handle markets property wrapper', async () => {
      // Arrange - Some APIs wrap in { markets: [...] }
      const mockMarkets: PolymarketMarket[] = [
        {
          condition_id: '0x123',
          question: 'Test?',
          outcomes: ['Yes', 'No'],
          end_date_iso: '2025-12-31T23:59:59Z',
          question_id: 'q1',
          market_slug: 'test',
        },
      ];

      mockAxiosInstance.get.mockResolvedValue({ data: { markets: mockMarkets } });

      // Act
      const result = await client.getMarkets();

      // Assert
      expect(result).toEqual(mockMarkets);
    });

    it('should return empty array when response is empty', async () => {
      // Arrange
      mockAxiosInstance.get.mockResolvedValue({ data: [] });

      // Act
      const result = await client.getMarkets();

      // Assert
      expect(result).toEqual([]);
    });

    it('should pass query parameters correctly', async () => {
      // Arrange
      mockAxiosInstance.get.mockResolvedValue({ data: [] });

      // Act
      await client.getMarkets({
        closed: true,
        limit: 50,
        offset: 10,
        tag_id: 'politics',
      });

      // Assert
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/markets', {
        params: {
          closed: 'true',
          limit: 50,
          offset: 10,
          tag_id: 'politics',
        },
      });
    });

    it('should default to active markets (closed=false) when not specified', async () => {
      // Arrange
      mockAxiosInstance.get.mockResolvedValue({ data: [] });

      // Act
      await client.getMarkets();

      // Assert
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/markets', {
        params: { closed: 'false' },
      });
    });

    it('should throw error when API call fails', async () => {
      // Arrange
      const errorMessage = 'Network Error';
      mockAxiosInstance.get.mockRejectedValue(new Error(errorMessage));

      // Act & Assert
      await expect(client.getMarkets()).rejects.toThrow('Failed to fetch markets from Polymarket');
    });

    it('should throw error with API response data when available', async () => {
      // Arrange
      const apiError = {
        response: {
          data: { error: 'Rate limit exceeded' },
        },
        message: 'Request failed',
      };
      mockAxiosInstance.get.mockRejectedValue(apiError);

      // Act & Assert
      await expect(client.getMarkets()).rejects.toThrow('Failed to fetch markets from Polymarket');
    });
  });

  describe('getMarket', () => {
    it('should fetch single market by condition ID', async () => {
      // Arrange
      const mockMarket: PolymarketMarket = {
        condition_id: '0x123',
        question: 'Will Bitcoin reach $100k?',
        outcomes: ['Yes', 'No'],
        end_date_iso: '2025-12-31T23:59:59Z',
        question_id: 'q1',
        market_slug: 'bitcoin-100k',
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockMarket });

      // Act
      const result = await client.getMarket('0x123');

      // Assert
      expect(result).toEqual(mockMarket);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/markets/0x123');
    });

    it('should return null when market not found', async () => {
      // Arrange
      mockAxiosInstance.get.mockRejectedValue(new Error('Not Found'));

      // Act
      const result = await client.getMarket('invalid-id');

      // Assert
      expect(result).toBeNull();
    });

    it('should return null when API returns null', async () => {
      // Arrange
      mockAxiosInstance.get.mockResolvedValue({ data: null });

      // Act
      const result = await client.getMarket('0x123');

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('getEvents', () => {
    it('should fetch events successfully', async () => {
      // Arrange
      const mockEvents: PolymarketEvent[] = [
        {
          id: 'event1',
          slug: 'us-election-2024',
          title: '2024 US Presidential Election',
          category: 'politics',
          active: true,
        },
        {
          id: 'event2',
          slug: 'bitcoin-price',
          title: 'Bitcoin Price Prediction',
          category: 'crypto',
          active: true,
        },
      ];

      mockAxiosInstance.get.mockResolvedValue({ data: mockEvents });

      // Act
      const result = await client.getEvents();

      // Assert
      expect(result).toEqual(mockEvents);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/events', {
        params: {},
      });
    });

    it('should handle wrapped response format', async () => {
      // Arrange
      const mockEvents: PolymarketEvent[] = [
        {
          id: 'event1',
          slug: 'test-event',
          title: 'Test Event',
        },
      ];

      mockAxiosInstance.get.mockResolvedValue({ data: { data: mockEvents } });

      // Act
      const result = await client.getEvents();

      // Assert
      expect(result).toEqual(mockEvents);
    });

    it('should handle events property wrapper', async () => {
      // Arrange
      const mockEvents: PolymarketEvent[] = [
        {
          id: 'event1',
          slug: 'test-event',
          title: 'Test Event',
        },
      ];

      mockAxiosInstance.get.mockResolvedValue({ data: { events: mockEvents } });

      // Act
      const result = await client.getEvents();

      // Assert
      expect(result).toEqual(mockEvents);
    });

    it('should pass all query parameters correctly', async () => {
      // Arrange
      mockAxiosInstance.get.mockResolvedValue({ data: [] });

      // Act
      await client.getEvents({
        closed: true,
        limit: 20,
        offset: 5,
        tag_id: 'sports',
        featured: true,
        order: 'id',
        ascending: false,
      });

      // Assert
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/events', {
        params: {
          closed: 'true',
          limit: 20,
          offset: 5,
          tag_id: 'sports',
          featured: 'true',
          order: 'id',
          ascending: 'false',
        },
      });
    });

    it('should throw error when API call fails', async () => {
      // Arrange
      mockAxiosInstance.get.mockRejectedValue(new Error('API Error'));

      // Act & Assert
      await expect(client.getEvents()).rejects.toThrow('Failed to fetch events from Polymarket');
    });
  });

  describe('getEvent', () => {
    it('should fetch single event by ID', async () => {
      // Arrange
      const mockEvent: PolymarketEvent = {
        id: 'event1',
        slug: 'us-election-2024',
        title: '2024 US Presidential Election',
        category: 'politics',
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockEvent });

      // Act
      const result = await client.getEvent('event1');

      // Assert
      expect(result).toEqual(mockEvent);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/events/event1');
    });

    it('should return null when event not found', async () => {
      // Arrange
      mockAxiosInstance.get.mockRejectedValue(new Error('Not Found'));

      // Act
      const result = await client.getEvent('invalid-id');

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('getEventMarkets', () => {
    it('should fetch markets for an event', async () => {
      // Arrange
      const mockMarkets: PolymarketMarket[] = [
        {
          condition_id: '0x123',
          question: 'Will candidate A win?',
          outcomes: ['Yes', 'No'],
          end_date_iso: '2025-12-31T23:59:59Z',
          question_id: 'q1',
          market_slug: 'candidate-a-win',
        },
      ];

      mockAxiosInstance.get.mockResolvedValue({ data: mockMarkets });

      // Act
      const result = await client.getEventMarkets('event1');

      // Assert
      expect(result).toEqual(mockMarkets);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/events/event1/markets');
    });

    it('should return empty array when API call fails', async () => {
      // Arrange
      mockAxiosInstance.get.mockRejectedValue(new Error('Not Found'));

      // Act
      const result = await client.getEventMarkets('invalid-event');

      // Assert
      expect(result).toEqual([]);
    });

    it('should return empty array when response is empty', async () => {
      // Arrange
      mockAxiosInstance.get.mockResolvedValue({ data: [] });

      // Act
      const result = await client.getEventMarkets('event1');

      // Assert
      expect(result).toEqual([]);
    });
  });
});

