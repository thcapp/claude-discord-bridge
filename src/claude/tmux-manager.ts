import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import { logger } from '../utils/logger';
import { config } from '../config';

export class TmuxManager extends EventEmitter {
  private sessionName: string;
  private process: ChildProcess | null = null;
  private buffer: string = '';

  constructor(sessionId: string) {
    super();
    this.sessionName = `claude_${sessionId}`;
  }

  async initialize(): Promise<void> {
    try {
      await this.createTmuxSession();
      await this.startClaude();
      this.attachToSession();
    } catch (error) {
      logger.error(`Failed to initialize tmux session ${this.sessionName}:`, error);
      throw error;
    }
  }

  private async createTmuxSession(): Promise<void> {
    return new Promise((resolve, reject) => {
      const create = spawn('tmux', ['new-session', '-d', '-s', this.sessionName]);
      
      create.on('close', (code) => {
        if (code === 0) {
          logger.info(`Created tmux session: ${this.sessionName}`);
          resolve();
        } else {
          reject(new Error(`Failed to create tmux session: ${code}`));
        }
      });
    });
  }

  private async startClaude(): Promise<void> {
    await this.sendToTmux(config.claude.cliPath);
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  private attachToSession(): void {
    this.process = spawn('tmux', ['capture-pane', '-t', this.sessionName, '-p', '-S', '-']);
    
    if (this.process.stdout) {
      this.process.stdout.on('data', (data) => {
        this.handleOutput(data.toString());
      });
    }
    
    if (this.process.stderr) {
      this.process.stderr.on('data', (data) => {
        logger.error(`Tmux stderr: ${data}`);
      });
    }
    
    this.process.on('error', (error) => {
      this.emit('error', error);
    });
    
    this.process.on('close', (code) => {
      this.emit('exit', code);
    });
    
    this.startOutputCapture();
  }

  private startOutputCapture(): void {
    const captureInterval = setInterval(() => {
      if (!this.process) {
        clearInterval(captureInterval);
        return;
      }
      
      const capture = spawn('tmux', ['capture-pane', '-t', this.sessionName, '-p']);
      let output = '';
      
      capture.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      capture.on('close', () => {
        if (output && output !== this.buffer) {
          const newContent = output.slice(this.buffer.length);
          if (newContent) {
            this.handleOutput(newContent);
          }
          this.buffer = output;
        }
      });
    }, 500);
    
    this.on('exit', () => clearInterval(captureInterval));
  }

  async sendInput(input: string): Promise<void> {
    await this.sendToTmux(input);
  }

  private async sendToTmux(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const send = spawn('tmux', ['send-keys', '-t', this.sessionName, text, 'Enter']);
      
      send.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Failed to send to tmux: ${code}`));
        }
      });
    });
  }

  async stop(): Promise<void> {
    await this.sendToTmux('C-c');
  }

  async destroy(): Promise<void> {
    return new Promise((resolve) => {
      const kill = spawn('tmux', ['kill-session', '-t', this.sessionName]);
      
      kill.on('close', () => {
        if (this.process) {
          this.process.kill();
        }
        logger.info(`Destroyed tmux session: ${this.sessionName}`);
        resolve();
      });
    });
  }

  private handleOutput(data: string): void {
    const lines = data.split('\n').filter(line => line.trim());
    lines.forEach(line => {
      this.emit('output', line);
    });
  }
}