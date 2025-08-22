import express, { Express, Request, Response, NextFunction } from 'express';
import bodyParser from 'body-parser';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { config } from '../config';

interface WebhookEvent {
  id: string;
  type: string;
  source: 'github' | 'gitlab';
  payload: any;
  timestamp: number;
  signature?: string;
}

export class WebhookServer extends EventEmitter {
  private static instance: WebhookServer;
  private app: Express;
  private server: any;
  private eventQueue: WebhookEvent[] = [];
  private processing: boolean = false;
  private readonly MAX_QUEUE_SIZE = 100;
  private readonly PORT: number;

  private constructor() {
    super();
    this.app = express();
    this.PORT = config.github.webhookPort || 3000;
    this.setupMiddleware();
    this.setupRoutes();
  }

  static getInstance(): WebhookServer {
    if (!WebhookServer.instance) {
      WebhookServer.instance = new WebhookServer();
    }
    return WebhookServer.instance;
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    // Parse JSON bodies
    this.app.use(bodyParser.json({
      limit: '10mb',
      verify: (req: any, res, buf) => {
        // Store raw body for signature verification
        req.rawBody = buf.toString('utf8');
      }
    }));

    // Parse URL-encoded bodies
    this.app.use(bodyParser.urlencoded({ extended: true }));

    // CORS headers
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, X-GitHub-Event, X-Hub-Signature-256, X-GitLab-Token');
      res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
      
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });

    // Request logging
    this.app.use((req, res, next) => {
      logger.debug(`Webhook request: ${req.method} ${req.path}`);
      next();
    });

    // Error handling
    this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      logger.error('Webhook server error:', err);
      res.status(500).json({ error: 'Internal server error' });
    });
  }

  /**
   * Setup webhook routes
   */
  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        uptime: process.uptime(),
        queue: this.eventQueue.length,
        timestamp: new Date().toISOString()
      });
    });

    // GitHub webhook endpoint
    this.app.post('/webhook/github', async (req, res) => {
      try {
        // Verify signature
        if (!this.verifyGitHubSignature(req)) {
          logger.warn('Invalid GitHub webhook signature');
          return res.status(401).json({ error: 'Invalid signature' });
        }

        // Get event type
        const eventType = req.headers['x-github-event'] as string;
        const deliveryId = req.headers['x-github-delivery'] as string;

        logger.info(`Received GitHub webhook: ${eventType} (${deliveryId})`);

        // Create event
        const event: WebhookEvent = {
          id: deliveryId,
          type: eventType,
          source: 'github',
          payload: req.body,
          timestamp: Date.now(),
          signature: req.headers['x-hub-signature-256'] as string
        };

        // Queue event for processing
        this.queueEvent(event);

        // Respond immediately
        res.status(200).json({ received: true, id: deliveryId });
      } catch (error) {
        logger.error('GitHub webhook error:', error);
        res.status(500).json({ error: 'Processing error' });
      }
    });

    // GitLab webhook endpoint
    this.app.post('/webhook/gitlab', async (req, res) => {
      try {
        // Verify token
        if (!this.verifyGitLabToken(req)) {
          logger.warn('Invalid GitLab webhook token');
          return res.status(401).json({ error: 'Invalid token' });
        }

        // Get event type
        const eventType = req.headers['x-gitlab-event'] as string;
        const eventId = req.headers['x-gitlab-event-uuid'] as string;

        logger.info(`Received GitLab webhook: ${eventType} (${eventId})`);

        // Create event
        const event: WebhookEvent = {
          id: eventId,
          type: eventType,
          source: 'gitlab',
          payload: req.body,
          timestamp: Date.now()
        };

        // Queue event for processing
        this.queueEvent(event);

        // Respond immediately
        res.status(200).json({ received: true, id: eventId });
      } catch (error) {
        logger.error('GitLab webhook error:', error);
        res.status(500).json({ error: 'Processing error' });
      }
    });

    // Generic webhook endpoint (for testing)
    this.app.post('/webhook', (req, res) => {
      logger.info('Received generic webhook');
      
      const event: WebhookEvent = {
        id: Date.now().toString(),
        type: 'generic',
        source: 'github',
        payload: req.body,
        timestamp: Date.now()
      };

      this.queueEvent(event);
      res.status(200).json({ received: true });
    });

    // List queued events (debug endpoint)
    this.app.get('/webhook/queue', (req, res) => {
      res.json({
        count: this.eventQueue.length,
        events: this.eventQueue.map(e => ({
          id: e.id,
          type: e.type,
          source: e.source,
          timestamp: new Date(e.timestamp).toISOString()
        }))
      });
    });
  }

  /**
   * Verify GitHub webhook signature
   */
  private verifyGitHubSignature(req: any): boolean {
    const secret = config.github.webhookSecret;
    if (!secret) {
      logger.warn('GitHub webhook secret not configured');
      return true; // Allow if not configured (development)
    }

    const signature = req.headers['x-hub-signature-256'];
    if (!signature) {
      return false;
    }

    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(req.rawBody || JSON.stringify(req.body));
    const expectedSignature = `sha256=${hmac.digest('hex')}`;

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  /**
   * Verify GitLab webhook token
   */
  private verifyGitLabToken(req: Request): boolean {
    const secret = config.github.webhookSecret; // Reuse GitHub secret for now
    if (!secret) {
      return true; // Allow if not configured
    }

    const token = req.headers['x-gitlab-token'];
    return token === secret;
  }

  /**
   * Queue event for processing
   */
  private queueEvent(event: WebhookEvent): void {
    // Check queue size
    if (this.eventQueue.length >= this.MAX_QUEUE_SIZE) {
      logger.warn('Webhook event queue full, dropping oldest event');
      this.eventQueue.shift();
    }

    // Add to queue
    this.eventQueue.push(event);

    // Start processing if not already running
    if (!this.processing) {
      this.processQueue();
    }
  }

  /**
   * Process event queue
   */
  private async processQueue(): Promise<void> {
    if (this.processing || this.eventQueue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.eventQueue.length > 0) {
      const event = this.eventQueue.shift();
      if (!event) continue;

      try {
        // Emit event for handlers
        this.emit('webhook', event);
        this.emit(`webhook:${event.type}`, event);

        // Log successful processing
        logger.debug(`Processed webhook event: ${event.type} (${event.id})`);
      } catch (error) {
        logger.error(`Error processing webhook event ${event.id}:`, error);
      }

      // Rate limiting - wait a bit between events
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.processing = false;
  }

  /**
   * Start the webhook server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.PORT, () => {
          logger.info(`Webhook server listening on port ${this.PORT}`);
          resolve();
        });

        // Handle server errors
        this.server.on('error', (error: any) => {
          if (error.code === 'EADDRINUSE') {
            logger.error(`Port ${this.PORT} is already in use`);
          } else {
            logger.error('Webhook server error:', error);
          }
          reject(error);
        });
      } catch (error) {
        logger.error('Failed to start webhook server:', error);
        reject(error);
      }
    });
  }

  /**
   * Stop the webhook server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          logger.info('Webhook server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Get server status
   */
  getStatus(): {
    running: boolean;
    port: number;
    queueSize: number;
    uptime: number;
  } {
    return {
      running: !!this.server && this.server.listening,
      port: this.PORT,
      queueSize: this.eventQueue.length,
      uptime: process.uptime()
    };
  }

  /**
   * Register event filter
   */
  registerFilter(
    eventType: string,
    filter: (event: WebhookEvent) => boolean
  ): void {
    const originalEmit = this.emit.bind(this);
    
    this.emit = (event: string | symbol, ...args: any[]): boolean => {
      if (event === `webhook:${eventType}`) {
        const webhookEvent = args[0] as WebhookEvent;
        if (!filter(webhookEvent)) {
          logger.debug(`Filtered out ${eventType} event`);
          return false;
        }
      }
      return originalEmit(event, ...args);
    };
  }

  /**
   * Clear event queue
   */
  clearQueue(): void {
    const count = this.eventQueue.length;
    this.eventQueue = [];
    logger.info(`Cleared ${count} events from webhook queue`);
  }

  /**
   * Get recent events
   */
  getRecentEvents(limit: number = 10): WebhookEvent[] {
    return this.eventQueue.slice(-limit);
  }
}