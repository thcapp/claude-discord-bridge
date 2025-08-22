import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { SessionManager } from '../../../src/claude/session-manager';
import { Session } from '../../../src/claude/session';

describe('SessionManager', () => {
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Session Creation', () => {
    it('should create a new session', async () => {
      const session = await sessionManager.getOrCreateSession('user123', 'channel456');
      
      expect(session).toBeDefined();
      expect(session.userId).toBe('user123');
      expect(session.channelId).toBe('channel456');
    });

    it('should return existing session for same user/channel', async () => {
      const session1 = await sessionManager.getOrCreateSession('user123', 'channel456');
      const session2 = await sessionManager.getOrCreateSession('user123', 'channel456');
      
      expect(session1.id).toBe(session2.id);
    });

    it('should enforce max sessions per user', async () => {
      // Create max sessions
      for (let i = 0; i < 5; i++) {
        await sessionManager.getOrCreateSession('user123', `channel${i}`);
      }
      
      // Try to create one more
      await expect(
        sessionManager.getOrCreateSession('user123', 'channel999')
      ).rejects.toThrow();
    });
  });

  describe('Session Management', () => {
    it('should get session by ID', async () => {
      const created = await sessionManager.getOrCreateSession('user123', 'channel456');
      const retrieved = sessionManager.getSession(created.id);
      
      expect(retrieved?.id).toBe(created.id);
    });

    it('should get session by channel', async () => {
      const created = await sessionManager.getOrCreateSession('user123', 'channel456');
      const retrieved = sessionManager.getSessionByChannel('channel456');
      
      expect(retrieved?.id).toBe(created.id);
    });

    it('should list user sessions', async () => {
      await sessionManager.getOrCreateSession('user123', 'channel1');
      await sessionManager.getOrCreateSession('user123', 'channel2');
      await sessionManager.getOrCreateSession('user456', 'channel3');
      
      const userSessions = sessionManager.getUserSessions('user123');
      
      expect(userSessions).toHaveLength(2);
      expect(userSessions.every(s => s.userId === 'user123')).toBe(true);
    });

    it('should delete session', async () => {
      const session = await sessionManager.getOrCreateSession('user123', 'channel456');
      
      await sessionManager.deleteSession(session.id);
      
      const retrieved = sessionManager.getSession(session.id);
      expect(retrieved).toBeUndefined();
    });

    it('should clear user sessions', async () => {
      await sessionManager.getOrCreateSession('user123', 'channel1');
      await sessionManager.getOrCreateSession('user123', 'channel2');
      
      await sessionManager.clearUserSessions('user123');
      
      const userSessions = sessionManager.getUserSessions('user123');
      expect(userSessions).toHaveLength(0);
    });
  });

  describe('Session Persistence', () => {
    it('should save session to database', async () => {
      const session = await sessionManager.getOrCreateSession('user123', 'channel456');
      
      const saveSpy = jest.spyOn(sessionManager as any, 'saveSession');
      await sessionManager.saveSession(session.id);
      
      expect(saveSpy).toHaveBeenCalledWith(session.id);
    });

    it('should save all sessions', async () => {
      await sessionManager.getOrCreateSession('user1', 'channel1');
      await sessionManager.getOrCreateSession('user2', 'channel2');
      
      const saveSpy = jest.spyOn(sessionManager as any, 'saveSession');
      await sessionManager.saveAllSessions();
      
      expect(saveSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('Session Statistics', () => {
    it('should return correct stats', async () => {
      await sessionManager.getOrCreateSession('user1', 'channel1');
      await sessionManager.getOrCreateSession('user2', 'channel2');
      
      const stats = sessionManager.getStats();
      
      expect(stats.totalSessions).toBe(2);
      expect(stats.activeSessions).toBe(2);
      expect(stats.uniqueUsers).toBe(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Mock database error
      jest.spyOn(sessionManager as any, 'db').mockImplementation(() => {
        throw new Error('Database connection failed');
      });
      
      // Should not throw, but log error
      await expect(
        sessionManager.initialize()
      ).resolves.not.toThrow();
    });

    it('should handle invalid session IDs', () => {
      const session = sessionManager.getSession('invalid-id');
      expect(session).toBeUndefined();
    });
  });
});