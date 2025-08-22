import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  codeBlock,
  AttachmentBuilder
} from 'discord.js';
import { SessionManager } from '../../claude/session-manager';
import { GitManager } from '../../claude/git-manager';
import { logger } from '../../utils/logger';
import simpleGit, { SimpleGit, StatusResult, DiffResult } from 'simple-git';
import path from 'path';

export const gitCommand = {
  data: new SlashCommandBuilder()
    .setName('git')
    .setDescription('Git version control operations')
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('Show repository status')
        .addBooleanOption(option =>
          option
            .setName('detailed')
            .setDescription('Show detailed status')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('diff')
        .setDescription('Show changes')
        .addStringOption(option =>
          option
            .setName('file')
            .setDescription('Specific file to diff')
            .setRequired(false)
            .setAutocomplete(true)
        )
        .addBooleanOption(option =>
          option
            .setName('staged')
            .setDescription('Show staged changes')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('commit')
        .setDescription('Create a commit')
        .addStringOption(option =>
          option
            .setName('message')
            .setDescription('Commit message (or let Claude generate one)')
            .setRequired(false)
        )
        .addBooleanOption(option =>
          option
            .setName('all')
            .setDescription('Stage all changes before commit')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('branch')
        .setDescription('Branch operations')
        .addStringOption(option =>
          option
            .setName('action')
            .setDescription('Branch action')
            .setRequired(true)
            .addChoices(
              { name: 'List', value: 'list' },
              { name: 'Create', value: 'create' },
              { name: 'Switch', value: 'switch' },
              { name: 'Delete', value: 'delete' },
              { name: 'Rename', value: 'rename' }
            )
        )
        .addStringOption(option =>
          option
            .setName('name')
            .setDescription('Branch name')
            .setRequired(false)
            .setAutocomplete(true)
        )
        .addStringOption(option =>
          option
            .setName('new_name')
            .setDescription('New branch name (for rename)')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('log')
        .setDescription('Show commit history')
        .addIntegerOption(option =>
          option
            .setName('limit')
            .setDescription('Number of commits to show')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(50)
        )
        .addBooleanOption(option =>
          option
            .setName('graph')
            .setDescription('Show branch graph')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('author')
            .setDescription('Filter by author')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('stash')
        .setDescription('Stash operations')
        .addStringOption(option =>
          option
            .setName('action')
            .setDescription('Stash action')
            .setRequired(true)
            .addChoices(
              { name: 'Save', value: 'save' },
              { name: 'List', value: 'list' },
              { name: 'Apply', value: 'apply' },
              { name: 'Pop', value: 'pop' },
              { name: 'Drop', value: 'drop' },
              { name: 'Clear', value: 'clear' }
            )
        )
        .addStringOption(option =>
          option
            .setName('message')
            .setDescription('Stash message')
            .setRequired(false)
        )
        .addIntegerOption(option =>
          option
            .setName('index')
            .setDescription('Stash index')
            .setRequired(false)
            .setMinValue(0)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('merge')
        .setDescription('Merge branches')
        .addStringOption(option =>
          option
            .setName('branch')
            .setDescription('Branch to merge')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addBooleanOption(option =>
          option
            .setName('no_ff')
            .setDescription('No fast-forward merge')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('push')
        .setDescription('Push to remote')
        .addStringOption(option =>
          option
            .setName('remote')
            .setDescription('Remote name')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('branch')
            .setDescription('Branch to push')
            .setRequired(false)
            .setAutocomplete(true)
        )
        .addBooleanOption(option =>
          option
            .setName('force')
            .setDescription('Force push (use with caution!)')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('pull')
        .setDescription('Pull from remote')
        .addStringOption(option =>
          option
            .setName('remote')
            .setDescription('Remote name')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('branch')
            .setDescription('Branch to pull')
            .setRequired(false)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('clone')
        .setDescription('Clone a repository')
        .addStringOption(option =>
          option
            .setName('url')
            .setDescription('Repository URL')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('directory')
            .setDescription('Target directory')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('init')
        .setDescription('Initialize a new repository')
        .addStringOption(option =>
          option
            .setName('directory')
            .setDescription('Directory to initialize')
            .setRequired(false)
        )
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction, sessionManager: SessionManager) {
    const subcommand = interaction.options.getSubcommand();
    const session = sessionManager.getSessionByChannel(interaction.channelId);
    
    if (!session) {
      await interaction.reply({
        content: '❌ No active session. Use `/claude chat` to start.',
        ephemeral: true
      });
      return;
    }

    const gitManager = new GitManager(session.projectPath || process.cwd());

    switch (subcommand) {
      case 'status':
        await this.handleStatus(interaction, gitManager, session);
        break;
      case 'diff':
        await this.handleDiff(interaction, gitManager, session);
        break;
      case 'commit':
        await this.handleCommit(interaction, gitManager, session);
        break;
      case 'branch':
        await this.handleBranch(interaction, gitManager, session);
        break;
      case 'log':
        await this.handleLog(interaction, gitManager, session);
        break;
      case 'stash':
        await this.handleStash(interaction, gitManager, session);
        break;
      case 'merge':
        await this.handleMerge(interaction, gitManager, session);
        break;
      case 'push':
        await this.handlePush(interaction, gitManager, session);
        break;
      case 'pull':
        await this.handlePull(interaction, gitManager, session);
        break;
      case 'clone':
        await this.handleClone(interaction, gitManager, session);
        break;
      case 'init':
        await this.handleInit(interaction, gitManager, session);
        break;
    }
  },

  async autocomplete(interaction: AutocompleteInteraction, sessionManager: SessionManager) {
    const session = sessionManager.getSessionByChannel(interaction.channelId);
    if (!session) {
      await interaction.respond([]);
      return;
    }

    const gitManager = new GitManager(session.projectPath || process.cwd());
    const focused = interaction.options.getFocused(true);

    if (focused.name === 'file') {
      const files = await gitManager.getModifiedFiles();
      const choices = files
        .filter(f => f.toLowerCase().includes(focused.value.toLowerCase()))
        .slice(0, 25)
        .map(f => ({ name: f, value: f }));
      
      await interaction.respond(choices);
    } else if (focused.name === 'branch' || focused.name === 'name') {
      const branches = await gitManager.getBranches();
      const choices = branches
        .filter(b => b.toLowerCase().includes(focused.value.toLowerCase()))
        .slice(0, 25)
        .map(b => ({ name: b, value: b }));
      
      await interaction.respond(choices);
    }
  },

  async handleStatus(interaction: ChatInputCommandInteraction, gitManager: GitManager, session: any) {
    await interaction.deferReply();

    try {
      const status = await gitManager.getStatus();
      const detailed = interaction.options.getBoolean('detailed');

      const embed = new EmbedBuilder()
        .setTitle('📊 Git Status')
        .setColor(status.files.length > 0 ? 0xFFA500 : 0x00FF00)
        .addFields(
          { name: 'Branch', value: status.current || 'Unknown', inline: true },
          { name: 'Tracking', value: status.tracking || 'None', inline: true },
          { name: 'Changes', value: String(status.files.length), inline: true }
        );

      if (status.ahead > 0 || status.behind > 0) {
        embed.addFields({
          name: 'Remote Status',
          value: `↑ ${status.ahead} ahead, ↓ ${status.behind} behind`,
          inline: true
        });
      }

      if (status.files.length > 0) {
        const staged = status.files.filter(f => f.index !== ' ' && f.index !== '?');
        const unstaged = status.files.filter(f => f.working_dir !== ' ');
        const untracked = status.files.filter(f => f.working_dir === '?' && f.index === '?');

        if (staged.length > 0) {
          embed.addFields({
            name: `✅ Staged (${staged.length})`,
            value: staged.slice(0, 10).map(f => `\`${f.path}\``).join(', ') + 
                   (staged.length > 10 ? ` +${staged.length - 10} more` : ''),
            inline: false
          });
        }

        if (unstaged.length > 0) {
          embed.addFields({
            name: `📝 Modified (${unstaged.length})`,
            value: unstaged.slice(0, 10).map(f => `\`${f.path}\``).join(', ') +
                   (unstaged.length > 10 ? ` +${unstaged.length - 10} more` : ''),
            inline: false
          });
        }

        if (untracked.length > 0) {
          embed.addFields({
            name: `❓ Untracked (${untracked.length})`,
            value: untracked.slice(0, 10).map(f => `\`${f.path}\``).join(', ') +
                   (untracked.length > 10 ? ` +${untracked.length - 10} more` : ''),
            inline: false
          });
        }
      } else {
        embed.setDescription('✨ Working tree clean');
      }

      // Add action buttons
      const row = new ActionRowBuilder<ButtonBuilder>();
      
      if (status.files.length > 0) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`git_stage_all`)
            .setLabel('Stage All')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('➕'),
          new ButtonBuilder()
            .setCustomId(`git_commit`)
            .setLabel('Commit')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅'),
          new ButtonBuilder()
            .setCustomId(`git_diff`)
            .setLabel('View Diff')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔍')
        );
      }
      
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`git_refresh_status`)
          .setLabel('Refresh')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🔄')
      );

      await interaction.editReply({ 
        embeds: [embed],
        components: status.files.length > 0 || row.components.length > 0 ? [row] : []
      });

      // Send to Claude for context
      await session.sendMessage(`Git status: ${status.current} branch with ${status.files.length} changes`);

    } catch (error) {
      await interaction.editReply({
        content: `❌ Error getting git status: ${error.message}`
      });
    }
  },

  async handleDiff(interaction: ChatInputCommandInteraction, gitManager: GitManager, session: any) {
    await interaction.deferReply();

    try {
      const file = interaction.options.getString('file');
      const staged = interaction.options.getBoolean('staged');
      
      const diff = await gitManager.getDiff(file, staged);

      if (!diff || diff.trim().length === 0) {
        await interaction.editReply({
          content: '📄 No changes to show'
        });
        return;
      }

      // Format diff for Discord
      const lines = diff.split('\n');
      const formattedDiff = lines.map(line => {
        if (line.startsWith('+')) return `+ ${line.substring(1)}`;
        if (line.startsWith('-')) return `- ${line.substring(1)}`;
        if (line.startsWith('@')) return `@ ${line.substring(1)}`;
        return `  ${line}`;
      }).join('\n');

      if (formattedDiff.length <= 4000) {
        const embed = new EmbedBuilder()
          .setTitle(`📝 Git Diff${file ? `: ${file}` : ''}`)
          .setDescription(codeBlock('diff', formattedDiff.substring(0, 4000)))
          .setColor(0x3498DB)
          .setFooter({ text: staged ? 'Showing staged changes' : 'Showing unstaged changes' });

        await interaction.editReply({ embeds: [embed] });
      } else {
        // Send as file if diff is large
        const buffer = Buffer.from(formattedDiff);
        const attachment = new AttachmentBuilder(buffer, { 
          name: `diff-${file || 'all'}.patch` 
        });

        await interaction.editReply({
          content: `📝 Diff is too large for Discord. Sent as attachment.`,
          files: [attachment]
        });
      }

      // Send to Claude for analysis
      await session.sendMessage(`Git diff${file ? ` for ${file}` : ''}:\n${formattedDiff.substring(0, 2000)}`);

    } catch (error) {
      await interaction.editReply({
        content: `❌ Error getting diff: ${error.message}`
      });
    }
  },

  async handleCommit(interaction: ChatInputCommandInteraction, gitManager: GitManager, session: any) {
    const message = interaction.options.getString('message');
    const stageAll = interaction.options.getBoolean('all');

    if (message) {
      // Direct commit with provided message
      await interaction.deferReply();

      try {
        if (stageAll) {
          await gitManager.stageAll();
        }

        const result = await gitManager.commit(message);
        
        const embed = new EmbedBuilder()
          .setTitle('✅ Commit Created')
          .setColor(0x00FF00)
          .setDescription(`Successfully committed changes`)
          .addFields(
            { name: 'Message', value: message, inline: false },
            { name: 'Hash', value: `\`${result.commit}\``, inline: true },
            { name: 'Branch', value: result.branch, inline: true }
          );

        await interaction.editReply({ embeds: [embed] });
        await session.sendMessage(`Created commit: ${message}`);

      } catch (error) {
        await interaction.editReply({
          content: `❌ Commit failed: ${error.message}`
        });
      }
    } else {
      // Show modal for commit message or generate with Claude
      const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
      
      const modal = new ModalBuilder()
        .setCustomId('git_commit_modal')
        .setTitle('Create Git Commit');
      
      const messageInput = new TextInputBuilder()
        .setCustomId('message')
        .setLabel('Commit Message')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Enter commit message or leave empty for Claude to generate')
        .setRequired(false)
        .setMaxLength(500);
      
      const descriptionInput = new TextInputBuilder()
        .setCustomId('description')
        .setLabel('Extended Description (optional)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(2000);
      
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(messageInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput)
      );
      
      await interaction.showModal(modal);
    }
  },

  async handleBranch(interaction: ChatInputCommandInteraction, gitManager: GitManager, session: any) {
    await interaction.deferReply();

    const action = interaction.options.getString('action', true);
    const name = interaction.options.getString('name');
    const newName = interaction.options.getString('new_name');

    try {
      switch (action) {
        case 'list': {
          const branches = await gitManager.getBranches();
          const current = await gitManager.getCurrentBranch();
          
          const embed = new EmbedBuilder()
            .setTitle('🌿 Git Branches')
            .setColor(0x00FF00)
            .setDescription(branches.map(b => 
              b === current ? `**➤ ${b}** (current)` : `   ${b}`
            ).join('\n'));

          // Add branch management buttons
          const row = new ActionRowBuilder<StringSelectMenuBuilder>()
            .addComponents(
              new StringSelectMenuBuilder()
                .setCustomId('git_branch_switch')
                .setPlaceholder('Switch to branch...')
                .addOptions(
                  branches
                    .filter(b => b !== current)
                    .slice(0, 25)
                    .map(b => ({
                      label: b,
                      value: b,
                      description: `Switch to ${b} branch`
                    }))
                )
            );

          await interaction.editReply({ 
            embeds: [embed],
            components: branches.length > 1 ? [row] : []
          });
          break;
        }

        case 'create': {
          if (!name) {
            await interaction.editReply({
              content: '❌ Branch name is required for create action'
            });
            return;
          }
          
          await gitManager.createBranch(name);
          await interaction.editReply({
            content: `✅ Created branch: \`${name}\``
          });
          await session.sendMessage(`Created git branch: ${name}`);
          break;
        }

        case 'switch': {
          if (!name) {
            await interaction.editReply({
              content: '❌ Branch name is required for switch action'
            });
            return;
          }
          
          await gitManager.switchBranch(name);
          await interaction.editReply({
            content: `✅ Switched to branch: \`${name}\``
          });
          await session.sendMessage(`Switched to git branch: ${name}`);
          break;
        }

        case 'delete': {
          if (!name) {
            await interaction.editReply({
              content: '❌ Branch name is required for delete action'
            });
            return;
          }
          
          await gitManager.deleteBranch(name);
          await interaction.editReply({
            content: `✅ Deleted branch: \`${name}\``
          });
          await session.sendMessage(`Deleted git branch: ${name}`);
          break;
        }

        case 'rename': {
          if (!name || !newName) {
            await interaction.editReply({
              content: '❌ Both current and new branch names are required for rename'
            });
            return;
          }
          
          await gitManager.renameBranch(name, newName);
          await interaction.editReply({
            content: `✅ Renamed branch \`${name}\` to \`${newName}\``
          });
          await session.sendMessage(`Renamed git branch: ${name} → ${newName}`);
          break;
        }
      }
    } catch (error) {
      await interaction.editReply({
        content: `❌ Branch operation failed: ${error.message}`
      });
    }
  },

  async handleLog(interaction: ChatInputCommandInteraction, gitManager: GitManager, session: any) {
    await interaction.deferReply();

    try {
      const limit = interaction.options.getInteger('limit') || 10;
      const graph = interaction.options.getBoolean('graph');
      const author = interaction.options.getString('author');

      const commits = await gitManager.getLog(limit, graph, author);

      if (commits.length === 0) {
        await interaction.editReply({
          content: '📋 No commits found'
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle('📜 Git Log')
        .setColor(0x5865F2)
        .setDescription(`Showing ${commits.length} most recent commits`);

      // Format commits for display
      commits.slice(0, 10).forEach(commit => {
        const date = new Date(commit.date).toLocaleDateString();
        embed.addFields({
          name: `${commit.message.substring(0, 100)}`,
          value: [
            `**Hash:** \`${commit.hash.substring(0, 7)}\``,
            `**Author:** ${commit.author_name}`,
            `**Date:** ${date}`
          ].join('\n'),
          inline: false
        });
      });

      if (commits.length > 10) {
        embed.setFooter({ text: `Showing 10 of ${commits.length} commits` });
      }

      await interaction.editReply({ embeds: [embed] });

      // Send summary to Claude
      await session.sendMessage(
        `Git log summary: ${commits.length} commits, ` +
        `latest: "${commits[0]?.message}" by ${commits[0]?.author_name}`
      );

    } catch (error) {
      await interaction.editReply({
        content: `❌ Error getting log: ${error.message}`
      });
    }
  },

  async handleStash(interaction: ChatInputCommandInteraction, gitManager: GitManager, session: any) {
    await interaction.deferReply();

    const action = interaction.options.getString('action', true);
    const message = interaction.options.getString('message');
    const index = interaction.options.getInteger('index');

    try {
      switch (action) {
        case 'save': {
          await gitManager.stash(message);
          await interaction.editReply({
            content: `✅ Changes stashed${message ? `: ${message}` : ''}`
          });
          break;
        }

        case 'list': {
          const stashes = await gitManager.stashList();
          
          if (stashes.length === 0) {
            await interaction.editReply({
              content: '📋 No stashes found'
            });
            return;
          }

          const embed = new EmbedBuilder()
            .setTitle('📦 Git Stashes')
            .setColor(0x9B59B6)
            .setDescription(stashes.map((s, i) => 
              `**${i}:** ${s}`
            ).join('\n'));

          await interaction.editReply({ embeds: [embed] });
          break;
        }

        case 'apply':
        case 'pop': {
          await gitManager.stashApply(index || 0, action === 'pop');
          await interaction.editReply({
            content: `✅ Stash ${action === 'pop' ? 'popped' : 'applied'}${index !== undefined ? ` at index ${index}` : ''}`
          });
          break;
        }

        case 'drop': {
          await gitManager.stashDrop(index || 0);
          await interaction.editReply({
            content: `✅ Dropped stash${index !== undefined ? ` at index ${index}` : ''}`
          });
          break;
        }

        case 'clear': {
          await gitManager.stashClear();
          await interaction.editReply({
            content: '✅ Cleared all stashes'
          });
          break;
        }
      }

      await session.sendMessage(`Git stash ${action} completed`);

    } catch (error) {
      await interaction.editReply({
        content: `❌ Stash operation failed: ${error.message}`
      });
    }
  },

  async handleMerge(interaction: ChatInputCommandInteraction, gitManager: GitManager, session: any) {
    await interaction.deferReply();

    try {
      const branch = interaction.options.getString('branch', true);
      const noFf = interaction.options.getBoolean('no_ff');

      const result = await gitManager.merge(branch, noFf);

      if (result.conflicts.length > 0) {
        const embed = new EmbedBuilder()
          .setTitle('⚠️ Merge Conflicts')
          .setColor(0xFF0000)
          .setDescription(`Merge resulted in conflicts that need to be resolved`)
          .addFields({
            name: 'Conflicted Files',
            value: result.conflicts.map(f => `\`${f}\``).join('\n'),
            inline: false
          });

        // Add conflict resolution buttons
        const row = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('git_conflict_abort')
              .setLabel('Abort Merge')
              .setStyle(ButtonStyle.Danger)
              .setEmoji('❌'),
            new ButtonBuilder()
              .setCustomId('git_conflict_help')
              .setLabel('Get Help')
              .setStyle(ButtonStyle.Primary)
              .setEmoji('❓')
          );

        await interaction.editReply({ 
          embeds: [embed],
          components: [row]
        });

        await session.sendMessage(
          `Merge conflict detected with ${result.conflicts.length} files. ` +
          `Help me resolve the conflicts.`
        );
      } else {
        const embed = new EmbedBuilder()
          .setTitle('✅ Merge Successful')
          .setColor(0x00FF00)
          .setDescription(`Successfully merged \`${branch}\` into current branch`)
          .addFields(
            { name: 'Merged', value: branch, inline: true },
            { name: 'Fast-forward', value: noFf ? 'No' : 'Yes', inline: true }
          );

        await interaction.editReply({ embeds: [embed] });
        await session.sendMessage(`Successfully merged ${branch}`);
      }

    } catch (error) {
      await interaction.editReply({
        content: `❌ Merge failed: ${error.message}`
      });
    }
  },

  async handlePush(interaction: ChatInputCommandInteraction, gitManager: GitManager, session: any) {
    await interaction.deferReply();

    try {
      const remote = interaction.options.getString('remote') || 'origin';
      const branch = interaction.options.getString('branch');
      const force = interaction.options.getBoolean('force');

      if (force) {
        // Add confirmation for force push
        const embed = new EmbedBuilder()
          .setTitle('⚠️ Force Push Warning')
          .setColor(0xFF0000)
          .setDescription('Force pushing can overwrite remote history. Are you sure?');

        const row = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`git_force_push_confirm_${remote}_${branch}`)
              .setLabel('Confirm Force Push')
              .setStyle(ButtonStyle.Danger)
              .setEmoji('⚠️'),
            new ButtonBuilder()
              .setCustomId('git_force_push_cancel')
              .setLabel('Cancel')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('❌')
          );

        await interaction.editReply({ 
          embeds: [embed],
          components: [row]
        });
        return;
      }

      const result = await gitManager.push(remote, branch, force);

      const embed = new EmbedBuilder()
        .setTitle('✅ Push Successful')
        .setColor(0x00FF00)
        .setDescription('Successfully pushed to remote')
        .addFields(
          { name: 'Remote', value: remote, inline: true },
          { name: 'Branch', value: branch || 'current', inline: true }
        );

      await interaction.editReply({ embeds: [embed] });
      await session.sendMessage(`Pushed to ${remote}/${branch || 'current branch'}`);

    } catch (error) {
      await interaction.editReply({
        content: `❌ Push failed: ${error.message}`
      });
    }
  },

  async handlePull(interaction: ChatInputCommandInteraction, gitManager: GitManager, session: any) {
    await interaction.deferReply();

    try {
      const remote = interaction.options.getString('remote') || 'origin';
      const branch = interaction.options.getString('branch');

      const result = await gitManager.pull(remote, branch);

      const embed = new EmbedBuilder()
        .setTitle('✅ Pull Successful')
        .setColor(0x00FF00)
        .setDescription('Successfully pulled from remote')
        .addFields(
          { name: 'Remote', value: remote, inline: true },
          { name: 'Branch', value: branch || 'current', inline: true },
          { name: 'Files Changed', value: String(result.files?.length || 0), inline: true }
        );

      if (result.summary) {
        embed.addFields({
          name: 'Summary',
          value: `+${result.summary.insertions} -${result.summary.deletions}`,
          inline: false
        });
      }

      await interaction.editReply({ embeds: [embed] });
      await session.sendMessage(`Pulled from ${remote}/${branch || 'current branch'}`);

    } catch (error) {
      await interaction.editReply({
        content: `❌ Pull failed: ${error.message}`
      });
    }
  },

  async handleClone(interaction: ChatInputCommandInteraction, gitManager: GitManager, session: any) {
    await interaction.deferReply();

    try {
      const url = interaction.options.getString('url', true);
      const directory = interaction.options.getString('directory');

      await gitManager.clone(url, directory);

      const embed = new EmbedBuilder()
        .setTitle('✅ Repository Cloned')
        .setColor(0x00FF00)
        .setDescription('Successfully cloned repository')
        .addFields(
          { name: 'URL', value: url, inline: false },
          { name: 'Directory', value: directory || 'default', inline: true }
        );

      await interaction.editReply({ embeds: [embed] });
      await session.sendMessage(`Cloned repository: ${url}`);

    } catch (error) {
      await interaction.editReply({
        content: `❌ Clone failed: ${error.message}`
      });
    }
  },

  async handleInit(interaction: ChatInputCommandInteraction, gitManager: GitManager, session: any) {
    await interaction.deferReply();

    try {
      const directory = interaction.options.getString('directory') || '.';

      await gitManager.init(directory);

      const embed = new EmbedBuilder()
        .setTitle('✅ Repository Initialized')
        .setColor(0x00FF00)
        .setDescription('Successfully initialized new Git repository')
        .addFields(
          { name: 'Directory', value: directory, inline: true },
          { name: 'Branch', value: 'main', inline: true }
        );

      await interaction.editReply({ embeds: [embed] });
      await session.sendMessage(`Initialized git repository in ${directory}`);

    } catch (error) {
      await interaction.editReply({
        content: `❌ Init failed: ${error.message}`
      });
    }
  }
};