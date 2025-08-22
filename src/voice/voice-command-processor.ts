import { EventEmitter } from 'events';
import { SessionManager } from '../claude/session-manager';
import { logger } from '../utils/logger';

interface CommandContext {
  userId: string;
  sessionId: string;
  channelId: string;
  guildId: string;
}

interface CommandResponse {
  text: string;
  voice?: string;
  speed?: number;
  action?: string;
  data?: any;
}

interface VoiceCommandHandler {
  pattern: RegExp;
  handler: (match: RegExpMatchArray, context: CommandContext) => Promise<CommandResponse>;
  description: string;
}

export class VoiceCommandProcessor extends EventEmitter {
  private static instance: VoiceCommandProcessor;
  private sessionManager: SessionManager;
  private commands: VoiceCommandHandler[] = [];

  private constructor() {
    super();
    this.sessionManager = SessionManager.getInstance();
    this.registerCommands();
  }

  static getInstance(): VoiceCommandProcessor {
    if (!VoiceCommandProcessor.instance) {
      VoiceCommandProcessor.instance = new VoiceCommandProcessor();
    }
    return VoiceCommandProcessor.instance;
  }

  private registerCommands(): void {
    // Code execution commands
    this.registerCommand({
      pattern: /^(?:run|execute|exec)\s+(.+)$/i,
      description: 'Execute a command',
      handler: async (match, context) => {
        const command = match[1];
        const session = await this.sessionManager.getOrCreateSession(context.userId, {
          type: 'tmux',
          persistent: true
        });

        const result = await session.executeCommand(command);
        return {
          text: result.output || 'Command executed successfully',
          action: 'command_executed',
          data: { command, output: result.output }
        };
      }
    });

    // File operations
    this.registerCommand({
      pattern: /^(?:create|make|new)\s+(?:a\s+)?file\s+(?:named\s+)?(.+)$/i,
      description: 'Create a new file',
      handler: async (match, context) => {
        const filename = match[1].replace(/['"]/g, '');
        const session = await this.sessionManager.getOrCreateSession(context.userId);
        
        await session.executeCommand(`touch ${filename}`);
        return {
          text: `Created file ${filename}`,
          action: 'file_created',
          data: { filename }
        };
      }
    });

    this.registerCommand({
      pattern: /^(?:read|show|display|cat)\s+(?:file\s+)?(.+)$/i,
      description: 'Read a file',
      handler: async (match, context) => {
        const filename = match[1].replace(/['"]/g, '');
        const session = await this.sessionManager.getOrCreateSession(context.userId);
        
        const result = await session.executeCommand(`cat ${filename}`);
        return {
          text: result.output || `Contents of ${filename}`,
          action: 'file_read',
          data: { filename, content: result.output }
        };
      }
    });

    // Git commands
    this.registerCommand({
      pattern: /^git\s+(.+)$/i,
      description: 'Execute git command',
      handler: async (match, context) => {
        const gitCommand = match[1];
        const session = await this.sessionManager.getOrCreateSession(context.userId);
        
        const result = await session.executeCommand(`git ${gitCommand}`);
        return {
          text: result.output || 'Git command executed',
          action: 'git_command',
          data: { command: gitCommand, output: result.output }
        };
      }
    });

    // Search commands
    this.registerCommand({
      pattern: /^(?:search|find|grep)\s+(?:for\s+)?['"]?(.+?)['"]?\s+(?:in\s+)?(.*)$/i,
      description: 'Search for text in files',
      handler: async (match, context) => {
        const searchTerm = match[1];
        const location = match[2] || '.';
        const session = await this.sessionManager.getOrCreateSession(context.userId);
        
        const result = await session.executeCommand(`grep -r "${searchTerm}" ${location}`);
        return {
          text: result.output || `No matches found for "${searchTerm}"`,
          action: 'search',
          data: { searchTerm, location, results: result.output }
        };
      }
    });

    // Navigation commands
    this.registerCommand({
      pattern: /^(?:go\s+to|cd|change\s+directory\s+to)\s+(.+)$/i,
      description: 'Change directory',
      handler: async (match, context) => {
        const directory = match[1].replace(/['"]/g, '');
        const session = await this.sessionManager.getOrCreateSession(context.userId);
        
        await session.executeCommand(`cd ${directory}`);
        const pwd = await session.executeCommand('pwd');
        return {
          text: `Changed directory to ${pwd.output?.trim()}`,
          action: 'directory_changed',
          data: { directory: pwd.output?.trim() }
        };
      }
    });

    this.registerCommand({
      pattern: /^(?:list|ls|show)\s+(?:files|directory|folder)?\s*(.*)$/i,
      description: 'List files in directory',
      handler: async (match, context) => {
        const directory = match[1] || '.';
        const session = await this.sessionManager.getOrCreateSession(context.userId);
        
        const result = await session.executeCommand(`ls -la ${directory}`);
        return {
          text: result.output || 'Directory listing',
          action: 'directory_listed',
          data: { directory, listing: result.output }
        };
      }
    });

    // Code generation
    this.registerCommand({
      pattern: /^(?:write|generate|create)\s+(?:code\s+for\s+)?(.+)$/i,
      description: 'Generate code',
      handler: async (match, context) => {
        const description = match[1];
        const session = await this.sessionManager.getOrCreateSession(context.userId);
        
        // Send to Claude for code generation
        const prompt = `Generate code for: ${description}`;
        const response = await session.sendMessage(prompt);
        
        return {
          text: response.content || 'Here is the generated code',
          action: 'code_generated',
          data: { description, code: response.content }
        };
      }
    });

    // Help and status
    this.registerCommand({
      pattern: /^(?:help|what can you do|commands)$/i,
      description: 'Show available commands',
      handler: async (match, context) => {
        const commandList = this.commands
          .map(cmd => `• ${cmd.description}`)
          .join('\n');
        
        return {
          text: `I can help you with:\n${commandList}`,
          action: 'help',
          data: { commands: this.commands.map(c => c.description) }
        };
      }
    });

    this.registerCommand({
      pattern: /^(?:status|info|session info)$/i,
      description: 'Show session status',
      handler: async (match, context) => {
        const session = await this.sessionManager.getOrCreateSession(context.userId);
        const info = session.getInfo();
        
        return {
          text: `Session ${info.id} is ${info.status}. Created ${new Date(info.createdAt).toLocaleString()}`,
          action: 'status',
          data: info
        };
      }
    });

    // Session management
    this.registerCommand({
      pattern: /^(?:clear|reset|new session)$/i,
      description: 'Clear or reset session',
      handler: async (match, context) => {
        await this.sessionManager.clearSession(context.userId);
        const session = await this.sessionManager.getOrCreateSession(context.userId);
        
        return {
          text: 'Started a new session',
          action: 'session_reset',
          data: { sessionId: session.getInfo().id }
        };
      }
    });

    logger.info(`Registered ${this.commands.length} voice commands`);
  }

  private registerCommand(command: VoiceCommandHandler): void {
    this.commands.push(command);
  }

  async process(input: string, context: CommandContext): Promise<CommandResponse> {
    const normalizedInput = input.trim();
    
    // Try to match against registered commands
    for (const command of this.commands) {
      const match = normalizedInput.match(command.pattern);
      if (match) {
        try {
          logger.info(`Processing voice command: ${command.description}`);
          const response = await command.handler(match, context);
          
          this.emit('commandProcessed', {
            input: normalizedInput,
            command: command.description,
            response,
            context
          });
          
          return response;
        } catch (error) {
          logger.error(`Error processing voice command: ${error}`);
          return {
            text: `Sorry, I encountered an error: ${error.message}`,
            action: 'error',
            data: { error: error.message }
          };
        }
      }
    }

    // If no command matched, send to Claude as a general query
    try {
      const session = await this.sessionManager.getOrCreateSession(context.userId);
      const response = await session.sendMessage(normalizedInput);
      
      return {
        text: response.content || 'I processed your request',
        action: 'claude_response',
        data: { query: normalizedInput, response: response.content }
      };
    } catch (error) {
      logger.error(`Error sending to Claude: ${error}`);
      return {
        text: 'Sorry, I could not understand that command. Try saying "help" for available commands.',
        action: 'unknown_command',
        data: { input: normalizedInput }
      };
    }
  }

  getCommands(): VoiceCommandHandler[] {
    return this.commands;
  }

  async processNaturalLanguage(input: string, context: CommandContext): Promise<CommandResponse> {
    // Enhanced natural language processing
    const lowerInput = input.toLowerCase();
    
    // Intent detection
    const intents = {
      create_file: /(?:create|make|new|add)\s+(?:a\s+)?file/i,
      run_command: /(?:run|execute|exec|do)\s+(.+)/i,
      search: /(?:search|find|look for|grep)/i,
      navigate: /(?:go to|navigate|cd|change directory)/i,
      code_gen: /(?:write|generate|create)\s+(?:code|function|class)/i,
      git: /(?:commit|push|pull|clone|branch)/i,
      help: /(?:help|what can|how do|explain)/i
    };

    for (const [intent, pattern] of Object.entries(intents)) {
      if (pattern.test(lowerInput)) {
        logger.info(`Detected intent: ${intent}`);
        // Route to appropriate handler based on intent
        return this.process(input, context);
      }
    }

    // Fallback to Claude for complex queries
    return this.process(input, context);
  }
}