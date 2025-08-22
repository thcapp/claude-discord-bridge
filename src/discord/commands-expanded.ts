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
  AutocompleteInteraction,
  AttachmentBuilder,
  PermissionFlagsBits
} from 'discord.js';
import { SessionManager } from '../claude/session-manager';
import { ComponentHandler } from '../interactions/component-handler';
import { config } from '../config';
import { logger } from '../utils/logger';
import fs from 'fs/promises';
import path from 'path';

interface Command {
  data: SlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction, sessionManager: SessionManager) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction, sessionManager: SessionManager) => Promise<void>;
}

export const commands = new Collection<string, Command>();

// ============================================================================
// /claude - Main Claude interaction command with subcommands
// ============================================================================
const claudeCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('claude')
    .setDescription('Interact with Claude Code')
    .addSubcommand(subcommand =>
      subcommand
        .setName('chat')
        .setDescription('Start or continue a chat with Claude')
        .addStringOption(option =>
          option
            .setName('message')
            .setDescription('Your message to Claude')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('model')
            .setDescription('Claude model to use')
            .setRequired(false)
            .addChoices(
              { name: 'Claude 3 Opus (Most Capable)', value: 'opus' },
              { name: 'Claude 3.5 Sonnet (Balanced)', value: 'sonnet' },
              { name: 'Claude 3 Haiku (Fastest)', value: 'haiku' }
            )
        )
        .addStringOption(option =>
          option
            .setName('project')
            .setDescription('Project directory to work in')
            .setRequired(false)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('continue')
        .setDescription('Continue the current conversation')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('regenerate')
        .setDescription('Regenerate the last response')
        .addStringOption(option =>
          option
            .setName('feedback')
            .setDescription('Optional feedback for better regeneration')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('stop')
        .setDescription('Stop the current Claude operation')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('branch')
        .setDescription('Create a new conversation branch from current point')
        .addStringOption(option =>
          option
            .setName('name')
            .setDescription('Name for the new branch')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('model')
        .setDescription('Switch Claude model for current session')
        .addStringOption(option =>
          option
            .setName('model')
            .setDescription('Model to switch to')
            .setRequired(true)
            .addChoices(
              { name: 'Claude 3 Opus', value: 'opus' },
              { name: 'Claude 3.5 Sonnet', value: 'sonnet' },
              { name: 'Claude 3 Haiku', value: 'haiku' }
            )
        )
    ) as SlashCommandBuilder,
    
  async execute(interaction, sessionManager) {
    const subcommand = interaction.options.getSubcommand();
    
    switch (subcommand) {
      case 'chat':
        await this.handleChat(interaction, sessionManager);
        break;
      case 'continue':
        await this.handleContinue(interaction, sessionManager);
        break;
      case 'regenerate':
        await this.handleRegenerate(interaction, sessionManager);
        break;
      case 'stop':
        await this.handleStop(interaction, sessionManager);
        break;
      case 'branch':
        await this.handleBranch(interaction, sessionManager);
        break;
      case 'model':
        await this.handleModelSwitch(interaction, sessionManager);
        break;
    }
  },

  async autocomplete(interaction, sessionManager) {
    const focused = interaction.options.getFocused(true);
    
    if (focused.name === 'project') {
      const projects = await this.getProjectDirectories();
      const filtered = projects
        .filter(p => p.toLowerCase().includes(focused.value.toLowerCase()))
        .slice(0, 25);
      
      await interaction.respond(
        filtered.map(p => ({ name: p, value: p }))
      );
    }
  },

  async handleChat(interaction: ChatInputCommandInteraction, sessionManager: SessionManager) {
    await interaction.deferReply();
    
    const message = interaction.options.getString('message');
    const model = interaction.options.getString('model');
    const project = interaction.options.getString('project');
    
    const session = await sessionManager.getOrCreateSession(
      interaction.user.id,
      interaction.channelId
    );
    
    if (model) await session.setModel(model);
    if (project) await session.setProject(project);
    
    const componentHandler = new ComponentHandler(sessionManager);
    const controlPanel = componentHandler.createControlPanel(session.id);
    
    const embed = new EmbedBuilder()
      .setTitle('🤖 Claude Session')
      .setColor(0x5865F2)
      .setDescription(message ? 'Processing your message...' : 'Session ready. Send your message or use the controls below.')
      .addFields(
        { name: 'Session', value: `\`${session.id}\``, inline: true },
        { name: 'Model', value: model || 'default', inline: true },
        { name: 'Status', value: '🟢 Active', inline: true }
      );
    
    if (project) {
      embed.addFields({ name: 'Project', value: project, inline: true });
    }
    
    embed.setFooter({ text: 'Use /help for more commands' }).setTimestamp();
    
    await interaction.editReply({
      embeds: [embed],
      components: [controlPanel]
    });
    
    if (message) {
      await session.sendMessage(message);
    }
  },

  async handleContinue(interaction: ChatInputCommandInteraction, sessionManager: SessionManager) {
    await interaction.deferReply();
    
    const session = sessionManager.getSessionByChannel(interaction.channelId);
    if (!session) {
      await interaction.editReply('❌ No active session in this channel. Use `/claude chat` to start.');
      return;
    }
    
    await session.continue();
    await interaction.editReply('▶️ Continuing conversation...');
  },

  async handleRegenerate(interaction: ChatInputCommandInteraction, sessionManager: SessionManager) {
    await interaction.deferReply();
    
    const session = sessionManager.getSessionByChannel(interaction.channelId);
    if (!session) {
      await interaction.editReply('❌ No active session in this channel.');
      return;
    }
    
    const feedback = interaction.options.getString('feedback');
    await session.regenerate(feedback);
    await interaction.editReply('🔄 Regenerating response...');
  },

  async handleStop(interaction: ChatInputCommandInteraction, sessionManager: SessionManager) {
    await interaction.deferReply();
    
    const session = sessionManager.getSessionByChannel(interaction.channelId);
    if (!session) {
      await interaction.editReply('❌ No active session in this channel.');
      return;
    }
    
    await session.stop();
    await interaction.editReply('⏹️ Operation stopped.');
  },

  async handleBranch(interaction: ChatInputCommandInteraction, sessionManager: SessionManager) {
    await interaction.deferReply();
    
    const session = sessionManager.getSessionByChannel(interaction.channelId);
    if (!session) {
      await interaction.editReply('❌ No active session in this channel.');
      return;
    }
    
    const name = interaction.options.getString('name');
    const newSession = await session.branch(name);
    
    await interaction.editReply(`🌿 Created new branch: \`${newSession.id}\``);
  },

  async handleModelSwitch(interaction: ChatInputCommandInteraction, sessionManager: SessionManager) {
    await interaction.deferReply();
    
    const session = sessionManager.getSessionByChannel(interaction.channelId);
    if (!session) {
      await interaction.editReply('❌ No active session in this channel.');
      return;
    }
    
    const model = interaction.options.getString('model', true);
    await session.setModel(model);
    
    await interaction.editReply(`✅ Switched to ${model} model.`);
  },

  async getProjectDirectories(): Promise<string[]> {
    try {
      const basePath = config.claude.projectBasePath;
      const dirs = await fs.readdir(basePath, { withFileTypes: true });
      return dirs
        .filter(d => d.isDirectory())
        .map(d => d.name);
    } catch {
      return [];
    }
  }
};

// ============================================================================
// /code - Enhanced code submission with multiple modes
// ============================================================================
const codeCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('code')
    .setDescription('Work with code using Claude')
    .addSubcommand(subcommand =>
      subcommand
        .setName('review')
        .setDescription('Submit code for review')
        .addAttachmentOption(option =>
          option
            .setName('file')
            .setDescription('Code file to review')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('fix')
        .setDescription('Fix errors in code')
        .addStringOption(option =>
          option
            .setName('error')
            .setDescription('Error message or description')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('refactor')
        .setDescription('Refactor code for better quality')
        .addStringOption(option =>
          option
            .setName('goal')
            .setDescription('Refactoring goal (performance, readability, etc.)')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('explain')
        .setDescription('Get detailed code explanation')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('test')
        .setDescription('Generate tests for code')
        .addStringOption(option =>
          option
            .setName('framework')
            .setDescription('Testing framework to use')
            .setRequired(false)
            .addChoices(
              { name: 'Jest', value: 'jest' },
              { name: 'Mocha', value: 'mocha' },
              { name: 'Pytest', value: 'pytest' },
              { name: 'JUnit', value: 'junit' },
              { name: 'RSpec', value: 'rspec' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('document')
        .setDescription('Generate documentation for code')
        .addStringOption(option =>
          option
            .setName('style')
            .setDescription('Documentation style')
            .setRequired(false)
            .addChoices(
              { name: 'JSDoc', value: 'jsdoc' },
              { name: 'TypeDoc', value: 'typedoc' },
              { name: 'Docstring', value: 'docstring' },
              { name: 'Markdown', value: 'markdown' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('convert')
        .setDescription('Convert code to another language')
        .addStringOption(option =>
          option
            .setName('language')
            .setDescription('Target programming language')
            .setRequired(true)
            .addChoices(
              { name: 'TypeScript', value: 'typescript' },
              { name: 'JavaScript', value: 'javascript' },
              { name: 'Python', value: 'python' },
              { name: 'Java', value: 'java' },
              { name: 'C++', value: 'cpp' },
              { name: 'Rust', value: 'rust' },
              { name: 'Go', value: 'go' },
              { name: 'Ruby', value: 'ruby' }
            )
        )
    ) as SlashCommandBuilder,
    
  async execute(interaction, sessionManager) {
    const subcommand = interaction.options.getSubcommand();
    
    // Show modal for code input
    const modal = new ModalBuilder()
      .setCustomId(`code_${subcommand}`)
      .setTitle(`Code ${subcommand.charAt(0).toUpperCase() + subcommand.slice(1)}`);
    
    const codeInput = new TextInputBuilder()
      .setCustomId('code')
      .setLabel('Your Code')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Paste your code here...')
      .setRequired(true)
      .setMaxLength(4000);
    
    const contextInput = new TextInputBuilder()
      .setCustomId('context')
      .setLabel(`Additional Context for ${subcommand}`)
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Any additional instructions or context...')
      .setRequired(false)
      .setMaxLength(1000);
    
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(codeInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(contextInput)
    );
    
    await interaction.showModal(modal);
  }
};

// ============================================================================
// /session - Comprehensive session management
// ============================================================================
const sessionCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('session')
    .setDescription('Manage Claude sessions')
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List all your sessions')
        .addBooleanOption(option =>
          option
            .setName('detailed')
            .setDescription('Show detailed information')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('info')
        .setDescription('Get information about current session')
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
        .setName('rename')
        .setDescription('Rename current session')
        .addStringOption(option =>
          option
            .setName('name')
            .setDescription('New name for the session')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('clear')
        .setDescription('Clear session history')
        .addStringOption(option =>
          option
            .setName('target')
            .setDescription('What to clear')
            .setRequired(true)
            .addChoices(
              { name: 'Current Session', value: 'current' },
              { name: 'All My Sessions', value: 'all' },
              { name: 'Inactive Sessions', value: 'inactive' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('export')
        .setDescription('Export session data')
        .addStringOption(option =>
          option
            .setName('format')
            .setDescription('Export format')
            .setRequired(false)
            .addChoices(
              { name: 'JSON', value: 'json' },
              { name: 'Markdown', value: 'markdown' },
              { name: 'Text', value: 'text' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('import')
        .setDescription('Import session from file')
        .addAttachmentOption(option =>
          option
            .setName('file')
            .setDescription('Session file to import')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('stats')
        .setDescription('View session statistics')
        .addStringOption(option =>
          option
            .setName('period')
            .setDescription('Time period for stats')
            .setRequired(false)
            .addChoices(
              { name: 'Today', value: 'today' },
              { name: 'This Week', value: 'week' },
              { name: 'This Month', value: 'month' },
              { name: 'All Time', value: 'all' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('history')
        .setDescription('View conversation history')
        .addIntegerOption(option =>
          option
            .setName('limit')
            .setDescription('Number of messages to show')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(50)
        )
    ) as SlashCommandBuilder,
    
  async execute(interaction, sessionManager) {
    const subcommand = interaction.options.getSubcommand();
    
    switch (subcommand) {
      case 'list':
        await this.handleList(interaction, sessionManager);
        break;
      case 'info':
        await this.handleInfo(interaction, sessionManager);
        break;
      case 'switch':
        await this.handleSwitch(interaction, sessionManager);
        break;
      case 'rename':
        await this.handleRename(interaction, sessionManager);
        break;
      case 'clear':
        await this.handleClear(interaction, sessionManager);
        break;
      case 'export':
        await this.handleExport(interaction, sessionManager);
        break;
      case 'import':
        await this.handleImport(interaction, sessionManager);
        break;
      case 'stats':
        await this.handleStats(interaction, sessionManager);
        break;
      case 'history':
        await this.handleHistory(interaction, sessionManager);
        break;
    }
  },

  async autocomplete(interaction, sessionManager) {
    const sessions = await sessionManager.getUserSessions(interaction.user.id);
    const focused = interaction.options.getFocused().toLowerCase();
    
    const choices = sessions
      .filter(s => s.id.toLowerCase().includes(focused) || s.name?.toLowerCase().includes(focused))
      .slice(0, 25)
      .map(s => ({
        name: s.name || s.id,
        value: s.id
      }));
    
    await interaction.respond(choices);
  },

  // Implementation methods would go here...
  async handleList(interaction: ChatInputCommandInteraction, sessionManager: SessionManager) {
    // Implementation
  },
  
  async handleInfo(interaction: ChatInputCommandInteraction, sessionManager: SessionManager) {
    // Implementation
  },
  
  // ... other handlers
};

// ============================================================================
// /project - Project workspace management
// ============================================================================
const projectCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('project')
    .setDescription('Manage project workspaces')
    .addSubcommand(subcommand =>
      subcommand
        .setName('create')
        .setDescription('Create a new project workspace')
        .addStringOption(option =>
          option
            .setName('name')
            .setDescription('Project name')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('template')
            .setDescription('Project template')
            .setRequired(false)
            .addChoices(
              { name: 'Node.js', value: 'nodejs' },
              { name: 'React', value: 'react' },
              { name: 'Python', value: 'python' },
              { name: 'Empty', value: 'empty' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List available projects')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('open')
        .setDescription('Open a project workspace')
        .addStringOption(option =>
          option
            .setName('name')
            .setDescription('Project to open')
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('files')
        .setDescription('List files in current project')
        .addStringOption(option =>
          option
            .setName('path')
            .setDescription('Directory path')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('run')
        .setDescription('Run a project command')
        .addStringOption(option =>
          option
            .setName('command')
            .setDescription('Command to run (e.g., npm test)')
            .setRequired(true)
        )
    ) as SlashCommandBuilder,
    
  async execute(interaction, sessionManager) {
    // Implementation
  }
};

// ============================================================================
// /tools - Claude's tool usage
// ============================================================================
const toolsCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('tools')
    .setDescription('Control Claude\'s tool usage')
    .addSubcommand(subcommand =>
      subcommand
        .setName('enable')
        .setDescription('Enable specific tools')
        .addStringOption(option =>
          option
            .setName('tool')
            .setDescription('Tool to enable')
            .setRequired(true)
            .addChoices(
              { name: 'Web Search', value: 'search' },
              { name: 'Calculator', value: 'calculator' },
              { name: 'Code Execution', value: 'execute' },
              { name: 'File System', value: 'filesystem' },
              { name: 'Git Operations', value: 'git' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('disable')
        .setDescription('Disable specific tools')
        .addStringOption(option =>
          option
            .setName('tool')
            .setDescription('Tool to disable')
            .setRequired(true)
            .addChoices(
              { name: 'Web Search', value: 'search' },
              { name: 'Calculator', value: 'calculator' },
              { name: 'Code Execution', value: 'execute' },
              { name: 'File System', value: 'filesystem' },
              { name: 'Git Operations', value: 'git' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List available tools and their status')
    ) as SlashCommandBuilder,
    
  async execute(interaction, sessionManager) {
    // Implementation
  }
};

// ============================================================================
// /admin - Administrative commands (restricted)
// ============================================================================
const adminCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Administrative commands')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('System status and health check')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('sessions')
        .setDescription('View all active sessions')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('cleanup')
        .setDescription('Clean up inactive sessions')
        .addIntegerOption(option =>
          option
            .setName('age')
            .setDescription('Cleanup sessions older than (hours)')
            .setRequired(false)
            .setMinValue(1)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('restart')
        .setDescription('Restart Claude CLI backend')
        .addStringOption(option =>
          option
            .setName('type')
            .setDescription('What to restart')
            .setRequired(true)
            .addChoices(
              { name: 'All Sessions', value: 'all' },
              { name: 'Tmux Backend', value: 'tmux' },
              { name: 'Database Connection', value: 'database' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('config')
        .setDescription('View or update configuration')
        .addStringOption(option =>
          option
            .setName('action')
            .setDescription('Configuration action')
            .setRequired(true)
            .addChoices(
              { name: 'View', value: 'view' },
              { name: 'Reload', value: 'reload' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('logs')
        .setDescription('View system logs')
        .addStringOption(option =>
          option
            .setName('level')
            .setDescription('Log level to show')
            .setRequired(false)
            .addChoices(
              { name: 'Error', value: 'error' },
              { name: 'Warning', value: 'warn' },
              { name: 'Info', value: 'info' },
              { name: 'Debug', value: 'debug' }
            )
        )
        .addIntegerOption(option =>
          option
            .setName('lines')
            .setDescription('Number of log lines')
            .setRequired(false)
            .setMinValue(10)
            .setMaxValue(100)
        )
    ) as SlashCommandBuilder,
    
  async execute(interaction, sessionManager) {
    // Check admin permissions
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({
        content: '❌ You need administrator permissions to use this command.',
        ephemeral: true
      });
      return;
    }
    
    // Implementation
  }
};

// ============================================================================
// /settings - User settings and preferences
// ============================================================================
const settingsCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Configure your preferences')
    .addSubcommand(subcommand =>
      subcommand
        .setName('view')
        .setDescription('View your current settings')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('model')
        .setDescription('Set default Claude model')
        .addStringOption(option =>
          option
            .setName('model')
            .setDescription('Default model')
            .setRequired(true)
            .addChoices(
              { name: 'Claude 3 Opus', value: 'opus' },
              { name: 'Claude 3.5 Sonnet', value: 'sonnet' },
              { name: 'Claude 3 Haiku', value: 'haiku' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('notifications')
        .setDescription('Configure notifications')
        .addBooleanOption(option =>
          option
            .setName('enabled')
            .setDescription('Enable notifications')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('threads')
        .setDescription('Configure auto-threading')
        .addBooleanOption(option =>
          option
            .setName('enabled')
            .setDescription('Auto-create threads')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('streaming')
        .setDescription('Configure response streaming')
        .addBooleanOption(option =>
          option
            .setName('enabled')
            .setDescription('Enable streaming')
            .setRequired(true)
        )
    ) as SlashCommandBuilder,
    
  async execute(interaction, sessionManager) {
    // Implementation
  }
};

// ============================================================================
// /help - Comprehensive help system
// ============================================================================
const helpCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Get help with Claude Discord Bridge')
    .addStringOption(option =>
      option
        .setName('topic')
        .setDescription('Help topic')
        .setRequired(false)
        .addChoices(
          { name: 'Getting Started', value: 'start' },
          { name: 'Commands', value: 'commands' },
          { name: 'Sessions', value: 'sessions' },
          { name: 'Code Features', value: 'code' },
          { name: 'Projects', value: 'projects' },
          { name: 'Shortcuts', value: 'shortcuts' },
          { name: 'Troubleshooting', value: 'troubleshoot' }
        )
    ) as SlashCommandBuilder,
    
  async execute(interaction, sessionManager) {
    const topic = interaction.options.getString('topic');
    
    let embed: EmbedBuilder;
    
    if (!topic || topic === 'commands') {
      embed = new EmbedBuilder()
        .setTitle('📚 Claude Discord Bridge - Commands')
        .setColor(0x5865F2)
        .setDescription('Complete command reference')
        .addFields(
          {
            name: '💬 Chat Commands',
            value: '`/claude chat` - Start conversation\n`/claude continue` - Continue\n`/claude regenerate` - Regenerate\n`/claude stop` - Stop operation',
            inline: false
          },
          {
            name: '💻 Code Commands',
            value: '`/code review` - Code review\n`/code fix` - Fix errors\n`/code refactor` - Refactor\n`/code test` - Generate tests',
            inline: false
          },
          {
            name: '📊 Session Commands',
            value: '`/session list` - List sessions\n`/session info` - Session info\n`/session export` - Export data\n`/session stats` - Statistics',
            inline: false
          },
          {
            name: '📁 Project Commands',
            value: '`/project create` - New project\n`/project open` - Open project\n`/project files` - List files\n`/project run` - Run commands',
            inline: false
          },
          {
            name: '⚙️ Settings & Help',
            value: '`/settings` - Preferences\n`/tools` - Tool control\n`/help` - This menu\n`/admin` - Admin tools',
            inline: false
          }
        );
    } else {
      // Handle other topics
      embed = this.getHelpEmbed(topic);
    }
    
    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setLabel('Documentation')
          .setStyle(ButtonStyle.Link)
          .setURL('https://github.com/yourusername/claude-discord-bridge')
          .setEmoji('📖'),
        new ButtonBuilder()
          .setLabel('Support')
          .setStyle(ButtonStyle.Link)
          .setURL('https://discord.gg/yoursupport')
          .setEmoji('💬'),
        new ButtonBuilder()
          .setCustomId('help_interactive')
          .setLabel('Interactive Tutorial')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🎮')
      );
    
    await interaction.reply({
      embeds: [embed],
      components: [buttons],
      ephemeral: true
    });
  },
  
  getHelpEmbed(topic: string): EmbedBuilder {
    // Return appropriate embed based on topic
    return new EmbedBuilder()
      .setTitle(`Help: ${topic}`)
      .setDescription('Topic-specific help content...');
  }
};

// Register all commands
commands.set('claude', claudeCommand);
commands.set('code', codeCommand);
commands.set('session', sessionCommand);
commands.set('project', projectCommand);
commands.set('tools', toolsCommand);
commands.set('admin', adminCommand);
commands.set('settings', settingsCommand);
commands.set('help', helpCommand);

// Export registration function
export async function registerCommands(token: string, clientId: string, guildId?: string): Promise<void> {
  const { REST } = await import('@discordjs/rest');
  const { Routes } = await import('discord-api-types/v10');
  
  const rest = new REST({ version: '10' }).setToken(token);
  
  try {
    const commandData = Array.from(commands.values()).map(cmd => cmd.data.toJSON());
    
    logger.info(`Registering ${commandData.length} commands...`);
    
    if (guildId) {
      await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: commandData }
      );
      logger.info(`Successfully registered ${commandData.length} guild commands`);
    } else {
      await rest.put(
        Routes.applicationCommands(clientId),
        { body: commandData }
      );
      logger.info(`Successfully registered ${commandData.length} global commands`);
    }
  } catch (error) {
    logger.error('Failed to register commands:', error);
    throw error;
  }
}