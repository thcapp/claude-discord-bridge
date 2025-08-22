import * as dotenv from 'dotenv';
import { logger } from './utils/logger';

dotenv.config();

interface Config {
  discord: {
    token: string;
    clientId: string;
    guildId?: string;
    allowedUserIds: string[];
    allowedRoleIds: string[];
  };
  claude: {
    cliPath: string;
    sessionType: 'tmux' | 'pty';
    projectBasePath: string;
    maxSessions: number;
    defaultTimeout: number;
  };
  features: {
    streaming: boolean;
    attachments: boolean;
    threading: boolean;
    persistence: boolean;
    notifications: boolean;
    ephemeralSettings: boolean;
    autoCreateThreads: boolean;
    reactionShortcuts: boolean;
  };
  logging: {
    level: string;
    file: string;
    maxSize: string;
    maxFiles: string;
  };
  database: {
    path: string;
  };
}

function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(',').map(item => item.trim()).filter(Boolean);
}

function parseBoolean(value: string | undefined, defaultValue: boolean = false): boolean {
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
}

export const config: Config = {
  discord: {
    token: process.env.DISCORD_TOKEN || '',
    clientId: process.env.DISCORD_CLIENT_ID || '',
    guildId: process.env.DISCORD_GUILD_ID,
    allowedUserIds: parseList(process.env.ALLOWED_USER_IDS),
    allowedRoleIds: parseList(process.env.ALLOWED_ROLE_IDS)
  },
  claude: {
    cliPath: process.env.CLAUDE_CLI_PATH || 'claude-code',
    sessionType: (process.env.SESSION_TYPE as 'tmux' | 'pty') || 'tmux',
    projectBasePath: process.env.PROJECT_BASE_PATH || '~/claude-projects',
    maxSessions: parseInt(process.env.MAX_SESSIONS || '10'),
    defaultTimeout: parseInt(process.env.DEFAULT_TIMEOUT || '300')
  },
  features: {
    streaming: parseBoolean(process.env.ENABLE_STREAMING, true),
    attachments: parseBoolean(process.env.ENABLE_ATTACHMENTS, true),
    threading: parseBoolean(process.env.ENABLE_THREADING, true),
    persistence: parseBoolean(process.env.ENABLE_PERSISTENCE, true),
    notifications: parseBoolean(process.env.ENABLE_NOTIFICATIONS, true),
    ephemeralSettings: parseBoolean(process.env.EPHEMERAL_SETTINGS, true),
    autoCreateThreads: parseBoolean(process.env.AUTO_CREATE_THREADS, true),
    reactionShortcuts: parseBoolean(process.env.REACTION_SHORTCUTS, true)
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || './logs/bot.log',
    maxSize: process.env.LOG_MAX_SIZE || '10m',
    maxFiles: process.env.LOG_MAX_FILES || '5'
  },
  database: {
    path: process.env.DATABASE_PATH || './data/sessions.db'
  }
};

export function validateConfig(): boolean {
  const errors: string[] = [];
  
  if (!config.discord.token) {
    errors.push('DISCORD_TOKEN is required');
  }
  
  if (!config.discord.clientId) {
    errors.push('DISCORD_CLIENT_ID is required');
  }
  
  if (errors.length > 0) {
    errors.forEach(error => logger.error(error));
    return false;
  }
  
  return true;
}