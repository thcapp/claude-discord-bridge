// Test setup file
import * as dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Mock Discord.js client
jest.mock('discord.js', () => ({
  Client: jest.fn().mockImplementation(() => ({
    login: jest.fn().mockResolvedValue(true),
    destroy: jest.fn().mockResolvedValue(true),
    user: { id: 'test-bot-id', tag: 'TestBot#0000' },
  })),
  GatewayIntentBits: {
    Guilds: 1,
    GuildMessages: 2,
    MessageContent: 4,
    DirectMessages: 8,
  },
  Collection: Map,
  EmbedBuilder: jest.fn(),
  SlashCommandBuilder: jest.fn().mockImplementation(() => ({
    setName: jest.fn().mockReturnThis(),
    setDescription: jest.fn().mockReturnThis(),
    addStringOption: jest.fn().mockReturnThis(),
    addBooleanOption: jest.fn().mockReturnThis(),
    addIntegerOption: jest.fn().mockReturnThis(),
  })),
}));

// Mock node-pty
jest.mock('node-pty', () => ({
  spawn: jest.fn().mockReturnValue({
    write: jest.fn(),
    kill: jest.fn(),
    onData: jest.fn(),
    onExit: jest.fn(),
  }),
}));

// Mock SQLite
jest.mock('sqlite3', () => ({
  Database: jest.fn().mockImplementation(() => ({
    run: jest.fn((sql, params, callback) => callback?.(null)),
    get: jest.fn((sql, params, callback) => callback?.(null, null)),
    all: jest.fn((sql, params, callback) => callback?.(null, [])),
    close: jest.fn((callback) => callback?.(null)),
  })),
}));

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Reduce noise in tests

// Global test utilities
global.testUtils = {
  mockSession: () => ({
    id: 'test-session-123',
    userId: 'test-user-456',
    channelId: 'test-channel-789',
    status: 'active',
    createdAt: Date.now(),
  }),
  
  mockInteraction: () => ({
    user: { id: 'test-user-456', username: 'TestUser' },
    channelId: 'test-channel-789',
    guildId: 'test-guild-012',
    reply: jest.fn().mockResolvedValue(true),
    deferReply: jest.fn().mockResolvedValue(true),
    editReply: jest.fn().mockResolvedValue(true),
    followUp: jest.fn().mockResolvedValue(true),
  }),
};

// Cleanup after tests
afterAll(() => {
  jest.clearAllMocks();
});