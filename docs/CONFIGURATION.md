# Configuration Guide

This guide covers all configuration options for Claude Discord Bridge, from basic setup to advanced features.

## Table of Contents
- [Environment Variables](#environment-variables)
- [Configuration Examples](#configuration-examples)
- [Feature Flags](#feature-flags)
- [Security Settings](#security-settings)
- [Integration Setup](#integration-setup)
- [Performance Tuning](#performance-tuning)
- [Backup and Recovery](#backup-and-recovery)

---

## Environment Variables

### Core Discord Configuration

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `DISCORD_TOKEN` | ✅ | Bot token from Discord Developer Portal | - |
| `DISCORD_CLIENT_ID` | ✅ | Application/Client ID | - |
| `DISCORD_GUILD_ID` | ❌ | Guild ID for guild-specific commands | - |
| `DISCORD_ALLOWED_USER_IDS` | ❌ | Comma-separated list of allowed user IDs | All users |
| `DISCORD_ALLOWED_ROLE_IDS` | ❌ | Comma-separated list of allowed role IDs | All roles |
| `DISCORD_ADMIN_USER_IDS` | ❌ | Admin users with full permissions | - |

### Claude Configuration

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `CLAUDE_API_KEY` | ❌ | Anthropic API key (if not using CLI) | - |
| `CLAUDE_MODEL` | ❌ | Default Claude model | claude-3-sonnet-20240229 |
| `CLAUDE_MAX_TOKENS` | ❌ | Maximum tokens per response | 4000 |
| `CLAUDE_TEMPERATURE` | ❌ | Response randomness (0-1) | 0.7 |
| `CLAUDE_CLI_PATH` | ❌ | Path to Claude Code CLI binary | claude-code |
| `CLAUDE_TOP_P` | ❌ | Nucleus sampling parameter | 1.0 |
| `CLAUDE_SYSTEM_PROMPT` | ❌ | Default system prompt | - |

### Session Management

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `SESSION_TYPE` | ❌ | Session backend (tmux/pty) | tmux |
| `SESSION_TIMEOUT` | ❌ | Session timeout in milliseconds | 1800000 (30 min) |
| `SESSION_PERSIST` | ❌ | Enable session persistence | true |
| `MAX_SESSIONS` | ❌ | Max total concurrent sessions | 10 |
| `MAX_SESSIONS_PER_USER` | ❌ | Max sessions per user | 5 |
| `SESSION_CLEANUP_INTERVAL` | ❌ | Cleanup interval in ms | 300000 (5 min) |
| `SESSION_SAVE_INTERVAL` | ❌ | Auto-save interval in ms | 60000 (1 min) |

### Database Configuration

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `DATABASE_PATH` | ❌ | SQLite database file path | ./data/sessions.db |
| `DATABASE_WAL_MODE` | ❌ | Enable WAL mode for better performance | true |
| `DATABASE_BACKUP_COUNT` | ❌ | Number of automatic backups to keep | 5 |
| `DATABASE_VACUUM_INTERVAL` | ❌ | Days between VACUUM operations | 7 |

### GitHub Integration

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `GITHUB_TOKEN` | ❌ | GitHub personal access token | - |
| `GITHUB_DEFAULT_ORG` | ❌ | Default organization | - |
| `GITHUB_DEFAULT_REPO` | ❌ | Default repository | - |
| `GITHUB_API_VERSION` | ❌ | GitHub API version | 2022-11-28 |
| `GITHUB_PER_PAGE` | ❌ | Items per page in listings | 30 |
| `GITHUB_TIMEOUT` | ❌ | API request timeout in ms | 30000 |

### Webhook Server

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `WEBHOOK_ENABLED` | ❌ | Enable webhook server | false |
| `WEBHOOK_PORT` | ❌ | Webhook server port | 3000 |
| `WEBHOOK_HOST` | ❌ | Webhook server host | 0.0.0.0 |
| `WEBHOOK_PATH` | ❌ | Webhook endpoint path | /webhook |
| `WEBHOOK_SECRET` | ❌ | GitHub webhook secret | - |
| `WEBHOOK_CHANNELS` | ❌ | Channel mapping (JSON) | {} |
| `WEBHOOK_USER_MAP` | ❌ | GitHub to Discord user map | {} |

### Security Configuration

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `SECURITY_ENABLED` | ❌ | Enable security features | true |
| `RATE_LIMIT_ENABLED` | ❌ | Enable rate limiting | true |
| `RATE_LIMIT_MAX_REQUESTS` | ❌ | Max requests per window | 10 |
| `RATE_LIMIT_WINDOW_MS` | ❌ | Rate limit window in ms | 60000 |
| `SANDBOX_ENABLED` | ❌ | Enable file operation sandboxing | true |
| `SANDBOX_PATH` | ❌ | Sandbox root directory | ./sandbox |
| `MAX_FILE_SIZE` | ❌ | Max file size in bytes | 10485760 (10MB) |
| `ALLOWED_FILE_EXTENSIONS` | ❌ | Comma-separated extensions | All |
| `BLOCKED_FILE_EXTENSIONS` | ❌ | Blocked extensions | .exe,.dll,.so |

### Bash Execution Security

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `BASH_ENABLED` | ❌ | Enable bash command execution | true |
| `BASH_WHITELIST_ENABLED` | ❌ | Enable command whitelist | false |
| `BASH_WHITELIST_COMMANDS` | ❌ | Comma-separated allowed commands | - |
| `BASH_BLACKLIST_ENABLED` | ❌ | Enable command blacklist | true |
| `BASH_BLACKLIST_COMMANDS` | ❌ | Comma-separated blocked commands | rm,sudo,chmod |
| `BASH_TIMEOUT_DEFAULT` | ❌ | Default command timeout in ms | 30000 |
| `BASH_MAX_OUTPUT_SIZE` | ❌ | Max output size in bytes | 1048576 (1MB) |

### Web Integration

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `WEB_ENABLED` | ❌ | Enable web features | true |
| `WEB_USER_AGENT` | ❌ | User agent for requests | Claude-Discord-Bridge/1.0 |
| `WEB_TIMEOUT` | ❌ | Request timeout in ms | 30000 |
| `WEB_MAX_REDIRECTS` | ❌ | Max redirects to follow | 5 |
| `WEB_PROXY` | ❌ | HTTP proxy URL | - |
| `WEB_SEARCH_ENGINE` | ❌ | Default search engine | google |
| `WEB_SEARCH_LIMIT` | ❌ | Default search results | 5 |

### Logging Configuration

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `LOG_LEVEL` | ❌ | Log level (error/warn/info/debug) | info |
| `LOG_TO_FILE` | ❌ | Enable file logging | true |
| `LOG_DIR` | ❌ | Log directory path | ./logs |
| `LOG_MAX_FILES` | ❌ | Max log files to keep | 14 |
| `LOG_MAX_SIZE` | ❌ | Max log file size | 20m |
| `LOG_DATE_PATTERN` | ❌ | Log rotation pattern | YYYY-MM-DD |
| `LOG_COMPRESS` | ❌ | Compress old logs | true |

### Token Management

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `TOKEN_TRACKING_ENABLED` | ❌ | Enable token usage tracking | true |
| `TOKEN_BUDGET_ENABLED` | ❌ | Enable token budgets | false |
| `TOKEN_DAILY_LIMIT` | ❌ | Default daily token limit | 100000 |
| `TOKEN_MONTHLY_LIMIT` | ❌ | Default monthly token limit | 3000000 |
| `TOKEN_WARNING_THRESHOLD` | ❌ | Warning at % of limit | 80 |
| `TOKEN_COST_MULTIPLIER` | ❌ | Cost calculation multiplier | 1.0 |

### Backup Configuration

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `BACKUP_ENABLED` | ❌ | Enable automatic backups | true |
| `BACKUP_DIR` | ❌ | Backup directory | ./backups |
| `BACKUP_SCHEDULE` | ❌ | Backup schedule (hourly/daily/weekly) | daily |
| `BACKUP_MAX_COUNT` | ❌ | Max backups to keep | 10 |
| `BACKUP_MAX_AGE_DAYS` | ❌ | Max backup age in days | 30 |
| `BACKUP_COMPRESS` | ❌ | Compress backups | true |
| `BACKUP_ENCRYPTION_KEY` | ❌ | Encryption key for backups | - |

### Performance Tuning

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `CACHE_ENABLED` | ❌ | Enable response caching | true |
| `CACHE_TTL` | ❌ | Cache TTL in seconds | 300 |
| `CACHE_MAX_SIZE` | ❌ | Max cache size in MB | 100 |
| `STREAMING_ENABLED` | ❌ | Enable response streaming | true |
| `STREAMING_CHUNK_SIZE` | ❌ | Stream chunk size in chars | 2000 |
| `PAGINATION_ENABLED` | ❌ | Enable output pagination | true |
| `PAGINATION_PAGE_SIZE` | ❌ | Lines per page | 20 |

### Feature Flags

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `FEATURE_FILE_OPERATIONS` | ❌ | Enable file operations | true |
| `FEATURE_WEB_SEARCH` | ❌ | Enable web search | true |
| `FEATURE_GIT_COMMANDS` | ❌ | Enable Git commands | true |
| `FEATURE_GITHUB_INTEGRATION` | ❌ | Enable GitHub features | true |
| `FEATURE_BASH_EXECUTION` | ❌ | Enable bash execution | true |
| `FEATURE_PROCESS_MANAGEMENT` | ❌ | Enable process management | true |
| `FEATURE_TEMPLATES` | ❌ | Enable AI templates | true |
| `FEATURE_COLLABORATION` | ❌ | Enable collaboration | true |
| `FEATURE_TOKEN_TRACKING` | ❌ | Enable token tracking | true |
| `FEATURE_WEBHOOKS` | ❌ | Enable webhooks | true |
| `FEATURE_CONTEXT_MENUS` | ❌ | Enable context menus | true |
| `FEATURE_REACTION_SHORTCUTS` | ❌ | Enable reaction shortcuts | true |
| `FEATURE_THREADING` | ❌ | Auto-create threads | true |
| `FEATURE_SYNTAX_HIGHLIGHTING` | ❌ | Enable syntax highlighting | true |

---

## Configuration Examples

### Minimal Configuration
Basic setup for personal use:

```env
# Required
DISCORD_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_client_id_here

# Optional but recommended
DISCORD_GUILD_ID=your_test_guild_id
LOG_LEVEL=info
```

### Development Configuration
Ideal for development and testing:

```env
# Discord
DISCORD_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_client_id_here
DISCORD_GUILD_ID=your_test_guild_id

# Claude
CLAUDE_MODEL=claude-3-haiku-20240307
CLAUDE_MAX_TOKENS=2000

# Development
LOG_LEVEL=debug
LOG_TO_FILE=true
CACHE_ENABLED=false
RATE_LIMIT_ENABLED=false
SANDBOX_ENABLED=false

# Features
FEATURE_FILE_OPERATIONS=true
FEATURE_WEB_SEARCH=true
FEATURE_GIT_COMMANDS=true
FEATURE_BASH_EXECUTION=true
```

### Production Configuration
Secure setup for production:

```env
# Discord
DISCORD_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_client_id_here
DISCORD_ALLOWED_USER_IDS=user1,user2,user3
DISCORD_ADMIN_USER_IDS=admin1

# Claude
CLAUDE_API_KEY=your_api_key_here
CLAUDE_MODEL=claude-3-opus-20240229
CLAUDE_MAX_TOKENS=4000
CLAUDE_TEMPERATURE=0.7

# Security
SECURITY_ENABLED=true
RATE_LIMIT_ENABLED=true
RATE_LIMIT_MAX_REQUESTS=10
RATE_LIMIT_WINDOW_MS=60000
SANDBOX_ENABLED=true
SANDBOX_PATH=/app/sandbox
MAX_FILE_SIZE=5242880

# Bash Security
BASH_BLACKLIST_ENABLED=true
BASH_BLACKLIST_COMMANDS=rm,sudo,chmod,chown,kill,shutdown,reboot
BASH_TIMEOUT_DEFAULT=30000

# Database
DATABASE_PATH=/app/data/sessions.db
DATABASE_WAL_MODE=true
DATABASE_BACKUP_COUNT=10

# Logging
LOG_LEVEL=warn
LOG_TO_FILE=true
LOG_DIR=/app/logs
LOG_MAX_FILES=30
LOG_COMPRESS=true

# Backup
BACKUP_ENABLED=true
BACKUP_SCHEDULE=daily
BACKUP_ENCRYPTION_KEY=your_encryption_key_here

# Performance
CACHE_ENABLED=true
CACHE_TTL=600
STREAMING_ENABLED=true
PAGINATION_ENABLED=true
```

### High-Security Configuration
Maximum security for sensitive environments:

```env
# Strict Access Control
DISCORD_ALLOWED_USER_IDS=trusted_user_1,trusted_user_2
DISCORD_ADMIN_USER_IDS=admin_only

# Security Maximized
SECURITY_ENABLED=true
RATE_LIMIT_MAX_REQUESTS=5
RATE_LIMIT_WINDOW_MS=60000
SANDBOX_ENABLED=true
MAX_FILE_SIZE=1048576

# Bash Highly Restricted
BASH_ENABLED=true
BASH_WHITELIST_ENABLED=true
BASH_WHITELIST_COMMANDS=ls,pwd,echo,cat,grep
BASH_TIMEOUT_DEFAULT=10000

# File Operations Restricted
ALLOWED_FILE_EXTENSIONS=.txt,.md,.json,.js,.ts,.py
BLOCKED_FILE_EXTENSIONS=.exe,.dll,.so,.sh,.bat

# Disable Risky Features
FEATURE_WEB_SEARCH=false
FEATURE_GITHUB_INTEGRATION=false
FEATURE_WEBHOOKS=false

# Token Limits
TOKEN_BUDGET_ENABLED=true
TOKEN_DAILY_LIMIT=50000
TOKEN_MONTHLY_LIMIT=1000000
```

### Team Collaboration Configuration
Optimized for team use:

```env
# Team Access
DISCORD_ALLOWED_ROLE_IDS=dev_team_role_id
DISCORD_ADMIN_USER_IDS=team_lead_1,team_lead_2

# Collaboration Features
FEATURE_COLLABORATION=true
FEATURE_TEMPLATES=true
FEATURE_TOKEN_TRACKING=true
MAX_SESSIONS_PER_USER=10

# GitHub Integration
GITHUB_TOKEN=github_pat_token
GITHUB_DEFAULT_ORG=your-org
FEATURE_GITHUB_INTEGRATION=true

# Webhooks for CI/CD
WEBHOOK_ENABLED=true
WEBHOOK_PORT=3000
WEBHOOK_SECRET=webhook_secret_here
WEBHOOK_CHANNELS={"push":"channel_id_1","pr":"channel_id_2"}

# Shared Templates
CLAUDE_MODEL=claude-3-sonnet-20240229
FEATURE_TEMPLATES=true

# Logging for Audit
LOG_LEVEL=info
LOG_TO_FILE=true
LOG_MAX_FILES=90
```

---

## Integration Setup

### GitHub Webhook Setup

1. **Generate Webhook Secret**:
```bash
openssl rand -hex 32
```

2. **Configure Environment**:
```env
WEBHOOK_ENABLED=true
WEBHOOK_PORT=3000
WEBHOOK_SECRET=your_generated_secret
WEBHOOK_PATH=/webhook
```

3. **Setup in GitHub**:
- Go to Repository Settings → Webhooks
- Add webhook URL: `https://your-domain.com/webhook`
- Content type: `application/json`
- Secret: Use generated secret
- Events: Choose events to monitor

4. **Configure Channel Mapping**:
```env
WEBHOOK_CHANNELS={"push":"channel_id_for_pushes","pull_request":"channel_id_for_prs"}
WEBHOOK_USER_MAP={"github_user":"discord_user_id"}
```

### Claude API Setup

1. **Get API Key**:
- Visit [Anthropic Console](https://console.anthropic.com)
- Generate API key
- Add to configuration

2. **Configure**:
```env
CLAUDE_API_KEY=your_api_key_here
CLAUDE_MODEL=claude-3-opus-20240229
CLAUDE_MAX_TOKENS=4000
```

### Discord Bot Permissions

Required permissions integer: `534723947584`

Required permissions:
- Send Messages
- Embed Links
- Attach Files
- Read Message History
- Add Reactions
- Use Slash Commands
- Manage Threads
- Create Public Threads
- Send Messages in Threads

---

## Performance Tuning

### Memory Optimization

```env
# Reduce memory usage
CACHE_MAX_SIZE=50
LOG_MAX_FILES=7
SESSION_TIMEOUT=900000
MAX_SESSIONS=5
PAGINATION_PAGE_SIZE=10
```

### Speed Optimization

```env
# Increase performance
CACHE_ENABLED=true
CACHE_TTL=600
DATABASE_WAL_MODE=true
STREAMING_ENABLED=true
STREAMING_CHUNK_SIZE=4000
```

### Scaling Configuration

```env
# Handle more users
MAX_SESSIONS=50
MAX_SESSIONS_PER_USER=10
RATE_LIMIT_MAX_REQUESTS=20
SESSION_CLEANUP_INTERVAL=60000
DATABASE_VACUUM_INTERVAL=1
```

---

## Backup and Recovery

### Automated Backup Setup

```env
BACKUP_ENABLED=true
BACKUP_DIR=./backups
BACKUP_SCHEDULE=daily
BACKUP_MAX_COUNT=30
BACKUP_COMPRESS=true
BACKUP_ENCRYPTION_KEY=strong_encryption_key_here
```

### Manual Backup Commands

```bash
# Create backup
npm run backup create

# Create encrypted backup
npm run backup create -- --encrypt

# Restore from backup
npm run backup restore backups/backup-full-2024-01-01.tar.gz

# List backups
npm run backup list
```

### Disaster Recovery

1. **Regular Backups**:
- Enable automated backups
- Store backups off-site
- Test restore procedures

2. **Database Maintenance**:
```bash
# Run migrations
npm run migrate up

# Check database integrity
npm run migrate status

# Reset database (WARNING: Data loss)
npm run migrate reset
```

3. **Health Monitoring**:
```bash
# Full health check
npm run health

# Quick diagnostics
npm run doctor
```

---

## Troubleshooting

### Common Issues

**Bot not responding**:
- Check `DISCORD_TOKEN` is correct
- Verify bot has proper permissions
- Check `DISCORD_ALLOWED_USER_IDS` if set

**Commands not working**:
- Run `npm run register` to register commands
- Check feature flags are enabled
- Verify rate limits aren't exceeded

**Database errors**:
- Check write permissions on database directory
- Run `npm run migrate up` to update schema
- Verify `DATABASE_PATH` is correct

**High memory usage**:
- Reduce `CACHE_MAX_SIZE`
- Lower `MAX_SESSIONS`
- Enable `SESSION_TIMEOUT`

**Webhook not receiving events**:
- Verify `WEBHOOK_SECRET` matches GitHub
- Check firewall allows incoming connections
- Ensure `WEBHOOK_PORT` is accessible

### Debug Mode

Enable comprehensive debugging:

```env
LOG_LEVEL=debug
LOG_TO_FILE=true
CACHE_ENABLED=false
```

Then monitor logs:
```bash
tail -f logs/bot-*.log
```

---

## Security Best Practices

1. **Never commit `.env` files**
2. **Use strong, unique tokens and secrets**
3. **Regularly rotate API keys**
4. **Enable rate limiting in production**
5. **Use sandboxing for file operations**
6. **Implement command whitelisting for bash**
7. **Set appropriate file size limits**
8. **Enable backup encryption**
9. **Restrict bot access to trusted users**
10. **Monitor logs for suspicious activity**

---

## Environment Variable Precedence

1. Command-line arguments (highest)
2. `.env` file
3. System environment variables
4. Default values (lowest)

Example:
```bash
CLAUDE_MODEL=opus npm start  # Overrides .env setting
```

---

## Configuration Validation

Run the setup wizard to validate configuration:

```bash
npm run setup
```

Run doctor to check configuration:

```bash
npm run doctor
```

Run health check for detailed diagnostics:

```bash
npm run health
```