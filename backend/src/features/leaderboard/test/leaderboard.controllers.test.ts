// Unit tests for Leaderboard Controllers
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as leaderboardControllers from '../leaderboard.controllers.js';
import * as leaderboardService from '../leaderboard.services.js';

vi.mock('../leaderboard.services.js');

describe('Leaderboard Controllers', () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRequest = {
      query: {},
      user: { userId: 'user-123' },
      log: {
        error: vi.fn(),
      },
    };

    mockReply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };
  });

  describe('getPnLLeaderboardHandler', () => {
    it('should return PnL leaderboard', async () => {
      const mockResult = {
        leaderboard: [
          { rank: 1, user: { id: 'user-1', username: 'user1' }, overallPnL: 1000 },
        ],
        total: 1,
        limit: 100,
        offset: 0,
      };

      vi.mocked(leaderboardService.getPnLLeaderboard).mockResolvedValue(mockResult);

      await leaderboardControllers.getPnLLeaderboardHandler(mockRequest, mockReply);

      expect(leaderboardService.getPnLLeaderboard).toHaveBeenCalledWith(100, 0);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        ...mockResult,
      });
    });
  });

  describe('getVolumeLeaderboardHandler', () => {
    it('should return volume leaderboard', async () => {
      const mockResult = {
        leaderboard: [
          { rank: 1, user: { id: 'user-1', username: 'user1' }, totalVolume: 10000 },
        ],
        total: 1,
        limit: 100,
        offset: 0,
      };

      vi.mocked(leaderboardService.getVolumeLeaderboard).mockResolvedValue(mockResult);

      await leaderboardControllers.getVolumeLeaderboardHandler(mockRequest, mockReply);

      expect(leaderboardService.getVolumeLeaderboard).toHaveBeenCalledWith(100, 0);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        ...mockResult,
      });
    });
  });

  describe('getUserRankingHandler', () => {
    it('should return user ranking', async () => {
      const mockRanking = {
        rank: 10,
        totalUsers: 100,
        overallPnL: 500,
        totalVolume: 5000,
      };

      vi.mocked(leaderboardService.getUserRanking).mockResolvedValue(mockRanking);

      await leaderboardControllers.getUserRankingHandler(mockRequest, mockReply);

      expect(leaderboardService.getUserRanking).toHaveBeenCalledWith('user-123', 'pnl');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        ranking: mockRanking,
      });
    });

    it('should return 404 if user not found', async () => {
      vi.mocked(leaderboardService.getUserRanking).mockResolvedValue(null);

      await leaderboardControllers.getUserRankingHandler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });
  });
});




