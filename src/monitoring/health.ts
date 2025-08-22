import * as express from 'express';
import { Client } from 'discord.js';
import Database from 'sqlite3';
import { MetricsCollector } from './metrics';
import { SessionManager } from '../claude/session-manager';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

export interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: number;
  uptime: number;
  checks: {
    discord: CheckResult;
    database: CheckResult;
    filesystem: CheckResult;
    memory: CheckResult;
    sessions: CheckResult;
  };
  metrics?: any;
}

export interface CheckResult {
  status: 'pass' | 'warn' | 'fail';
  message: string;
  details?: any;
}

export class HealthMonitor {
  private static instance: HealthMonitor;
  private app: express.Application;
  private port: number;
  private server?: any;
  private client?: Client;
  private sessionManager?: SessionManager;
  private metricsCollector: MetricsCollector;
  private startTime: number;

  private constructor(port: number = 3000) {
    this.port = port;
    this.app = express();
    this.metricsCollector = MetricsCollector.getInstance();
    this.startTime = Date.now();
    this.setupRoutes();
  }

  static getInstance(port?: number): HealthMonitor {
    if (!HealthMonitor.instance) {
      HealthMonitor.instance = new HealthMonitor(port);
    }
    return HealthMonitor.instance;
  }

  /**
   * Set Discord client for health checks
   */
  setDiscordClient(client: Client): void {
    this.client = client;
  }

  /**
   * Set session manager for health checks
   */
  setSessionManager(manager: SessionManager): void {
    this.sessionManager = manager;
  }

  /**
   * Setup Express routes
   */
  private setupRoutes(): void {
    // Basic health check
    this.app.get('/health', async (req, res) => {
      const health = await this.checkHealth();
      const statusCode = health.status === 'healthy' ? 200 : 
                         health.status === 'degraded' ? 503 : 500;
      res.status(statusCode).json(health);
    });

    // Readiness probe
    this.app.get('/ready', async (req, res) => {
      const ready = await this.checkReadiness();
      res.status(ready ? 200 : 503).json({ ready });
    });

    // Liveness probe
    this.app.get('/live', (req, res) => {
      res.status(200).json({ 
        alive: true,
        timestamp: Date.now()
      });
    });

    // Prometheus metrics
    this.app.get('/metrics', (req, res) => {
      res.set('Content-Type', 'text/plain');
      res.send(this.metricsCollector.exportPrometheus());
    });

    // Detailed status
    this.app.get('/status', async (req, res) => {
      const status = await this.getDetailedStatus();
      res.json(status);
    });

    // Version info
    this.app.get('/version', (req, res) => {
      const packageJson = require('../../package.json');
      res.json({
        name: packageJson.name,
        version: packageJson.version,
        node: process.version,
        discord: require('discord.js').version
      });
    });

    // Error handling
    this.app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      logger.error('Health endpoint error:', err);
      res.status(500).json({ error: 'Internal server error' });
    });
  }

  /**
   * Check overall health
   */
  private async checkHealth(): Promise<HealthCheck> {
    const checks = {
      discord: await this.checkDiscord(),
      database: await this.checkDatabase(),
      filesystem: await this.checkFilesystem(),
      memory: this.checkMemory(),
      sessions: this.checkSessions()
    };

    // Determine overall status
    const hasFailure = Object.values(checks).some(c => c.status === 'fail');
    const hasWarning = Object.values(checks).some(c => c.status === 'warn');
    
    const status = hasFailure ? 'unhealthy' : 
                   hasWarning ? 'degraded' : 
                   'healthy';

    return {
      status,
      timestamp: Date.now(),
      uptime: Date.now() - this.startTime,
      checks,
      metrics: this.metricsCollector.getSummary()
    };
  }

  /**
   * Check if bot is ready to serve requests
   */
  private async checkReadiness(): Promise<boolean> {
    if (!this.client || !this.client.isReady()) {
      return false;
    }

    const dbCheck = await this.checkDatabase();
    if (dbCheck.status === 'fail') {
      return false;
    }

    return true;
  }

  /**
   * Check Discord connection
   */
  private async checkDiscord(): Promise<CheckResult> {
    if (!this.client) {
      return {
        status: 'fail',
        message: 'Discord client not initialized'
      };
    }

    if (!this.client.isReady()) {
      return {
        status: 'fail',
        message: 'Discord client not ready'
      };
    }

    const ping = this.client.ws.ping;
    if (ping > 500) {
      return {
        status: 'warn',
        message: `High latency: ${ping}ms`,
        details: { ping }
      };
    }

    return {
      status: 'pass',
      message: `Connected (${ping}ms)`,
      details: {
        ping,
        guilds: this.client.guilds.cache.size,
        users: this.client.users.cache.size,
        uptime: this.client.uptime
      }
    };
  }

  /**
   * Check database connection
   */
  private async checkDatabase(): Promise<CheckResult> {
    const dbPath = process.env.DATABASE_PATH || './data/sessions.db';
    
    if (!fs.existsSync(dbPath)) {
      return {
        status: 'fail',
        message: 'Database file not found'
      };
    }

    return new Promise((resolve) => {
      const db = new Database.Database(dbPath);
      
      db.get('SELECT COUNT(*) as count FROM sqlite_master WHERE type="table"', (err, row: any) => {
        db.close();
        
        if (err) {
          resolve({
            status: 'fail',
            message: `Database error: ${err.message}`
          });
        } else {
          const size = fs.statSync(dbPath).size;
          const sizeMB = (size / 1024 / 1024).toFixed(2);
          
          if (size > 100 * 1024 * 1024) { // 100MB warning
            resolve({
              status: 'warn',
              message: `Database size high: ${sizeMB}MB`,
              details: { tables: row?.count || 0, size: sizeMB }
            });
          } else {
            resolve({
              status: 'pass',
              message: `Database healthy (${sizeMB}MB)`,
              details: { tables: row?.count || 0, size: sizeMB }
            });
          }
        }
      });
    });
  }

  /**
   * Check filesystem
   */
  private async checkFilesystem(): Promise<CheckResult> {
    const dirs = ['./data', './logs', './backups', './sandbox'];
    const issues: string[] = [];
    
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        issues.push(`Missing: ${dir}`);
        continue;
      }
      
      // Check write permissions
      try {
        const testFile = path.join(dir, '.health-check');
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
      } catch {
        issues.push(`No write access: ${dir}`);
      }
    }
    
    if (issues.length > 0) {
      return {
        status: 'warn',
        message: 'Filesystem issues detected',
        details: { issues }
      };
    }
    
    // Check disk space
    try {
      const { execSync } = require('child_process');
      const df = execSync('df -h .', { encoding: 'utf8' });
      const lines = df.split('\n');
      if (lines[1]) {
        const parts = lines[1].split(/\s+/);
        const usage = parseInt(parts[4]);
        
        if (usage > 90) {
          return {
            status: 'fail',
            message: `Disk space critical: ${usage}%`,
            details: { usage }
          };
        } else if (usage > 80) {
          return {
            status: 'warn',
            message: `Disk space high: ${usage}%`,
            details: { usage }
          };
        }
      }
    } catch {
      // Ignore if df command fails
    }
    
    return {
      status: 'pass',
      message: 'Filesystem healthy',
      details: { directories: dirs }
    };
  }

  /**
   * Check memory usage
   */
  private checkMemory(): CheckResult {
    const memUsage = process.memoryUsage();
    const heapUsed = memUsage.heapUsed;
    const heapTotal = memUsage.heapTotal;
    const percentage = (heapUsed / heapTotal) * 100;
    const rss = memUsage.rss;
    const rssMB = (rss / 1024 / 1024).toFixed(2);
    
    if (percentage > 90) {
      return {
        status: 'fail',
        message: `Memory critical: ${percentage.toFixed(1)}%`,
        details: { heapUsed, heapTotal, rss: rssMB }
      };
    } else if (percentage > 75) {
      return {
        status: 'warn',
        message: `Memory high: ${percentage.toFixed(1)}%`,
        details: { heapUsed, heapTotal, rss: rssMB }
      };
    }
    
    return {
      status: 'pass',
      message: `Memory usage: ${percentage.toFixed(1)}%`,
      details: { 
        heapUsed: (heapUsed / 1024 / 1024).toFixed(2) + 'MB',
        heapTotal: (heapTotal / 1024 / 1024).toFixed(2) + 'MB',
        rss: rssMB + 'MB',
        percentage: percentage.toFixed(1)
      }
    };
  }

  /**
   * Check sessions
   */
  private checkSessions(): CheckResult {
    if (!this.sessionManager) {
      return {
        status: 'warn',
        message: 'Session manager not initialized'
      };
    }
    
    const stats = this.sessionManager.getStats();
    
    if (stats.activeSessions > 50) {
      return {
        status: 'warn',
        message: `High session count: ${stats.activeSessions}`,
        details: stats
      };
    }
    
    return {
      status: 'pass',
      message: `Active sessions: ${stats.activeSessions}`,
      details: stats
    };
  }

  /**
   * Get detailed status
   */
  private async getDetailedStatus(): Promise<any> {
    const health = await this.checkHealth();
    const packageJson = require('../../package.json');
    
    return {
      application: {
        name: packageJson.name,
        version: packageJson.version,
        environment: process.env.NODE_ENV || 'development',
        node: process.version,
        pid: process.pid
      },
      health,
      discord: this.client ? {
        ready: this.client.isReady(),
        guilds: this.client.guilds.cache.size,
        users: this.client.users.cache.size,
        channels: this.client.channels.cache.size,
        ping: this.client.ws.ping,
        uptime: this.client.uptime
      } : null,
      system: {
        platform: process.platform,
        arch: process.arch,
        cpus: require('os').cpus().length,
        totalMemory: require('os').totalmem(),
        freeMemory: require('os').freemem(),
        loadAverage: require('os').loadavg(),
        uptime: process.uptime()
      },
      metrics: this.metricsCollector.getSummary(),
      configuration: {
        sessionTimeout: process.env.SESSION_TIMEOUT,
        maxSessions: process.env.MAX_SESSIONS,
        rateLimit: process.env.RATE_LIMIT_ENABLED === 'true',
        sandbox: process.env.SANDBOX_ENABLED === 'true',
        webhook: process.env.WEBHOOK_ENABLED === 'true'
      }
    };
  }

  /**
   * Start health server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, () => {
        logger.info(`Health monitor listening on port ${this.port}`);
        resolve();
      }).on('error', reject);
    });
  }

  /**
   * Stop health server
   */
  async stop(): Promise<void> {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          logger.info('Health monitor stopped');
          resolve();
        });
      });
    }
  }
}