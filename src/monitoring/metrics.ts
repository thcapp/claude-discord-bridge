import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';
import * as os from 'os';
import { logger } from '../utils/logger';

export interface Metric {
  name: string;
  value: number;
  timestamp: number;
  labels?: Record<string, string>;
}

export interface CommandMetric {
  command: string;
  userId: string;
  duration: number;
  success: boolean;
  timestamp: number;
  error?: string;
}

export interface SystemMetrics {
  timestamp: number;
  memory: {
    used: number;
    total: number;
    percentage: number;
    rss: number;
    heapUsed: number;
    heapTotal: number;
  };
  cpu: {
    usage: number;
    loadAverage: number[];
    cores: number;
  };
  discord: {
    guilds: number;
    users: number;
    channels: number;
    uptime: number;
    ping: number;
  };
  sessions: {
    active: number;
    total: number;
    averageDuration: number;
  };
  commands: {
    total: number;
    successful: number;
    failed: number;
    averageResponseTime: number;
  };
}

export class MetricsCollector extends EventEmitter {
  private static instance: MetricsCollector;
  private metrics: Map<string, Metric[]> = new Map();
  private commandMetrics: CommandMetric[] = [];
  private systemMetrics: SystemMetrics[] = [];
  private startTime: number;
  private commandTimers: Map<string, number> = new Map();
  private intervalId?: NodeJS.Timeout;

  // Metric buckets for histogram
  private readonly responseBuckets = [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
  
  private constructor() {
    super();
    this.startTime = Date.now();
    this.startCollection();
  }

  static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  /**
   * Start collecting system metrics
   */
  private startCollection(): void {
    // Collect system metrics every 30 seconds
    this.intervalId = setInterval(() => {
      this.collectSystemMetrics();
    }, 30000);

    // Initial collection
    this.collectSystemMetrics();
  }

  /**
   * Record a metric
   */
  record(name: string, value: number, labels?: Record<string, string>): void {
    const metric: Metric = {
      name,
      value,
      timestamp: Date.now(),
      labels
    };

    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    const metrics = this.metrics.get(name)!;
    metrics.push(metric);

    // Keep only last 1000 metrics per name
    if (metrics.length > 1000) {
      metrics.shift();
    }

    this.emit('metric', metric);
  }

  /**
   * Increment a counter
   */
  increment(name: string, labels?: Record<string, string>): void {
    const key = labels ? `${name}:${JSON.stringify(labels)}` : name;
    const current = this.getLatestValue(key) || 0;
    this.record(key, current + 1, labels);
  }

  /**
   * Decrement a counter
   */
  decrement(name: string, labels?: Record<string, string>): void {
    const key = labels ? `${name}:${JSON.stringify(labels)}` : name;
    const current = this.getLatestValue(key) || 0;
    this.record(key, Math.max(0, current - 1), labels);
  }

  /**
   * Set a gauge value
   */
  gauge(name: string, value: number, labels?: Record<string, string>): void {
    this.record(name, value, labels);
  }

  /**
   * Start timing a command
   */
  startCommandTimer(commandId: string): void {
    this.commandTimers.set(commandId, performance.now());
  }

  /**
   * End timing a command and record metrics
   */
  endCommandTimer(
    commandId: string,
    command: string,
    userId: string,
    success: boolean,
    error?: string
  ): void {
    const startTime = this.commandTimers.get(commandId);
    if (!startTime) return;

    const duration = performance.now() - startTime;
    this.commandTimers.delete(commandId);

    const metric: CommandMetric = {
      command,
      userId,
      duration,
      success,
      timestamp: Date.now(),
      error
    };

    this.commandMetrics.push(metric);

    // Keep only last 1000 command metrics
    if (this.commandMetrics.length > 1000) {
      this.commandMetrics.shift();
    }

    // Record aggregated metrics
    this.increment('commands.total');
    if (success) {
      this.increment('commands.successful');
    } else {
      this.increment('commands.failed');
    }

    // Record histogram
    this.recordHistogram('command.duration', duration, { command });

    // Record by command type
    this.increment(`commands.by_type.${command}`);

    this.emit('command', metric);
  }

  /**
   * Record a histogram value
   */
  recordHistogram(name: string, value: number, labels?: Record<string, string>): void {
    // Record the raw value
    this.record(`${name}.sum`, value, labels);
    this.increment(`${name}.count`, labels);

    // Record in buckets
    for (const bucket of this.responseBuckets) {
      if (value <= bucket) {
        this.increment(`${name}.bucket.${bucket}`, labels);
      }
    }
  }

  /**
   * Collect system metrics
   */
  private collectSystemMetrics(): void {
    const memUsage = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const cpuUsage = process.cpuUsage();
    const loadAvg = os.loadavg();

    const metrics: SystemMetrics = {
      timestamp: Date.now(),
      memory: {
        used: usedMem,
        total: totalMem,
        percentage: (usedMem / totalMem) * 100,
        rss: memUsage.rss,
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal
      },
      cpu: {
        usage: (cpuUsage.user + cpuUsage.system) / 1000000, // Convert to seconds
        loadAverage: loadAvg,
        cores: os.cpus().length
      },
      discord: {
        guilds: 0, // Will be set by bot
        users: 0,
        channels: 0,
        uptime: Date.now() - this.startTime,
        ping: 0
      },
      sessions: {
        active: this.getLatestValue('sessions.active') || 0,
        total: this.getLatestValue('sessions.total') || 0,
        averageDuration: this.calculateAverageDuration()
      },
      commands: {
        total: this.getLatestValue('commands.total') || 0,
        successful: this.getLatestValue('commands.successful') || 0,
        failed: this.getLatestValue('commands.failed') || 0,
        averageResponseTime: this.calculateAverageResponseTime()
      }
    };

    this.systemMetrics.push(metrics);

    // Keep only last 100 system metrics (50 minutes at 30s interval)
    if (this.systemMetrics.length > 100) {
      this.systemMetrics.shift();
    }

    // Record as individual metrics for Prometheus
    this.gauge('memory.used.bytes', metrics.memory.used);
    this.gauge('memory.percentage', metrics.memory.percentage);
    this.gauge('memory.rss.bytes', metrics.memory.rss);
    this.gauge('memory.heap.used.bytes', metrics.memory.heapUsed);
    this.gauge('memory.heap.total.bytes', metrics.memory.heapTotal);
    this.gauge('cpu.usage.seconds', metrics.cpu.usage);
    this.gauge('cpu.load.1m', metrics.cpu.loadAverage[0]);
    this.gauge('cpu.load.5m', metrics.cpu.loadAverage[1]);
    this.gauge('cpu.load.15m', metrics.cpu.loadAverage[2]);
    this.gauge('uptime.seconds', metrics.discord.uptime / 1000);

    this.emit('system', metrics);
  }

  /**
   * Update Discord metrics
   */
  updateDiscordMetrics(guilds: number, users: number, channels: number, ping: number): void {
    const latest = this.systemMetrics[this.systemMetrics.length - 1];
    if (latest) {
      latest.discord.guilds = guilds;
      latest.discord.users = users;
      latest.discord.channels = channels;
      latest.discord.ping = ping;
    }

    this.gauge('discord.guilds', guilds);
    this.gauge('discord.users', users);
    this.gauge('discord.channels', channels);
    this.gauge('discord.ping.ms', ping);
  }

  /**
   * Get latest value for a metric
   */
  private getLatestValue(name: string): number | undefined {
    const metrics = this.metrics.get(name);
    if (!metrics || metrics.length === 0) return undefined;
    return metrics[metrics.length - 1].value;
  }

  /**
   * Calculate average command duration
   */
  private calculateAverageDuration(): number {
    if (this.commandMetrics.length === 0) return 0;
    
    const recent = this.commandMetrics.slice(-100);
    const sum = recent.reduce((acc, m) => acc + m.duration, 0);
    return sum / recent.length;
  }

  /**
   * Calculate average response time
   */
  private calculateAverageResponseTime(): number {
    return this.calculateAverageDuration();
  }

  /**
   * Get metrics summary
   */
  getSummary(): {
    uptime: number;
    totalCommands: number;
    successRate: number;
    averageResponseTime: number;
    memoryUsage: number;
    activeUsers: Set<string>;
    topCommands: Array<{ command: string; count: number }>;
    errorRate: number;
  } {
    const total = this.getLatestValue('commands.total') || 0;
    const successful = this.getLatestValue('commands.successful') || 0;
    const failed = this.getLatestValue('commands.failed') || 0;

    // Get unique users from recent commands
    const activeUsers = new Set(
      this.commandMetrics.slice(-100).map(m => m.userId)
    );

    // Count commands by type
    const commandCounts = new Map<string, number>();
    this.commandMetrics.forEach(m => {
      commandCounts.set(m.command, (commandCounts.get(m.command) || 0) + 1);
    });

    const topCommands = Array.from(commandCounts.entries())
      .map(([command, count]) => ({ command, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      uptime: Date.now() - this.startTime,
      totalCommands: total,
      successRate: total > 0 ? (successful / total) * 100 : 0,
      averageResponseTime: this.calculateAverageResponseTime(),
      memoryUsage: this.getLatestValue('memory.percentage') || 0,
      activeUsers,
      topCommands,
      errorRate: total > 0 ? (failed / total) * 100 : 0
    };
  }

  /**
   * Export metrics in Prometheus format
   */
  exportPrometheus(): string {
    const lines: string[] = [];
    const timestamp = Date.now();

    // Add help and type annotations
    lines.push('# HELP discord_commands_total Total number of commands executed');
    lines.push('# TYPE discord_commands_total counter');
    lines.push(`discord_commands_total ${this.getLatestValue('commands.total') || 0} ${timestamp}`);

    lines.push('# HELP discord_commands_successful_total Total number of successful commands');
    lines.push('# TYPE discord_commands_successful_total counter');
    lines.push(`discord_commands_successful_total ${this.getLatestValue('commands.successful') || 0} ${timestamp}`);

    lines.push('# HELP discord_commands_failed_total Total number of failed commands');
    lines.push('# TYPE discord_commands_failed_total counter');
    lines.push(`discord_commands_failed_total ${this.getLatestValue('commands.failed') || 0} ${timestamp}`);

    lines.push('# HELP discord_memory_used_bytes Memory used in bytes');
    lines.push('# TYPE discord_memory_used_bytes gauge');
    lines.push(`discord_memory_used_bytes ${this.getLatestValue('memory.used.bytes') || 0} ${timestamp}`);

    lines.push('# HELP discord_memory_percentage Memory usage percentage');
    lines.push('# TYPE discord_memory_percentage gauge');
    lines.push(`discord_memory_percentage ${this.getLatestValue('memory.percentage') || 0} ${timestamp}`);

    lines.push('# HELP discord_cpu_usage_seconds CPU usage in seconds');
    lines.push('# TYPE discord_cpu_usage_seconds gauge');
    lines.push(`discord_cpu_usage_seconds ${this.getLatestValue('cpu.usage.seconds') || 0} ${timestamp}`);

    lines.push('# HELP discord_uptime_seconds Bot uptime in seconds');
    lines.push('# TYPE discord_uptime_seconds gauge');
    lines.push(`discord_uptime_seconds ${(Date.now() - this.startTime) / 1000} ${timestamp}`);

    lines.push('# HELP discord_guilds Number of guilds');
    lines.push('# TYPE discord_guilds gauge');
    lines.push(`discord_guilds ${this.getLatestValue('discord.guilds') || 0} ${timestamp}`);

    lines.push('# HELP discord_ping_ms Discord API ping in milliseconds');
    lines.push('# TYPE discord_ping_ms gauge');
    lines.push(`discord_ping_ms ${this.getLatestValue('discord.ping.ms') || 0} ${timestamp}`);

    return lines.join('\n');
  }

  /**
   * Clean up
   */
  destroy(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    this.removeAllListeners();
    this.metrics.clear();
    this.commandMetrics = [];
    this.systemMetrics = [];
    this.commandTimers.clear();
  }
}