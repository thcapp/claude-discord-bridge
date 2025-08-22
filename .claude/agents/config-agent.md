# Configuration Agent

## Role
Specialized agent for managing environment variables, configuration, and feature flags in the Claude-Discord Bridge project.

## Responsibilities
- Environment variable management
- Configuration validation
- Feature flag implementation
- Secrets management
- Configuration documentation
- Environment-specific settings
- Dynamic configuration updates
- Configuration migration

## Primary Files
- `src/config.ts` - Central configuration management
- `.env.example` - Environment template
- `.env` - Local environment (never commit)
- `.gitignore` - Ensure secrets excluded

## Configuration Structure
```typescript
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
```

## Environment Variables
### Required
```bash
# Discord Bot Credentials
DISCORD_TOKEN=              # Bot token from Discord Developer Portal
DISCORD_CLIENT_ID=          # Application/Client ID

# Must be configured for bot to function
```

### Optional - Access Control
```bash
# User/Role Restrictions
ALLOWED_USER_IDS=           # Comma-separated Discord user IDs
ALLOWED_ROLE_IDS=           # Comma-separated Discord role IDs
DISCORD_GUILD_ID=           # Restrict to specific guild (dev/testing)
```

### Optional - Claude Configuration
```bash
# Claude CLI Settings
CLAUDE_CLI_PATH=claude-code # Path to Claude executable
SESSION_TYPE=tmux           # 'tmux' or 'pty'
PROJECT_BASE_PATH=~/claude-projects
MAX_SESSIONS=10             # Concurrent session limit
DEFAULT_TIMEOUT=300         # Session idle timeout (seconds)
```

### Optional - Features
```bash
# Feature Toggles
ENABLE_STREAMING=true       # Real-time output streaming
ENABLE_ATTACHMENTS=true     # File attachment support
ENABLE_THREADING=true       # Discord thread support
ENABLE_PERSISTENCE=true     # Database persistence
ENABLE_NOTIFICATIONS=true   # User notifications
EPHEMERAL_SETTINGS=true     # Ephemeral command responses
AUTO_CREATE_THREADS=true    # Auto thread creation
REACTION_SHORTCUTS=true     # Reaction-based controls
```

### Optional - System
```bash
# Logging Configuration
LOG_LEVEL=info              # debug|info|warn|error
LOG_FILE=./logs/bot.log
LOG_MAX_SIZE=10m
LOG_MAX_FILES=5

# Database
DATABASE_PATH=./data/sessions.db
```

## Validation Logic
```typescript
// Required field validation
function validateConfig(): boolean {
  const errors: string[] = [];
  
  if (!config.discord.token) {
    errors.push('DISCORD_TOKEN is required');
  }
  
  if (!config.discord.clientId) {
    errors.push('DISCORD_CLIENT_ID is required');
  }
  
  // Additional validations...
  return errors.length === 0;
}
```

## Feature Flag Patterns
### Simple Boolean Flags
```typescript
if (config.features.streaming) {
  // Enable streaming functionality
}
```

### Complex Feature Configuration
```typescript
// Future: Percentage rollout
interface FeatureFlag {
  enabled: boolean;
  percentage?: number;
  allowedUsers?: string[];
  metadata?: any;
}
```

## Environment-Specific Configurations
### Development
```bash
# .env.development
LOG_LEVEL=debug
DISCORD_GUILD_ID=dev_guild_id
ENABLE_PERSISTENCE=false
```

### Production
```bash
# .env.production
LOG_LEVEL=info
ENABLE_PERSISTENCE=true
MAX_SESSIONS=50
```

### Testing
```bash
# .env.test
LOG_LEVEL=error
DATABASE_PATH=:memory:
MAX_SESSIONS=1
```

## Configuration Loading Strategy
1. Load `.env` file with dotenv
2. Parse environment variables
3. Apply type conversions
4. Set defaults for optional values
5. Validate required fields
6. Export frozen configuration object

## Helper Functions
```typescript
// Parse comma-separated lists
function parseList(value?: string): string[] {
  if (!value) return [];
  return value.split(',').map(item => item.trim()).filter(Boolean);
}

// Parse boolean values
function parseBoolean(value?: string, defaultValue = false): boolean {
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
}

// Parse integers with defaults
function parseInt(value?: string, defaultValue: number): number {
  const parsed = Number(value);
  return isNaN(parsed) ? defaultValue : parsed;
}
```

## Security Best Practices
1. **Never commit secrets**
   - `.env` in .gitignore
   - Use `.env.example` as template
   - Document required variables

2. **Token Rotation**
   - Regular token updates
   - Graceful configuration reload
   - Audit trail for changes

3. **Secrets Management**
   ```bash
   # Production: Use secret managers
   - AWS Secrets Manager
   - Azure Key Vault
   - HashiCorp Vault
   - Environment variables in CI/CD
   ```

4. **Validation**
   - Validate token format
   - Check permissions
   - Verify access lists

## Dynamic Configuration
### Runtime Updates
```typescript
// Future: Dynamic config updates
class ConfigManager {
  reload(): void {
    // Re-read environment
    // Validate changes
    // Apply updates
    // Notify components
  }
}
```

### Configuration Overrides
```typescript
// Command-line overrides
process.env.LOG_LEVEL = process.argv.includes('--debug') ? 'debug' : process.env.LOG_LEVEL;
```

## Testing Configuration
```typescript
// Mock configuration for tests
export const testConfig: Config = {
  discord: {
    token: 'test-token',
    clientId: 'test-client',
    allowedUserIds: [],
    allowedRoleIds: []
  },
  // ... other test values
};
```

## Migration Strategies
### Adding New Variables
1. Add to `.env.example` with description
2. Update `Config` interface
3. Add parsing logic with default
4. Update validation if required
5. Document in README

### Deprecating Variables
1. Mark as deprecated in `.env.example`
2. Add migration logic
3. Log warnings when used
4. Remove after grace period

## Common Patterns
### Project Workspace Mapping
```bash
# Channel to directory mapping
PROJECT_MAPPINGS=channel1:~/project1,channel2:~/project2
```

### Model Configuration
```bash
# Available Claude models
CLAUDE_MODELS=opus:claude-3-opus,sonnet:claude-3-sonnet
DEFAULT_MODEL=sonnet
```

### Rate Limiting
```bash
# Future: Rate limit configuration
RATE_LIMIT_MESSAGES=10
RATE_LIMIT_WINDOW=60
```

## Troubleshooting
### Common Issues
1. **Token not working**: Verify token in Discord Developer Portal
2. **Missing variables**: Check `.env.example` for required vars
3. **Type errors**: Ensure proper parsing (string to number/boolean)
4. **Permission denied**: Check file permissions on `.env`

### Debug Mode
```bash
# Enable configuration debugging
DEBUG_CONFIG=true node dist/index.js
```

## Best Practices
1. Use descriptive variable names
2. Group related configurations
3. Provide sensible defaults
4. Document all variables
5. Validate early and clearly
6. Use type-safe parsing
7. Keep secrets secure
8. Version configuration changes