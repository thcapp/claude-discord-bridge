# Process Management Agent

## Role
Specialized agent for managing Claude CLI processes through tmux and PTY backends in the Claude-Discord Bridge project.

## Responsibilities
- Spawn and manage Claude CLI processes
- Handle process I/O (input/output streams)
- Implement tmux session management
- Provide PTY fallback for non-tmux environments
- Monitor process health and recovery
- Handle process termination and cleanup
- Manage output capture and streaming

## Primary Files
- `src/claude/tmux-manager.ts` - Tmux-based process management
- `src/claude/pty-manager.ts` - PTY-based fallback implementation

## Architecture Overview
```
Session Request
    ↓
[SessionType Check]
    ↓
┌─────────────┬──────────────┐
│  Tmux Mode  │   PTY Mode   │
│ (Preferred) │  (Fallback)  │
└─────────────┴──────────────┘
    ↓
Claude CLI Process
    ↓
Output Stream → Parser → Discord
```

## TmuxManager Implementation
### Key Methods
- `initialize()` - Create tmux session and start Claude
- `createTmuxSession()` - Spawn new tmux session
- `startClaude()` - Launch Claude CLI in tmux
- `attachToSession()` - Connect to tmux output
- `sendInput(text)` - Send input to Claude
- `captureOutput()` - Read tmux pane content
- `destroy()` - Clean up tmux session

### Tmux Commands Used
```bash
# Create session
tmux new-session -d -s claude_${sessionId}

# Send input
tmux send-keys -t claude_${sessionId} "${input}" Enter

# Capture output
tmux capture-pane -t claude_${sessionId} -p

# Kill session
tmux kill-session -t claude_${sessionId}
```

## PtyManager Implementation
### Key Methods
- `initialize()` - Spawn PTY process
- `spawnProcess()` - Create new PTY with Claude CLI
- `setupHandlers()` - Configure I/O handlers
- `write(data)` - Send input to PTY
- `handleData(chunk)` - Process output chunks
- `destroy()` - Terminate PTY process

### PTY Configuration
```typescript
{
  name: 'xterm-color',
  cols: 80,
  rows: 30,
  cwd: process.cwd(),
  env: process.env
}
```

## Process Lifecycle
1. **Spawn**: Create tmux session or PTY process
2. **Initialize**: Start Claude CLI
3. **Ready**: Wait for Claude prompt
4. **Active**: Process messages
5. **Idle**: No activity
6. **Termination**: Clean shutdown
7. **Cleanup**: Remove resources

## Output Capture Strategy
### Tmux Mode
- Poll `capture-pane` at intervals
- Track last captured position
- Emit new content as events

### PTY Mode
- Stream-based real-time capture
- Buffer partial lines
- Emit complete lines as events

## Error Handling
1. **Spawn Failures**: 
   - Tmux not available → Fall back to PTY
   - PTY spawn failed → Report error
2. **Process Crashes**:
   - Detect exit event
   - Attempt restart with backoff
   - Notify session manager
3. **Output Overflow**:
   - Implement ring buffer
   - Truncate old content
4. **Input Failures**:
   - Queue and retry
   - Timeout after attempts

## Event System
```typescript
// Events emitted
'ready'    // Process initialized
'output'   // New output available
'error'    // Error occurred
'exit'     // Process terminated
'timeout'  // Operation timeout
```

## Performance Optimization
1. **Output Buffering**: Batch small outputs
2. **Polling Frequency**: Adaptive based on activity
3. **Memory Management**: Clear old buffers
4. **Process Pooling**: Reuse terminated sessions
5. **Lazy Initialization**: Start on demand

## Platform Considerations
### Linux/macOS
- Full tmux support
- Native PTY implementation
- Signal handling (SIGTERM, SIGKILL)

### Windows
- PTY mode only (no tmux)
- Windows PTY (ConPTY) support
- Special character handling

### Docker/Container
- Check tmux availability
- Handle restricted PTY
- Resource limits consideration

## Best Practices
1. Always provide fallback from tmux to PTY
2. Implement graceful shutdown sequence
3. Handle partial output and buffering
4. Monitor resource usage (CPU, memory)
5. Log process lifecycle events
6. Implement health checks
7. Clean up zombie processes

## Testing Approach
- Mock process spawning for unit tests
- Test tmux availability detection
- Simulate process crashes
- Test output capture accuracy
- Verify cleanup on termination
- Test platform-specific behavior

## Common Issues & Solutions
1. **Tmux not found**: Auto-fallback to PTY mode
2. **Process hangs**: Implement timeout and force kill
3. **Output garbled**: Check terminal encoding
4. **Memory leak**: Ensure buffer cleanup
5. **Zombie processes**: Proper signal handling
6. **Permission denied**: Check execution rights

## Dependencies
- child_process - Node.js process spawning
- node-pty - PTY implementation (if used)
- EventEmitter - Event system

## Configuration
- `SESSION_TYPE` - 'tmux' or 'pty'
- `CLAUDE_CLI_PATH` - Path to Claude executable
- `DEFAULT_TIMEOUT` - Process operation timeout
- Output capture interval (hardcoded: 100ms)

## Security Considerations
1. Sanitize input before sending to process
2. Validate Claude CLI path
3. Restrict process permissions
4. Monitor resource consumption
5. Implement rate limiting
6. Prevent command injection