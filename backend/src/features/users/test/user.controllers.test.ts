// Unit tests for User Controllers
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as userControllers from '../user.controllers.js';
import * as userService from '../user.services.js';

vi.mock('../user.services.js');
vi.mock('../user.models.js', () => ({
  updateUserSchema: {
    parse: vi.fn((data) => data),
  },
  userIdParamSchema: {
    parse: vi.fn((data) => data),
  },
}));

describe('User Controllers', () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRequest = {
      body: {},
      params: {},
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

  describe('updateMeHandler', () => {
    it('should update user profile successfully', async () => {
      const updateData = {
        name: 'Updated Name',
        username: 'newusername',
      };

      mockRequest.body = updateData;

      const mockUpdatedUser = {
        id: 'user-123',
        username: updateData.username,
        name: updateData.name,
        creditBalance: 1000,
      };

      vi.mocked(userService.updateUserProfile).mockResolvedValue(mockUpdatedUser);

      await userControllers.updateMeHandler(mockRequest, mockReply);

      expect(userService.updateUserProfile).toHaveBeenCalledWith('user-123', updateData);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        user: mockUpdatedUser,
      });
    });

    it('should return 401 if user not authenticated', async () => {
      mockRequest.user = null;

      await userControllers.updateMeHandler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });

    it('should return 409 if username already taken', async () => {
      vi.mocked(userService.updateUserProfile).mockRejectedValue(
        new Error('Username already taken')
      );

      await userControllers.updateMeHandler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(409);
    });
  });

  describe('getUserByIdHandler', () => {
    it('should return user profile', async () => {
      const userId = 'user-456';
      mockRequest.params = { userId };

      const mockUser = {
        id: userId,
        username: 'testuser',
        creditBalance: 1000,
      };

      vi.mocked(userService.getUserById).mockResolvedValue(mockUser);

      await userControllers.getUserByIdHandler(mockRequest, mockReply);

      expect(userService.getUserById).toHaveBeenCalledWith(userId);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        user: mockUser,
      });
    });

    it('should return 404 if user not found', async () => {
      mockRequest.params = { userId: 'non-existent' };

      vi.mocked(userService.getUserById).mockResolvedValue(null);

      await userControllers.getUserByIdHandler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });
  });
});




