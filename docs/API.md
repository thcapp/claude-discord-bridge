# API Documentation

## Table of Contents
- [Session Manager API](#session-manager-api)
- [Claude Integration API](#claude-integration-api)
- [Discord Commands API](#discord-commands-api)
- [Component Handlers API](#component-handlers-api)
- [Events](#events)
- [Types](#types)
- [Command Structure](#command-structure)
- [Modal Handlers](#modal-handlers)
- [Autocomplete Providers](#autocomplete-providers)

## Session Manager API

### Class: `SessionManager`

Central manager for all Claude sessions with persistence support.

#### Constructor
```typescript
new SessionManager()
```

#### Methods

##### `initialize(): Promise<void>`
Initializes the session manager and database connection.

```typescript
const manager = new SessionManager();
await manager.initialize();
```

##### `createSession(userId: string, channelId: string): Promise<Session>`
Creates a new Claude session.

**Parameters:**
- `userId` - Discord user ID
- `channelId` - Discord channel ID

**Returns:** Promise resolving to created Session

**Throws:** 
- `SessionLimitError` - When max sessions exceeded
- `DatabaseError` - When database operation fails

```typescript
const session = await manager.createSession('123456789', '987654321');
```

##### `getOrCreateSession(userId: string, channelId: string): Promise<Session>`
Gets existing session or creates new one.

```typescript
const session = await manager.getOrCreateSession(userId, channelId);
```

##### `getSession(sessionId: string): Session | undefined`
Retrieves a session by ID.

```typescript
const session = manager.getSession('session_123');
if (session) {
  await session.sendMessage('Hello Claude');
}
```

##### `getUserSessions(userId: string): Promise<Session[]>`
Gets all sessions for a user.

```typescript
const sessions = await manager.getUserSessions('123456789');
console.log(`User has ${sessions.length} active sessions`);
```

##### `clearSession(sessionId: string): Promise<void>`
Clears and destroys a session.

```typescript
await manager.clearSession('session_123');
```

##### `exportSessions(userId: string): Promise<ExportData>`
Exports user sessions to JSON format.

```typescript
const exportData = await manager.exportSessions(userId);
fs.writeFileSync('sessions.json', JSON.stringify(exportData));
```

## Claude Integration API

### Class: `Session`

Individual Claude session handler.

#### Properties

- `id: string` - Unique session identifier
- `userId: string` - Discord user ID
- `channelId: string` - Discord channel ID
- `status: 'active' | 'idle' | 'stopped'` - Current status
- `model: string` - Claude model in use
- `messageCount: number` - Total messages in session
- `createdAt: number` - Creation timestamp

#### Methods

##### `sendMessage(content: string, discordMessage?: Message): Promise<void>`
Sends a message to Claude.

```typescript
await session.sendMessage('Explain async/await in JavaScript');
```

##### `continue(): Promise<void>`
Continues the conversation.

```typescript
await session.continue();
```

##### `regenerate(): Promise<void>`
Regenerates the last response.

```typescript
await session.regenerate();
```

##### `stop(): Promise<void>`
Stops current operation.

```typescript
await session.stop();
```

##### `setModel(model: string): Promise<void>`
Changes the Claude model.

```typescript
await session.setModel('opus');
```

##### `getDebugInfo(): Promise<DebugInfo>`
Gets session debug information.

```typescript
const debug = await session.getDebugInfo();
console.log(debug);
```

### Class: `TmuxManager`

Manages Claude CLI sessions using tmux.

#### Constructor
```typescript
new TmuxManager(sessionId: string)
```

#### Methods

##### `initialize(): Promise<void>`
Initializes tmux session.

##### `sendInput(input: string): Promise<void>`
Sends input to Claude CLI.

##### `destroy(): Promise<void>`
Destroys tmux session.

#### Events

- `output` - Emitted when Claude produces output
- `error` - Emitted on error
- `exit` - Emitted when session exits

```typescript
tmuxManager.on('output', (data: string) => {
  console.log('Claude output:', data);
});
```

### Class: `OutputParser`

Parses Claude CLI output into structured format.

#### Methods

##### `parse(data: string): ParsedOutput`
Parses raw output.

```typescript
const parser = new OutputParser();
const result = parser.parse(rawOutput);
if (result.type === 'response') {
  console.log('Claude says:', result.content);
}
```

## Discord Commands API

### Command Structure

```typescript
interface Command {
  data: SlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction, sessionManager: SessionManager) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction, sessionManager: SessionManager) => Promise<void>;
}
```

### Available Commands

#### `/claude`
Starts an interactive Claude session.

**Options:**
- `message` (string, optional) - Initial message
- `model` (string, optional) - Claude model to use

```typescript
const claudeCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('claude')
    .setDescription('Start an interactive Claude session'),
  async execute(interaction, sessionManager) {
    // Implementation
  }
};
```

#### `/code`
Opens modal for code submission.

```typescript
const codeCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('code')
    .setDescription('Submit code to Claude'),
  async execute(interaction, sessionManager) {
    // Shows modal
  }
};
```

#### `/session`
Session management commands.

**Subcommands:**
- `list` - List all sessions
- `switch` - Switch to session
- `clear` - Clear session(s)
- `export` - Export sessions
- `stats` - View statistics

## Component Handlers API

### Class: `ComponentHandler`

Handles Discord component interactions.

#### Constructor
```typescript
new ComponentHandler(sessionManager: SessionManager)
```

#### Methods

##### `handleButton(interaction: ButtonInteraction): Promise<void>`
Handles button clicks.

```typescript
await componentHandler.handleButton(interaction);
```

##### `handleSelectMenu(interaction: StringSelectMenuInteraction): Promise<void>`
Handles select menu selections.

##### `handleModal(interaction: ModalSubmitInteraction): Promise<void>`
Handles modal submissions.

##### `createControlPanel(sessionId: string): ActionRowBuilder<ButtonBuilder>`
Creates standard control panel.

```typescript
const panel = componentHandler.createControlPanel('session_123');
await channel.send({ components: [panel] });
```

### Button Custom IDs

Format: `action_sessionId_params`

- `continue_[sessionId]` - Continue conversation
- `regenerate_[sessionId]` - Regenerate response
- `stop_[sessionId]` - Stop operation
- `branch_[sessionId]` - Branch conversation
- `debug_[sessionId]` - Show debug info

### Select Menu Custom IDs

- `model_select` - Model selection
- `project_select` - Project selection
- `session_select` - Session selection
- `tool_category` - Tool category selection

### Modal Custom IDs

- `code_input` - Code input modal
- `quick_action` - Quick action modal
- `config_modal` - Configuration modal

## Events

### Session Events

```typescript
session.on('message', (message: ClaudeMessage) => {
  console.log('New message:', message);
});

session.on('status', (status: SessionStatus) => {
  console.log('Status changed:', status);
});

session.on('error', (error: Error) => {
  console.error('Session error:', error);
});
```

### Manager Events

```typescript
manager.on('sessionCreated', (session: Session) => {
  console.log('New session:', session.id);
});

manager.on('sessionDestroyed', (sessionId: string) => {
  console.log('Session destroyed:', sessionId);
});
```

## Types

### Core Types

```typescript
interface SessionConfig {
  id: string;
  userId: string;
  channelId: string;
  model?: string;
  timeout?: number;
}

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  id: string;
}

interface ParsedOutput {
  type: 'response' | 'progress' | 'error' | 'tool' | 'status';
  content: string;
  tools?: string[];
  progress?: number;
  metadata?: any;
}

interface DebugInfo {
  id: string;
  status: string;
  messageCount: number;
  created: string;
  lastActive: string;
  process: string;
  lastError: string | null;
}

interface SessionStatistics {
  total: number;
  active: number;
  messages: number;
  uptime: string;
  avgLength: string;
  favoriteModel: string | null;
}
```

### Discord Types

```typescript
interface CommandOptions {
  message?: string;
  model?: string;
  action?: string;
  id?: string;
}

interface InteractionResponse {
  embeds?: EmbedBuilder[];
  components?: ActionRowBuilder[];
  content?: string;
  ephemeral?: boolean;
  files?: AttachmentBuilder[];
}
```

## Error Handling

### Error Classes

```typescript
class SessionLimitError extends Error {
  constructor(userId: string, limit: number) {
    super(`User ${userId} exceeded session limit of ${limit}`);
  }
}

class SessionNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`Session ${sessionId} not found`);
  }
}

class ClaudeTimeoutError extends Error {
  constructor(timeout: number) {
    super(`Claude response timeout after ${timeout}ms`);
  }
}
```

### Error Handling Example

```typescript
try {
  const session = await manager.createSession(userId, channelId);
  await session.sendMessage(message);
} catch (error) {
  if (error instanceof SessionLimitError) {
    await interaction.reply('You have too many active sessions!');
  } else if (error instanceof ClaudeTimeoutError) {
    await interaction.reply('Claude took too long to respond.');
  } else {
    logger.error('Unexpected error:', error);
    await interaction.reply('An unexpected error occurred.');
  }
}
```

## Rate Limiting

The bot implements rate limiting to prevent abuse:

```typescript
interface RateLimitConfig {
  maxSessionsPerUser: number;      // Default: 10
  maxMessagesPerMinute: number;    // Default: 30
  maxCommandsPerMinute: number;    // Default: 20
  cooldownPeriod: number;          // Default: 60000ms
}
```

## Webhooks

Optional webhook support for external integrations:

```typescript
interface WebhookPayload {
  event: 'session.created' | 'session.destroyed' | 'message.sent' | 'error';
  sessionId?: string;
  userId: string;
  timestamp: number;
  data: any;
}
```

## Best Practices

1. **Always handle errors gracefully**
   ```typescript
   try {
     await riskyOperation();
   } catch (error) {
     logger.error('Operation failed:', error);
     // Fallback behavior
   }
   ```

2. **Use TypeScript types**
   ```typescript
   function processSession(session: Session): void {
     // Type safety guaranteed
   }
   ```

3. **Clean up resources**
   ```typescript
   try {
     // Use resources
   } finally {
     await cleanup();
   }
   ```

4. **Implement timeouts**
   ```typescript
   const timeout = setTimeout(() => {
     throw new ClaudeTimeoutError(30000);
   }, 30000);
   
   try {
     await operation();
   } finally {
     clearTimeout(timeout);
   }
   ```

5. **Log important events**
   ```typescript
   logger.info('Session created', { sessionId, userId });
   ```