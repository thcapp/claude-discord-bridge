import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import { logger } from '../utils/logger';
import { config } from '../config';

export class PtyManager extends EventEmitter {
  private process: ChildProcess | null = null;
  private sessionId: string;

  constructor(sessionId: string) {
    super();
    this.sessionId = sessionId;
  }

  async initialize(): Promise<void> {
    try {
      this.process = spawn(config.claude.cliPath, [], {
        cwd: process.cwd(),
        env: process.env,
        shell: true
      });

      if (this.process.stdout) {
        this.process.stdout.on('data', (data) => {
          this.handleOutput(data.toString());
        });
      }

      if (this.process.stderr) {
        this.process.stderr.on('data', (data) => {
          logger.error(`Process stderr: ${data}`);
        });
      }

      this.process.on('exit', (code) => {
        logger.info(`Process exited with code ${code}`);
        this.emit('exit', code);
      });

      this.process.on('error', (error) => {
        logger.error(`Process error:`, error);
        this.emit('error', error);
      });

      logger.info(`PTY session initialized: ${this.sessionId}`);
    } catch (error) {
      logger.error(`Failed to initialize PTY session ${this.sessionId}:`, error);
      throw error;
    }
  }

  async sendInput(input: string): Promise<void> {
    if (this.process && this.process.stdin) {
      this.process.stdin.write(input + '\n');
    }
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill('SIGINT');
    }
  }

  async destroy(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  private handleOutput(data: string): void {
    const cleanData = this.stripAnsiCodes(data);
    const lines = cleanData.split('\n').filter(line => line.trim());
    
    lines.forEach(line => {
      this.emit('output', line);
    });
  }

  private stripAnsiCodes(str: string): string {
    return str.replace(/\x1b\[[0-9;]*m/g, '');
  }
}