import { logger } from './logger';

interface LanguageConfig {
  name: string;
  extensions: string[];
  keywords: string[];
  types?: string[];
  builtins?: string[];
  operators?: string[];
  comments?: {
    single?: string;
    multi?: { start: string; end: string };
  };
  strings?: {
    quotes: string[];
    multiline?: { start: string; end: string };
  };
}

export class SyntaxHighlighter {
  private static instance: SyntaxHighlighter;
  private languages: Map<string, LanguageConfig> = new Map();

  private constructor() {
    this.initializeLanguages();
  }

  static getInstance(): SyntaxHighlighter {
    if (!SyntaxHighlighter.instance) {
      SyntaxHighlighter.instance = new SyntaxHighlighter();
    }
    return SyntaxHighlighter.instance;
  }

  /**
   * Initialize language configurations
   */
  private initializeLanguages(): void {
    // JavaScript/TypeScript
    this.languages.set('javascript', {
      name: 'JavaScript',
      extensions: ['.js', '.jsx', '.mjs'],
      keywords: ['const', 'let', 'var', 'function', 'class', 'if', 'else', 'for', 'while', 'return', 'async', 'await', 'import', 'export', 'default', 'try', 'catch', 'throw', 'new', 'this', 'super'],
      types: ['string', 'number', 'boolean', 'object', 'undefined', 'null', 'symbol', 'bigint'],
      builtins: ['console', 'window', 'document', 'process', 'require', 'module', 'exports', 'global', 'Promise', 'Array', 'Object', 'String', 'Number', 'Boolean', 'Date', 'Math', 'JSON'],
      operators: ['=', '+', '-', '*', '/', '%', '++', '--', '==', '===', '!=', '!==', '>', '<', '>=', '<=', '&&', '||', '!', '?', ':', '=>'],
      comments: {
        single: '//',
        multi: { start: '/*', end: '*/' }
      },
      strings: {
        quotes: ['"', "'", '`'],
        multiline: { start: '`', end: '`' }
      }
    });

    this.languages.set('typescript', {
      ...this.languages.get('javascript')!,
      name: 'TypeScript',
      extensions: ['.ts', '.tsx'],
      keywords: [...this.languages.get('javascript')!.keywords, 'interface', 'type', 'enum', 'namespace', 'abstract', 'as', 'implements', 'extends', 'private', 'public', 'protected', 'readonly', 'static'],
      types: [...this.languages.get('javascript')!.types!, 'any', 'void', 'never', 'unknown']
    });

    // Python
    this.languages.set('python', {
      name: 'Python',
      extensions: ['.py', '.pyw'],
      keywords: ['def', 'class', 'if', 'elif', 'else', 'for', 'while', 'return', 'import', 'from', 'as', 'try', 'except', 'finally', 'with', 'lambda', 'yield', 'global', 'nonlocal', 'pass', 'break', 'continue', 'raise', 'assert', 'del', 'in', 'is', 'not', 'and', 'or'],
      types: ['int', 'float', 'str', 'bool', 'list', 'dict', 'set', 'tuple', 'None', 'bytes', 'bytearray'],
      builtins: ['print', 'input', 'len', 'range', 'enumerate', 'zip', 'map', 'filter', 'sorted', 'reversed', 'sum', 'min', 'max', 'abs', 'round', 'open', 'file', 'type', 'isinstance', 'issubclass', 'hasattr', 'getattr', 'setattr'],
      operators: ['=', '+', '-', '*', '/', '//', '%', '**', '==', '!=', '>', '<', '>=', '<=', 'and', 'or', 'not', 'in', 'is'],
      comments: {
        single: '#'
      },
      strings: {
        quotes: ['"', "'"],
        multiline: { start: '"""', end: '"""' }
      }
    });

    // Java
    this.languages.set('java', {
      name: 'Java',
      extensions: ['.java'],
      keywords: ['public', 'private', 'protected', 'static', 'final', 'class', 'interface', 'extends', 'implements', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'return', 'try', 'catch', 'finally', 'throw', 'throws', 'new', 'this', 'super', 'import', 'package', 'abstract', 'synchronized', 'volatile', 'transient'],
      types: ['void', 'boolean', 'byte', 'char', 'short', 'int', 'long', 'float', 'double', 'String', 'Object', 'Integer', 'Boolean', 'Character', 'Double', 'Float', 'Long'],
      builtins: ['System', 'Math', 'String', 'StringBuilder', 'ArrayList', 'HashMap', 'HashSet', 'LinkedList', 'Stack', 'Queue'],
      operators: ['=', '+', '-', '*', '/', '%', '++', '--', '==', '!=', '>', '<', '>=', '<=', '&&', '||', '!', '?', ':', '+=', '-=', '*=', '/='],
      comments: {
        single: '//',
        multi: { start: '/*', end: '*/' }
      },
      strings: {
        quotes: ['"']
      }
    });

    // C/C++
    this.languages.set('cpp', {
      name: 'C++',
      extensions: ['.cpp', '.cc', '.cxx', '.hpp', '.h', '.c'],
      keywords: ['auto', 'break', 'case', 'char', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum', 'extern', 'float', 'for', 'goto', 'if', 'int', 'long', 'register', 'return', 'short', 'signed', 'sizeof', 'static', 'struct', 'switch', 'typedef', 'union', 'unsigned', 'void', 'volatile', 'while', 'class', 'namespace', 'template', 'public', 'private', 'protected', 'virtual', 'override', 'new', 'delete', 'try', 'catch', 'throw'],
      types: ['bool', 'char', 'int', 'float', 'double', 'void', 'wchar_t', 'string', 'vector', 'map', 'set', 'pair'],
      operators: ['=', '+', '-', '*', '/', '%', '++', '--', '==', '!=', '>', '<', '>=', '<=', '&&', '||', '!', '&', '|', '^', '~', '<<', '>>', '?', ':', '->', '.', '::'],
      comments: {
        single: '//',
        multi: { start: '/*', end: '*/' }
      },
      strings: {
        quotes: ['"', "'"]
      }
    });

    // Go
    this.languages.set('go', {
      name: 'Go',
      extensions: ['.go'],
      keywords: ['package', 'import', 'func', 'var', 'const', 'type', 'struct', 'interface', 'if', 'else', 'for', 'range', 'switch', 'case', 'default', 'break', 'continue', 'return', 'go', 'defer', 'select', 'chan', 'map', 'nil'],
      types: ['bool', 'string', 'int', 'int8', 'int16', 'int32', 'int64', 'uint', 'uint8', 'uint16', 'uint32', 'uint64', 'uintptr', 'byte', 'rune', 'float32', 'float64', 'complex64', 'complex128', 'error'],
      builtins: ['make', 'new', 'append', 'copy', 'delete', 'len', 'cap', 'panic', 'recover', 'print', 'println', 'close'],
      operators: ['=', ':=', '+', '-', '*', '/', '%', '++', '--', '==', '!=', '>', '<', '>=', '<=', '&&', '||', '!', '&', '|', '^', '<<', '>>', '<-'],
      comments: {
        single: '//',
        multi: { start: '/*', end: '*/' }
      },
      strings: {
        quotes: ['"', "'", '`']
      }
    });

    // Rust
    this.languages.set('rust', {
      name: 'Rust',
      extensions: ['.rs'],
      keywords: ['fn', 'let', 'mut', 'const', 'static', 'struct', 'enum', 'trait', 'impl', 'if', 'else', 'match', 'for', 'while', 'loop', 'break', 'continue', 'return', 'use', 'mod', 'pub', 'crate', 'self', 'super', 'async', 'await', 'move', 'ref', 'where', 'unsafe', 'extern'],
      types: ['bool', 'char', 'i8', 'i16', 'i32', 'i64', 'i128', 'isize', 'u8', 'u16', 'u32', 'u64', 'u128', 'usize', 'f32', 'f64', 'str', 'String', 'Vec', 'Option', 'Result', 'Box', 'Rc', 'Arc'],
      builtins: ['println!', 'print!', 'format!', 'vec!', 'panic!', 'assert!', 'debug_assert!', 'unimplemented!', 'todo!'],
      operators: ['=', '+', '-', '*', '/', '%', '==', '!=', '>', '<', '>=', '<=', '&&', '||', '!', '&', '|', '^', '<<', '>>', '+=', '-=', '*=', '/=', '%=', '=>', '->', '::'],
      comments: {
        single: '//',
        multi: { start: '/*', end: '*/' }
      },
      strings: {
        quotes: ['"', "'"]
      }
    });

    // SQL
    this.languages.set('sql', {
      name: 'SQL',
      extensions: ['.sql'],
      keywords: ['SELECT', 'FROM', 'WHERE', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'TABLE', 'DATABASE', 'INDEX', 'VIEW', 'PROCEDURE', 'FUNCTION', 'TRIGGER', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'OUTER', 'ON', 'AS', 'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET', 'UNION', 'ALL', 'DISTINCT', 'AND', 'OR', 'NOT', 'IN', 'EXISTS', 'BETWEEN', 'LIKE', 'IS', 'NULL', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END'],
      types: ['INT', 'INTEGER', 'BIGINT', 'SMALLINT', 'DECIMAL', 'NUMERIC', 'FLOAT', 'REAL', 'DOUBLE', 'CHAR', 'VARCHAR', 'TEXT', 'DATE', 'TIME', 'TIMESTAMP', 'DATETIME', 'BOOLEAN', 'BLOB'],
      operators: ['=', '!=', '<>', '>', '<', '>=', '<=', '+', '-', '*', '/', '%', '||'],
      comments: {
        single: '--',
        multi: { start: '/*', end: '*/' }
      },
      strings: {
        quotes: ["'", '"']
      }
    });

    // HTML
    this.languages.set('html', {
      name: 'HTML',
      extensions: ['.html', '.htm'],
      keywords: ['html', 'head', 'body', 'div', 'span', 'a', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'table', 'tr', 'td', 'th', 'form', 'input', 'button', 'select', 'option', 'textarea', 'img', 'video', 'audio', 'canvas', 'svg', 'header', 'footer', 'nav', 'main', 'section', 'article', 'aside'],
      operators: ['=', '/', '>'],
      comments: {
        multi: { start: '<!--', end: '-->' }
      },
      strings: {
        quotes: ['"', "'"]
      }
    });

    // CSS
    this.languages.set('css', {
      name: 'CSS',
      extensions: ['.css', '.scss', '.sass', '.less'],
      keywords: ['color', 'background', 'border', 'margin', 'padding', 'width', 'height', 'display', 'position', 'top', 'right', 'bottom', 'left', 'float', 'clear', 'font', 'text', 'line', 'vertical', 'align', 'overflow', 'z-index', 'opacity', 'transform', 'transition', 'animation', 'flex', 'grid'],
      types: ['px', 'em', 'rem', '%', 'vh', 'vw', 'deg', 'rad', 's', 'ms'],
      operators: [':', ';', '{', '}', ',', '>', '+', '~', '*', '.', '#', '[', ']', '(', ')'],
      comments: {
        multi: { start: '/*', end: '*/' }
      },
      strings: {
        quotes: ['"', "'"]
      }
    });

    // JSON
    this.languages.set('json', {
      name: 'JSON',
      extensions: ['.json'],
      keywords: ['true', 'false', 'null'],
      types: [],
      operators: [':', ',', '{', '}', '[', ']'],
      comments: {},
      strings: {
        quotes: ['"']
      }
    });

    // YAML
    this.languages.set('yaml', {
      name: 'YAML',
      extensions: ['.yml', '.yaml'],
      keywords: ['true', 'false', 'null', 'yes', 'no', 'on', 'off'],
      types: [],
      operators: [':', '-', '|', '>'],
      comments: {
        single: '#'
      },
      strings: {
        quotes: ['"', "'"]
      }
    });

    // Markdown
    this.languages.set('markdown', {
      name: 'Markdown',
      extensions: ['.md', '.markdown'],
      keywords: [],
      types: [],
      operators: ['#', '*', '-', '+', '_', '`', '[', ']', '(', ')', '!', '>'],
      comments: {},
      strings: {
        quotes: []
      }
    });

    // Shell/Bash
    this.languages.set('bash', {
      name: 'Bash',
      extensions: ['.sh', '.bash'],
      keywords: ['if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'do', 'done', 'case', 'esac', 'function', 'return', 'break', 'continue', 'exit', 'export', 'source', 'alias', 'unset', 'shift', 'readonly', 'local'],
      builtins: ['echo', 'printf', 'read', 'cd', 'ls', 'pwd', 'mkdir', 'rm', 'cp', 'mv', 'touch', 'cat', 'grep', 'sed', 'awk', 'find', 'sort', 'uniq', 'cut', 'tr', 'head', 'tail', 'wc', 'date', 'sleep', 'kill', 'ps', 'df', 'du', 'tar', 'gzip', 'curl', 'wget', 'ssh', 'scp', 'git', 'docker', 'npm', 'node', 'python', 'pip', 'apt', 'yum', 'brew', 'sudo'],
      operators: ['=', '==', '!=', '>', '<', '>=', '<=', '&&', '||', '!', '|', '&', ';', '$(', '${', '[[', ']]', '((', '))'],
      comments: {
        single: '#'
      },
      strings: {
        quotes: ['"', "'"]
      }
    });

    // Dockerfile
    this.languages.set('dockerfile', {
      name: 'Dockerfile',
      extensions: ['Dockerfile', '.dockerfile'],
      keywords: ['FROM', 'RUN', 'CMD', 'LABEL', 'EXPOSE', 'ENV', 'ADD', 'COPY', 'ENTRYPOINT', 'VOLUME', 'USER', 'WORKDIR', 'ARG', 'ONBUILD', 'STOPSIGNAL', 'HEALTHCHECK', 'SHELL'],
      types: [],
      operators: ['=', '&&', '||', '\\'],
      comments: {
        single: '#'
      },
      strings: {
        quotes: ['"', "'"]
      }
    });
  }

  /**
   * Detect language from file extension
   */
  detectLanguage(filename: string): string {
    const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
    
    for (const [lang, config] of this.languages.entries()) {
      if (config.extensions.includes(ext)) {
        return lang;
      }
    }

    // Special cases
    if (filename === 'Dockerfile' || filename.endsWith('.dockerfile')) {
      return 'dockerfile';
    }

    return 'text';
  }

  /**
   * Highlight code for Discord
   */
  highlightForDiscord(
    code: string,
    language: string,
    options: {
      lineNumbers?: boolean;
      startLine?: number;
      highlightLines?: number[];
      maxLength?: number;
    } = {}
  ): string {
    const { lineNumbers = false, startLine = 1, highlightLines = [], maxLength = 2000 } = options;
    
    // Discord uses standard markdown code blocks
    let highlighted = `\`\`\`${language}\n`;
    
    const lines = code.split('\n');
    let totalLength = highlighted.length;
    
    lines.forEach((line, index) => {
      const lineNum = startLine + index;
      const isHighlighted = highlightLines.includes(lineNum);
      
      let formattedLine = '';
      
      if (lineNumbers) {
        formattedLine = `${lineNum.toString().padStart(4, ' ')} │ `;
      }
      
      if (isHighlighted) {
        formattedLine = `> ${formattedLine}`;
      }
      
      formattedLine += line;
      
      // Check if adding this line would exceed max length
      if (totalLength + formattedLine.length + 4 > maxLength) {
        highlighted += `\n... (truncated)\n`;
        break;
      }
      
      highlighted += formattedLine + '\n';
      totalLength += formattedLine.length + 1;
    });
    
    highlighted += '```';
    
    return highlighted;
  }

  /**
   * Format diff with syntax highlighting
   */
  highlightDiff(
    diff: string,
    options: {
      maxLines?: number;
      contextLines?: number;
    } = {}
  ): string {
    const { maxLines = 50 } = options;
    
    const lines = diff.split('\n');
    let highlighted = '```diff\n';
    let linesShown = 0;

    for (const line of lines) {
      if (linesShown >= maxLines) {
        highlighted += `\n... ${lines.length - linesShown} more lines ...\n`;
        break;
      }

      if (line.startsWith('+') && !line.startsWith('+++')) {
        // Addition - will be green in Discord
        highlighted += line + '\n';
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        // Deletion - will be red in Discord
        highlighted += line + '\n';
      } else if (line.startsWith('@@')) {
        // Hunk header - will be cyan in Discord
        highlighted += line + '\n';
      } else if (line.startsWith('diff --git') || line.startsWith('index ')) {
        // File headers
        highlighted += line + '\n';
      } else {
        // Context line
        highlighted += ' ' + line + '\n';
      }
      
      linesShown++;
    }

    highlighted += '```';
    
    return highlighted;
  }

  /**
   * Highlight inline code snippets
   */
  highlightInline(code: string, language?: string): string {
    // For inline code, Discord doesn't support syntax highlighting
    // But we can use backticks for monospace formatting
    return `\`${code}\``;
  }

  /**
   * Highlight error messages
   */
  highlightError(
    error: string,
    options: {
      lineNumber?: number;
      columnNumber?: number;
      filename?: string;
      suggestion?: string;
    } = {}
  ): string {
    let highlighted = '```ansi\n';
    
    // ANSI color codes work in Discord code blocks with 'ansi' language
    // Red for errors
    highlighted += '\u001b[31m'; // Red
    
    if (options.filename) {
      highlighted += `File: ${options.filename}\n`;
    }
    
    if (options.lineNumber) {
      highlighted += `Line ${options.lineNumber}`;
      if (options.columnNumber) {
        highlighted += `:${options.columnNumber}`;
      }
      highlighted += '\n';
    }
    
    highlighted += `\u001b[0m`; // Reset
    highlighted += error + '\n';
    
    if (options.suggestion) {
      highlighted += '\u001b[33m'; // Yellow
      highlighted += `\nSuggestion: ${options.suggestion}\n`;
      highlighted += '\u001b[0m'; // Reset
    }
    
    highlighted += '```';
    
    return highlighted;
  }

  /**
   * Format code block with language detection
   */
  formatCodeBlock(
    code: string,
    filename?: string,
    options: {
      lineNumbers?: boolean;
      maxLines?: number;
    } = {}
  ): string {
    const language = filename ? this.detectLanguage(filename) : 'text';
    
    return this.highlightForDiscord(code, language, options);
  }

  /**
   * Extract code blocks from markdown
   */
  extractCodeBlocks(markdown: string): Array<{
    language: string;
    code: string;
    startLine: number;
    endLine: number;
  }> {
    const blocks: Array<{ language: string; code: string; startLine: number; endLine: number }> = [];
    const lines = markdown.split('\n');
    
    let inCodeBlock = false;
    let currentBlock: { language: string; code: string[]; startLine: number } | null = null;
    
    lines.forEach((line, index) => {
      if (line.startsWith('```')) {
        if (!inCodeBlock) {
          // Starting a code block
          const language = line.substring(3).trim() || 'text';
          currentBlock = {
            language,
            code: [],
            startLine: index + 1
          };
          inCodeBlock = true;
        } else {
          // Ending a code block
          if (currentBlock) {
            blocks.push({
              language: currentBlock.language,
              code: currentBlock.code.join('\n'),
              startLine: currentBlock.startLine,
              endLine: index
            });
          }
          currentBlock = null;
          inCodeBlock = false;
        }
      } else if (inCodeBlock && currentBlock) {
        currentBlock.code.push(line);
      }
    });
    
    return blocks;
  }

  /**
   * Get language statistics from code
   */
  getLanguageStats(code: string, language: string): {
    lines: number;
    characters: number;
    keywords: number;
    comments: number;
  } {
    const config = this.languages.get(language);
    if (!config) {
      return {
        lines: code.split('\n').length,
        characters: code.length,
        keywords: 0,
        comments: 0
      };
    }

    const lines = code.split('\n');
    let keywordCount = 0;
    let commentLines = 0;

    lines.forEach(line => {
      // Count keywords
      config.keywords.forEach(keyword => {
        const regex = new RegExp(`\\b${keyword}\\b`, 'g');
        const matches = line.match(regex);
        if (matches) {
          keywordCount += matches.length;
        }
      });

      // Count comment lines
      if (config.comments?.single && line.trim().startsWith(config.comments.single)) {
        commentLines++;
      }
    });

    return {
      lines: lines.length,
      characters: code.length,
      keywords: keywordCount,
      comments: commentLines
    };
  }

  /**
   * Get supported languages
   */
  getSupportedLanguages(): string[] {
    return Array.from(this.languages.keys());
  }

  /**
   * Get language configuration
   */
  getLanguageConfig(language: string): LanguageConfig | undefined {
    return this.languages.get(language);
  }
}