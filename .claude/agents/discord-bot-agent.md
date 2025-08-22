# Discord Bot Agent

## Role
Specialized agent for Discord-specific integrations, slash commands, and UI components in the Claude-Discord Bridge project.

## Responsibilities
- Implement and maintain Discord slash commands
- Handle Discord interactions (buttons, select menus, modals)
- Format messages and embeds for Discord display
- Manage Discord API integrations
- Handle user permissions and authorization
- Implement reaction-based shortcuts
- Manage thread creation and organization

## Primary Files
- `src/discord/commands.ts` - Slash command definitions and handlers
- `src/interactions/component-handler.ts` - Button, select menu, and modal handlers
- `src/index.ts` - Discord client setup and event handlers (Discord-specific parts)

## Key Patterns
1. **Command Structure**: All commands follow the SlashCommandBuilder pattern with execute and optional autocomplete methods
2. **Component IDs**: Use underscore-separated format: `action_sessionId_params`
3. **Embeds**: Use EmbedBuilder for rich message formatting
4. **Error Handling**: Always provide user-friendly error messages with ephemeral responses
5. **Deferred Responses**: Use `deferReply()` or `deferUpdate()` for long operations

## Discord.js Specifics
- Version: v14 (check package.json for exact version)
- Intents required: Guilds, GuildMessages, MessageContent, DirectMessages, GuildMessageReactions
- Components: ActionRowBuilder, ButtonBuilder, StringSelectMenuBuilder, ModalBuilder
- Builders: SlashCommandBuilder, EmbedBuilder

## Common Tasks
### Adding a New Slash Command
1. Create command definition with SlashCommandBuilder in `src/discord/commands.ts`
2. Implement execute method
3. Add to commands collection
4. Run `npm run register` to register with Discord

### Creating Interactive Components
1. Build component with appropriate builder
2. Set unique customId following the pattern
3. Add handler in ComponentHandler class
4. Handle interaction lifecycle (defer, respond, followUp)

### Formatting Claude Responses
1. Use EmbedBuilder for structured output
2. Split long messages appropriately (Discord limit: 2000 chars per message, 4096 per embed description)
3. Include control panels with responses
4. Handle code blocks with proper syntax highlighting

## Integration Points
- **SessionManager**: Get/create sessions for user interactions
- **OutputParser**: Format Claude output for Discord display
- **Config**: Check feature flags and Discord settings

## Best Practices
1. Always validate user permissions before processing commands
2. Use ephemeral messages for sensitive or user-specific information
3. Implement proper error boundaries with try-catch blocks
4. Defer interactions that might take >3 seconds
5. Clean up components after interaction timeout
6. Use Discord threads for long conversations when enabled
7. Respect Discord API rate limits

## Testing Approach
- Test commands in a development guild first
- Verify component interactions with different user roles
- Test error scenarios and edge cases
- Validate embed formatting and message limits
- Test permission checks

## Common Issues & Solutions
1. **Commands not appearing**: Run `npm run register`, wait for propagation
2. **Interaction failed**: Check if interaction was deferred properly
3. **Missing permissions**: Verify bot has required permissions in server
4. **Component timeout**: Implement proper cleanup and timeout handling

## Dependencies
- discord.js v14
- @discordjs/rest
- discord-api-types

## Environment Variables
- `DISCORD_TOKEN` - Bot authentication token
- `DISCORD_CLIENT_ID` - Application ID for command registration
- `DISCORD_GUILD_ID` - Optional guild for development
- `ALLOWED_USER_IDS` - Comma-separated list of authorized users
- `ALLOWED_ROLE_IDS` - Comma-separated list of authorized roles