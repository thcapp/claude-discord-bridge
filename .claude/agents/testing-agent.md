# Testing Agent

## Role
Specialized agent for writing and maintaining tests for all components in the Claude-Discord Bridge project.

## Responsibilities
- Write unit tests for individual components
- Create integration tests for system flows
- Implement end-to-end tests
- Maintain test coverage
- Mock external dependencies
- Test Discord interactions
- Validate error handling
- Performance testing

## Test Framework
- **Test Runner**: Jest
- **Assertion Library**: Jest built-in matchers
- **Mocking**: Jest mocks
- **Coverage**: Jest coverage reports

## Test Structure
```
tests/
├── unit/
│   ├── claude/
│   │   ├── session-manager.test.ts
│   │   ├── session.test.ts
│   │   ├── tmux-manager.test.ts
│   │   ├── pty-manager.test.ts
│   │   └── output-parser.test.ts
│   ├── discord/
│   │   └── commands.test.ts
│   ├── interactions/
│   │   └── component-handler.test.ts
│   └── utils/
│       └── logger.test.ts
├── integration/
│   ├── session-flow.test.ts
│   ├── discord-integration.test.ts
│   └── database-persistence.test.ts
├── e2e/
│   └── full-conversation.test.ts
├── fixtures/
│   ├── claude-outputs.ts
│   └── discord-messages.ts
└── mocks/
    ├── discord.ts
    └── process.ts
```

## Unit Test Patterns
### Session Manager Tests
```typescript
describe('SessionManager', () => {
  let manager: SessionManager;
  
  beforeEach(() => {
    manager = new SessionManager();
    jest.clearAllMocks();
  });
  
  describe('createSession', () => {
    it('should create a new session', async () => {
      const session = await manager.createSession('user123', 'channel456');
      expect(session).toBeDefined();
      expect(session.userId).toBe('user123');
    });
    
    it('should enforce session limits', async () => {
      // Create max sessions
      for (let i = 0; i < config.claude.maxSessions; i++) {
        await manager.createSession(`user${i}`, 'channel');
      }
      
      // Attempt to exceed limit
      await expect(manager.createSession('userExtra', 'channel'))
        .rejects.toThrow('Session limit exceeded');
    });
  });
});
```

### Output Parser Tests
```typescript
describe('OutputParser', () => {
  let parser: OutputParser;
  
  beforeEach(() => {
    parser = new OutputParser();
  });
  
  describe('parse', () => {
    it('should detect code blocks', () => {
      const input = '```javascript\nconst x = 1;\n```';
      const result = parser.parse(input);
      expect(result.type).toBe('response');
      expect(result.content).toContain('```javascript');
    });
    
    it('should detect errors', () => {
      const input = 'Error: Something went wrong';
      const result = parser.parse(input);
      expect(result.type).toBe('error');
      expect(result.content).toBe('Something went wrong');
    });
  });
});
```

### Discord Command Tests
```typescript
describe('Discord Commands', () => {
  let interaction: ChatInputCommandInteraction;
  let sessionManager: SessionManager;
  
  beforeEach(() => {
    interaction = createMockInteraction();
    sessionManager = new SessionManager();
  });
  
  describe('/claude command', () => {
    it('should start a new session', async () => {
      await claudeCommand.execute(interaction, sessionManager);
      
      expect(interaction.deferReply).toHaveBeenCalled();
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          embeds: expect.any(Array),
          components: expect.any(Array)
        })
      );
    });
  });
});
```

## Integration Test Patterns
### Session Flow Test
```typescript
describe('Session Flow Integration', () => {
  it('should handle complete conversation flow', async () => {
    const manager = new SessionManager();
    await manager.initialize();
    
    // Create session
    const session = await manager.createSession('user1', 'channel1');
    
    // Send message
    await session.sendMessage('Hello Claude');
    
    // Wait for response
    await new Promise(resolve => {
      session.on('response', (data) => {
        expect(data).toContain('Hello');
        resolve(void 0);
      });
    });
    
    // Cleanup
    await manager.clearSession(session.id);
  });
});
```

### Database Persistence Test
```typescript
describe('Database Persistence', () => {
  it('should persist and restore sessions', async () => {
    const manager1 = new SessionManager();
    await manager1.initialize();
    
    // Create session
    const session = await manager1.createSession('user1', 'channel1');
    const sessionId = session.id;
    
    // Simulate restart
    const manager2 = new SessionManager();
    await manager2.initialize();
    
    // Verify restoration
    const restored = manager2.getSession(sessionId);
    expect(restored).toBeDefined();
    expect(restored?.userId).toBe('user1');
  });
});
```

## Mock Implementations
### Discord Mocks
```typescript
// mocks/discord.ts
export function createMockInteraction(): ChatInputCommandInteraction {
  return {
    user: { id: 'user123', username: 'testuser' },
    channelId: 'channel456',
    guildId: 'guild789',
    commandName: 'claude',
    options: {
      getString: jest.fn(),
      getUser: jest.fn(),
    },
    deferReply: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
    reply: jest.fn().mockResolvedValue(undefined),
    followUp: jest.fn().mockResolvedValue(undefined),
  } as any;
}
```

### Process Mocks
```typescript
// mocks/process.ts
export function createMockProcess(): ChildProcess {
  const emitter = new EventEmitter();
  return {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    stdin: {
      write: jest.fn(),
    },
    kill: jest.fn(),
    on: emitter.on.bind(emitter),
    emit: emitter.emit.bind(emitter),
  } as any;
}
```

## Test Fixtures
### Claude Output Fixtures
```typescript
// fixtures/claude-outputs.ts
export const claudeOutputs = {
  greeting: "Hello! I'm Claude, an AI assistant.",
  codeBlock: '```javascript\nfunction hello() {\n  console.log("Hello");\n}\n```',
  error: 'Error: Unable to process request',
  progress: 'Working on your request...',
  toolUsage: 'Tool: Executing search query',
};
```

## Coverage Requirements
```json
// jest.config.js
{
  "coverageThreshold": {
    "global": {
      "branches": 80,
      "functions": 80,
      "lines": 80,
      "statements": 80
    }
  }
}
```

## Test Commands
```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch

# Run specific test file
npm test session-manager.test.ts

# Run unit tests only
npm test tests/unit

# Debug tests
node --inspect-brk node_modules/.bin/jest --runInBand
```

## Testing Best Practices
1. **Isolation**: Each test should be independent
2. **Mocking**: Mock external dependencies
3. **Assertions**: Use descriptive assertions
4. **Coverage**: Aim for >80% code coverage
5. **Speed**: Keep unit tests fast (<100ms)
6. **Clarity**: Test names describe behavior
7. **DRY**: Use shared fixtures and helpers

## Common Test Scenarios
### Error Handling
```typescript
it('should handle process crash gracefully', async () => {
  const session = await manager.createSession('user1', 'channel1');
  
  // Simulate crash
  session.processManager.emit('error', new Error('Process crashed'));
  
  expect(session.status).toBe('stopped');
  expect(logger.error).toHaveBeenCalled();
});
```

### Timeout Handling
```typescript
it('should timeout inactive sessions', async () => {
  jest.useFakeTimers();
  
  const session = await manager.createSession('user1', 'channel1');
  
  // Fast-forward time
  jest.advanceTimersByTime(config.claude.defaultTimeout * 1000);
  
  expect(session.status).toBe('idle');
  
  jest.useRealTimers();
});
```

### Rate Limiting
```typescript
it('should respect Discord rate limits', async () => {
  const messages = Array(20).fill('test');
  
  for (const msg of messages) {
    await session.sendMessage(msg);
  }
  
  // Verify batching/throttling
  expect(mockChannel.send).toHaveBeenCalledTimes(expect.lessThan(20));
});
```

## Performance Testing
```typescript
describe('Performance', () => {
  it('should handle large outputs efficiently', async () => {
    const largeOutput = 'x'.repeat(10000);
    const startTime = Date.now();
    
    const result = parser.parse(largeOutput);
    
    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(100); // ms
  });
});
```

## CI/CD Integration
```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm ci
      - run: npm test -- --coverage
      - uses: codecov/codecov-action@v2
```

## Debugging Tests
```bash
# VSCode launch.json
{
  "type": "node",
  "request": "launch",
  "name": "Jest Debug",
  "program": "${workspaceFolder}/node_modules/.bin/jest",
  "args": ["--runInBand"],
  "console": "integratedTerminal"
}
```

## Common Issues & Solutions
1. **Async test timeout**: Increase timeout with `jest.setTimeout(10000)`
2. **Mock not working**: Ensure mock is before import
3. **Database conflicts**: Use in-memory DB for tests
4. **Flaky tests**: Remove time dependencies
5. **Coverage gaps**: Add edge case tests