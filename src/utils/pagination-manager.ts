import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Message,
  ButtonInteraction,
  InteractionEditReplyOptions,
  APIEmbed
} from 'discord.js';
import { logger } from './logger';

interface PaginatedContent {
  pages: string[];
  currentPage: number;
  totalPages: number;
  embed?: EmbedBuilder;
  preserveCodeBlocks: boolean;
  footer?: string;
}

export class PaginationManager {
  private static instance: PaginationManager;
  private activePages: Map<string, PaginatedContent> = new Map();
  private readonly PAGE_SIZE = 2000; // Discord limit minus some buffer
  private readonly CODE_BLOCK_PATTERN = /```[\s\S]*?```/g;
  private readonly CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

  private constructor() {
    // Clean up old paginated content periodically
    setInterval(() => this.cleanup(), this.CACHE_DURATION);
  }

  static getInstance(): PaginationManager {
    if (!PaginationManager.instance) {
      PaginationManager.instance = new PaginationManager();
    }
    return PaginationManager.instance;
  }

  /**
   * Create paginated content from large text
   */
  createPages(
    content: string,
    options: {
      preserveCodeBlocks?: boolean;
      pageSize?: number;
      title?: string;
      codeLanguage?: string;
    } = {}
  ): string[] {
    const {
      preserveCodeBlocks = true,
      pageSize = this.PAGE_SIZE,
      codeLanguage = ''
    } = options;

    // If content fits in one page, return as-is
    if (content.length <= pageSize) {
      return [content];
    }

    const pages: string[] = [];

    if (preserveCodeBlocks) {
      // Extract code blocks and split carefully
      const parts = this.splitPreservingCodeBlocks(content, pageSize, codeLanguage);
      pages.push(...parts);
    } else {
      // Simple split by size
      let remaining = content;
      while (remaining.length > 0) {
        const chunk = remaining.substring(0, pageSize);
        pages.push(chunk);
        remaining = remaining.substring(pageSize);
      }
    }

    return pages;
  }

  /**
   * Split content while preserving code blocks
   */
  private splitPreservingCodeBlocks(
    content: string,
    pageSize: number,
    language: string = ''
  ): string[] {
    const pages: string[] = [];
    const lines = content.split('\n');
    let currentPage = '';
    let inCodeBlock = false;
    let codeBlockBuffer = '';

    for (const line of lines) {
      const isCodeBlockDelimiter = line.startsWith('```');
      
      if (isCodeBlockDelimiter) {
        if (!inCodeBlock) {
          // Starting a code block
          inCodeBlock = true;
          codeBlockBuffer = line + '\n';
        } else {
          // Ending a code block
          codeBlockBuffer += line;
          inCodeBlock = false;

          // Check if code block fits in current page
          if (currentPage.length + codeBlockBuffer.length + 1 > pageSize) {
            // Start new page with the code block
            if (currentPage.trim()) {
              pages.push(currentPage.trim());
            }
            currentPage = codeBlockBuffer + '\n';
          } else {
            currentPage += codeBlockBuffer + '\n';
          }
          
          codeBlockBuffer = '';
        }
      } else if (inCodeBlock) {
        // Inside code block
        codeBlockBuffer += line + '\n';
      } else {
        // Regular line
        const lineWithNewline = line + '\n';
        
        if (currentPage.length + lineWithNewline.length > pageSize) {
          // Start new page
          if (currentPage.trim()) {
            pages.push(currentPage.trim());
          }
          currentPage = lineWithNewline;
        } else {
          currentPage += lineWithNewline;
        }
      }
    }

    // Handle any remaining content
    if (inCodeBlock && codeBlockBuffer) {
      // Close unclosed code block
      codeBlockBuffer += '```';
      currentPage += codeBlockBuffer;
    }

    if (currentPage.trim()) {
      pages.push(currentPage.trim());
    }

    // Ensure code blocks are properly wrapped on each page
    return pages.map(page => {
      if (language && !page.startsWith('```')) {
        return `\`\`\`${language}\n${page}\n\`\`\``;
      }
      return page;
    });
  }

  /**
   * Create a paginated embed message
   */
  async createPaginatedEmbed(
    content: string | string[],
    options: {
      title?: string;
      description?: string;
      color?: number;
      footer?: string;
      preserveCodeBlocks?: boolean;
      codeLanguage?: string;
      thumbnail?: string;
      author?: { name: string; iconURL?: string };
    } = {}
  ): Promise<{ embed: EmbedBuilder; components: ActionRowBuilder<ButtonBuilder>[] }> {
    const pages = Array.isArray(content) 
      ? content 
      : this.createPages(content, {
          preserveCodeBlocks: options.preserveCodeBlocks,
          codeLanguage: options.codeLanguage
        });

    const messageId = Date.now().toString();
    
    const paginatedContent: PaginatedContent = {
      pages,
      currentPage: 0,
      totalPages: pages.length,
      preserveCodeBlocks: options.preserveCodeBlocks ?? true,
      footer: options.footer
    };

    this.activePages.set(messageId, paginatedContent);

    const embed = this.createEmbed(paginatedContent, 0, options);
    const components = this.createNavigationButtons(messageId, 0, pages.length);

    return { embed, components };
  }

  /**
   * Create embed for a specific page
   */
  private createEmbed(
    content: PaginatedContent,
    pageIndex: number,
    options: any = {}
  ): EmbedBuilder {
    const embed = new EmbedBuilder();

    if (options.title) {
      embed.setTitle(options.title);
    }

    if (options.color) {
      embed.setColor(options.color);
    }

    if (options.author) {
      embed.setAuthor(options.author);
    }

    if (options.thumbnail) {
      embed.setThumbnail(options.thumbnail);
    }

    // Set the main content
    const pageContent = content.pages[pageIndex];
    
    if (options.description && pageIndex === 0) {
      embed.setDescription(options.description);
      embed.addFields({ name: '\u200b', value: pageContent });
    } else {
      embed.setDescription(pageContent);
    }

    // Add page indicator
    const pageIndicator = `Page ${pageIndex + 1} of ${content.totalPages}`;
    const footerText = options.footer 
      ? `${pageIndicator} | ${options.footer}`
      : pageIndicator;
    
    embed.setFooter({ text: footerText });
    embed.setTimestamp();

    return embed;
  }

  /**
   * Create navigation buttons for pagination
   */
  private createNavigationButtons(
    messageId: string,
    currentPage: number,
    totalPages: number
  ): ActionRowBuilder<ButtonBuilder>[] {
    if (totalPages <= 1) {
      return [];
    }

    const row = new ActionRowBuilder<ButtonBuilder>();

    // First page button
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`page_first_${messageId}_${currentPage}_${totalPages}`)
        .setEmoji('⏮️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === 0)
    );

    // Previous page button
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`page_prev_${messageId}_${currentPage}_${totalPages}`)
        .setEmoji('◀️')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(currentPage === 0)
    );

    // Page counter button (non-interactive)
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`page_counter_${messageId}`)
        .setLabel(`${currentPage + 1}/${totalPages}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    );

    // Next page button
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`page_next_${messageId}_${currentPage}_${totalPages}`)
        .setEmoji('▶️')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(currentPage === totalPages - 1)
    );

    // Last page button
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`page_last_${messageId}_${currentPage}_${totalPages}`)
        .setEmoji('⏭️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === totalPages - 1)
    );

    return [row];
  }

  /**
   * Handle pagination button interaction
   */
  async handlePaginationInteraction(
    interaction: ButtonInteraction
  ): Promise<InteractionEditReplyOptions | null> {
    const [, direction, messageId, currentStr, totalStr] = interaction.customId.split('_');
    const current = parseInt(currentStr);
    const total = parseInt(totalStr);

    const content = this.activePages.get(messageId);
    if (!content) {
      // Content expired or not found
      return {
        content: '⚠️ This paginated content has expired. Please run the command again.',
        embeds: [],
        components: []
      };
    }

    let newPage = current;
    
    switch (direction) {
      case 'first':
        newPage = 0;
        break;
      case 'prev':
        newPage = Math.max(0, current - 1);
        break;
      case 'next':
        newPage = Math.min(total - 1, current + 1);
        break;
      case 'last':
        newPage = total - 1;
        break;
    }

    if (newPage === current) {
      return null; // No change needed
    }

    content.currentPage = newPage;

    const embed = this.createEmbed(content, newPage, {});
    const components = this.createNavigationButtons(messageId, newPage, total);

    return {
      embeds: [embed],
      components
    };
  }

  /**
   * Create paginated code output
   */
  createCodePages(
    code: string,
    language: string = '',
    options: {
      title?: string;
      lineNumbers?: boolean;
      highlightLines?: number[];
      maxLinesPerPage?: number;
    } = {}
  ): string[] {
    const { lineNumbers = true, highlightLines = [], maxLinesPerPage = 40 } = options;
    
    const lines = code.split('\n');
    const pages: string[] = [];
    
    for (let i = 0; i < lines.length; i += maxLinesPerPage) {
      const pageLines = lines.slice(i, i + maxLinesPerPage);
      let pageContent = '';
      
      pageLines.forEach((line, index) => {
        const lineNum = i + index + 1;
        const highlight = highlightLines.includes(lineNum) ? '>' : ' ';
        
        if (lineNumbers) {
          pageContent += `${highlight}${lineNum.toString().padStart(4, ' ')} | ${line}\n`;
        } else {
          pageContent += `${highlight}${line}\n`;
        }
      });
      
      pages.push(`\`\`\`${language}\n${pageContent}\`\`\``);
    }
    
    return pages;
  }

  /**
   * Create paginated table
   */
  createTablePages(
    headers: string[],
    rows: string[][],
    options: {
      title?: string;
      maxRowsPerPage?: number;
      alignment?: ('left' | 'center' | 'right')[];
    } = {}
  ): string[] {
    const { maxRowsPerPage = 15, alignment = [] } = options;
    
    const pages: string[] = [];
    const columnWidths = this.calculateColumnWidths(headers, rows);
    
    for (let i = 0; i < rows.length; i += maxRowsPerPage) {
      const pageRows = rows.slice(i, i + maxRowsPerPage);
      let table = '```\n';
      
      // Add headers
      table += this.createTableRow(headers, columnWidths, alignment);
      table += this.createTableSeparator(columnWidths);
      
      // Add rows
      pageRows.forEach(row => {
        table += this.createTableRow(row, columnWidths, alignment);
      });
      
      table += '```';
      pages.push(table);
    }
    
    return pages;
  }

  /**
   * Calculate column widths for table
   */
  private calculateColumnWidths(headers: string[], rows: string[][]): number[] {
    const widths = headers.map(h => h.length);
    
    rows.forEach(row => {
      row.forEach((cell, i) => {
        widths[i] = Math.max(widths[i] || 0, cell.length);
      });
    });
    
    return widths.map(w => Math.min(w, 30)); // Cap at 30 chars
  }

  /**
   * Create a table row
   */
  private createTableRow(
    cells: string[],
    widths: number[],
    alignment: ('left' | 'center' | 'right')[]
  ): string {
    let row = '│';
    
    cells.forEach((cell, i) => {
      const width = widths[i];
      const align = alignment[i] || 'left';
      
      let paddedCell = cell.substring(0, width);
      
      switch (align) {
        case 'center':
          const padding = width - paddedCell.length;
          const leftPad = Math.floor(padding / 2);
          const rightPad = padding - leftPad;
          paddedCell = ' '.repeat(leftPad) + paddedCell + ' '.repeat(rightPad);
          break;
        case 'right':
          paddedCell = paddedCell.padStart(width, ' ');
          break;
        default:
          paddedCell = paddedCell.padEnd(width, ' ');
      }
      
      row += ` ${paddedCell} │`;
    });
    
    return row + '\n';
  }

  /**
   * Create table separator
   */
  private createTableSeparator(widths: number[]): string {
    let separator = '├';
    
    widths.forEach((width, i) => {
      separator += '─'.repeat(width + 2);
      separator += i < widths.length - 1 ? '┼' : '┤';
    });
    
    return separator + '\n';
  }

  /**
   * Create paginated diff output
   */
  createDiffPages(
    diff: string,
    options: {
      title?: string;
      contextLines?: number;
      maxLinesPerPage?: number;
    } = {}
  ): string[] {
    const { maxLinesPerPage = 30 } = options;
    
    const lines = diff.split('\n');
    const pages: string[] = [];
    
    for (let i = 0; i < lines.length; i += maxLinesPerPage) {
      const pageLines = lines.slice(i, i + maxLinesPerPage);
      let pageContent = '```diff\n';
      
      pageLines.forEach(line => {
        // Ensure proper diff formatting
        if (line.startsWith('+')) {
          pageContent += line + '\n';
        } else if (line.startsWith('-')) {
          pageContent += line + '\n';
        } else if (line.startsWith('@')) {
          pageContent += line + '\n';
        } else {
          pageContent += ' ' + line + '\n';
        }
      });
      
      pageContent += '```';
      pages.push(pageContent);
    }
    
    return pages;
  }

  /**
   * Check if content needs pagination
   */
  needsPagination(content: string, threshold: number = this.PAGE_SIZE): boolean {
    return content.length > threshold;
  }

  /**
   * Get active pagination for a message
   */
  getActivePagination(messageId: string): PaginatedContent | undefined {
    return this.activePages.get(messageId);
  }

  /**
   * Clean up expired paginations
   */
  private cleanup(): void {
    const now = Date.now();
    const expired: string[] = [];

    this.activePages.forEach((content, id) => {
      const messageTime = parseInt(id);
      if (now - messageTime > this.CACHE_DURATION) {
        expired.push(id);
      }
    });

    expired.forEach(id => this.activePages.delete(id));
    
    if (expired.length > 0) {
      logger.debug(`Cleaned up ${expired.length} expired paginations`);
    }
  }

  /**
   * Create a jump-to-page select menu
   */
  createPageJumpMenu(
    messageId: string,
    currentPage: number,
    totalPages: number
  ): ActionRowBuilder<any> | null {
    if (totalPages <= 25) {
      // Can use a select menu for quick navigation
      const options = [];
      
      for (let i = 0; i < totalPages; i++) {
        options.push({
          label: `Page ${i + 1}`,
          value: `${i}`,
          description: i === currentPage ? 'Current page' : undefined,
          default: i === currentPage
        });
      }
      
      // This would need a StringSelectMenuBuilder
      // Keeping as placeholder for now
      return null;
    }
    
    return null;
  }

  /**
   * Export full content from pagination
   */
  exportFullContent(messageId: string): string | null {
    const content = this.activePages.get(messageId);
    if (!content) return null;
    
    return content.pages.join('\n\n');
  }
}