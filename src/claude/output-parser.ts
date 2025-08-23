export interface ParsedOutput {
  type: 'response' | 'progress' | 'error' | 'tool' | 'status';
  content: string;
  tools?: string[];
  progress?: number;
  metadata?: any;
}

export class OutputParser {
  private buffer: string = '';

  parse(data: string): ParsedOutput {
    this.buffer += data;
    
    if (this.isError(data)) {
      return {
        type: 'error',
        content: this.extractError(data)
      };
    }
    
    if (this.isProgress(data)) {
      return {
        type: 'progress',
        content: this.extractProgress(data),
        progress: this.extractProgressPercent(data)
      };
    }
    
    if (this.isTool(data)) {
      return {
        type: 'tool',
        content: data,
        tools: this.extractTools(data)
      };
    }
    
    if (this.isStatus(data)) {
      return {
        type: 'status',
        content: this.extractStatus(data)
      };
    }
    
    return {
      type: 'response',
      content: this.formatResponse(data),
      tools: this.extractTools(this.buffer)
    };
  }

  private isError(data: string): boolean {
    return data.includes('Error:') || 
           data.includes('error:') || 
           data.includes('Failed') ||
           data.includes('Exception');
  }

  private isProgress(data: string): boolean {
    return data.includes('...') || 
           data.includes('Working') ||
           data.includes('Processing') ||
           data.includes('%');
  }

  private isTool(data: string): boolean {
    return data.includes('Tool:') ||
           data.includes('Using:') ||
           data.includes('Executing:') ||
           data.includes('Running:');
  }

  private isStatus(data: string): boolean {
    return data.includes('Status:') ||
           data.includes('Ready') ||
           data.includes('Complete') ||
           data.includes('Done');
  }

  private extractError(data: string): string {
    const errorMatch = data.match(/(?:Error|error|Failed|Exception)[:\s]*(.*)/);
    return errorMatch ? errorMatch[1].trim() : data;
  }

  private extractProgress(data: string): string {
    const progressMatch = data.match(/(?:Working|Processing)[:\s]*(.*)/);
    if (progressMatch) return progressMatch[1].trim();
    
    const cleanData = data.replace(/\.\.\./g, '').trim();
    return cleanData || 'Processing...';
  }

  private extractProgressPercent(data: string): number {
    const percentMatch = data.match(/(\d+)%/);
    return percentMatch ? parseInt(percentMatch[1]) : 0;
  }

  private extractTools(data: string): string[] {
    const tools: string[] = [];
    const toolPatterns = [
      /Tool:\s*(\w+)/g,
      /Using:\s*(\w+)/g,
      /\[(\w+)\]/g
    ];
    
    toolPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(data)) !== null) {
        if (match[1] && !tools.includes(match[1])) {
          tools.push(match[1]);
        }
      }
    });
    
    return tools;
  }

  private extractStatus(data: string): string {
    const statusMatch = data.match(/Status:\s*(.*)/);
    if (statusMatch) return statusMatch[1].trim();
    return data.trim();
  }

  private formatResponse(data: string): string {
    let formatted = data;
    
    formatted = this.detectAndFormatCodeBlocks(formatted);
    formatted = this.formatLists(formatted);
    formatted = this.cleanupFormatting(formatted);
    
    return formatted;
  }

  private detectAndFormatCodeBlocks(text: string): string {
    const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
    
    return text.replace(codeBlockRegex, (_match, lang, code) => {
      const language = lang || 'plaintext';
      return `\n\`\`\`${language}\n${code.trim()}\n\`\`\`\n`;
    });
  }

  private formatLists(text: string): string {
    const lines = text.split('\n');
    const formattedLines: string[] = [];
    let inList = false;
    
    lines.forEach(line => {
      const trimmed = line.trim();
      
      if (trimmed.match(/^\d+\.|^[-*+]\s/)) {
        inList = true;
        formattedLines.push(line);
      } else if (inList && trimmed === '') {
        inList = false;
        formattedLines.push('');
      } else {
        formattedLines.push(line);
      }
    });
    
    return formattedLines.join('\n');
  }

  private cleanupFormatting(text: string): string {
    text = text.replace(/\n{3,}/g, '\n\n');
    text = text.replace(/^\s+|\s+$/g, '');
    text = text.replace(/\t/g, '  ');
    
    return text;
  }

  reset(): void {
    this.buffer = '';
  }
}