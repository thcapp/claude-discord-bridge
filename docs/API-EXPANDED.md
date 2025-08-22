# Expanded API Documentation

## Table of Contents
- [Command Architecture](#command-architecture)
- [Session Manager API](#session-manager-api)
- [Claude Session API](#claude-session-api)
- [Discord Commands API](#discord-commands-api)
- [Component Handlers API](#component-handlers-api)
- [Modal System](#modal-system)
- [Autocomplete System](#autocomplete-system)
- [Event System](#event-system)
- [Type Definitions](#type-definitions)
- [Error Handling](#error-handling)

---

## Command Architecture

### Command Interface
```typescript
interface Command {
  data: SlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction, sessionManager: SessionManager) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction, sessionManager: SessionManager) => Promise<void>;
}
```

### Command Registration
```typescript
export async function registerCommands(
  token: string, 
  clientId: string, 
  guildId?: string
): Promise<void>
```

---

## Session Manager API

### Class: `SessionManager`

Central manager for all Claude sessions with persistence support.

#### Constructor
```typescript
new SessionManager()
```

#### Core Methods

##### Session Lifecycle

```typescript
async createSession(userId: string, channelId: string): Promise<Session>
```
Creates a new Claude session.

```typescript
async getOrCreateSession(userId: string, channelId: string): Promise<Session>
```
Gets existing session or creates new one.

```typescript
async getSession(sessionId: string): Session | null
```
Retrieves session by ID.

```typescript
async getSessionByChannel(channelId: string): Session | null
```
Gets active session in a channel.

```typescript
async getUserSessions(userId: string): Promise<Session[]>
```
Gets all sessions for a user.

##### Session Management

```typescript
async clearSession(sessionId: string): Promise<void>
```
Terminates and removes a session.

```typescript
async clearUserSessions(userId: string): Promise<void>
```
Clears all sessions for a user.

```typescript
async clearInactiveSessions(hoursOld: number): Promise<number>
```
Removes sessions inactive for specified hours.

##### Data Operations

```typescript
async exportSessions(userId: string, format?: 'json' | 'markdown' | 'text'): Promise<ExportData>
```
Exports session data in specified format.

```typescript
async importSession(userId: string, data: ExportData): Promise<Session>
```
Imports session from exported data.

```typescript
async persistSession(session: Session): Promise<void>
```
Saves session to database.

```typescript
async restoreSessions(): Promise<void>
```
Restores all sessions from database.

##### Statistics

```typescript
async getStatistics(userId: string, period?: StatsPeriod): Promise<Statistics>
```
Gets usage statistics.

```typescript
interface Statistics {
  total: number;
  active: number;
  messages: number;
  uptime: string;
  avgLength: string;
  favoriteModel?: string;
  periodStats?: PeriodStatistics;
}
```

---

## Claude Session API

### Class: `Session`

Individual Claude session management.

#### Properties

```typescript
readonly id: string;
readonly userId: string;
readonly channelId: string;
readonly createdAt: number;
status: 'active' | 'idle' | 'stopped';
model: string;
name?: string;
messageCount: number;
```

#### Core Methods

##### Conversation Management

```typescript
async sendMessage(content: string, discordMessage?: Message): Promise<void>
```
Sends message to Claude.

```typescript
async continue(): Promise<void>
```
Continues the conversation.

```typescript
async regenerate(feedback?: string): Promise<void>
```
Regenerates last response with optional feedback.

```typescript
async stop(): Promise<void>
```
Stops current operation.

```typescript
async branch(name?: string): Promise<Session>
```
Creates conversation branch.

##### Configuration

```typescript
async setModel(model: string): Promise<void>
```
Changes Claude model.

```typescript
async setProject(projectPath: string): Promise<void>
```
Sets project context.

```typescript
async rename(name: string): Promise<void>
```
Renames the session.

##### Data Operations

```typescript
async getHistory(limit?: number): Promise<ClaudeMessage[]>
```
Gets conversation history.

```typescript
async export(format: 'json' | 'markdown' | 'text'): Promise<string>
```
Exports session data.

```typescript
async restore(data: SessionData): Promise<void>
```
Restores from saved state.

---

## Discord Commands API

### Claude Command (`/claude`)

#### Subcommands

```typescript
interface ClaudeSubcommands {
  chat: {
    message?: string;
    model?: 'opus' | 'sonnet' | 'haiku';
    project?: string;
  };
  continue: {};
  regenerate: {
    feedback?: string;
  };
  stop: {};
  branch: {
    name?: string;
  };
  model: {
    model: 'opus' | 'sonnet' | 'haiku';
  };
}
```

### Code Command (`/code`)

#### Subcommands

```typescript
interface CodeSubcommands {
  review: {
    file?: Attachment;
  };
  fix: {
    error: string;
  };
  refactor: {
    goal?: string;
  };
  explain: {};
  test: {
    framework?: TestFramework;
  };
  document: {
    style?: DocStyle;
  };
  convert: {
    language: ProgrammingLanguage;
  };
}
```

### Session Command (`/session`)

#### Subcommands

```typescript
interface SessionSubcommands {
  list: {
    detailed?: boolean;
  };
  info: {};
  switch: {
    id: string; // autocomplete
  };
  rename: {
    name: string;
  };
  clear: {
    target: 'current' | 'all' | 'inactive';
  };
  export: {
    format?: 'json' | 'markdown' | 'text';
  };
  import: {
    file: Attachment;
  };
  stats: {
    period?: 'today' | 'week' | 'month' | 'all';
  };
  history: {
    limit?: number; // 1-50
  };
}
```

### Project Command (`/project`)

#### Subcommands

```typescript
interface ProjectSubcommands {
  create: {
    name: string;
    template?: 'nodejs' | 'react' | 'python' | 'empty';
  };
  list: {};
  open: {
    name: string; // autocomplete
  };
  files: {
    path?: string;
  };
  run: {
    command: string;
  };
}
```

### Admin Command (`/admin`)

#### Subcommands

```typescript
interface AdminSubcommands {
  status: {};
  sessions: {};
  cleanup: {
    age?: number; // hours
  };
  restart: {
    type: 'all' | 'tmux' | 'database';
  };
  config: {
    action: 'view' | 'reload';
  };
  logs: {
    level?: 'error' | 'warn' | 'info' | 'debug';
    lines?: number; // 10-100
  };
}
```

---

## Component Handlers API

### Class: `ComponentHandler`

Handles all Discord interaction components.

#### Constructor
```typescript
new ComponentHandler(sessionManager: SessionManager)
```

#### Button Handlers

```typescript
async handleButton(interaction: ButtonInteraction): Promise<void>
```

**Button ID Format:** `action_sessionId_params`

**Supported Actions:**
- `continue` - Continue conversation
- `regenerate` - Regenerate response
- `stop` - Stop operation
- `branch` - Create branch
- `debug` - Show debug info
- `session` - Session actions
- `nav` - Navigation
- `tool` - Tool actions

#### Select Menu Handlers

```typescript
async handleSelectMenu(interaction: StringSelectMenuInteraction): Promise<void>
```

**Menu ID Format:** `type_params`

**Supported Types:**
- `model` - Model selection
- `project` - Project selection
- `session` - Session selection
- `tool` - Tool selection
- `history` - History navigation

#### Component Builders

```typescript
createControlPanel(sessionId: string): ActionRowBuilder<ButtonBuilder>
```
Creates standard control panel with buttons.

```typescript
createModelSelector(currentModel: string): StringSelectMenuBuilder
```
Creates model selection dropdown.

```typescript
createSessionSelector(sessions: Session[]): StringSelectMenuBuilder
```
Creates session selection dropdown.

---

## Modal System

### Modal Handlers

```typescript
async handleModal(interaction: ModalSubmitInteraction): Promise<void>
```

### Modal ID Patterns

- `code_[action]` - Code action modals
- `quick_action` - Quick action modals
- `project_create` - Project creation
- `session_rename` - Session renaming

### Modal Field IDs

```typescript
interface ModalFields {
  code: string;        // Code input
  context: string;     // Additional context
  instructions: string; // Instructions
  name: string;        // Name fields
  description: string; // Description fields
}
```

---

## Autocomplete System

### Autocomplete Providers

```typescript
async autocomplete(
  interaction: AutocompleteInteraction, 
  sessionManager: SessionManager
): Promise<void>
```

### Supported Autocomplete

1. **Session IDs** - `/session switch`, `/session clear`
2. **Project Names** - `/project open`, `/claude chat`
3. **File Paths** - `/project files`
4. **Command History** - Previous commands

### Autocomplete Response

```typescript
interface AutocompleteChoice {
  name: string;  // Display name
  value: string; // Actual value
}

await interaction.respond(choices: AutocompleteChoice[]);
```

---

## Event System

### Session Events

```typescript
class Session extends EventEmitter {
  // Events emitted
  'ready'         // Session initialized
  'message'       // User message received
  'response'      // Claude response received
  'output'        // Raw output from Claude
  'error'         // Error occurred
  'status'        // Status changed
  'stop'          // Operation stopped
  'timeout'       // Session timed out
}
```

### Process Events

```typescript
class TmuxManager extends EventEmitter {
  // Events emitted
  'output'        // New output available
  'error'         // Process error
  'exit'          // Process exited
  'ready'         // Process ready
}
```

---

## Type Definitions

### Core Types

```typescript
interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  id: string;
  metadata?: MessageMetadata;
}

interface SessionData {
  id: string;
  userId: string;
  channelId: string;
  status: SessionStatus;
  model: string;
  messages: ClaudeMessage[];
  createdAt: number;
  lastActivity: number;
  metadata?: SessionMetadata;
}

interface ParsedOutput {
  type: 'response' | 'progress' | 'error' | 'tool' | 'status';
  content: string;
  tools?: string[];
  progress?: number;
  metadata?: any;
}
```

### Configuration Types

```typescript
interface Config {
  discord: DiscordConfig;
  claude: ClaudeConfig;
  features: FeatureFlags;
  logging: LoggingConfig;
  database: DatabaseConfig;
}

interface DiscordConfig {
  token: string;
  clientId: string;
  guildId?: string;
  allowedUserIds: string[];
  allowedRoleIds: string[];
}

interface ClaudeConfig {
  cliPath: string;
  sessionType: 'tmux' | 'pty';
  projectBasePath: string;
  maxSessions: number;
  defaultTimeout: number;
}
```

---

## Error Handling

### Custom Errors

```typescript
class SessionError extends Error {
  constructor(message: string, public sessionId?: string) {
    super(message);
    this.name = 'SessionError';
  }
}

class SessionLimitError extends SessionError {
  constructor() {
    super('Maximum sessions exceeded');
    this.name = 'SessionLimitError';
  }
}

class ProcessError extends Error {
  constructor(message: string, public processId?: string) {
    super(message);
    this.name = 'ProcessError';
  }
}
```

### Error Recovery

```typescript
interface ErrorHandler {
  handleSessionError(error: SessionError): Promise<void>;
  handleProcessError(error: ProcessError): Promise<void>;
  handleDiscordError(error: DiscordAPIError): Promise<void>;
  recoverSession(sessionId: string): Promise<Session>;
  restartProcess(processId: string): Promise<void>;
}
```

### Logging

```typescript
interface Logger {
  error(message: string, error?: Error): void;
  warn(message: string, data?: any): void;
  info(message: string, data?: any): void;
  debug(message: string, data?: any): void;
}
```

---

## Usage Examples

### Creating a Session

```typescript
const sessionManager = new SessionManager();
await sessionManager.initialize();

const session = await sessionManager.createSession(
  userId,
  channelId
);

await session.sendMessage('Hello Claude!');
```

### Handling Commands

```typescript
const command = commands.get(interaction.commandName);
if (command) {
  await command.execute(interaction, sessionManager);
}
```

### Processing Output

```typescript
session.on('output', (data: string) => {
  const parsed = outputParser.parse(data);
  if (parsed.type === 'response') {
    await channel.send(parsed.content);
  }
});
```

### Component Interaction

```typescript
const componentHandler = new ComponentHandler(sessionManager);

client.on('interactionCreate', async (interaction) => {
  if (interaction.isButton()) {
    await componentHandler.handleButton(interaction);
  } else if (interaction.isStringSelectMenu()) {
    await componentHandler.handleSelectMenu(interaction);
  }
});
```