import { WebSocketServer, WebSocket } from 'ws';
import { Server as HTTPServer } from 'http';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import * as jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';
import { config } from '../config';
import { SessionManager } from '../claude/session-manager';
import { SecurityManager } from '../utils/security-manager';
import { MetricsCollector } from '../monitoring/metrics';

interface IDEConnection {
  id: string;
  ws: WebSocket;
  userId: string;
  ideType: 'vscode' | 'jetbrains' | 'neovim' | 'sublime';
  ideVersion: string;
  workspacePath: string;
  sessionId?: string;
  authenticated: boolean;
  lastActivity: Date;
  heartbeatInterval?: NodeJS.Timer;
  messageQueue: Message[];
  capabilities: Set<string>;
}

interface Message {
  id: string;
  type: string;
  method?: string;
  params?: any;
  result?: any;
  error?: any;
  timestamp: number;
}

interface AuthToken {
  userId: string;
  discordId: string;
  permissions: string[];
  exp: number;
}

export class IDEWebSocketServer extends EventEmitter {
  private static instance: IDEWebSocketServer;
  private wss?: WebSocketServer;
  private connections: Map<string, IDEConnection> = new Map();
  private userConnections: Map<string, Set<string>> = new Map();
  private sessionManager: SessionManager;
  private securityManager: SecurityManager;
  private metrics: MetricsCollector;
  private heartbeatInterval = 25000; // 25 seconds
  private messageTimeout = 30000; // 30 seconds
  private maxConnectionsPerUser = 5;
  private maxMessageQueueSize = 100;

  private constructor() {
    super();
    this.sessionManager = SessionManager.getInstance();
    this.securityManager = SecurityManager.getInstance();
    this.metrics = MetricsCollector.getInstance();
  }

  static getInstance(): IDEWebSocketServer {
    if (!IDEWebSocketServer.instance) {
      IDEWebSocketServer.instance = new IDEWebSocketServer();
    }
    return IDEWebSocketServer.instance;
  }

  async start(server?: HTTPServer, port: number = 3002): Promise<void> {
    try {
      this.wss = new WebSocketServer(server ? { server } : { port });

      this.wss.on('connection', (ws: WebSocket, request) => {
        this.handleConnection(ws, request);
      });

      this.wss.on('error', (error) => {
        logger.error('WebSocket server error:', error);
      });

      // Start cleanup interval
      setInterval(() => this.cleanupConnections(), 60000);

      logger.info(`IDE WebSocket server started on port ${port}`);
      this.emit('started', { port });
    } catch (error) {
      logger.error('Failed to start WebSocket server:', error);
      throw error;
    }
  }

  private handleConnection(ws: WebSocket, request: any): void {
    const connectionId = uuidv4();
    const connection: IDEConnection = {
      id: connectionId,
      ws,
      userId: '',
      ideType: 'vscode',
      ideVersion: '',
      workspacePath: '',
      authenticated: false,
      lastActivity: new Date(),
      messageQueue: [],
      capabilities: new Set()
    };

    this.connections.set(connectionId, connection);

    // Set up event handlers
    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        await this.handleMessage(connectionId, message);
      } catch (error) {
        logger.error('Failed to handle WebSocket message:', error);
        this.sendError(connectionId, null, 'Invalid message format');
      }
    });

    ws.on('close', (code, reason) => {
      this.handleDisconnection(connectionId, code, reason.toString());
    });

    ws.on('error', (error) => {
      logger.error(`WebSocket error for connection ${connectionId}:`, error);
    });

    ws.on('pong', () => {
      connection.lastActivity = new Date();
    });

    // Start heartbeat
    this.startHeartbeat(connectionId);

    // Send initial handshake
    this.sendMessage(connectionId, {
      type: 'hello',
      version: '1.0.0',
      capabilities: ['auth', 'sync', 'collaboration', 'debugging', 'lsp'],
      requiresAuth: true
    });

    logger.info(`New IDE connection: ${connectionId}`);
    this.metrics.increment('ide.connections.total');
  }

  private async handleMessage(connectionId: string, message: Message): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    connection.lastActivity = new Date();
    
    // Record metrics
    this.metrics.increment('ide.messages.received', { type: message.type });

    // Handle authentication first
    if (!connection.authenticated && message.type !== 'auth') {
      this.sendError(connectionId, message.id, 'Authentication required');
      return;
    }

    try {
      switch (message.type) {
        case 'auth':
          await this.handleAuth(connectionId, message);
          break;

        case 'request':
          await this.handleRequest(connectionId, message);
          break;

        case 'notification':
          await this.handleNotification(connectionId, message);
          break;

        case 'sync':
          await this.handleSync(connectionId, message);
          break;

        case 'collaboration':
          await this.handleCollaboration(connectionId, message);
          break;

        case 'heartbeat':
          this.handleHeartbeat(connectionId);
          break;

        default:
          this.sendError(connectionId, message.id, `Unknown message type: ${message.type}`);
      }
    } catch (error) {
      logger.error(`Error handling message type ${message.type}:`, error);
      this.sendError(connectionId, message.id, error.message);
    }
  }

  private async handleAuth(connectionId: string, message: Message): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    try {
      const { token, ideType, ideVersion, workspacePath } = message.params;

      // Verify JWT token
      const decoded = jwt.verify(token, config.jwt?.secret || 'secret') as AuthToken;

      // Check if user has too many connections
      const userConns = this.userConnections.get(decoded.userId) || new Set();
      if (userConns.size >= this.maxConnectionsPerUser) {
        throw new Error('Maximum connections exceeded');
      }

      // Update connection
      connection.userId = decoded.userId;
      connection.ideType = ideType;
      connection.ideVersion = ideVersion;
      connection.workspacePath = workspacePath;
      connection.authenticated = true;

      // Track user connection
      userConns.add(connectionId);
      this.userConnections.set(decoded.userId, userConns);

      // Parse capabilities
      if (message.params.capabilities) {
        message.params.capabilities.forEach((cap: string) => {
          connection.capabilities.add(cap);
        });
      }

      // Send success response
      this.sendMessage(connectionId, {
        id: message.id,
        type: 'response',
        result: {
          authenticated: true,
          userId: decoded.userId,
          sessionId: connection.sessionId,
          capabilities: Array.from(connection.capabilities)
        }
      });

      logger.info(`IDE authenticated: ${connection.userId} using ${ideType} ${ideVersion}`);
      this.emit('authenticated', { connectionId, userId: decoded.userId, ideType });

    } catch (error) {
      logger.error('Authentication failed:', error);
      this.sendError(connectionId, message.id, 'Authentication failed');
      connection.ws.close(1008, 'Authentication failed');
    }
  }

  private async handleRequest(connectionId: string, message: Message): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    const { method, params } = message;

    try {
      let result: any;

      switch (method) {
        case 'createSession':
          result = await this.createSession(connection, params);
          break;

        case 'executeCommand':
          result = await this.executeCommand(connection, params);
          break;

        case 'getFile':
          result = await this.getFile(connection, params);
          break;

        case 'saveFile':
          result = await this.saveFile(connection, params);
          break;

        case 'searchFiles':
          result = await this.searchFiles(connection, params);
          break;

        case 'getCompletions':
          result = await this.getCompletions(connection, params);
          break;

        case 'getDiagnostics':
          result = await this.getDiagnostics(connection, params);
          break;

        case 'refactor':
          result = await this.refactor(connection, params);
          break;

        default:
          throw new Error(`Unknown method: ${method}`);
      }

      this.sendMessage(connectionId, {
        id: message.id,
        type: 'response',
        result
      });

    } catch (error) {
      logger.error(`Request ${method} failed:`, error);
      this.sendError(connectionId, message.id, error.message);
    }
  }

  private async handleNotification(connectionId: string, message: Message): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    const { method, params } = message;

    // Notifications don't require responses
    try {
      switch (method) {
        case 'textDocument/didOpen':
          await this.handleDocumentOpen(connection, params);
          break;

        case 'textDocument/didChange':
          await this.handleDocumentChange(connection, params);
          break;

        case 'textDocument/didSave':
          await this.handleDocumentSave(connection, params);
          break;

        case 'textDocument/didClose':
          await this.handleDocumentClose(connection, params);
          break;

        case 'workspace/didChangeConfiguration':
          await this.handleConfigurationChange(connection, params);
          break;

        default:
          logger.warn(`Unknown notification method: ${method}`);
      }

      this.emit('notification', { connectionId, method, params });
    } catch (error) {
      logger.error(`Notification ${method} failed:`, error);
    }
  }

  private async handleSync(connectionId: string, message: Message): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection || !connection.sessionId) return;

    const { operation, documentUri, changes } = message.params;

    // Broadcast to other connections in the same session
    this.broadcastToSession(connection.sessionId, {
      type: 'sync',
      operation,
      documentUri,
      changes,
      userId: connection.userId,
      timestamp: Date.now()
    }, connectionId);

    this.emit('sync', { connectionId, operation, documentUri });
  }

  private async handleCollaboration(connectionId: string, message: Message): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection || !connection.sessionId) return;

    const { action, data } = message.params;

    switch (action) {
      case 'cursor':
        this.broadcastToSession(connection.sessionId, {
          type: 'collaboration',
          action: 'cursor',
          userId: connection.userId,
          data
        }, connectionId);
        break;

      case 'selection':
        this.broadcastToSession(connection.sessionId, {
          type: 'collaboration',
          action: 'selection',
          userId: connection.userId,
          data
        }, connectionId);
        break;

      case 'presence':
        this.updatePresence(connection, data);
        break;
    }
  }

  private handleHeartbeat(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    connection.lastActivity = new Date();
    this.sendMessage(connectionId, { type: 'heartbeat', timestamp: Date.now() });
  }

  private startHeartbeat(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    connection.heartbeatInterval = setInterval(() => {
      if (connection.ws.readyState === WebSocket.OPEN) {
        connection.ws.ping();
      }
    }, this.heartbeatInterval);
  }

  private async createSession(connection: IDEConnection, params: any): Promise<any> {
    const session = await this.sessionManager.getOrCreateSession(connection.userId, {
      type: params.type || 'tmux',
      persistent: true,
      metadata: {
        ide: connection.ideType,
        workspace: connection.workspacePath
      }
    });

    connection.sessionId = session.getInfo().id;
    
    return {
      sessionId: session.getInfo().id,
      status: session.getInfo().status,
      createdAt: session.getInfo().createdAt
    };
  }

  private async executeCommand(connection: IDEConnection, params: any): Promise<any> {
    if (!connection.sessionId) {
      throw new Error('No active session');
    }

    const session = await this.sessionManager.getSession(connection.sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const result = await session.executeCommand(params.command);
    return {
      output: result.output,
      error: result.error,
      exitCode: result.exitCode
    };
  }

  private async getFile(connection: IDEConnection, params: any): Promise<any> {
    // Security check
    const safePath = await this.securityManager.validatePath(params.path);
    
    const session = await this.sessionManager.getOrCreateSession(connection.userId);
    const result = await session.executeCommand(`cat "${safePath}"`);
    
    return {
      path: params.path,
      content: result.output,
      encoding: 'utf-8'
    };
  }

  private async saveFile(connection: IDEConnection, params: any): Promise<any> {
    // Security check
    const safePath = await this.securityManager.validatePath(params.path);
    
    const session = await this.sessionManager.getOrCreateSession(connection.userId);
    
    // Write file using echo and redirection
    const content = params.content.replace(/'/g, "'\\''");
    await session.executeCommand(`echo '${content}' > "${safePath}"`);
    
    return {
      path: params.path,
      saved: true
    };
  }

  private async searchFiles(connection: IDEConnection, params: any): Promise<any> {
    const session = await this.sessionManager.getOrCreateSession(connection.userId);
    const result = await session.executeCommand(
      `find . -type f -name "*${params.query}*" | head -20`
    );
    
    return {
      files: result.output?.split('\n').filter(f => f.trim()) || []
    };
  }

  private async getCompletions(connection: IDEConnection, params: any): Promise<any> {
    // This would integrate with Claude for code completions
    const session = await this.sessionManager.getOrCreateSession(connection.userId);
    const response = await session.sendMessage(
      `Provide code completions for: ${params.prefix}`
    );
    
    return {
      completions: [
        {
          label: response.content?.substring(0, 50) || '',
          detail: 'Claude suggestion',
          insertText: response.content || ''
        }
      ]
    };
  }

  private async getDiagnostics(connection: IDEConnection, params: any): Promise<any> {
    // Run linters or analyzers
    const session = await this.sessionManager.getOrCreateSession(connection.userId);
    const result = await session.executeCommand(`npm run lint -- ${params.path}`);
    
    return {
      diagnostics: this.parseDiagnostics(result.output || '')
    };
  }

  private async refactor(connection: IDEConnection, params: any): Promise<any> {
    const session = await this.sessionManager.getOrCreateSession(connection.userId);
    const response = await session.sendMessage(
      `Refactor this code: ${params.code}\nRefactoring type: ${params.type}`
    );
    
    return {
      refactoredCode: response.content,
      explanation: response.metadata?.explanation
    };
  }

  private async handleDocumentOpen(connection: IDEConnection, params: any): Promise<void> {
    // Track opened documents
    this.emit('documentOpened', {
      connectionId: connection.id,
      uri: params.textDocument.uri,
      languageId: params.textDocument.languageId
    });
  }

  private async handleDocumentChange(connection: IDEConnection, params: any): Promise<void> {
    // Handle document changes for real-time sync
    if (connection.sessionId) {
      this.broadcastToSession(connection.sessionId, {
        type: 'documentChange',
        uri: params.textDocument.uri,
        changes: params.contentChanges
      }, connection.id);
    }
  }

  private async handleDocumentSave(connection: IDEConnection, params: any): Promise<void> {
    // Trigger save actions
    this.emit('documentSaved', {
      connectionId: connection.id,
      uri: params.textDocument.uri
    });
  }

  private async handleDocumentClose(connection: IDEConnection, params: any): Promise<void> {
    // Clean up document tracking
    this.emit('documentClosed', {
      connectionId: connection.id,
      uri: params.textDocument.uri
    });
  }

  private async handleConfigurationChange(connection: IDEConnection, params: any): Promise<void> {
    // Update configuration
    this.emit('configurationChanged', {
      connectionId: connection.id,
      settings: params.settings
    });
  }

  private updatePresence(connection: IDEConnection, data: any): void {
    if (!connection.sessionId) return;

    this.broadcastToSession(connection.sessionId, {
      type: 'presence',
      userId: connection.userId,
      status: data.status,
      currentFile: data.currentFile,
      cursor: data.cursor
    }, connection.id);
  }

  private broadcastToSession(sessionId: string, message: any, excludeConnectionId?: string): void {
    for (const [connId, conn] of this.connections) {
      if (conn.sessionId === sessionId && connId !== excludeConnectionId) {
        this.sendMessage(connId, message);
      }
    }
  }

  private sendMessage(connectionId: string, message: any): void {
    const connection = this.connections.get(connectionId);
    if (!connection || connection.ws.readyState !== WebSocket.OPEN) return;

    try {
      connection.ws.send(JSON.stringify({
        ...message,
        timestamp: message.timestamp || Date.now()
      }));

      this.metrics.increment('ide.messages.sent', { type: message.type });
    } catch (error) {
      logger.error(`Failed to send message to ${connectionId}:`, error);
    }
  }

  private sendError(connectionId: string, messageId: string | null, error: string): void {
    this.sendMessage(connectionId, {
      id: messageId,
      type: 'error',
      error: {
        message: error,
        code: -32603 // Internal error
      }
    });
  }

  private handleDisconnection(connectionId: string, code: number, reason: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    // Clear heartbeat
    if (connection.heartbeatInterval) {
      clearInterval(connection.heartbeatInterval);
    }

    // Remove from user connections
    if (connection.userId) {
      const userConns = this.userConnections.get(connection.userId);
      if (userConns) {
        userConns.delete(connectionId);
        if (userConns.size === 0) {
          this.userConnections.delete(connection.userId);
        }
      }
    }

    // Remove connection
    this.connections.delete(connectionId);

    logger.info(`IDE disconnected: ${connectionId} (code: ${code}, reason: ${reason})`);
    this.emit('disconnected', { connectionId, code, reason });
    this.metrics.decrement('ide.connections.active');
  }

  private cleanupConnections(): void {
    const now = Date.now();
    const timeout = 60000; // 1 minute

    for (const [connId, conn] of this.connections) {
      if (now - conn.lastActivity.getTime() > timeout) {
        logger.warn(`Closing inactive connection: ${connId}`);
        conn.ws.close(1000, 'Inactive');
        this.handleDisconnection(connId, 1000, 'Inactive');
      }
    }
  }

  private parseDiagnostics(output: string): any[] {
    // Parse linter output into diagnostics
    const diagnostics: any[] = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
      // Example: Parse ESLint output
      const match = line.match(/(\d+):(\d+)\s+(error|warning)\s+(.+)/);
      if (match) {
        diagnostics.push({
          line: parseInt(match[1]),
          column: parseInt(match[2]),
          severity: match[3] === 'error' ? 1 : 2,
          message: match[4]
        });
      }
    }
    
    return diagnostics;
  }

  async stop(): Promise<void> {
    // Close all connections
    for (const [connId, conn] of this.connections) {
      conn.ws.close(1000, 'Server shutting down');
    }

    // Close WebSocket server
    if (this.wss) {
      await new Promise<void>((resolve) => {
        this.wss!.close(() => resolve());
      });
    }

    logger.info('IDE WebSocket server stopped');
    this.emit('stopped');
  }

  getStats(): any {
    return {
      totalConnections: this.connections.size,
      authenticatedConnections: Array.from(this.connections.values())
        .filter(c => c.authenticated).length,
      userCount: this.userConnections.size,
      ideTypes: this.getIDETypeStats()
    };
  }

  private getIDETypeStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const conn of this.connections.values()) {
      if (conn.ideType) {
        stats[conn.ideType] = (stats[conn.ideType] || 0) + 1;
      }
    }
    return stats;
  }
}