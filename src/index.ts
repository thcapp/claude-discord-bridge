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

dotenv.config();

class ClaudeDiscordBridge {
  private client: Client;
  private sessionManager: SessionManager;
  private componentHandler: ComponentHandler;

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMessageReactions
      ]
    });

    this.sessionManager = new SessionManager();
    this.componentHandler = new ComponentHandler(this.sessionManager);
    
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.once(Events.ClientReady, (client) => {
      logger.info(`✅ Logged in as ${client.user.tag}`);
      this.sessionManager.restoreSessions();
      
      client.user.setActivity({
        name: 'Claude Code',
        type: 2
      });
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
      await this.sessionManager.saveAllSessions();
      await this.client.destroy();
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
    
    try {
      await command.execute(interaction, this.sessionManager);
    } catch (error) {
      logger.error(`Command error (${interaction.commandName}):`, error);
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
      await this.sessionManager.initialize();
      await this.registerAllCommands();
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