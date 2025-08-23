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
  git: {
    enabled: boolean;
    userEmail: string;
    userName: string;
    defaultBranch: string;
    autoCommit: boolean;
    signCommits: boolean;
  };
  github: {
    enabled: boolean;
    token?: string;
    webhookSecret?: string;
    webhookPort: number;
    defaultRepo?: string;
    notificationChannel?: string;
  };
  security: {
    fileSystemBoundaries: string[];
    maxFileSize: number;
    allowedFileTypes: string[];
    blockedFileTypes: string[];
    bashWhitelist: string[];
    bashBlacklist: string[];
    enableSandbox: boolean;
    rateLimiting: {
      enabled: boolean;
      maxCommandsPerMinute: number;
      maxFilesPerHour: number;
      maxProcessesPerUser: number;
    };
  };
  web: {
    enableSearch: boolean;
    enableFetch: boolean;
    allowedDomains: string[];
    blockedDomains: string[];
    maxContentSize: number;
    timeout: number;
  };
  redis?: {
    enabled: boolean;
    host: string;
    port: number;
    password?: string;
    db: number;
    keyPrefix: string;
    ttl?: number;
    cluster?: boolean;
    sentinels?: Array<{ host: string; port: number }>;
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
  },
  git: {
    enabled: parseBoolean(process.env.GIT_ENABLED, true),
    userEmail: process.env.GIT_USER_EMAIL || 'claude@discord.bot',
    userName: process.env.GIT_USER_NAME || 'Claude Bot',
    defaultBranch: process.env.GIT_DEFAULT_BRANCH || 'main',
    autoCommit: parseBoolean(process.env.GIT_AUTO_COMMIT, false),
    signCommits: parseBoolean(process.env.GIT_SIGN_COMMITS, false)
  },
  github: {
    enabled: parseBoolean(process.env.GITHUB_ENABLED, false),
    token: process.env.GITHUB_TOKEN,
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
    webhookPort: parseInt(process.env.GITHUB_WEBHOOK_PORT || '3000'),
    defaultRepo: process.env.GITHUB_DEFAULT_REPO,
    notificationChannel: process.env.GITHUB_NOTIFICATION_CHANNEL
  },
  security: {
    fileSystemBoundaries: parseList(process.env.FS_BOUNDARIES || '~/claude-projects,/tmp'),
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'), // 10MB
    allowedFileTypes: parseList(process.env.ALLOWED_FILE_TYPES || '*'),
    blockedFileTypes: parseList(process.env.BLOCKED_FILE_TYPES || '.exe,.dll,.so'),
    bashWhitelist: parseList(process.env.BASH_WHITELIST),
    bashBlacklist: parseList(process.env.BASH_BLACKLIST || 'rm -rf,sudo,chmod 777'),
    enableSandbox: parseBoolean(process.env.ENABLE_SANDBOX, true),
    rateLimiting: {
      enabled: parseBoolean(process.env.RATE_LIMITING_ENABLED, true),
      maxCommandsPerMinute: parseInt(process.env.MAX_COMMANDS_PER_MINUTE || '30'),
      maxFilesPerHour: parseInt(process.env.MAX_FILES_PER_HOUR || '100'),
      maxProcessesPerUser: parseInt(process.env.MAX_PROCESSES_PER_USER || '5')
    }
  },
  web: {
    enableSearch: parseBoolean(process.env.WEB_SEARCH_ENABLED, true),
    enableFetch: parseBoolean(process.env.WEB_FETCH_ENABLED, true),
    allowedDomains: parseList(process.env.WEB_ALLOWED_DOMAINS),
    blockedDomains: parseList(process.env.WEB_BLOCKED_DOMAINS),
    maxContentSize: parseInt(process.env.WEB_MAX_CONTENT_SIZE || '5242880'), // 5MB
    timeout: parseInt(process.env.WEB_TIMEOUT || '10000') // 10 seconds
  },
  redis: parseBoolean(process.env.REDIS_ENABLED, false) ? {
    enabled: true,
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0'),
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'claude:',
    ttl: parseInt(process.env.REDIS_TTL || '3600'),
    cluster: parseBoolean(process.env.REDIS_CLUSTER, false),
    sentinels: process.env.REDIS_SENTINELS ? 
      JSON.parse(process.env.REDIS_SENTINELS) : undefined
  } : undefined
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