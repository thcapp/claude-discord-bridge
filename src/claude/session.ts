import { Message, TextChannel, EmbedBuilder } from 'discord.js';
import { TmuxManager } from './tmux-manager';
import { PtyManager } from './pty-manager';
import { OutputParser } from './output-parser';
import { SessionManager } from './session-manager';
import { logger } from '../utils/logger';
import { config } from '../config';

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  id: string;
}

export class Session {
  public readonly id: string;
  public readonly userId: string;
  public readonly channelId: string;
  public readonly createdAt: number;
  
  public status: 'active' | 'idle' | 'stopped' = 'active';
  public model: string = 'default';
  public messageCount: number = 0;
  
  private messages: ClaudeMessage[] = [];
  private processManager: TmuxManager | PtyManager | null = null;
  private outputParser: OutputParser;
  private lastActivity: number;
  private sessionManager: SessionManager;
  private currentMessageIndex: number = 0;
  private channel: TextChannel | null = null;
  private lastBotMessage: Message | null = null;

  constructor(id: string, userId: string, channelId: string, sessionManager: SessionManager) {
    this.id = id;
    this.userId = userId;
    this.channelId = channelId;
    this.sessionManager = sessionManager;
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
    this.outputParser = new OutputParser();
  }

  async initialize(): Promise<void> {
    try {
      if (config.claude.sessionType === 'tmux') {
        this.processManager = new TmuxManager(this.id);
      } else {
        this.processManager = new PtyManager(this.id);
      }
      
      await this.processManager.initialize();
      
      this.processManager.on('output', (data: string) => {
        this.handleOutput(data);
      });
      
      this.processManager.on('error', (error: Error) => {
        logger.error(`Session ${this.id} process error:`, error);
      });
      
      this.processManager.on('exit', () => {
        this.status = 'stopped';
        logger.info(`Session ${this.id} process exited`);
      });
      
      logger.info(`Session ${this.id} initialized with ${config.claude.sessionType}`);
    } catch (error) {
      logger.error(`Failed to initialize session ${this.id}:`, error);
      throw error;
    }
  }

  async sendMessage(content: string, discordMessage?: Message): Promise<void> {
    this.lastActivity = Date.now();
    
    const message: ClaudeMessage = {
      role: 'user',
      content,
      timestamp: Date.now(),
      id: this.generateMessageId()
    };
    
    this.messages.push(message);
    this.messageCount++;
    
    if (this.processManager) {
      await this.processManager.sendInput(content);
    }
    
    if (discordMessage) {
      this.channel = discordMessage.channel as TextChannel;
      await this.sendTypingIndicator();
    }
    
    logger.info(`Session ${this.id}: User message sent`);
  }

  async continue(): Promise<void> {
    await this.sendMessage('continue');
  }

  async regenerate(): Promise<void> {
    if (this.messages.length > 0) {
      const lastUserMessage = [...this.messages]
        .reverse()
        .find(m => m.role === 'user');
      
      if (lastUserMessage) {
        this.messages = this.messages.slice(0, -2);
        await this.sendMessage(lastUserMessage.content);
      }
    }
  }

  async stop(): Promise<void> {
    if (this.processManager) {
      await this.processManager.stop();
    }
    this.status = 'idle';
  }

  async destroy(): Promise<void> {
    if (this.processManager) {
      await this.processManager.destroy();
    }
    this.status = 'stopped';
  }

  async setModel(model: string): Promise<void> {
    this.model = model;
    if (this.processManager) {
      await this.processManager.sendInput(`/model ${model}`);
    }
  }

  async switchProject(projectId: string): Promise<void> {
    if (this.processManager) {
      await this.processManager.sendInput(`/project ${projectId}`);
    }
  }

  async activate(): Promise<void> {
    this.status = 'active';
    this.lastActivity = Date.now();
  }

  async jumpToMessage(messageId: string): Promise<void> {
    const index = this.messages.findIndex(m => m.id === messageId);
    if (index >= 0) {
      this.currentMessageIndex = index;
      await this.displayCurrentMessage();
    }
  }

  async navigateToFirst(): Promise<void> {
    this.currentMessageIndex = 0;
    await this.displayCurrentMessage();
  }

  async navigatePrevious(): Promise<void> {
    if (this.currentMessageIndex > 0) {
      this.currentMessageIndex--;
      await this.displayCurrentMessage();
    }
  }

  async navigateNext(): Promise<void> {
    if (this.currentMessageIndex < this.messages.length - 1) {
      this.currentMessageIndex++;
      await this.displayCurrentMessage();
    }
  }

  async navigateToLast(): Promise<void> {
    this.currentMessageIndex = this.messages.length - 1;
    await this.displayCurrentMessage();
  }

  async copyFrom(source: Session): Promise<void> {
    this.messages = [...source.messages];
    this.messageCount = source.messageCount;
    this.model = source.model;
  }

  async getDebugInfo(): Promise<any> {
    return {
      id: this.id,
      status: this.status,
      messageCount: this.messageCount,
      created: new Date(this.createdAt).toISOString(),
      lastActive: new Date(this.lastActivity).toISOString(),
      process: this.processManager ? 'active' : 'none',
      lastError: null
    };
  }

  async serialize(): Promise<any> {
    return {
      messages: this.messages,
      messageCount: this.messageCount,
      model: this.model,
      status: this.status,
      lastActivity: this.lastActivity
    };
  }

  restore(data: any): void {
    this.messages = data.messages || [];
    this.messageCount = data.messageCount || 0;
    this.model = data.model || 'default';
    this.status = data.status || 'idle';
    this.lastActivity = data.lastActivity || Date.now();
  }

  async export(): Promise<any> {
    return {
      id: this.id,
      userId: this.userId,
      channelId: this.channelId,
      createdAt: this.createdAt,
      messages: this.messages,
      model: this.model,
      status: this.status
    };
  }

  private async handleOutput(data: string): Promise<void> {
    const parsed = this.outputParser.parse(data);
    
    if (parsed.type === 'response') {
      const message: ClaudeMessage = {
        role: 'assistant',
        content: parsed.content,
        timestamp: Date.now(),
        id: this.generateMessageId()
      };
      
      this.messages.push(message);
      await this.sendToDiscord(parsed);
    } else if (parsed.type === 'progress') {
      await this.updateProgress(parsed);
    } else if (parsed.type === 'error') {
      await this.sendErrorToDiscord(parsed.content);
    }
  }

  private async sendToDiscord(parsed: any): Promise<void> {
    if (!this.channel) return;
    
    try {
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setAuthor({ name: 'Claude Code' })
        .setDescription(parsed.content.slice(0, 4000))
        .setFooter({ text: `Session: ${this.id}` })
        .setTimestamp();
      
      if (parsed.tools && parsed.tools.length > 0) {
        embed.addFields({
          name: '🔧 Tools Used',
          value: parsed.tools.join(', '),
          inline: true
        });
      }
      
      const componentHandler = require('../interactions/component-handler').ComponentHandler;
      const handler = new componentHandler(this.sessionManager);
      const controlPanel = handler.createControlPanel(this.id);
      
      const message = await this.channel.send({
        embeds: [embed],
        components: [controlPanel]
      });
      
      this.lastBotMessage = message;
    } catch (error) {
      logger.error(`Failed to send message to Discord:`, error);
    }
  }

  private async sendErrorToDiscord(error: string): Promise<void> {
    if (!this.channel) return;
    
    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('❌ Error')
      .setDescription(error)
      .setFooter({ text: `Session: ${this.id}` })
      .setTimestamp();
    
    await this.channel.send({ embeds: [embed] });
  }

  private async updateProgress(parsed: any): Promise<void> {
    if (!this.channel || !this.lastBotMessage) return;
    
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🔄 Claude is working...')
      .setDescription(parsed.content)
      .addFields({
        name: 'Progress',
        value: this.createProgressBar(parsed.progress || 0),
        inline: false
      })
      .setFooter({ text: `Session: ${this.id}` })
      .setTimestamp();
    
    try {
      await this.lastBotMessage.edit({ embeds: [embed] });
    } catch (error) {
      logger.error('Failed to update progress:', error);
    }
  }

  private async displayCurrentMessage(): Promise<void> {
    if (!this.channel || this.messages.length === 0) return;
    
    const message = this.messages[this.currentMessageIndex];
    const embed = new EmbedBuilder()
      .setColor(message.role === 'user' ? 0x00FF00 : 0x5865F2)
      .setAuthor({ name: message.role === 'user' ? 'User' : 'Claude' })
      .setDescription(message.content.slice(0, 4000))
      .setFooter({ 
        text: `Message ${this.currentMessageIndex + 1}/${this.messages.length} • ${new Date(message.timestamp).toLocaleString()}` 
      });
    
    await this.channel.send({ embeds: [embed] });
  }

  private async sendTypingIndicator(): Promise<void> {
    if (this.channel) {
      await this.channel.sendTyping();
    }
  }

  private createProgressBar(percent: number): string {
    const filled = Math.floor(percent / 5);
    const empty = 20 - filled;
    return `${'█'.repeat(filled)}${'░'.repeat(empty)} ${percent}%`;
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}