import { SessionManager } from '../claude/session-manager';
import { Session } from '../claude/session';
import { PostgresAdapter } from '../database/postgres-adapter';
import { RedisCache } from '../cache/redis-cache';
import { SecurityManager } from '../utils/security-manager';
import { MetricsCollector } from '../monitoring/metrics';
import { EventEmitter } from 'events';

// Mock dependencies
jest.mock('../database/postgres-adapter');
jest.mock('../cache/redis-cache');
jest.mock('../utils/security-manager');
jest.mock('../monitoring/metrics');
jest.mock('../claude/session');

describe('SessionManager', () => {
  let sessionManager: SessionManager;
  let mockDb: jest.Mocked<PostgresAdapter>;
  let mockCache: jest.Mocked<RedisCache>;
  let mockSecurity: jest.Mocked<SecurityManager>;
  let mockMetrics: jest.Mocked<MetricsCollector>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create mock instances
    mockDb = PostgresAdapter.getInstance() as jest.Mocked<PostgresAdapter>;
    mockCache = RedisCache.getInstance() as jest.Mocked<RedisCache>;
    mockSecurity = SecurityManager.getInstance() as jest.Mocked<SecurityManager>;
    mockMetrics = MetricsCollector.getInstance() as jest.Mocked<MetricsCollector>;
    
    // Initialize SessionManager
    sessionManager = SessionManager.getInstance();
  });

  afterEach(() => {
    // Clean up
    jest.restoreAllMocks();
  });

  describe('Session Creation', () => {
    it('should create a new session successfully', async () => {
      const userId = 'user123';
      const options = {
        type: 'tmux' as const,
        persistent: true,
        template: 'default'
      };

      const mockSession = {
        getInfo: jest.fn().mockReturnValue({
          id: 'session123',
          userId,
          status: 'active',
          createdAt: new Date()
        })
      };

      (Session as jest.MockedClass<typeof Session>).mockImplementation(() => mockSession as any);
      mockDb.createSession.mockResolvedValue({ id: 'session123' });
      mockCache.set.mockResolvedValue(true);

      const session = await sessionManager.getOrCreateSession(userId, options);

      expect(session).toBeDefined();
      expect(Session).toHaveBeenCalledWith(expect.objectContaining({
        userId,
        type: 'tmux',
        persistent: true
      }));
      expect(mockMetrics.increment).toHaveBeenCalledWith('sessions.created');
    });

    it('should return existing session if available', async () => {
      const userId = 'user123';
      const existingSessionId = 'existing123';
      
      const mockSession = {
        getInfo: jest.fn().mockReturnValue({
          id: existingSessionId,
          userId,
          status: 'active'
        }),
        isActive: jest.fn().mockReturnValue(true)
      };

      // Set up existing session in manager
      (sessionManager as any).sessions.set(userId, mockSession);
      mockCache.get.mockResolvedValue({ sessionId: existingSessionId });

      const session = await sessionManager.getOrCreateSession(userId);

      expect(session).toBe(mockSession);
      expect(Session).not.toHaveBeenCalled();
      expect(mockMetrics.increment).toHaveBeenCalledWith('sessions.reused');
    });

    it('should enforce session limits per user', async () => {
      const userId = 'user123';
      const maxSessions = 5;

      // Mock multiple existing sessions
      mockDb.getUserSessions.mockResolvedValue(
        Array(maxSessions).fill(null).map((_, i) => ({
          id: `session${i}`,
          userId,
          status: 'active'
        }))
      );

      await expect(
        sessionManager.getOrCreateSession(userId)
      ).rejects.toThrow('Maximum session limit reached');
    });

    it('should handle session creation failures gracefully', async () => {
      const userId = 'user123';
      const error = new Error('Database connection failed');
      
      mockDb.createSession.mockRejectedValue(error);

      await expect(
        sessionManager.getOrCreateSession(userId)
      ).rejects.toThrow('Database connection failed');
      
      expect(mockMetrics.increment).toHaveBeenCalledWith('sessions.errors');
    });
  });

  describe('Session Retrieval', () => {
    it('should get session by ID', async () => {
      const sessionId = 'session123';
      const mockSessionData = {
        id: sessionId,
        userId: 'user123',
        status: 'active'
      };

      mockCache.get.mockResolvedValue(mockSessionData);
      mockDb.getSession.mockResolvedValue(mockSessionData);

      const session = await sessionManager.getSession(sessionId);

      expect(session).toBeDefined();
      expect(mockCache.get).toHaveBeenCalledWith(`session:${sessionId}`);
    });

    it('should get all user sessions', async () => {
      const userId = 'user123';
      const mockSessions = [
        { id: 'session1', userId, status: 'active' },
        { id: 'session2', userId, status: 'inactive' }
      ];

      mockDb.getUserSessions.mockResolvedValue(mockSessions);

      const sessions = await sessionManager.getUserSessions(userId);

      expect(sessions).toHaveLength(2);
      expect(mockDb.getUserSessions).toHaveBeenCalledWith(userId);
    });

    it('should return null for non-existent session', async () => {
      const sessionId = 'nonexistent';
      
      mockCache.get.mockResolvedValue(null);
      mockDb.getSession.mockResolvedValue(null);

      const session = await sessionManager.getSession(sessionId);

      expect(session).toBeNull();
    });
  });

  describe('Session Management', () => {
    it('should clear user session', async () => {
      const userId = 'user123';
      const sessionId = 'session123';
      
      const mockSession = {
        getInfo: jest.fn().mockReturnValue({ id: sessionId }),
        destroy: jest.fn().mockResolvedValue(undefined)
      };

      (sessionManager as any).sessions.set(userId, mockSession);

      await sessionManager.clearSession(userId);

      expect(mockSession.destroy).toHaveBeenCalled();
      expect((sessionManager as any).sessions.has(userId)).toBe(false);
      expect(mockCache.delete).toHaveBeenCalledWith(`session:user:${userId}`);
    });

    it('should destroy all sessions', async () => {
      const sessions = [
        { userId: 'user1', session: { destroy: jest.fn() } },
        { userId: 'user2', session: { destroy: jest.fn() } }
      ];

      sessions.forEach(({ userId, session }) => {
        (sessionManager as any).sessions.set(userId, session);
      });

      await sessionManager.destroyAllSessions();

      sessions.forEach(({ session }) => {
        expect(session.destroy).toHaveBeenCalled();
      });
      expect((sessionManager as any).sessions.size).toBe(0);
    });

    it('should handle session handoff', async () => {
      const fromUserId = 'user1';
      const toUserId = 'user2';
      const sessionId = 'session123';

      const mockSession = {
        getInfo: jest.fn().mockReturnValue({
          id: sessionId,
          userId: fromUserId
        }),
        handoff: jest.fn().mockResolvedValue(true)
      };

      (sessionManager as any).sessions.set(fromUserId, mockSession);
      mockSecurity.canHandoffSession.mockResolvedValue(true);

      const result = await sessionManager.handoffSession(sessionId, fromUserId, toUserId);

      expect(result).toBe(true);
      expect(mockSession.handoff).toHaveBeenCalledWith(toUserId);
      expect((sessionManager as any).sessions.has(fromUserId)).toBe(false);
      expect((sessionManager as any).sessions.get(toUserId)).toBe(mockSession);
    });

    it('should prevent unauthorized session handoff', async () => {
      const fromUserId = 'user1';
      const toUserId = 'user2';
      const sessionId = 'session123';

      mockSecurity.canHandoffSession.mockResolvedValue(false);

      await expect(
        sessionManager.handoffSession(sessionId, fromUserId, toUserId)
      ).rejects.toThrow('Unauthorized session handoff');
    });
  });

  describe('Session Persistence', () => {
    it('should save session state', async () => {
      const sessionId = 'session123';
      const sessionData = {
        id: sessionId,
        userId: 'user123',
        config: { persistent: true },
        state: 'active'
      };

      mockDb.updateSession.mockResolvedValue(sessionData);
      mockCache.set.mockResolvedValue(true);

      await sessionManager.saveSessionState(sessionId, sessionData);

      expect(mockDb.updateSession).toHaveBeenCalledWith(sessionId, sessionData);
      expect(mockCache.set).toHaveBeenCalledWith(
        `session:${sessionId}`,
        sessionData,
        expect.any(Object)
      );
    });

    it('should restore sessions on startup', async () => {
      const mockSessions = [
        { id: 'session1', userId: 'user1', status: 'active', config: {} },
        { id: 'session2', userId: 'user2', status: 'active', config: {} }
      ];

      mockDb.query = jest.fn().mockResolvedValue({ rows: mockSessions });

      await sessionManager.restoreSessions();

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM sessions WHERE status = $1'),
        ['active']
      );
      expect(mockMetrics.gauge).toHaveBeenCalledWith('sessions.restored', 2);
    });

    it('should handle restore failures gracefully', async () => {
      mockDb.query = jest.fn().mockRejectedValue(new Error('Database error'));

      await sessionManager.restoreSessions();

      expect(mockMetrics.increment).toHaveBeenCalledWith('sessions.restore.errors');
    });
  });

  describe('Session Cleanup', () => {
    it('should clean up inactive sessions', async () => {
      const inactiveSessions = [
        { id: 'inactive1', lastActivity: new Date(Date.now() - 3600000) },
        { id: 'inactive2', lastActivity: new Date(Date.now() - 7200000) }
      ];

      mockDb.query = jest.fn().mockResolvedValue({ rows: inactiveSessions });
      mockDb.deleteSession = jest.fn().mockResolvedValue(undefined);

      await sessionManager.cleanupInactiveSessions();

      expect(mockDb.deleteSession).toHaveBeenCalledTimes(2);
      expect(mockMetrics.increment).toHaveBeenCalledWith(
        'sessions.cleanup',
        { count: 2 }
      );
    });

    it('should respect session timeout settings', async () => {
      const sessions = [
        {
          id: 'session1',
          lastActivity: new Date(Date.now() - 1000), // Recent
          config: { timeout: 3600000 }
        },
        {
          id: 'session2',
          lastActivity: new Date(Date.now() - 7200000), // Old
          config: { timeout: 3600000 }
        }
      ];

      mockDb.query = jest.fn().mockResolvedValue({ rows: sessions });
      mockDb.deleteSession = jest.fn().mockResolvedValue(undefined);

      await sessionManager.cleanupInactiveSessions();

      expect(mockDb.deleteSession).toHaveBeenCalledWith('session2');
      expect(mockDb.deleteSession).not.toHaveBeenCalledWith('session1');
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits', async () => {
      const userId = 'user123';
      
      mockCache.checkRateLimit.mockResolvedValue({
        allowed: false,
        remaining: 0,
        resetAt: Date.now() + 60000
      });

      await expect(
        sessionManager.checkRateLimit(userId)
      ).rejects.toThrow('Rate limit exceeded');
    });

    it('should allow requests within rate limit', async () => {
      const userId = 'user123';
      
      mockCache.checkRateLimit.mockResolvedValue({
        allowed: true,
        remaining: 5,
        resetAt: Date.now() + 60000
      });

      const result = await sessionManager.checkRateLimit(userId);
      
      expect(result).toBe(true);
    });
  });

  describe('Metrics and Monitoring', () => {
    it('should track session metrics', async () => {
      const userId = 'user123';
      
      await sessionManager.getOrCreateSession(userId);

      expect(mockMetrics.increment).toHaveBeenCalled();
      expect(mockMetrics.gauge).toHaveBeenCalled();
      expect(mockMetrics.histogram).toHaveBeenCalled();
    });

    it('should provide session statistics', () => {
      // Mock some sessions
      (sessionManager as any).sessions.set('user1', { isActive: () => true });
      (sessionManager as any).sessions.set('user2', { isActive: () => true });
      (sessionManager as any).sessions.set('user3', { isActive: () => false });

      const stats = sessionManager.getStats();

      expect(stats).toEqual(expect.objectContaining({
        totalSessions: 3,
        activeSessions: 2,
        inactiveSessions: 1
      }));
    });
  });

  describe('Event Handling', () => {
    it('should emit session created event', async () => {
      const userId = 'user123';
      const eventSpy = jest.fn();
      
      sessionManager.on('sessionCreated', eventSpy);
      
      await sessionManager.getOrCreateSession(userId);

      expect(eventSpy).toHaveBeenCalledWith(expect.objectContaining({
        userId,
        sessionId: expect.any(String)
      }));
    });

    it('should emit session destroyed event', async () => {
      const userId = 'user123';
      const eventSpy = jest.fn();
      
      const mockSession = {
        getInfo: jest.fn().mockReturnValue({ id: 'session123' }),
        destroy: jest.fn().mockResolvedValue(undefined)
      };

      (sessionManager as any).sessions.set(userId, mockSession);
      sessionManager.on('sessionDestroyed', eventSpy);
      
      await sessionManager.clearSession(userId);

      expect(eventSpy).toHaveBeenCalledWith(expect.objectContaining({
        userId,
        sessionId: 'session123'
      }));
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors', async () => {
      const userId = 'user123';
      
      mockDb.createSession.mockRejectedValue(new Error('Connection timeout'));

      await expect(
        sessionManager.getOrCreateSession(userId)
      ).rejects.toThrow('Connection timeout');
    });

    it('should handle cache failures gracefully', async () => {
      const userId = 'user123';
      
      mockCache.set.mockRejectedValue(new Error('Redis connection lost'));
      
      // Should still create session even if cache fails
      const session = await sessionManager.getOrCreateSession(userId);
      
      expect(session).toBeDefined();
      expect(mockMetrics.increment).toHaveBeenCalledWith('cache.errors');
    });

    it('should handle concurrent session creation', async () => {
      const userId = 'user123';
      
      // Simulate concurrent requests
      const promises = Array(5).fill(null).map(() =>
        sessionManager.getOrCreateSession(userId)
      );

      const sessions = await Promise.all(promises);
      
      // Should all return the same session
      const firstSession = sessions[0];
      sessions.forEach(session => {
        expect(session).toBe(firstSession);
      });
    });
  });
});