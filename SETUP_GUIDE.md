# Claude-Discord Bridge Setup Guide

## 🚀 Quick Start

### 1. Prerequisites
- Node.js 18+ installed
- Claude Code CLI installed (from https://claude.ai/code)
- Discord Bot Token (from https://discord.com/developers/applications)
- Tmux installed (optional but recommended)

### 2. Installation

```bash
# Install dependencies
npm install

# Initialize database
npm run db:init

# Copy environment template
cp .env.example .env
```

### 3. Configuration

Edit `.env` file:

```env
# Required
DISCORD_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_client_id_here

# Optional
DISCORD_GUILD_ID=your_guild_id  # For guild-specific commands
ALLOWED_USER_IDS=user1,user2    # Comma-separated Discord user IDs
```

### 4. Discord Bot Setup

1. Go to https://discord.com/developers/applications
2. Create a new application
3. Go to "Bot" section
4. Copy the token to your `.env` file
5. Enable these intents:
   - MESSAGE CONTENT INTENT
   - SERVER MEMBERS INTENT
6. Go to OAuth2 → URL Generator
7. Select scopes: `bot`, `applications.commands`
8. Select permissions:
   - Send Messages
   - Use Slash Commands
   - Embed Links
   - Attach Files
   - Read Message History
   - Add Reactions
   - Use External Emojis
   - Manage Threads
9. Use the generated URL to invite the bot

### 5. Register Commands

```bash
npm run register
```

### 6. Start the Bot

```bash
# Production
npm start

# Development (with auto-reload)
npm run dev
```

## 📝 Usage

### Discord Commands
- `/claude` - Start an interactive session
- `/code` - Submit code with instructions
- `/session list` - View all sessions
- `/quick` - Quick actions
- `/help` - Show help

### Interactive Components
Every Claude response includes:
- **Continue** button - Continue the conversation
- **Regenerate** button - Regenerate last response
- **Stop** button - Stop current operation
- **Branch** button - Create conversation branch
- **Debug** button - View debug info

### Mention the Bot
You can also just mention the bot in any message:
```
@ClaudeBot explain this code: function add(a, b) { return a + b; }
```

## 🔧 Troubleshooting

### Run System Check
```bash
npm run doctor
```

### Common Issues

1. **Bot not responding**
   - Check if bot is online in Discord
   - Verify token in `.env`
   - Check logs in `logs/` directory

2. **Commands not showing**
   - Run `npm run register`
   - Wait 1 hour for global commands
   - Use guild-specific commands for instant updates

3. **Claude CLI not found**
   - Verify Claude Code is installed
   - Update `CLAUDE_CLI_PATH` in `.env`

4. **Tmux issues**
   - Install tmux: `sudo apt-get install tmux`
   - Or set `SESSION_TYPE=pty` in `.env`

## 📊 Session Management

Sessions are automatically saved to SQLite database.

- Sessions persist across bot restarts
- Multiple concurrent sessions supported
- Export sessions: `/session export`
- View statistics: `/session stats`

## 🔒 Security

- Set `ALLOWED_USER_IDS` to restrict access
- Use `ALLOWED_ROLE_IDS` for role-based access
- Sessions are isolated per user
- Database is local (not shared)

## 📚 Advanced Configuration

See `.env.example` for all available options:
- `MAX_SESSIONS` - Maximum concurrent sessions
- `DEFAULT_TIMEOUT` - Session timeout (seconds)
- `ENABLE_STREAMING` - Real-time response streaming
- `AUTO_CREATE_THREADS` - Auto-create Discord threads
- `REACTION_SHORTCUTS` - Enable reaction controls

## 🐛 Debug Mode

Enable debug logging:
```env
LOG_LEVEL=debug
```

View logs:
```bash
tail -f logs/bot.log
```

## 📦 Project Structure

```
claude-discord-bridge/
├── src/               # Source code
│   ├── index.ts      # Main entry
│   ├── claude/       # Claude integration
│   ├── discord/      # Discord commands
│   └── interactions/ # Component handlers
├── scripts/          # Setup scripts
├── logs/            # Log files
├── data/            # Database
└── .env             # Configuration
```

## 🤝 Support

- Check README.md for more details
- Report issues on GitHub
- Run `npm run doctor` for diagnostics

---

Happy coding with Claude! 🚀