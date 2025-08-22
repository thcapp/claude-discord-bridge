import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  codeBlock,
  AttachmentBuilder
} from 'discord.js';
import { SessionManager } from '../../claude/session-manager';
import { logger } from '../../utils/logger';
import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';

export const fileCommand = {
  data: new SlashCommandBuilder()
    .setName('file')
    .setDescription('File system operations')
    .addSubcommand(subcommand =>
      subcommand
        .setName('read')
        .setDescription('Read a file from the project')
        .addStringOption(option =>
          option
            .setName('path')
            .setDescription('File path to read')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addIntegerOption(option =>
          option
            .setName('lines')
            .setDescription('Number of lines to show (default: all)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(500)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('write')
        .setDescription('Write or create a file')
        .addStringOption(option =>
          option
            .setName('path')
            .setDescription('File path to write')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('content')
            .setDescription('Initial content (or use modal for larger content)')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('edit')
        .setDescription('Edit an existing file')
        .addStringOption(option =>
          option
            .setName('path')
            .setDescription('File path to edit')
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('ls')
        .setDescription('List files in a directory')
        .addStringOption(option =>
          option
            .setName('path')
            .setDescription('Directory path (default: current)')
            .setRequired(false)
            .setAutocomplete(true)
        )
        .addBooleanOption(option =>
          option
            .setName('tree')
            .setDescription('Show as tree structure')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('search')
        .setDescription('Search for files by pattern')
        .addStringOption(option =>
          option
            .setName('pattern')
            .setDescription('Search pattern (glob or regex)')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('content')
            .setDescription('Search within file content')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('delete')
        .setDescription('Delete a file or directory')
        .addStringOption(option =>
          option
            .setName('path')
            .setDescription('Path to delete')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addBooleanOption(option =>
          option
            .setName('confirm')
            .setDescription('Confirm deletion')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('tree')
        .setDescription('Show project file tree')
        .addStringOption(option =>
          option
            .setName('path')
            .setDescription('Root path (default: project root)')
            .setRequired(false)
        )
        .addIntegerOption(option =>
          option
            .setName('depth')
            .setDescription('Maximum depth')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(10)
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

    switch (subcommand) {
      case 'read':
        await this.handleRead(interaction, session);
        break;
      case 'write':
        await this.handleWrite(interaction, session);
        break;
      case 'edit':
        await this.handleEdit(interaction, session);
        break;
      case 'ls':
        await this.handleList(interaction, session);
        break;
      case 'search':
        await this.handleSearch(interaction, session);
        break;
      case 'delete':
        await this.handleDelete(interaction, session);
        break;
      case 'tree':
        await this.handleTree(interaction, session);
        break;
    }
  },

  async autocomplete(interaction: AutocompleteInteraction, sessionManager: SessionManager) {
    const focused = interaction.options.getFocused(true);
    const session = sessionManager.getSessionByChannel(interaction.channelId);
    
    if (!session || !session.projectPath) {
      await interaction.respond([]);
      return;
    }

    const projectPath = session.projectPath;
    
    if (focused.name === 'path') {
      try {
        const searchPath = path.join(projectPath, focused.value || '');
        const parentDir = path.dirname(searchPath);
        const basename = path.basename(searchPath);
        
        const files = await fs.readdir(parentDir);
        const filtered = files
          .filter(f => f.toLowerCase().includes(basename.toLowerCase()))
          .slice(0, 25)
          .map(f => ({
            name: path.relative(projectPath, path.join(parentDir, f)),
            value: path.relative(projectPath, path.join(parentDir, f))
          }));
        
        await interaction.respond(filtered);
      } catch (error) {
        await interaction.respond([]);
      }
    }
  },

  async handleRead(interaction: ChatInputCommandInteraction, session: any) {
    await interaction.deferReply();
    
    const filePath = interaction.options.getString('path', true);
    const lines = interaction.options.getInteger('lines');
    const fullPath = path.join(session.projectPath || '.', filePath);
    
    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const fileLines = content.split('\n');
      const displayLines = lines ? fileLines.slice(0, lines) : fileLines;
      const truncated = lines && lines < fileLines.length;
      
      const language = this.detectLanguage(filePath);
      const codeContent = displayLines.join('\n');
      
      if (codeContent.length <= 4000) {
        const embed = new EmbedBuilder()
          .setTitle(`📄 ${path.basename(filePath)}`)
          .setDescription(codeBlock(language, codeContent))
          .setColor(0x00FF00)
          .setFooter({ 
            text: truncated 
              ? `Showing ${lines} of ${fileLines.length} lines`
              : `${fileLines.length} lines`
          });
        
        await interaction.editReply({ embeds: [embed] });
      } else {
        // For large files, send as attachment
        const buffer = Buffer.from(codeContent);
        const attachment = new AttachmentBuilder(buffer, { 
          name: path.basename(filePath) 
        });
        
        await interaction.editReply({
          content: `📄 **${filePath}** (${fileLines.length} lines)`,
          files: [attachment]
        });
      }
      
      // Send to Claude for context
      await session.sendMessage(`File read: ${filePath}\n\`\`\`${language}\n${codeContent}\n\`\`\``);
      
    } catch (error) {
      await interaction.editReply({
        content: `❌ Error reading file: ${error.message}`
      });
    }
  },

  async handleWrite(interaction: ChatInputCommandInteraction, session: any) {
    const filePath = interaction.options.getString('path', true);
    const content = interaction.options.getString('content');
    
    if (content) {
      // Direct write with provided content
      await interaction.deferReply();
      const fullPath = path.join(session.projectPath || '.', filePath);
      
      try {
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content);
        
        const embed = new EmbedBuilder()
          .setTitle('✅ File Written')
          .setDescription(`Successfully wrote to \`${filePath}\``)
          .setColor(0x00FF00)
          .addFields({
            name: 'Size',
            value: `${content.length} bytes`,
            inline: true
          });
        
        await interaction.editReply({ embeds: [embed] });
        await session.sendMessage(`File written: ${filePath}`);
        
      } catch (error) {
        await interaction.editReply({
          content: `❌ Error writing file: ${error.message}`
        });
      }
    } else {
      // Show modal for larger content
      const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
      
      const modal = new ModalBuilder()
        .setCustomId(`file_write_${filePath}`)
        .setTitle('Write File Content');
      
      const contentInput = new TextInputBuilder()
        .setCustomId('content')
        .setLabel(`Content for ${path.basename(filePath)}`)
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(4000);
      
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(contentInput)
      );
      
      await interaction.showModal(modal);
    }
  },

  async handleEdit(interaction: ChatInputCommandInteraction, session: any) {
    const filePath = interaction.options.getString('path', true);
    const fullPath = path.join(session.projectPath || '.', filePath);
    
    try {
      const currentContent = await fs.readFile(fullPath, 'utf-8');
      
      // Show modal with current content
      const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
      
      const modal = new ModalBuilder()
        .setCustomId(`file_edit_${filePath}`)
        .setTitle(`Edit: ${path.basename(filePath)}`);
      
      const contentInput = new TextInputBuilder()
        .setCustomId('content')
        .setLabel('File Content')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(currentContent.substring(0, 4000))
        .setRequired(true)
        .setMaxLength(4000);
      
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(contentInput)
      );
      
      await interaction.showModal(modal);
      
    } catch (error) {
      await interaction.reply({
        content: `❌ Error reading file for edit: ${error.message}`,
        ephemeral: true
      });
    }
  },

  async handleList(interaction: ChatInputCommandInteraction, session: any) {
    await interaction.deferReply();
    
    const dirPath = interaction.options.getString('path') || '.';
    const showTree = interaction.options.getBoolean('tree');
    const fullPath = path.join(session.projectPath || '.', dirPath);
    
    try {
      const items = await fs.readdir(fullPath, { withFileTypes: true });
      
      if (showTree) {
        const tree = await this.buildTree(fullPath, 0, 3);
        
        const embed = new EmbedBuilder()
          .setTitle(`📁 ${dirPath}`)
          .setDescription(codeBlock('yaml', tree))
          .setColor(0x5865F2)
          .setFooter({ text: `${items.length} items` });
        
        await interaction.editReply({ embeds: [embed] });
      } else {
        const dirs = items.filter(i => i.isDirectory()).map(i => `📁 ${i.name}`);
        const files = items.filter(i => i.isFile()).map(i => `📄 ${i.name}`);
        
        const embed = new EmbedBuilder()
          .setTitle(`📁 Directory: ${dirPath}`)
          .setColor(0x5865F2);
        
        if (dirs.length > 0) {
          embed.addFields({
            name: `Directories (${dirs.length})`,
            value: dirs.slice(0, 10).join('\n') + (dirs.length > 10 ? '\n...' : ''),
            inline: true
          });
        }
        
        if (files.length > 0) {
          embed.addFields({
            name: `Files (${files.length})`,
            value: files.slice(0, 10).join('\n') + (files.length > 10 ? '\n...' : ''),
            inline: true
          });
        }
        
        // Add navigation buttons
        const row = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`file_navigate_parent_${dirPath}`)
              .setLabel('Parent Directory')
              .setStyle(ButtonStyle.Primary)
              .setEmoji('⬆️')
              .setDisabled(dirPath === '.'),
            new ButtonBuilder()
              .setCustomId(`file_navigate_select_${dirPath}`)
              .setLabel('Select Directory')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('📂')
          );
        
        await interaction.editReply({ 
          embeds: [embed],
          components: [row]
        });
      }
      
    } catch (error) {
      await interaction.editReply({
        content: `❌ Error listing directory: ${error.message}`
      });
    }
  },

  async handleSearch(interaction: ChatInputCommandInteraction, session: any) {
    await interaction.deferReply();
    
    const pattern = interaction.options.getString('pattern', true);
    const contentSearch = interaction.options.getString('content');
    const projectPath = session.projectPath || '.';
    
    try {
      // Use glob for file pattern matching
      const files = await glob(pattern, {
        cwd: projectPath,
        nodir: !contentSearch,
        ignore: ['node_modules/**', '.git/**', 'dist/**', 'build/**']
      });
      
      let results = files;
      
      // If content search is specified, search within files
      if (contentSearch) {
        const matchingFiles = [];
        for (const file of files) {
          try {
            const content = await fs.readFile(path.join(projectPath, file), 'utf-8');
            if (content.includes(contentSearch)) {
              matchingFiles.push(file);
            }
          } catch (err) {
            // Skip files that can't be read
          }
        }
        results = matchingFiles;
      }
      
      const embed = new EmbedBuilder()
        .setTitle(`🔍 Search Results`)
        .setDescription(contentSearch 
          ? `Files containing "${contentSearch}" matching pattern "${pattern}"`
          : `Files matching pattern "${pattern}"`)
        .setColor(0x5865F2)
        .addFields({
          name: `Found ${results.length} matches`,
          value: results.length > 0 
            ? results.slice(0, 20).map(f => `📄 ${f}`).join('\n') + 
              (results.length > 20 ? `\n... and ${results.length - 20} more` : '')
            : 'No matches found'
        });
      
      // Add action buttons for results
      if (results.length > 0) {
        const row = new ActionRowBuilder<StringSelectMenuBuilder>()
          .addComponents(
            new StringSelectMenuBuilder()
              .setCustomId('file_search_select')
              .setPlaceholder('Select a file to open')
              .addOptions(
                results.slice(0, 25).map(file => ({
                  label: path.basename(file),
                  description: path.dirname(file),
                  value: file
                }))
              )
          );
        
        await interaction.editReply({ 
          embeds: [embed],
          components: [row]
        });
      } else {
        await interaction.editReply({ embeds: [embed] });
      }
      
    } catch (error) {
      await interaction.editReply({
        content: `❌ Error searching files: ${error.message}`
      });
    }
  },

  async handleDelete(interaction: ChatInputCommandInteraction, session: any) {
    await interaction.deferReply();
    
    const filePath = interaction.options.getString('path', true);
    const confirm = interaction.options.getBoolean('confirm', true);
    
    if (!confirm) {
      await interaction.editReply({
        content: '❌ Deletion cancelled - confirmation required'
      });
      return;
    }
    
    const fullPath = path.join(session.projectPath || '.', filePath);
    
    try {
      const stats = await fs.stat(fullPath);
      
      if (stats.isDirectory()) {
        await fs.rm(fullPath, { recursive: true, force: true });
        await interaction.editReply({
          content: `✅ Directory deleted: \`${filePath}\``
        });
      } else {
        await fs.unlink(fullPath);
        await interaction.editReply({
          content: `✅ File deleted: \`${filePath}\``
        });
      }
      
      await session.sendMessage(`File deleted: ${filePath}`);
      
    } catch (error) {
      await interaction.editReply({
        content: `❌ Error deleting: ${error.message}`
      });
    }
  },

  async handleTree(interaction: ChatInputCommandInteraction, session: any) {
    await interaction.deferReply();
    
    const dirPath = interaction.options.getString('path') || '.';
    const maxDepth = interaction.options.getInteger('depth') || 3;
    const fullPath = path.join(session.projectPath || '.', dirPath);
    
    try {
      const tree = await this.buildTree(fullPath, 0, maxDepth);
      
      if (tree.length <= 4000) {
        const embed = new EmbedBuilder()
          .setTitle(`🌳 Project Tree: ${dirPath}`)
          .setDescription(codeBlock('yaml', tree))
          .setColor(0x00FF00);
        
        await interaction.editReply({ embeds: [embed] });
      } else {
        // Send as file if too large
        const buffer = Buffer.from(tree);
        const attachment = new AttachmentBuilder(buffer, { 
          name: 'project-tree.txt' 
        });
        
        await interaction.editReply({
          content: `🌳 Project tree for \`${dirPath}\``,
          files: [attachment]
        });
      }
      
    } catch (error) {
      await interaction.editReply({
        content: `❌ Error generating tree: ${error.message}`
      });
    }
  },

  async buildTree(dirPath: string, depth: number, maxDepth: number, prefix: string = ''): Promise<string> {
    if (depth > maxDepth) return '';
    
    const items = await fs.readdir(dirPath, { withFileTypes: true });
    let tree = '';
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const isLast = i === items.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      const extension = isLast ? '    ' : '│   ';
      
      if (item.name.startsWith('.') || 
          ['node_modules', 'dist', 'build'].includes(item.name)) {
        continue;
      }
      
      tree += prefix + connector + item.name + '\n';
      
      if (item.isDirectory() && depth < maxDepth) {
        const subTree = await this.buildTree(
          path.join(dirPath, item.name),
          depth + 1,
          maxDepth,
          prefix + extension
        );
        tree += subTree;
      }
    }
    
    return tree;
  },

  detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const languageMap: Record<string, string> = {
      '.js': 'javascript',
      '.ts': 'typescript',
      '.jsx': 'jsx',
      '.tsx': 'tsx',
      '.py': 'python',
      '.java': 'java',
      '.cpp': 'cpp',
      '.c': 'c',
      '.cs': 'csharp',
      '.go': 'go',
      '.rs': 'rust',
      '.rb': 'ruby',
      '.php': 'php',
      '.swift': 'swift',
      '.kt': 'kotlin',
      '.scala': 'scala',
      '.r': 'r',
      '.sql': 'sql',
      '.sh': 'bash',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.json': 'json',
      '.xml': 'xml',
      '.html': 'html',
      '.css': 'css',
      '.scss': 'scss',
      '.md': 'markdown'
    };
    
    return languageMap[ext] || 'plaintext';
  }
};