import { Collection } from 'discord.js';
import { Session } from './session';
import { logger } from '../utils/logger';
import { config } from '../config';
import Database from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { SessionTemplateManager } from './session-templates';
import { TokenCounter } from '../utils/token-counter';
import { SessionCollaborationManager } from './session-collaboration';

export class SessionManager {
  private sessions: Collection<string, Session>;
  private db: Database.Database | null = null;
  private userSessionMap: Map<string, Set<string>>;
  private channelSessionMap: Map<string, string>;
  private templateManager?: SessionTemplateManager;
  private tokenCounter?: TokenCounter;
  private collaborationManager?: SessionCollaborationManager;

  constructor() {
    this.sessions = new Collection();
    this.userSessionMap = new Map();
    this.channelSessionMap = new Map();
  }

  async initialize(): Promise<void> {
    await this.initializeDatabase();
    await this.loadPersistedSessions();
  }

  private async initializeDatabase(): Promise<void> {
    const dbPath = path.resolve(config.database.path);
    const dbDir = path.dirname(dbPath);
    
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    return new Promise((resolve, reject) => {
      this.db = new Database.Database(dbPath, (err) => {
        if (err) {
          logger.error('Failed to open database:', err);
          reject(err);
          return;
        }

        this.db!.run(`
          CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            status TEXT NOT NULL,
            model TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            data TEXT
          )
        `, (err) => {
          if (err) {
            logger.error('Failed to create sessions table:', err);
            reject(err);
          } else {
            logger.info('Database initialized');
            resolve();
          }
        });
      });
    });
  }

  private async loadPersistedSessions(): Promise<void> {
    if (!this.db || !config.features.persistence) return;

    return new Promise((resolve) => {
      this.db!.all(
        'SELECT * FROM sessions WHERE status = ?',
        ['active'],
        (err, rows: any[]) => {
          if (err) {
            logger.error('Failed to load sessions:', err);
            resolve();
            return;
          }

          rows.forEach(row => {
            try {
              const sessionData = JSON.parse(row.data || '{}');
              const session = new Session(
                row.id,
                row.user_id,
                row.channel_id,
                this
              );
              session.restore(sessionData);
              this.sessions.set(row.id, session);
              this.addToMaps(row.id, row.user_id, row.channel_id);
              logger.info(`Restored session: ${row.id}`);
            } catch (error) {
              logger.error(`Failed to restore session ${row.id}:`, error);
            }
          });

          logger.info(`Restored ${rows.length} sessions`);
          resolve();
        }
      );
    });
  }

  async createSession(userId: string, channelId: string): Promise<Session> {
    const sessionId = this.generateSessionId();
    const session = new Session(sessionId, userId, channelId, this);
    
    this.sessions.set(sessionId, session);
    this.addToMaps(sessionId, userId, channelId);
    
    await session.initialize();
    await this.persistSession(session);
    
    logger.info(`Created session: ${sessionId} for user: ${userId}`);
    return session;
  }

  async getOrCreateSession(userId: string, channelId: string): Promise<Session> {
    const existingSessionId = this.channelSessionMap.get(channelId);
    if (existingSessionId) {
      const session = this.sessions.get(existingSessionId);
      if (session && session.userId === userId) {
        return session;
      }
    }

    return this.createSession(userId, channelId);
  }

  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  getSessionByChannel(channelId: string): Session | undefined {
    const sessionId = this.channelSessionMap.get(channelId);
    return sessionId ? this.sessions.get(sessionId) : undefined;
  }

  async getUserSessions(userId: string): Promise<Session[]> {
    const sessionIds = this.userSessionMap.get(userId) || new Set();
    return Array.from(sessionIds)
      .map(id => this.sessions.get(id))
      .filter((s): s is Session => s !== undefined);
  }

  async clearSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      await session.destroy();
      this.sessions.delete(sessionId);
      this.removeFromMaps(sessionId, session.userId, session.channelId);
      await this.deletePersistedSession(sessionId);
    }
  }

  async clearUserSessions(userId: string): Promise<void> {
    const sessions = await this.getUserSessions(userId);
    for (const session of sessions) {
      await this.clearSession(session.id);
    }
  }

  async branchSession(sessionId: string): Promise<Session | null> {
    const originalSession = this.sessions.get(sessionId);
    if (!originalSession) return null;

    const newSession = await this.createSession(
      originalSession.userId,
      originalSession.channelId
    );
    
    await newSession.copyFrom(originalSession);
    return newSession;
  }

  async saveAllSessions(): Promise<void> {
    const promises = Array.from(this.sessions.values()).map(session =>
      this.persistSession(session)
    );
    await Promise.all(promises);
    logger.info('All sessions saved');
  }

  async restoreSessions(): Promise<void> {
    await this.loadPersistedSessions();
  }

  async exportSessions(userId: string): Promise<any> {
    const sessions = await this.getUserSessions(userId);
    return {
      exportedAt: new Date().toISOString(),
      userId,
      sessions: await Promise.all(sessions.map(s => s.export()))
    };
  }

  async getStatistics(userId: string): Promise<any> {
    const sessions = await this.getUserSessions(userId);
    const now = Date.now();
    
    let totalMessages = 0;
    let activeSessions = 0;
    const models: Record<string, number> = {};
    
    sessions.forEach(session => {
      totalMessages += session.messageCount;
      if (session.status === 'active') activeSessions++;
      const model = session.model || 'default';
      models[model] = (models[model] || 0) + 1;
    });
    
    const favoriteModel = Object.entries(models)
      .sort(([,a], [,b]) => b - a)[0]?.[0];
    
    return {
      total: sessions.length,
      active: activeSessions,
      messages: totalMessages,
      uptime: this.formatUptime(now - Math.min(...sessions.map(s => s.createdAt))),
      avgLength: sessions.length > 0 ? Math.round(totalMessages / sessions.length) + ' messages' : '0',
      favoriteModel
    };
  }

  private async persistSession(session: Session): Promise<void> {
    if (!this.db || !config.features.persistence) return;

    const data = await session.serialize();
    
    return new Promise((resolve, reject) => {
      this.db!.run(
        `INSERT OR REPLACE INTO sessions (id, user_id, channel_id, status, model, created_at, updated_at, data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          session.id,
          session.userId,
          session.channelId,
          session.status,
          session.model,
          session.createdAt,
          Date.now(),
          JSON.stringify(data)
        ],
        (err) => {
          if (err) {
            logger.error(`Failed to persist session ${session.id}:`, err);
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  private async deletePersistedSession(sessionId: string): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve) => {
      this.db!.run('DELETE FROM sessions WHERE id = ?', [sessionId], (err) => {
        if (err) {
          logger.error(`Failed to delete session ${sessionId}:`, err);
        }
        resolve();
      });
    });
  }

  private addToMaps(sessionId: string, userId: string, channelId: string): void {
    if (!this.userSessionMap.has(userId)) {
      this.userSessionMap.set(userId, new Set());
    }
    this.userSessionMap.get(userId)!.add(sessionId);
    this.channelSessionMap.set(channelId, sessionId);
  }

  private removeFromMaps(sessionId: string, userId: string, channelId: string): void {
    const userSessions = this.userSessionMap.get(userId);
    if (userSessions) {
      userSessions.delete(sessionId);
      if (userSessions.size === 0) {
        this.userSessionMap.delete(userId);
      }
    }
    
    if (this.channelSessionMap.get(channelId) === sessionId) {
      this.channelSessionMap.delete(channelId);
    }
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  // Integration methods for managers
  setTemplateManager(manager: SessionTemplateManager): void {
    this.templateManager = manager;
    logger.info('Template manager integrated with SessionManager');
  }

  setTokenCounter(counter: TokenCounter): void {
    this.tokenCounter = counter;
    logger.info('Token counter integrated with SessionManager');
  }

  setCollaborationManager(manager: SessionCollaborationManager): void {
    this.collaborationManager = manager;
    logger.info('Collaboration manager integrated with SessionManager');
  }

  getTemplateManager(): SessionTemplateManager | undefined {
    return this.templateManager;
  }

  getTokenCounter(): TokenCounter | undefined {
    return this.tokenCounter;
  }

  getCollaborationManager(): SessionCollaborationManager | undefined {
    return this.collaborationManager;
  }
}