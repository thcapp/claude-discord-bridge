import path from 'path';
import fs from 'fs/promises';
import { config } from '../config';
import { logger } from './logger';

export class SecurityManager {
  private static instance: SecurityManager;
  private commandHistory: Map<string, number[]> = new Map();
  private fileAccessHistory: Map<string, number[]> = new Map();
  private processCount: Map<string, number> = new Map();

  private constructor() {
    // Clean up old entries every hour
    setInterval(() => this.cleanupHistory(), 60 * 60 * 1000);
  }

  static getInstance(): SecurityManager {
    if (!SecurityManager.instance) {
      SecurityManager.instance = new SecurityManager();
    }
    return SecurityManager.instance;
  }

  // File System Security
  async validateFilePath(filePath: string): Promise<{ valid: boolean; reason?: string }> {
    try {
      // Resolve to absolute path
      const absolutePath = path.resolve(filePath);
      
      // Check for directory traversal attempts
      if (filePath.includes('..') || filePath.includes('~/../')) {
        return {
          valid: false,
          reason: 'Directory traversal detected'
        };
      }

      // Check against filesystem boundaries
      const boundaries = config.security.fileSystemBoundaries;
      if (boundaries.length > 0) {
        const isWithinBoundary = boundaries.some(boundary => {
          const resolvedBoundary = path.resolve(boundary.replace('~', process.env.HOME || ''));
          return absolutePath.startsWith(resolvedBoundary);
        });

        if (!isWithinBoundary) {
          return {
            valid: false,
            reason: `Path outside allowed boundaries: ${boundaries.join(', ')}`
          };
        }
      }

      // Check file extension
      const ext = path.extname(absolutePath);
      if (config.security.blockedFileTypes.includes(ext)) {
        return {
          valid: false,
          reason: `File type ${ext} is blocked`
        };
      }

      // Check if allowed file type (if whitelist is set)
      if (config.security.allowedFileTypes.length > 0 && 
          config.security.allowedFileTypes[0] !== '*' &&
          !config.security.allowedFileTypes.includes(ext)) {
        return {
          valid: false,
          reason: `File type ${ext} is not allowed`
        };
      }

      return { valid: true };
    } catch (error) {
      logger.error('File path validation error:', error);
      return {
        valid: false,
        reason: 'Path validation error'
      };
    }
  }

  async validateFileSize(filePath: string): Promise<{ valid: boolean; reason?: string }> {
    try {
      const stats = await fs.stat(filePath);
      
      if (stats.size > config.security.maxFileSize) {
        return {
          valid: false,
          reason: `File size ${stats.size} exceeds maximum ${config.security.maxFileSize}`
        };
      }

      return { valid: true };
    } catch (error) {
      // File doesn't exist yet, which is fine for write operations
      return { valid: true };
    }
  }

  // Bash Command Security
  validateBashCommand(command: string): { valid: boolean; reason?: string } {
    // Check against blacklist
    const blacklist = config.security.bashBlacklist;
    for (const blocked of blacklist) {
      if (command.includes(blocked)) {
        return {
          valid: false,
          reason: `Command contains blocked pattern: ${blocked}`
        };
      }
    }

    // Check against whitelist (if set)
    const whitelist = config.security.bashWhitelist;
    if (whitelist.length > 0) {
      const commandBase = command.split(' ')[0];
      if (!whitelist.includes(commandBase)) {
        return {
          valid: false,
          reason: `Command ${commandBase} is not in whitelist`
        };
      }
    }

    // Check for dangerous patterns
    const dangerousPatterns = [
      /rm\s+-rf\s+\//,  // rm -rf /
      /:(){ :|:& };:/,  // Fork bomb
      /mkfs/,           // Format filesystem
      /dd\s+if=.*of=\/dev\//,  // DD to device
      />\/dev\/sda/,    // Write to disk device
      /chmod\s+777/,    // Overly permissive permissions
      /curl.*\|\s*sh/,  // Curl pipe to shell
      /wget.*\|\s*sh/,  // Wget pipe to shell
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(command)) {
        return {
          valid: false,
          reason: 'Command contains dangerous pattern'
        };
      }
    }

    return { valid: true };
  }

  // Rate Limiting
  checkRateLimit(userId: string, type: 'command' | 'file' | 'process'): { allowed: boolean; reason?: string } {
    if (!config.security.rateLimiting.enabled) {
      return { allowed: true };
    }

    const now = Date.now();
    
    switch (type) {
      case 'command': {
        const history = this.commandHistory.get(userId) || [];
        const recentCommands = history.filter(t => now - t < 60000); // Last minute
        
        if (recentCommands.length >= config.security.rateLimiting.maxCommandsPerMinute) {
          return {
            allowed: false,
            reason: `Rate limit exceeded: ${config.security.rateLimiting.maxCommandsPerMinute} commands per minute`
          };
        }
        
        recentCommands.push(now);
        this.commandHistory.set(userId, recentCommands);
        break;
      }
      
      case 'file': {
        const history = this.fileAccessHistory.get(userId) || [];
        const recentAccess = history.filter(t => now - t < 3600000); // Last hour
        
        if (recentAccess.length >= config.security.rateLimiting.maxFilesPerHour) {
          return {
            allowed: false,
            reason: `Rate limit exceeded: ${config.security.rateLimiting.maxFilesPerHour} files per hour`
          };
        }
        
        recentAccess.push(now);
        this.fileAccessHistory.set(userId, recentAccess);
        break;
      }
      
      case 'process': {
        const count = this.processCount.get(userId) || 0;
        
        if (count >= config.security.rateLimiting.maxProcessesPerUser) {
          return {
            allowed: false,
            reason: `Process limit exceeded: ${config.security.rateLimiting.maxProcessesPerUser} concurrent processes`
          };
        }
        
        this.processCount.set(userId, count + 1);
        break;
      }
    }

    return { allowed: true };
  }

  decrementProcessCount(userId: string): void {
    const count = this.processCount.get(userId) || 0;
    if (count > 0) {
      this.processCount.set(userId, count - 1);
    }
  }

  // Web Security
  validateUrl(url: string): { valid: boolean; reason?: string } {
    try {
      const parsedUrl = new URL(url);
      
      // Check protocol
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return {
          valid: false,
          reason: 'Only HTTP/HTTPS protocols are allowed'
        };
      }

      // Check against blocked domains
      const blockedDomains = config.web.blockedDomains;
      if (blockedDomains.some(domain => parsedUrl.hostname.includes(domain))) {
        return {
          valid: false,
          reason: `Domain ${parsedUrl.hostname} is blocked`
        };
      }

      // Check against allowed domains (if set)
      const allowedDomains = config.web.allowedDomains;
      if (allowedDomains.length > 0 && 
          !allowedDomains.some(domain => parsedUrl.hostname.includes(domain))) {
        return {
          valid: false,
          reason: `Domain ${parsedUrl.hostname} is not in allowlist`
        };
      }

      // Check for local/private IPs
      const privateIpPatterns = [
        /^127\./,
        /^10\./,
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
        /^192\.168\./,
        /^localhost$/,
        /^0\.0\.0\.0$/
      ];

      if (privateIpPatterns.some(pattern => pattern.test(parsedUrl.hostname))) {
        return {
          valid: false,
          reason: 'Access to local/private addresses is blocked'
        };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        reason: 'Invalid URL format'
      };
    }
  }

  // Git Security
  validateGitOperation(operation: string, userId: string): { allowed: boolean; reason?: string } {
    // Check if git is enabled
    if (!config.git.enabled) {
      return {
        allowed: false,
        reason: 'Git operations are disabled'
      };
    }

    // Check for dangerous git operations
    const dangerousOperations = ['force-push', 'reset --hard', 'clean -fdx'];
    if (dangerousOperations.some(op => operation.includes(op))) {
      logger.warn(`User ${userId} attempted dangerous git operation: ${operation}`);
      // Could require additional confirmation
    }

    return { allowed: true };
  }

  // Sanitization
  sanitizeFilename(filename: string): string {
    // Remove or replace dangerous characters
    return filename
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/\.{2,}/g, '_')
      .replace(/^\./, '_')
      .substring(0, 255); // Limit length
  }

  sanitizeCommand(command: string): string {
    // Basic command sanitization
    return command
      .replace(/;/g, '\\;')  // Escape semicolons
      .replace(/\|/g, '\\|')  // Escape pipes
      .replace(/&/g, '\\&')   // Escape ampersands
      .replace(/\$/g, '\\$')  // Escape dollar signs
      .replace(/`/g, '\\`');  // Escape backticks
  }

  // Permission Checks
  async checkPermission(userId: string, action: string, resource?: string): Promise<boolean> {
    // Check if user is in allowed list
    const allowedUsers = config.discord.allowedUserIds;
    if (allowedUsers.length > 0 && !allowedUsers.includes(userId)) {
      logger.warn(`User ${userId} not in allowed list for action: ${action}`);
      return false;
    }

    // Log security-relevant actions
    logger.info(`Security check: User ${userId} performing ${action} on ${resource || 'N/A'}`);

    return true;
  }

  // Audit Logging
  logSecurityEvent(userId: string, action: string, resource: string, result: 'allowed' | 'blocked', reason?: string): void {
    const event = {
      timestamp: new Date().toISOString(),
      userId,
      action,
      resource,
      result,
      reason
    };

    logger.info('Security Event:', event);

    // Could also write to a separate security audit log
    // or send to a monitoring service
  }

  // Cleanup
  private cleanupHistory(): void {
    const now = Date.now();
    const oneHour = 3600000;

    // Clean command history
    for (const [userId, history] of this.commandHistory.entries()) {
      const recentHistory = history.filter(t => now - t < oneHour);
      if (recentHistory.length === 0) {
        this.commandHistory.delete(userId);
      } else {
        this.commandHistory.set(userId, recentHistory);
      }
    }

    // Clean file access history
    for (const [userId, history] of this.fileAccessHistory.entries()) {
      const recentHistory = history.filter(t => now - t < oneHour * 2);
      if (recentHistory.length === 0) {
        this.fileAccessHistory.delete(userId);
      } else {
        this.fileAccessHistory.set(userId, recentHistory);
      }
    }

    logger.debug('Security history cleanup completed');
  }

  // Get security statistics
  getSecurityStats(): {
    activeUsers: number;
    totalCommands: number;
    totalFileAccess: number;
    activeProcesses: number;
  } {
    let totalCommands = 0;
    let totalFileAccess = 0;
    let activeProcesses = 0;

    for (const history of this.commandHistory.values()) {
      totalCommands += history.length;
    }

    for (const history of this.fileAccessHistory.values()) {
      totalFileAccess += history.length;
    }

    for (const count of this.processCount.values()) {
      activeProcesses += count;
    }

    return {
      activeUsers: this.commandHistory.size,
      totalCommands,
      totalFileAccess,
      activeProcesses
    };
  }
}