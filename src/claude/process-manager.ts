import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import * as pty from 'node-pty';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';

interface ManagedProcess {
  id: string;
  name: string;
  command: string;
  cwd: string;
  userId: string;
  process: ChildProcess | pty.IPty;
  status: 'running' | 'stopped' | 'error' | 'killed';
  startTime: number;
  endTime?: number;
  exitCode?: number;
  output: string[];
  errorOutput: string[];
  maxOutputSize: number;
}

export class ProcessManager extends EventEmitter {
  private static instance: ProcessManager;
  private processes: Map<string, ManagedProcess>;
  private outputBuffers: Map<string, string>;
  private readonly MAX_OUTPUT_SIZE = 1024 * 1024; // 1MB per process
  private readonly MAX_PROCESSES = 50;
  private cleanupInterval: NodeJS.Timeout;

  private constructor() {
    super();
    this.processes = new Map();
    this.outputBuffers = new Map();
    
    // Cleanup dead processes every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupDeadProcesses();
    }, 5 * 60 * 1000);
  }

  static getInstance(): ProcessManager {
    if (!ProcessManager.instance) {
      ProcessManager.instance = new ProcessManager();
    }
    return ProcessManager.instance;
  }

  async startBackgroundProcess(
    command: string,
    cwd: string,
    userId: string,
    name?: string
  ): Promise<string> {
    if (this.processes.size >= this.MAX_PROCESSES) {
      throw new Error('Maximum number of processes reached');
    }

    const processId = uuidv4();
    const processName = name || command.split(' ')[0];

    // Use PTY for better terminal emulation
    const ptyProcess = pty.spawn('bash', ['-c', command], {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd,
      env: {
        ...process.env,
        TERM: 'xterm-color',
        NODE_ENV: 'production'
      }
    });

    const managedProcess: ManagedProcess = {
      id: processId,
      name: processName,
      command,
      cwd,
      userId,
      process: ptyProcess,
      status: 'running',
      startTime: Date.now(),
      output: [],
      errorOutput: [],
      maxOutputSize: this.MAX_OUTPUT_SIZE
    };

    // Handle output
    ptyProcess.onData((data: string) => {
      this.handleProcessOutput(processId, data, 'stdout');
    });

    // Handle exit
    ptyProcess.onExit((exitCode) => {
      this.handleProcessExit(processId, exitCode.exitCode);
    });

    this.processes.set(processId, managedProcess);
    this.outputBuffers.set(processId, '');

    logger.info(`Started background process: ${processId} (${processName})`);
    this.emit('processStarted', { processId, name: processName, userId });

    return processId;
  }

  async startStreamingProcess(
    command: string,
    cwd: string,
    timeout: number,
    onData: (data: string) => void
  ): Promise<string> {
    const processId = uuidv4();
    let outputBuffer = '';
    let killed = false;

    return new Promise((resolve, reject) => {
      const ptyProcess = pty.spawn('bash', ['-c', command], {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd,
        env: process.env
      });

      // Set timeout
      const timeoutHandle = setTimeout(() => {
        if (!killed) {
          killed = true;
          ptyProcess.kill();
          reject(new Error(`Command timed out after ${timeout/1000}s`));
        }
      }, timeout);

      // Handle output
      ptyProcess.onData((data: string) => {
        outputBuffer += data;
        
        // Call the streaming callback
        if (onData) {
          onData(outputBuffer);
        }
        
        // Limit buffer size
        if (outputBuffer.length > this.MAX_OUTPUT_SIZE) {
          outputBuffer = outputBuffer.substring(outputBuffer.length - this.MAX_OUTPUT_SIZE);
        }
      });

      // Handle exit
      ptyProcess.onExit((exitCode) => {
        clearTimeout(timeoutHandle);
        
        if (!killed) {
          if (exitCode.exitCode === 0) {
            resolve(outputBuffer);
          } else {
            reject(new Error(`Command failed with exit code ${exitCode.exitCode}`));
          }
        }
      });

      // Store temporarily for management
      this.processes.set(processId, {
        id: processId,
        name: command.split(' ')[0],
        command,
        cwd,
        userId: 'streaming',
        process: ptyProcess,
        status: 'running',
        startTime: Date.now(),
        output: [],
        errorOutput: [],
        maxOutputSize: this.MAX_OUTPUT_SIZE
      });
    });
  }

  async killProcess(processId: string, force: boolean = false): Promise<{success: boolean, error?: string, exitCode?: number}> {
    const managedProcess = this.processes.get(processId);
    
    if (!managedProcess) {
      return { success: false, error: 'Process not found' };
    }

    if (managedProcess.status !== 'running') {
      return { success: false, error: 'Process is not running' };
    }

    try {
      const signal = force ? 'SIGKILL' : 'SIGTERM';
      
      if ('kill' in managedProcess.process) {
        // PTY process
        (managedProcess.process as pty.IPty).kill(signal);
      } else {
        // Regular ChildProcess
        managedProcess.process.kill(signal);
      }

      managedProcess.status = 'killed';
      managedProcess.endTime = Date.now();

      logger.info(`Process ${processId} killed with ${signal}`);
      this.emit('processKilled', { processId, signal });

      return { success: true, exitCode: managedProcess.exitCode };
    } catch (error) {
      logger.error(`Failed to kill process ${processId}:`, error);
      return { success: false, error: error.message };
    }
  }

  getProcess(processId: string): ManagedProcess | undefined {
    return this.processes.get(processId);
  }

  getUserProcesses(userId: string): ManagedProcess[] {
    return Array.from(this.processes.values())
      .filter(p => p.userId === userId);
  }

  getAllProcesses(): ManagedProcess[] {
    return Array.from(this.processes.values());
  }

  getProcessOutput(processId: string, lines?: number): string | null {
    const managedProcess = this.processes.get(processId);
    
    if (!managedProcess) {
      return null;
    }

    const fullOutput = managedProcess.output.join('\n');
    
    if (lines) {
      const outputLines = fullOutput.split('\n');
      return outputLines.slice(-lines).join('\n');
    }
    
    return fullOutput;
  }

  getProcessError(processId: string): string | null {
    const managedProcess = this.processes.get(processId);
    
    if (!managedProcess) {
      return null;
    }

    return managedProcess.errorOutput.join('\n');
  }

  async writeToProcess(processId: string, input: string): Promise<boolean> {
    const managedProcess = this.processes.get(processId);
    
    if (!managedProcess || managedProcess.status !== 'running') {
      return false;
    }

    try {
      if ('write' in managedProcess.process) {
        // PTY process
        (managedProcess.process as pty.IPty).write(input);
      } else if (managedProcess.process.stdin) {
        // Regular ChildProcess
        managedProcess.process.stdin.write(input);
      } else {
        return false;
      }
      
      return true;
    } catch (error) {
      logger.error(`Failed to write to process ${processId}:`, error);
      return false;
    }
  }

  private handleProcessOutput(processId: string, data: string, stream: 'stdout' | 'stderr') {
    const managedProcess = this.processes.get(processId);
    
    if (!managedProcess) {
      return;
    }

    // Add to appropriate output array
    const outputArray = stream === 'stdout' ? managedProcess.output : managedProcess.errorOutput;
    
    // Split by lines and add to array
    const lines = data.split('\n');
    outputArray.push(...lines);
    
    // Limit output size
    const totalSize = outputArray.join('\n').length;
    if (totalSize > managedProcess.maxOutputSize) {
      // Remove old lines to stay under limit
      while (outputArray.join('\n').length > managedProcess.maxOutputSize && outputArray.length > 0) {
        outputArray.shift();
      }
    }

    this.emit('processOutput', { processId, data, stream });
  }

  private handleProcessExit(processId: string, exitCode: number) {
    const managedProcess = this.processes.get(processId);
    
    if (!managedProcess) {
      return;
    }

    managedProcess.status = exitCode === 0 ? 'stopped' : 'error';
    managedProcess.endTime = Date.now();
    managedProcess.exitCode = exitCode;

    logger.info(`Process ${processId} exited with code ${exitCode}`);
    this.emit('processExit', { processId, exitCode });
  }

  private cleanupDeadProcesses() {
    const now = Date.now();
    const maxAge = 60 * 60 * 1000; // 1 hour

    for (const [processId, managedProcess] of this.processes.entries()) {
      if (managedProcess.status !== 'running' && managedProcess.endTime) {
        const age = now - managedProcess.endTime;
        
        if (age > maxAge) {
          this.processes.delete(processId);
          this.outputBuffers.delete(processId);
          logger.info(`Cleaned up old process: ${processId}`);
        }
      }
    }
  }

  async saveProcessOutput(processId: string, filePath: string): Promise<void> {
    const output = this.getProcessOutput(processId);
    
    if (!output) {
      throw new Error('Process output not found');
    }

    await fs.writeFile(filePath, output, 'utf-8');
  }

  getProcessStats(): {
    total: number;
    running: number;
    stopped: number;
    error: number;
    memoryUsage: number;
  } {
    const stats = {
      total: this.processes.size,
      running: 0,
      stopped: 0,
      error: 0,
      memoryUsage: 0
    };

    for (const process of this.processes.values()) {
      switch (process.status) {
        case 'running':
          stats.running++;
          break;
        case 'stopped':
          stats.stopped++;
          break;
        case 'error':
          stats.error++;
          break;
      }
      
      // Estimate memory usage
      stats.memoryUsage += process.output.join('').length + process.errorOutput.join('').length;
    }

    return stats;
  }

  destroy() {
    // Kill all running processes
    for (const [processId, managedProcess] of this.processes.entries()) {
      if (managedProcess.status === 'running') {
        this.killProcess(processId, true);
      }
    }

    // Clear cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.processes.clear();
    this.outputBuffers.clear();
    this.removeAllListeners();
  }
}