import { Client, GatewayIntentBits, Events, Collection } from 'discord.js';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import * as dotenv from 'dotenv';
import { SessionManager } from './claude/session-manager';
import { ComponentHandler } from './interactions/component-handler';
import { commands, registerCommands } from './discord/commands';
import { contextMenuCommands } from './discord/context-menus';
import { logger } from './utils/logger';
import { config } from './config';
import { WebhookServer } from './webhook/server';
import { EventNotifier } from './webhook/event-notifier';
import { SessionTemplateManager } from './claude/session-templates';
import { SessionCollaborationManager } from './claude/session-collaboration';
import { TokenCounter } from './utils/token-counter';
import { SecurityManager } from './utils/security-manager';
import { GitManager } from './claude/git-manager';
import { GitHubIntegration } from './integrations/github-integration';
import { ProcessManager } from './claude/process-manager';
import { PaginationManager } from './utils/pagination-manager';
import { OutputFormatter } from './utils/output-formatter';
import { SyntaxHighlighter } from './utils/syntax-highlighter';
import { MetricsCollector } from './monitoring/metrics';
import { HealthMonitor } from './monitoring/health';

dotenv.config();

class ClaudeDiscordBridge {
  private client: Client;
  private sessionManager: SessionManager;
  private componentHandler: ComponentHandler;
  private webhookServer?: WebhookServer;
  private eventNotifier?: EventNotifier;
  private templateManager: SessionTemplateManager;
  private collaborationManager: SessionCollaborationManager;
  private tokenCounter: TokenCounter;
  private securityManager: SecurityManager;
  private gitManager: GitManager;
  private githubIntegration?: GitHubIntegration;
  private processManager: ProcessManager;
  private paginationManager: PaginationManager;
  private metricsCollector: MetricsCollector;
  private healthMonitor: HealthMonitor;

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildWebhooks
      ]
    });

    // Initialize core managers
    this.sessionManager = new SessionManager();
    this.componentHandler = new ComponentHandler(this.sessionManager);
    this.templateManager = SessionTemplateManager.getInstance();
    this.collaborationManager = SessionCollaborationManager.getInstance();
    this.tokenCounter = TokenCounter.getInstance();
    this.securityManager = SecurityManager.getInstance();
    this.gitManager = GitManager.getInstance();
    this.processManager = ProcessManager.getInstance();
    this.paginationManager = PaginationManager.getInstance();
    this.metricsCollector = MetricsCollector.getInstance();
    this.healthMonitor = HealthMonitor.getInstance(config.health?.port || 3001);
    
    // Initialize GitHub integration if configured
    if (config.github?.token) {
      this.githubIntegration = GitHubIntegration.getInstance();
    }
    
    // Setup monitoring
    this.healthMonitor.setSessionManager(this.sessionManager);
    
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.once(Events.ClientReady, async (client) => {
      logger.info(`✅ Logged in as ${client.user.tag}`);
      
      // Restore sessions
      await this.sessionManager.restoreSessions();
      
      // Start webhook server if configured
      if (config.webhook?.enabled) {
        try {
          this.webhookServer = new WebhookServer(config.webhook.port);
          this.eventNotifier = new EventNotifier(this.client);
          await this.webhookServer.start();
          logger.info(`🌐 Webhook server started on port ${config.webhook.port}`);
        } catch (error) {
          logger.error('Failed to start webhook server:', error);
        }
      }
      
      // Initialize collaboration manager with Discord client
      this.collaborationManager.setDiscordClient(this.client);
      
      // Start health monitoring
      this.healthMonitor.setDiscordClient(this.client);
      await this.healthMonitor.start();
      logger.info(`🏥 Health monitor started on port ${config.health?.port || 3001}`);
      
      // Update metrics
      this.metricsCollector.updateDiscordMetrics(
        client.guilds.cache.size,
        client.users.cache.size,
        client.channels.cache.size,
        client.ws.ping
      );
      
      // Set bot activity
      client.user.setActivity({
        name: 'Claude Code',
        type: 2
      });
      
      // Log system info
      logger.info('📊 System initialized:');
      logger.info(`  - Templates: ${this.templateManager.getAllTemplates().length}`);
      logger.info(`  - Security: ${config.security?.enabled ? 'Enabled' : 'Disabled'}`);
      logger.info(`  - GitHub: ${this.githubIntegration ? 'Connected' : 'Not configured'}`);
      logger.info(`  - Webhook: ${this.webhookServer ? 'Running' : 'Disabled'}`);
    });

    this.client.on(Events.InteractionCreate, async (interaction) => {
      try {
        if (!this.isAuthorized(interaction.user.id)) {
          if (interaction.isRepliable()) {
            await interaction.reply({
              content: '❌ You are not authorized to use this bot.',
              ephemeral: true
            });
          }
          return;
        }

        if (interaction.isChatInputCommand()) {
          await this.handleCommand(interaction);
        } else if (interaction.isContextMenuCommand()) {
          await this.handleContextMenu(interaction);
        } else if (interaction.isButton()) {
          await this.componentHandler.handleButton(interaction);
        } else if (interaction.isStringSelectMenu()) {
          await this.componentHandler.handleSelectMenu(interaction);
        } else if (interaction.isModalSubmit()) {
          await this.componentHandler.handleModal(interaction);
        } else if (interaction.isAutocomplete()) {
          await this.handleAutocomplete(interaction);
        }
      } catch (error) {
        logger.error('Interaction error:', error);
        if (interaction.isRepliable() && !interaction.replied) {
          await interaction.reply({
            content: '❌ An error occurred while processing your request.',
            ephemeral: true
          });
        }
      }
    });

    this.client.on(Events.MessageCreate, async (message) => {
      if (message.author.bot) return;
      
      if (message.mentions.has(this.client.user!) && this.isAuthorized(message.author.id)) {
        const content = message.content.replace(/<@!?\d+>/g, '').trim();
        if (content) {
          const session = await this.sessionManager.getOrCreateSession(
            message.author.id,
            message.channelId
          );
          await session.sendMessage(content, message);
        }
      }
    });

    this.client.on(Events.MessageReactionAdd, async (reaction, user) => {
      if (user.bot) return;
      if (!config.features.reactionShortcuts) return;
      
      const message = reaction.message;
      if (message.author?.id !== this.client.user?.id) return;
      
      const session = this.sessionManager.getSessionByChannel(message.channelId);
      if (!session) return;
      
      switch (reaction.emoji.name) {
        case '▶️':
        case '👍':
          await session.continue();
          break;
        case '🔄':
          await session.regenerate();
          break;
        case '⏹️':
        case '👎':
          await session.stop();
          break;
      }
    });

    process.on('SIGINT', async () => {
      logger.info('Shutting down gracefully...');
      
      // Save all sessions
      await this.sessionManager.saveAllSessions();
      
      // Stop webhook server
      if (this.webhookServer) {
        await this.webhookServer.stop();
      }
      
      // Cleanup process manager
      await this.processManager.cleanup();
      
      // Cleanup collaboration sessions
      this.collaborationManager.cleanup();
      
      // Stop health monitor
      await this.healthMonitor.stop();
      
      // Cleanup metrics
      this.metricsCollector.destroy();
      
      // Destroy Discord client
      await this.client.destroy();
      
      logger.info('Shutdown complete');
      process.exit(0);
    });

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception:', error);
    });

    process.on('unhandledRejection', (error) => {
      logger.error('Unhandled rejection:', error);
    });
  }

  private async handleCommand(interaction: any): Promise<void> {
    const command = commands.get(interaction.commandName);
    if (!command) return;
    
    const commandId = `${interaction.commandName}-${Date.now()}`;
    this.metricsCollector.startCommandTimer(commandId);
    
    try {
      await command.execute(interaction, this.sessionManager);
      this.metricsCollector.endCommandTimer(
        commandId,
        interaction.commandName,
        interaction.user.id,
        true
      );
    } catch (error: any) {
      logger.error(`Command error (${interaction.commandName}):`, error);
      this.metricsCollector.endCommandTimer(
        commandId,
        interaction.commandName,
        interaction.user.id,
        false,
        error.message
      );
      
      const errorMessage = '❌ An error occurred while executing this command.';
      
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      } else {
        await interaction.followUp({ content: errorMessage, ephemeral: true });
      }
    }
  }

  private async handleAutocomplete(interaction: any): Promise<void> {
    const command = commands.get(interaction.commandName);
    if (!command?.autocomplete) return;
    
    try {
      await command.autocomplete(interaction, this.sessionManager);
    } catch (error) {
      logger.error(`Autocomplete error (${interaction.commandName}):`, error);
      await interaction.respond([]);
    }
  }

  private async handleContextMenu(interaction: any): Promise<void> {
    const contextCommand = contextMenuCommands.find(
      cmd => cmd.data.name === interaction.commandName
    );
    
    if (!contextCommand) return;
    
    try {
      await contextCommand.execute(interaction, this.sessionManager);
    } catch (error) {
      logger.error(`Context menu error (${interaction.commandName}):`, error);
      const errorMessage = '❌ An error occurred while executing this command.';
      
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      } else {
        await interaction.followUp({ content: errorMessage, ephemeral: true });
      }
    }
  }

  private isAuthorized(userId: string): boolean {
    const allowedUsers = config.discord.allowedUserIds;
    if (allowedUsers.length === 0) return true;
    return allowedUsers.includes(userId);
  }

  async start(): Promise<void> {
    try {
      // Initialize managers
      await this.sessionManager.initialize();
      await this.gitManager.initialize();
      
      // Pass managers to session manager for integration
      this.sessionManager.setTemplateManager(this.templateManager);
      this.sessionManager.setTokenCounter(this.tokenCounter);
      this.sessionManager.setCollaborationManager(this.collaborationManager);
      
      // Register commands
      await this.registerAllCommands();
      
      // Login to Discord
      await this.client.login(config.discord.token);
    } catch (error) {
      logger.error('Failed to start bot:', error);
      process.exit(1);
    }
  }

  private async registerAllCommands(): Promise<void> {
    try {
      // Register both slash commands and context menu commands
      await registerCommands(
        config.discord.token,
        config.discord.clientId,
        config.discord.guildId
      );
      
      logger.info('All commands registered successfully');
    } catch (error) {
      logger.error('Failed to register commands:', error);
      throw error;
    }
  }
}

const bot = new ClaudeDiscordBridge();
bot.start().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});