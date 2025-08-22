import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  Message,
  ChatInputCommandInteraction,
  ButtonInteraction,
  InteractionReplyOptions,
  APIEmbed
} from 'discord.js';
import { PaginationManager } from './pagination-manager';

export class PaginatedEmbed {
  private paginationManager: PaginationManager;
  private pages: EmbedBuilder[] = [];
  private currentPage: number = 0;
  private message: Message | null = null;

  constructor() {
    this.paginationManager = PaginationManager.getInstance();
  }

  /**
   * Add a page to the embed
   */
  addPage(embed: EmbedBuilder): this {
    this.pages.push(embed);
    return this;
  }

  /**
   * Add multiple pages
   */
  addPages(embeds: EmbedBuilder[]): this {
    this.pages.push(...embeds);
    return this;
  }

  /**
   * Create pages from field data
   */
  addFieldPages(
    title: string,
    fields: { name: string; value: string; inline?: boolean }[],
    options: {
      color?: number;
      thumbnail?: string;
      footer?: string;
      fieldsPerPage?: number;
    } = {}
  ): this {
    const { fieldsPerPage = 6, color = 0x0099ff, thumbnail, footer } = options;

    for (let i = 0; i < fields.length; i += fieldsPerPage) {
      const pageFields = fields.slice(i, i + fieldsPerPage);
      const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor(color)
        .addFields(pageFields);

      if (thumbnail) embed.setThumbnail(thumbnail);
      if (footer) embed.setFooter({ text: footer });

      // Add page indicator
      const pageNum = Math.floor(i / fieldsPerPage) + 1;
      const totalPages = Math.ceil(fields.length / fieldsPerPage);
      embed.setFooter({ 
        text: `${footer ? footer + ' | ' : ''}Page ${pageNum}/${totalPages}` 
      });

      this.pages.push(embed);
    }

    return this;
  }

  /**
   * Create pages from large text content
   */
  async addTextPages(
    content: string,
    options: {
      title?: string;
      color?: number;
      codeLanguage?: string;
      preserveCodeBlocks?: boolean;
      footer?: string;
    } = {}
  ): Promise<this> {
    const pages = this.paginationManager.createPages(content, {
      preserveCodeBlocks: options.preserveCodeBlocks,
      codeLanguage: options.codeLanguage
    });

    pages.forEach((pageContent, index) => {
      const embed = new EmbedBuilder();
      
      if (options.title) {
        embed.setTitle(options.title);
      }
      
      if (options.color) {
        embed.setColor(options.color);
      }

      embed.setDescription(pageContent);
      
      const footerText = `Page ${index + 1}/${pages.length}${options.footer ? ' | ' + options.footer : ''}`;
      embed.setFooter({ text: footerText });
      embed.setTimestamp();

      this.pages.push(embed);
    });

    return this;
  }

  /**
   * Create pages from code with syntax highlighting
   */
  async addCodePages(
    code: string,
    language: string,
    options: {
      title?: string;
      lineNumbers?: boolean;
      maxLinesPerPage?: number;
      highlightLines?: number[];
    } = {}
  ): Promise<this> {
    const codePages = this.paginationManager.createCodePages(code, language, options);

    codePages.forEach((pageContent, index) => {
      const embed = new EmbedBuilder()
        .setTitle(options.title || `Code (${language})`)
        .setDescription(pageContent)
        .setColor(0x2f3136)
        .setFooter({ text: `Page ${index + 1}/${codePages.length}` })
        .setTimestamp();

      this.pages.push(embed);
    });

    return this;
  }

  /**
   * Create pages from table data
   */
  async addTablePages(
    headers: string[],
    rows: string[][],
    options: {
      title?: string;
      color?: number;
      maxRowsPerPage?: number;
    } = {}
  ): Promise<this> {
    const tablePages = this.paginationManager.createTablePages(headers, rows, options);

    tablePages.forEach((pageContent, index) => {
      const embed = new EmbedBuilder()
        .setTitle(options.title || 'Table')
        .setDescription(pageContent)
        .setColor(options.color || 0x0099ff)
        .setFooter({ text: `Page ${index + 1}/${tablePages.length}` })
        .setTimestamp();

      this.pages.push(embed);
    });

    return this;
  }

  /**
   * Create pages from diff output
   */
  async addDiffPages(
    diff: string,
    options: {
      title?: string;
      repository?: string;
      branch?: string;
    } = {}
  ): Promise<this> {
    const diffPages = this.paginationManager.createDiffPages(diff, options);

    diffPages.forEach((pageContent, index) => {
      const embed = new EmbedBuilder()
        .setTitle(options.title || 'Diff')
        .setDescription(pageContent)
        .setColor(0xf1c40f);

      if (options.repository) {
        embed.addFields({ 
          name: 'Repository', 
          value: options.repository, 
          inline: true 
        });
      }

      if (options.branch) {
        embed.addFields({ 
          name: 'Branch', 
          value: options.branch, 
          inline: true 
        });
      }

      embed.setFooter({ text: `Page ${index + 1}/${diffPages.length}` });
      embed.setTimestamp();

      this.pages.push(embed);
    });

    return this;
  }

  /**
   * Create pages from log entries
   */
  addLogPages(
    entries: Array<{
      hash?: string;
      author?: string;
      date?: string;
      message: string;
    }>,
    options: {
      title?: string;
      entriesPerPage?: number;
      color?: number;
    } = {}
  ): this {
    const { entriesPerPage = 5, title = 'Log', color = 0x0099ff } = options;

    for (let i = 0; i < entries.length; i += entriesPerPage) {
      const pageEntries = entries.slice(i, i + entriesPerPage);
      const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor(color);

      pageEntries.forEach(entry => {
        let fieldName = entry.message.substring(0, 100);
        if (entry.hash) fieldName = `${entry.hash.substring(0, 7)} - ${fieldName}`;
        
        let fieldValue = '';
        if (entry.author) fieldValue += `Author: ${entry.author}\n`;
        if (entry.date) fieldValue += `Date: ${entry.date}\n`;
        if (entry.message.length > 100) {
          fieldValue += `...\n${entry.message.substring(100, 300)}`;
        }

        embed.addFields({
          name: fieldName,
          value: fieldValue || '\u200b',
          inline: false
        });
      });

      const pageNum = Math.floor(i / entriesPerPage) + 1;
      const totalPages = Math.ceil(entries.length / entriesPerPage);
      embed.setFooter({ text: `Page ${pageNum}/${totalPages} | ${entries.length} total entries` });
      embed.setTimestamp();

      this.pages.push(embed);
    }

    return this;
  }

  /**
   * Create pages from file list
   */
  addFileListPages(
    files: Array<{
      name: string;
      path: string;
      size?: number;
      modified?: Date;
      isDirectory?: boolean;
    }>,
    options: {
      title?: string;
      filesPerPage?: number;
      showSize?: boolean;
      showModified?: boolean;
    } = {}
  ): this {
    const { 
      filesPerPage = 10, 
      title = 'Files', 
      showSize = true, 
      showModified = true 
    } = options;

    for (let i = 0; i < files.length; i += filesPerPage) {
      const pageFiles = files.slice(i, i + filesPerPage);
      const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor(0x7289da);

      let description = '```\n';
      pageFiles.forEach(file => {
        const icon = file.isDirectory ? '📁' : '📄';
        let line = `${icon} ${file.name}`;
        
        if (showSize && file.size !== undefined) {
          line += ` (${this.formatFileSize(file.size)})`;
        }
        
        if (showModified && file.modified) {
          line += ` - ${file.modified.toLocaleDateString()}`;
        }
        
        description += line + '\n';
      });
      description += '```';

      embed.setDescription(description);

      const pageNum = Math.floor(i / filesPerPage) + 1;
      const totalPages = Math.ceil(files.length / filesPerPage);
      embed.setFooter({ 
        text: `Page ${pageNum}/${totalPages} | ${files.length} items` 
      });
      embed.setTimestamp();

      this.pages.push(embed);
    }

    return this;
  }

  /**
   * Send the paginated embed
   */
  async send(
    interaction: ChatInputCommandInteraction | ButtonInteraction,
    ephemeral: boolean = false
  ): Promise<Message | void> {
    if (this.pages.length === 0) {
      throw new Error('No pages to display');
    }

    const messageId = Date.now().toString();
    const components = this.createNavigationButtons(messageId, 0, this.pages.length);

    const options: InteractionReplyOptions = {
      embeds: [this.pages[0]],
      components: components.length > 0 ? components : undefined,
      ephemeral
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(options);
    } else {
      await interaction.reply(options);
    }
  }

  /**
   * Create navigation buttons
   */
  private createNavigationButtons(
    messageId: string,
    currentPage: number,
    totalPages: number
  ): ActionRowBuilder<ButtonBuilder>[] {
    if (totalPages <= 1) return [];

    const manager = PaginationManager.getInstance();
    // Delegate to PaginationManager's button creation
    // This is a simplified version - in practice would integrate with manager
    
    const row = new ActionRowBuilder<ButtonBuilder>();
    const buttons = [
      { id: 'first', emoji: '⏮️', disabled: currentPage === 0 },
      { id: 'prev', emoji: '◀️', disabled: currentPage === 0 },
      { id: 'next', emoji: '▶️', disabled: currentPage === totalPages - 1 },
      { id: 'last', emoji: '⏭️', disabled: currentPage === totalPages - 1 }
    ];

    buttons.forEach(btn => {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`page_${btn.id}_${messageId}_${currentPage}_${totalPages}`)
          .setEmoji(btn.emoji)
          .setStyle(btn.disabled ? 2 : 1)
          .setDisabled(btn.disabled)
      );
    });

    return [row];
  }

  /**
   * Format file size for display
   */
  private formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  /**
   * Get total number of pages
   */
  getPageCount(): number {
    return this.pages.length;
  }

  /**
   * Get current page index
   */
  getCurrentPage(): number {
    return this.currentPage;
  }

  /**
   * Clear all pages
   */
  clear(): this {
    this.pages = [];
    this.currentPage = 0;
    return this;
  }
}