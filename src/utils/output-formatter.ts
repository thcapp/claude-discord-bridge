import { EmbedBuilder } from 'discord.js';
import * as diff from 'diff';

export class OutputFormatter {
  private static instance: OutputFormatter;

  private constructor() {}

  static getInstance(): OutputFormatter {
    if (!OutputFormatter.instance) {
      OutputFormatter.instance = new OutputFormatter();
    }
    return OutputFormatter.instance;
  }

  /**
   * Format a Git diff for Discord display
   */
  formatDiff(
    diffContent: string,
    options: {
      maxLines?: number;
      contextLines?: number;
      showStats?: boolean;
    } = {}
  ): string {
    const { maxLines = 50, showStats = true } = options;
    
    const lines = diffContent.split('\n');
    let formatted = '```diff\n';
    let additions = 0;
    let deletions = 0;
    let filesChanged = new Set<string>();
    let currentFile = '';
    let linesShown = 0;

    for (const line of lines) {
      if (linesShown >= maxLines) {
        formatted += `\n... ${lines.length - linesShown} more lines ...\n`;
        break;
      }

      // File header
      if (line.startsWith('diff --git')) {
        const match = line.match(/b\/(.+)$/);
        if (match) {
          currentFile = match[1];
          filesChanged.add(currentFile);
        }
        formatted += `\n${line}\n`;
        linesShown++;
      }
      // Index line
      else if (line.startsWith('index ')) {
        // Skip index lines for cleaner output
        continue;
      }
      // File mode
      else if (line.startsWith('new file mode') || line.startsWith('deleted file mode')) {
        formatted += `${line}\n`;
        linesShown++;
      }
      // --- and +++ lines
      else if (line.startsWith('---') || line.startsWith('+++')) {
        formatted += `${line}\n`;
        linesShown++;
      }
      // Hunk header
      else if (line.startsWith('@@')) {
        formatted += `\n${line}\n`;
        linesShown++;
      }
      // Addition
      else if (line.startsWith('+') && !line.startsWith('+++')) {
        formatted += `${line}\n`;
        additions++;
        linesShown++;
      }
      // Deletion
      else if (line.startsWith('-') && !line.startsWith('---')) {
        formatted += `${line}\n`;
        deletions++;
        linesShown++;
      }
      // Context line
      else if (line.startsWith(' ')) {
        formatted += `${line}\n`;
        linesShown++;
      }
    }

    formatted += '```';

    if (showStats) {
      formatted += `\n📊 **Stats**: ${filesChanged.size} file(s) changed, `;
      formatted += `${additions} insertions(+), ${deletions} deletions(-)`;
    }

    return formatted;
  }

  /**
   * Format side-by-side diff comparison
   */
  formatSideBySideDiff(
    oldContent: string,
    newContent: string,
    options: {
      title?: string;
      maxWidth?: number;
    } = {}
  ): string {
    const { title = 'Comparison', maxWidth = 40 } = options;
    
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    const maxLines = Math.max(oldLines.length, newLines.length);
    
    let formatted = `**${title}**\n\`\`\`\n`;
    formatted += '┌' + '─'.repeat(maxWidth + 2) + '┬' + '─'.repeat(maxWidth + 2) + '┐\n';
    formatted += '│ ' + 'Original'.padEnd(maxWidth) + ' │ ' + 'Modified'.padEnd(maxWidth) + ' │\n';
    formatted += '├' + '─'.repeat(maxWidth + 2) + '┼' + '─'.repeat(maxWidth + 2) + '┤\n';

    for (let i = 0; i < maxLines; i++) {
      const oldLine = (oldLines[i] || '').substring(0, maxWidth).padEnd(maxWidth);
      const newLine = (newLines[i] || '').substring(0, maxWidth).padEnd(maxWidth);
      
      // Highlight differences
      const isDifferent = oldLines[i] !== newLines[i];
      const marker = isDifferent ? '!' : ' ';
      
      formatted += `│${marker}${oldLine} │${marker}${newLine} │\n`;
    }

    formatted += '└' + '─'.repeat(maxWidth + 2) + '┴' + '─'.repeat(maxWidth + 2) + '┘\n';
    formatted += '```';

    return formatted;
  }

  /**
   * Create an ASCII table
   */
  formatTable(
    headers: string[],
    rows: string[][],
    options: {
      title?: string;
      alignment?: ('left' | 'center' | 'right')[];
      maxColumnWidth?: number;
      showIndex?: boolean;
    } = {}
  ): string {
    const { 
      title, 
      alignment = [], 
      maxColumnWidth = 20, 
      showIndex = false 
    } = options;

    // Add index column if requested
    if (showIndex) {
      headers = ['#', ...headers];
      rows = rows.map((row, i) => [(i + 1).toString(), ...row]);
    }

    // Calculate column widths
    const columnWidths = headers.map((header, i) => {
      const headerWidth = header.length;
      const maxRowWidth = Math.max(...rows.map(row => (row[i] || '').length));
      return Math.min(Math.max(headerWidth, maxRowWidth), maxColumnWidth);
    });

    let table = '```\n';
    
    if (title) {
      table += `${title}\n\n`;
    }

    // Top border
    table += '┌';
    columnWidths.forEach((width, i) => {
      table += '─'.repeat(width + 2);
      table += i < columnWidths.length - 1 ? '┬' : '┐\n';
    });

    // Headers
    table += '│';
    headers.forEach((header, i) => {
      const width = columnWidths[i];
      const align = alignment[i] || 'left';
      table += ' ' + this.alignText(header, width, align) + ' │';
    });
    table += '\n';

    // Header separator
    table += '├';
    columnWidths.forEach((width, i) => {
      table += '─'.repeat(width + 2);
      table += i < columnWidths.length - 1 ? '┼' : '┤\n';
    });

    // Rows
    rows.forEach(row => {
      table += '│';
      row.forEach((cell, i) => {
        const width = columnWidths[i];
        const align = alignment[i] || 'left';
        table += ' ' + this.alignText(cell || '', width, align) + ' │';
      });
      table += '\n';
    });

    // Bottom border
    table += '└';
    columnWidths.forEach((width, i) => {
      table += '─'.repeat(width + 2);
      table += i < columnWidths.length - 1 ? '┴' : '┘\n';
    });

    table += '```';

    return table;
  }

  /**
   * Format a file tree structure
   */
  formatFileTree(
    tree: Array<{
      name: string;
      type: 'file' | 'directory';
      path: string;
      level: number;
      children?: any[];
    }>,
    options: {
      showIcons?: boolean;
      showHidden?: boolean;
      maxDepth?: number;
    } = {}
  ): string {
    const { showIcons = true, showHidden = false, maxDepth = 5 } = options;
    
    let output = '```\n';
    
    const formatNode = (node: any, prefix: string = '', isLast: boolean = true, depth: number = 0) => {
      if (depth > maxDepth) return;
      if (!showHidden && node.name.startsWith('.')) return;

      const connector = isLast ? '└── ' : '├── ';
      const icon = showIcons ? (node.type === 'directory' ? '📁 ' : '📄 ') : '';
      
      output += prefix + connector + icon + node.name + '\n';

      if (node.children && node.children.length > 0) {
        const nextPrefix = prefix + (isLast ? '    ' : '│   ');
        node.children.forEach((child: any, index: number) => {
          formatNode(child, nextPrefix, index === node.children.length - 1, depth + 1);
        });
      }
    };

    tree.forEach((node, index) => {
      formatNode(node, '', index === tree.length - 1);
    });

    output += '```';
    
    return output;
  }

  /**
   * Format JSON with syntax highlighting for Discord
   */
  formatJson(
    obj: any,
    options: {
      indent?: number;
      maxDepth?: number;
      sortKeys?: boolean;
    } = {}
  ): string {
    const { indent = 2, sortKeys = false } = options;
    
    let json: string;
    
    if (sortKeys && typeof obj === 'object' && !Array.isArray(obj)) {
      const sorted = Object.keys(obj).sort().reduce((result, key) => {
        result[key] = obj[key];
        return result;
      }, {} as any);
      json = JSON.stringify(sorted, null, indent);
    } else {
      json = JSON.stringify(obj, null, indent);
    }

    return `\`\`\`json\n${json}\n\`\`\``;
  }

  /**
   * Format YAML-like output
   */
  formatYaml(
    obj: any,
    indent: number = 0
  ): string {
    let yaml = '';
    const spaces = '  '.repeat(indent);

    if (Array.isArray(obj)) {
      obj.forEach(item => {
        if (typeof item === 'object' && item !== null) {
          yaml += `${spaces}- \n${this.formatYaml(item, indent + 1)}`;
        } else {
          yaml += `${spaces}- ${item}\n`;
        }
      });
    } else if (typeof obj === 'object' && obj !== null) {
      Object.entries(obj).forEach(([key, value]) => {
        if (typeof value === 'object' && value !== null) {
          yaml += `${spaces}${key}:\n${this.formatYaml(value, indent + 1)}`;
        } else {
          yaml += `${spaces}${key}: ${value}\n`;
        }
      });
    } else {
      yaml += `${spaces}${obj}\n`;
    }

    return indent === 0 ? `\`\`\`yaml\n${yaml}\`\`\`` : yaml;
  }

  /**
   * Create a progress bar
   */
  formatProgressBar(
    current: number,
    total: number,
    options: {
      width?: number;
      showPercentage?: boolean;
      showNumbers?: boolean;
      fillChar?: string;
      emptyChar?: string;
    } = {}
  ): string {
    const {
      width = 20,
      showPercentage = true,
      showNumbers = true,
      fillChar = '█',
      emptyChar = '░'
    } = options;

    const percentage = Math.min(100, Math.max(0, (current / total) * 100));
    const filled = Math.floor((percentage / 100) * width);
    const empty = width - filled;

    let bar = fillChar.repeat(filled) + emptyChar.repeat(empty);
    
    if (showNumbers) {
      bar = `[${bar}] ${current}/${total}`;
    } else {
      bar = `[${bar}]`;
    }

    if (showPercentage) {
      bar += ` ${percentage.toFixed(1)}%`;
    }

    return bar;
  }

  /**
   * Format error message with context
   */
  formatError(
    error: Error | string,
    options: {
      showStack?: boolean;
      context?: any;
      suggestions?: string[];
    } = {}
  ): string {
    const { showStack = false, context, suggestions = [] } = options;
    
    let formatted = '❌ **Error**\n```\n';
    
    if (typeof error === 'string') {
      formatted += error;
    } else {
      formatted += error.message;
      
      if (showStack && error.stack) {
        formatted += '\n\nStack Trace:\n' + error.stack;
      }
    }
    
    formatted += '\n```';

    if (context) {
      formatted += '\n\n**Context:**\n```json\n';
      formatted += JSON.stringify(context, null, 2);
      formatted += '\n```';
    }

    if (suggestions.length > 0) {
      formatted += '\n\n💡 **Suggestions:**\n';
      suggestions.forEach(suggestion => {
        formatted += `• ${suggestion}\n`;
      });
    }

    return formatted;
  }

  /**
   * Format command output with syntax highlighting
   */
  formatCommandOutput(
    output: string,
    options: {
      command?: string;
      exitCode?: number;
      duration?: number;
      showTimestamp?: boolean;
    } = {}
  ): string {
    let formatted = '';

    if (options.command) {
      formatted += `\`$ ${options.command}\`\n`;
    }

    if (options.showTimestamp) {
      formatted += `🕐 ${new Date().toLocaleString()}\n`;
    }

    formatted += '```bash\n' + output + '\n```';

    if (options.exitCode !== undefined) {
      const icon = options.exitCode === 0 ? '✅' : '❌';
      formatted += `\n${icon} Exit code: ${options.exitCode}`;
    }

    if (options.duration) {
      formatted += ` (${(options.duration / 1000).toFixed(2)}s)`;
    }

    return formatted;
  }

  /**
   * Format statistics as a grid
   */
  formatStats(
    stats: Record<string, any>,
    options: {
      title?: string;
      columns?: number;
      icons?: Record<string, string>;
    } = {}
  ): string {
    const { title = 'Statistics', columns = 2, icons = {} } = options;
    
    const entries = Object.entries(stats);
    let formatted = `**${title}**\n\`\`\`\n`;

    const maxKeyLength = Math.max(...entries.map(([k]) => k.length));
    
    entries.forEach(([key, value], index) => {
      const icon = icons[key] || '';
      const paddedKey = key.padEnd(maxKeyLength);
      
      formatted += `${icon}${paddedKey}: ${value}`;
      
      if ((index + 1) % columns === 0) {
        formatted += '\n';
      } else if (index < entries.length - 1) {
        formatted += '  │  ';
      }
    });

    formatted += '\n```';
    
    return formatted;
  }

  /**
   * Format a list with bullets or numbers
   */
  formatList(
    items: string[],
    options: {
      ordered?: boolean;
      indent?: number;
      marker?: string;
    } = {}
  ): string {
    const { ordered = false, indent = 0, marker = '•' } = options;
    const spaces = '  '.repeat(indent);
    
    return items.map((item, index) => {
      const bullet = ordered ? `${index + 1}.` : marker;
      return `${spaces}${bullet} ${item}`;
    }).join('\n');
  }

  /**
   * Align text within a given width
   */
  private alignText(
    text: string,
    width: number,
    align: 'left' | 'center' | 'right'
  ): string {
    const truncated = text.substring(0, width);
    
    switch (align) {
      case 'center':
        const padding = width - truncated.length;
        const leftPad = Math.floor(padding / 2);
        const rightPad = padding - leftPad;
        return ' '.repeat(leftPad) + truncated + ' '.repeat(rightPad);
      
      case 'right':
        return truncated.padStart(width, ' ');
      
      default:
        return truncated.padEnd(width, ' ');
    }
  }

  /**
   * Create a comparison table
   */
  formatComparison(
    items: Array<{
      feature: string;
      before: string;
      after: string;
      change?: 'added' | 'removed' | 'modified' | 'unchanged';
    }>
  ): string {
    const headers = ['Feature', 'Before', 'After', 'Status'];
    const rows = items.map(item => {
      const status = this.getChangeEmoji(item.change);
      return [item.feature, item.before, item.after, status];
    });

    return this.formatTable(headers, rows, {
      title: 'Comparison',
      alignment: ['left', 'center', 'center', 'center']
    });
  }

  /**
   * Get emoji for change type
   */
  private getChangeEmoji(change?: string): string {
    switch (change) {
      case 'added': return '✅ Added';
      case 'removed': return '❌ Removed';
      case 'modified': return '🔄 Modified';
      case 'unchanged': return '⏸️ Unchanged';
      default: return '❓ Unknown';
    }
  }
}