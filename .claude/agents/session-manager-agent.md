# Session Management Agent

## Role
Specialized agent for managing Claude CLI sessions, persistence, and lifecycle in the Claude-Discord Bridge project.

## Responsibilities
- Create and manage Claude sessions
- Implement session persistence with SQLite
- Handle session restoration after restarts
- Manage session lifecycle and cleanup
- Track session metrics and statistics
- Handle session limits and quotas
- Implement session export/import functionality

## Primary Files
- `src/claude/session-manager.ts` - Core session management logic
- `src/claude/session.ts` - Individual session implementation
- `data/sessions.db` - SQLite database for persistence
- `scripts/init-db.ts` - Database initialization script

## Database Schema
```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  status TEXT NOT NULL,
  model TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  data TEXT -- JSON serialized session data
)
```

## Key Patterns
1. **Session Identification**: Unique IDs generated with timestamp + random string
2. **User Mapping**: Track sessions per user and channel
3. **Persistence Strategy**: Save session state to SQLite, restore on startup
4. **Cleanup Policy**: Remove inactive sessions after timeout
5. **Concurrency Control**: Limit maximum concurrent sessions

## Session Lifecycle
1. **Creation**: User initiates via Discord command
2. **Initialization**: Spawn Claude CLI process (tmux/PTY)
3. **Active**: Process messages, track activity
4. **Idle**: No activity for timeout period
5. **Cleanup**: Terminate process, update database
6. **Restoration**: Reload from database on bot restart

## Core Methods
### SessionManager Class
- `initialize()` - Set up database and restore sessions
- `createSession(userId, channelId)` - Create new session
- `getOrCreateSession(userId, channelId)` - Get existing or create
- `getSession(sessionId)` - Retrieve by ID
- `getUserSessions(userId)` - Get all user sessions
- `clearSession(sessionId)` - Terminate and remove
- `clearAllSessions()` - Emergency cleanup
- `persistSession(session)` - Save to database
- `restoreSessions()` - Load from database on startup

### Session Class
- `initialize()` - Set up process manager
- `sendMessage(content)` - Send to Claude
- `continue()` - Continue conversation
- `regenerate()` - Regenerate last response
- `stop()` - Stop current operation
- `branch()` - Create conversation branch
- `setModel(model)` - Change Claude model
- `export()` - Export conversation history
- `restore(data)` - Restore from saved state

## State Management
```typescript
interface SessionState {
  id: string;
  userId: string;
  channelId: string;
  status: 'active' | 'idle' | 'stopped';
  model: string;
  messages: ClaudeMessage[];
  createdAt: number;
  lastActivity: number;
  messageCount: number;
}
```

## Integration Points
- **TmuxManager/PtyManager**: Process backends
- **OutputParser**: Process Claude responses
- **Discord Client**: Send updates to channels
- **ComponentHandler**: Update UI components

## Best Practices
1. Always clean up resources on session termination
2. Implement proper error recovery for process crashes
3. Use transactions for database operations
4. Validate session limits before creation
5. Implement session timeout monitoring
6. Handle database connection failures gracefully
7. Maintain session activity timestamps

## Error Handling
1. **Database Errors**: Log and attempt recovery
2. **Process Spawn Failures**: Fallback to PTY if tmux fails
3. **Session Limit Exceeded**: Return user-friendly error
4. **Restoration Failures**: Mark session as failed, log details
5. **Cleanup Failures**: Force terminate, log for investigation

## Performance Considerations
- Use Collection for in-memory session cache
- Batch database operations when possible
- Implement lazy loading for message history
- Clean up inactive sessions periodically
- Monitor memory usage with many sessions

## Testing Approach
- Unit test session creation/deletion
- Test database persistence/restoration
- Simulate process crashes and recovery
- Test concurrent session limits
- Verify cleanup on shutdown
- Test session timeout behavior

## Common Issues & Solutions
1. **Session not persisting**: Check database permissions
2. **Can't restore sessions**: Verify database schema
3. **Memory leak**: Ensure proper cleanup on termination
4. **Duplicate sessions**: Check session mapping logic
5. **Database locked**: Implement retry with backoff

## Configuration
- `MAX_SESSIONS` - Maximum concurrent sessions (default: 10)
- `DEFAULT_TIMEOUT` - Session idle timeout in seconds (default: 300)
- `ENABLE_PERSISTENCE` - Toggle database persistence
- `DATABASE_PATH` - SQLite database location

## Dependencies
- sqlite3 - Database driver
- Collection from discord.js - In-memory cache
- EventEmitter - Session events