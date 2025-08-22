import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  Collection,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AutocompleteInteraction
} from 'discord.js';
import { SessionManager } from '../claude/session-manager';
import { ComponentHandler } from '../interactions/component-handler';
import { config } from '../config';
import { logger } from '../utils/logger';

// Import all command modules
import { fileCommand } from './commands/file-operations';
import { webCommand } from './commands/web-integration';
import { bashCommand } from './commands/bash-execution';
import { gitCommand } from './commands/git-operations';
import { githubCommand } from './commands/github-commands';
import { contextMenuCommands } from './context-menus';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';

interface Command {
  data: SlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction, sessionManager: SessionManager) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction, sessionManager: SessionManager) => Promise<void>;
}

export const commands = new Collection<string, Command>();

const claudeCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('claude')
    .setDescription('Start an interactive Claude session')
    .addStringOption(option =>
      option
        .setName('message')
        .setDescription('Initial message to Claude')
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('model')
        .setDescription('Claude model to use')
        .setRequired(false)
        .addChoices(
          { name: 'Claude 3 Opus', value: 'opus' },
          { name: 'Claude 3 Sonnet', value: 'sonnet' },
          { name: 'Claude 3 Haiku', value: 'haiku' }
        )
    ) as SlashCommandBuilder,
    
  async execute(interaction, sessionManager) {
    await interaction.deferReply();
    
    const message = interaction.options.getString('message');
    const model = interaction.options.getString('model');
    
    const session = await sessionManager.getOrCreateSession(
      interaction.user.id,
      interaction.channelId
    );
    
    if (model) {
      await session.setModel(model);
    }
    
    const componentHandler = new ComponentHandler(sessionManager);
    const controlPanel = componentHandler.createControlPanel(session.id);
    
    const embed = new EmbedBuilder()
      .setTitle('🤖 Claude Session Started')
      .setColor(0x5865F2)
      .setDescription('Session initialized. Send your message or use the controls below.')
      .addFields(
        { name: 'Session ID', value: session.id, inline: true },
        { name: 'Model', value: model || 'default', inline: true },
        { name: 'Status', value: '🟢 Active', inline: true }
      )
      .setFooter({ text: 'Use buttons below to control the session' })
      .setTimestamp();
    
    await interaction.editReply({
      embeds: [embed],
      components: [controlPanel]
    });
    
    if (message) {
      await session.sendMessage(message);
    }
  }
};

const codeCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('code')
    .setDescription('Submit code to Claude with instructions') as SlashCommandBuilder,
    
  async execute(interaction, sessionManager) {
    const modal = new ModalBuilder()
      .setCustomId('code_input')
      .setTitle('Code Input');
    
    const codeInput = new TextInputBuilder()
      .setCustomId('code')
      .setLabel('Your Code')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Paste your code here...')
      .setRequired(true)
      .setMaxLength(4000);
    
    const instructionsInput = new TextInputBuilder()
      .setCustomId('instructions')
      .setLabel('Instructions for Claude')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('What should Claude do with this code?')
      .setRequired(true)
      .setMaxLength(1000);
    
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(codeInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(instructionsInput)
    );
    
    await interaction.showModal(modal);
  }
};

const sessionCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('session')
    .setDescription('Manage Claude sessions')
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List all active sessions')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('switch')
        .setDescription('Switch to a different session')
        .addStringOption(option =>
          option
            .setName('id')
            .setDescription('Session ID to switch to')
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('clear')
        .setDescription('Clear session history')
        .addStringOption(option =>
          option
            .setName('id')
            .setDescription('Session ID to clear (or "all")')
            .setRequired(false)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('export')
        .setDescription('Export session history')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('stats')
        .setDescription('View session statistics')
    ) as SlashCommandBuilder,
    
  async execute(interaction, sessionManager) {
    const subcommand = interaction.options.getSubcommand();
    
    switch (subcommand) {
      case 'list':
        await this.handleListSessions(interaction, sessionManager);
        break;
      case 'switch':
        await this.handleSwitchSession(interaction, sessionManager);
        break;
      case 'clear':
        await this.handleClearSession(interaction, sessionManager);
        break;
      case 'export':
        await this.handleExportSessions(interaction, sessionManager);
        break;
      case 'stats':
        await this.handleSessionStats(interaction, sessionManager);
        break;
    }
  },
  
  async autocomplete(interaction, sessionManager) {
    const focused = interaction.options.getFocused();
    const sessions = await sessionManager.getUserSessions(interaction.user.id);
    
    const choices = sessions
      .filter(s => s.id.toLowerCase().includes(focused.toLowerCase()))
      .slice(0, 25)
      .map(s => ({
        name: `${s.id} (${s.messageCount} messages)`,
        value: s.id
      }));
    
    if (interaction.options.getSubcommand() === 'clear') {
      choices.unshift({ name: 'All Sessions', value: 'all' });
    }
    
    await interaction.respond(choices);
  },
  
  async handleListSessions(interaction: ChatInputCommandInteraction, sessionManager: SessionManager) {
    await interaction.deferReply();
    
    const sessions = await sessionManager.getUserSessions(interaction.user.id);
    
    if (sessions.length === 0) {
      await interaction.editReply('No active sessions found.');
      return;
    }
    
    const embed = new EmbedBuilder()
      .setTitle('📋 Your Claude Sessions')
      .setColor(0x5865F2)
      .setDescription(`You have ${sessions.length} active session(s)`)
      .setTimestamp();
    
    sessions.forEach((session, index) => {
      embed.addFields({
        name: `Session ${index + 1}: ${session.id}`,
        value: `**Status:** ${session.status}\n**Messages:** ${session.messageCount}\n**Created:** ${session.created}\n**Last Active:** ${session.lastActive}`,
        inline: true
      });
    });
    
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('session_select')
      .setPlaceholder('Select a session to activate')
      .addOptions(
        sessions.map(s => ({
          label: s.id,
          description: `${s.status} - ${s.messageCount} messages`,
          value: s.id
        }))
      );
    
    const actionRow = new ActionRowBuilder<StringSelectMenuBuilder>()
      .addComponents(selectMenu);
    
    await interaction.editReply({
      embeds: [embed],
      components: [actionRow]
    });
  },
  
  async handleSwitchSession(interaction: ChatInputCommandInteraction, sessionManager: SessionManager) {
    await interaction.deferReply();
    
    const sessionId = interaction.options.getString('id', true);
    const session = sessionManager.getSession(sessionId);
    
    if (!session) {
      await interaction.editReply('❌ Session not found.');
      return;
    }
    
    await session.activate();
    await interaction.editReply(`✅ Switched to session: ${sessionId}`);
  },
  
  async handleClearSession(interaction: ChatInputCommandInteraction, sessionManager: SessionManager) {
    await interaction.deferReply();
    
    const sessionId = interaction.options.getString('id');
    
    if (sessionId === 'all') {
      await sessionManager.clearUserSessions(interaction.user.id);
      await interaction.editReply('✅ All sessions cleared.');
    } else if (sessionId) {
      await sessionManager.clearSession(sessionId);
      await interaction.editReply(`✅ Session ${sessionId} cleared.`);
    } else {
      const currentSession = sessionManager.getSessionByChannel(interaction.channelId);
      if (currentSession) {
        await sessionManager.clearSession(currentSession.id);
        await interaction.editReply('✅ Current session cleared.');
      } else {
        await interaction.editReply('❌ No active session in this channel.');
      }
    }
  },
  
  async handleExportSessions(interaction: ChatInputCommandInteraction, sessionManager: SessionManager) {
    await interaction.deferReply({ ephemeral: true });
    
    const exportData = await sessionManager.exportSessions(interaction.user.id);
    const buffer = Buffer.from(JSON.stringify(exportData, null, 2));
    
    await interaction.editReply({
      content: '📥 Your sessions have been exported.',
      files: [{
        attachment: buffer,
        name: `sessions-${interaction.user.id}-${Date.now()}.json`
      }]
    });
  },
  
  async handleSessionStats(interaction: ChatInputCommandInteraction, sessionManager: SessionManager) {
    await interaction.deferReply();
    
    const stats = await sessionManager.getStatistics(interaction.user.id);
    
    const embed = new EmbedBuilder()
      .setTitle('📊 Session Statistics')
      .setColor(0x00FF00)
      .addFields(
        { name: 'Total Sessions', value: String(stats.total), inline: true },
        { name: 'Active Sessions', value: String(stats.active), inline: true },
        { name: 'Total Messages', value: String(stats.messages), inline: true },
        { name: 'Uptime', value: stats.uptime, inline: true },
        { name: 'Average Session Length', value: stats.avgLength, inline: true },
        { name: 'Most Used Model', value: stats.favoriteModel || 'N/A', inline: true }
      )
      .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
  }
};

const quickCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('quick')
    .setDescription('Quick Claude actions')
    .addStringOption(option =>
      option
        .setName('action')
        .setDescription('Quick action to perform')
        .setRequired(true)
        .addChoices(
          { name: 'Explain Code', value: 'explain' },
          { name: 'Fix Errors', value: 'fix' },
          { name: 'Refactor', value: 'refactor' },
          { name: 'Add Comments', value: 'comment' },
          { name: 'Write Tests', value: 'test' },
          { name: 'Optimize', value: 'optimize' },
          { name: 'Convert Language', value: 'convert' },
          { name: 'Generate Docs', value: 'docs' }
        )
    ) as SlashCommandBuilder,
    
  async execute(interaction, sessionManager) {
    const action = interaction.options.getString('action', true);
    
    const modal = new ModalBuilder()
      .setCustomId('quick_action')
      .setTitle(`Quick Action: ${action}`);
    
    const contextInput = new TextInputBuilder()
      .setCustomId('context')
      .setLabel('Code or Context')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Paste your code or provide context...')
      .setRequired(true)
      .setMaxLength(4000);
    
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(contextInput)
    );
    
    await interaction.showModal(modal);
  }
};

const helpCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show help and documentation') as SlashCommandBuilder,
    
  async execute(interaction, sessionManager) {
    const embed = new EmbedBuilder()
      .setTitle('📚 Claude Discord Bridge - Help')
      .setColor(0x5865F2)
      .setDescription('Full-featured development platform with Claude Code CLI integration!')
      .addFields(
        {
          name: '🤖 Core Commands',
          value: '`/claude` - Start Claude session\n`/code` - Submit code with instructions\n`/session` - Manage sessions\n`/quick` - Quick code actions',
          inline: true
        },
        {
          name: '📁 File Operations',
          value: '`/file read` - Read files\n`/file write` - Write files\n`/file edit` - Edit files\n`/file search` - Search in files\n`/file tree` - Directory tree',
          inline: true
        },
        {
          name: '🌐 Web Tools',
          value: '`/web search` - Search the web\n`/web fetch` - Fetch URLs\n`/web scrape` - Scrape pages\n`/web docs` - Search docs',
          inline: true
        },
        {
          name: '💻 System Commands',
          value: '`/bash run` - Execute commands\n`/bash script` - Run scripts\n`/bash background` - Background tasks\n`/bash ps` - List processes',
          inline: true
        },
        {
          name: '🔀 Git Operations',
          value: '`/git status` - Repository status\n`/git commit` - Create commits\n`/git branch` - Manage branches\n`/git push` - Push changes',
          inline: true
        },
        {
          name: '🐙 GitHub Integration',
          value: '`/github pr` - Pull requests\n`/github issue` - Issues\n`/github workflow` - Actions\n`/github release` - Releases',
          inline: true
        },
        {
          name: '🔘 Button Controls',
          value: '**Continue** - Continue conversation\n**Regenerate** - Regenerate response\n**Stop** - Stop current operation\n**Branch** - Create conversation branch\n**Debug** - View debug info',
          inline: false
        },
        {
          name: '⚡ Quick Tips',
          value: '• Mention the bot to start a conversation\n• React with 👍 to continue, 🔄 to regenerate\n• Sessions persist across restarts\n• Use threads for organized conversations',
          inline: false
        },
        {
          name: '🔧 Configuration',
          value: 'Sessions auto-save and can be exported\nMultiple models available\nFile attachments supported',
          inline: false
        }
      )
      .setFooter({ text: 'Powered by Claude Code CLI' })
      .setTimestamp();
    
    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setLabel('Documentation')
          .setStyle(ButtonStyle.Link)
          .setURL('https://github.com/yourusername/claude-discord-bridge')
          .setEmoji('📖'),
        new ButtonBuilder()
          .setCustomId('feedback')
          .setLabel('Send Feedback')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('💬')
      );
    
    await interaction.reply({
      embeds: [embed],
      components: [buttons],
      ephemeral: true
    });
  }
};

// Core commands
commands.set('claude', claudeCommand);
commands.set('code', codeCommand);
commands.set('session', sessionCommand);
commands.set('quick', quickCommand);
commands.set('help', helpCommand);

// File operations
commands.set('file', fileCommand);

// Web integration
commands.set('web', webCommand);

// Bash execution
commands.set('bash', bashCommand);

// Git operations
commands.set('git', gitCommand);

// GitHub integration
commands.set('github', githubCommand);

export async function registerCommands(token: string, clientId: string, guildId?: string): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(token);
  
  try {
    // Combine slash commands and context menu commands
    const slashCommandData = Array.from(commands.values()).map(cmd => cmd.data.toJSON());
    const contextMenuData = contextMenuCommands.map(cmd => cmd.data.toJSON());
    const allCommands = [...slashCommandData, ...contextMenuData];
    
    if (guildId) {
      await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: allCommands }
      );
      logger.info(`Registered ${slashCommandData.length} slash commands and ${contextMenuData.length} context menu commands (guild)`);
    } else {
      await rest.put(
        Routes.applicationCommands(clientId),
        { body: allCommands }
      );
      logger.info(`Registered ${slashCommandData.length} slash commands and ${contextMenuData.length} context menu commands (global)`);
    }
  } catch (error) {
    logger.error('Failed to register commands:', error);
    throw error;
  }
}