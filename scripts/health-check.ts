#!/usr/bin/env tsx

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import Database from 'sqlite3';
import { Client, GatewayIntentBits } from 'discord.js';
import * as dotenv from 'dotenv';

dotenv.config();

interface HealthCheck {
  name: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  details?: any;
}

interface SystemInfo {
  platform: string;
  arch: string;
  nodeVersion: string;
  memory: {
    total: string;
    free: string;
    used: string;
    percentage: number;
  };
  disk: {
    total: string;
    free: string;
    used: string;
    percentage: number;
  };
  uptime: string;
  cpuCores: number;
  loadAverage: number[];
}

class HealthChecker {
  private checks: HealthCheck[] = [];
  private systemInfo: SystemInfo;

  constructor() {
    this.systemInfo = this.getSystemInfo();
  }

  async run(): Promise<void> {
    console.log('🏥 Claude Discord Bridge Health Check');
    console.log('=====================================\n');

    // Display system info
    this.displaySystemInfo();

    // Run all health checks
    await this.runChecks();

    // Display results
    this.displayResults();

    // Generate report
    this.generateReport();

    // Exit with appropriate code
    const hasFailures = this.checks.some(c => c.status === 'fail');
    process.exit(hasFailures ? 1 : 0);
  }

  private getSystemInfo(): SystemInfo {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    // Get disk usage (simplified, works on Unix-like systems)
    let diskInfo = { total: 0, free: 0, used: 0, percentage: 0 };
    try {
      const df = execSync('df -k /', { encoding: 'utf8' });
      const lines = df.split('\n');
      if (lines[1]) {
        const parts = lines[1].split(/\s+/);
        const total = parseInt(parts[1]) * 1024;
        const used = parseInt(parts[2]) * 1024;
        const available = parseInt(parts[3]) * 1024;
        diskInfo = {
          total,
          free: available,
          used,
          percentage: Math.round((used / total) * 100)
        };
      }
    } catch {
      // Fallback for Windows or if df fails
      diskInfo = { total: 0, free: 0, used: 0, percentage: 0 };
    }

    return {
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
      memory: {
        total: this.formatBytes(totalMem),
        free: this.formatBytes(freeMem),
        used: this.formatBytes(usedMem),
        percentage: Math.round((usedMem / totalMem) * 100)
      },
      disk: {
        total: this.formatBytes(diskInfo.total),
        free: this.formatBytes(diskInfo.free),
        used: this.formatBytes(diskInfo.used),
        percentage: diskInfo.percentage
      },
      uptime: this.formatUptime(os.uptime()),
      cpuCores: os.cpus().length,
      loadAverage: os.loadavg()
    };
  }

  private displaySystemInfo(): void {
    console.log('📊 System Information');
    console.log('--------------------');
    console.log(`Platform:     ${this.systemInfo.platform} (${this.systemInfo.arch})`);
    console.log(`Node.js:      ${this.systemInfo.nodeVersion}`);
    console.log(`CPU Cores:    ${this.systemInfo.cpuCores}`);
    console.log(`Load Average: ${this.systemInfo.loadAverage.map(l => l.toFixed(2)).join(', ')}`);
    console.log(`Memory:       ${this.systemInfo.memory.used}/${this.systemInfo.memory.total} (${this.systemInfo.memory.percentage}%)`);
    
    if (this.systemInfo.disk.total !== '0 B') {
      console.log(`Disk:         ${this.systemInfo.disk.used}/${this.systemInfo.disk.total} (${this.systemInfo.disk.percentage}%)`);
    }
    
    console.log(`Uptime:       ${this.systemInfo.uptime}`);
    console.log();
  }

  private async runChecks(): Promise<void> {
    console.log('🔍 Running Health Checks');
    console.log('------------------------\n');

    // Core checks
    await this.checkNodeVersion();
    await this.checkEnvironmentVariables();
    await this.checkDirectories();
    await this.checkDatabase();
    await this.checkDiscordConnection();
    await this.checkClaudeCLI();
    await this.checkTmux();
    await this.checkGit();
    await this.checkDependencies();
    await this.checkWebhookServer();
    await this.checkMemoryUsage();
    await this.checkDiskSpace();
    await this.checkProcesses();
    await this.checkLogFiles();
    await this.checkPermissions();
  }

  private async checkNodeVersion(): Promise<void> {
    const majorVersion = parseInt(process.version.split('.')[0].substring(1));
    
    if (majorVersion >= 18) {
      this.addCheck('Node.js Version', 'pass', `Version ${process.version} meets requirements`);
    } else {
      this.addCheck('Node.js Version', 'fail', `Version ${process.version} is below required v18+`);
    }
  }

  private async checkEnvironmentVariables(): Promise<void> {
    const required = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID'];
    const missing: string[] = [];
    
    for (const env of required) {
      if (!process.env[env]) {
        missing.push(env);
      }
    }
    
    if (missing.length === 0) {
      this.addCheck('Environment Variables', 'pass', 'All required variables are set');
    } else {
      this.addCheck('Environment Variables', 'fail', `Missing: ${missing.join(', ')}`);
    }

    // Check optional but recommended
    const optional = ['GITHUB_TOKEN', 'WEBHOOK_SECRET', 'CLAUDE_API_KEY'];
    const missingOptional = optional.filter(env => !process.env[env]);
    
    if (missingOptional.length > 0) {
      this.addCheck('Optional Variables', 'warning', `Not configured: ${missingOptional.join(', ')}`);
    }
  }

  private async checkDirectories(): Promise<void> {
    const dirs = ['./data', './logs', './dist', './.claude/agents'];
    const missing: string[] = [];
    
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        missing.push(dir);
      }
    }
    
    if (missing.length === 0) {
      this.addCheck('Required Directories', 'pass', 'All directories exist');
    } else {
      this.addCheck('Required Directories', 'warning', `Missing: ${missing.join(', ')}`);
    }
  }

  private async checkDatabase(): Promise<void> {
    const dbPath = process.env.DATABASE_PATH || './data/sessions.db';
    
    if (!fs.existsSync(dbPath)) {
      this.addCheck('Database', 'fail', 'Database file not found');
      return;
    }

    try {
      const db = new Database.Database(dbPath);
      
      await new Promise<void>((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM sqlite_master WHERE type="table"', (err, row: any) => {
          if (err) {
            reject(err);
          } else {
            const tableCount = row?.count || 0;
            this.addCheck('Database', 'pass', `Connected, ${tableCount} tables found`, {
              path: dbPath,
              size: this.formatBytes(fs.statSync(dbPath).size),
              tables: tableCount
            });
            resolve();
          }
        });
      });
      
      db.close();
    } catch (error: any) {
      this.addCheck('Database', 'fail', `Connection failed: ${error.message}`);
    }
  }

  private async checkDiscordConnection(): Promise<void> {
    if (!process.env.DISCORD_TOKEN) {
      this.addCheck('Discord Connection', 'fail', 'No Discord token configured');
      return;
    }

    try {
      const client = new Client({
        intents: [GatewayIntentBits.Guilds]
      });

      const loginPromise = client.login(process.env.DISCORD_TOKEN);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout')), 5000)
      );

      await Promise.race([loginPromise, timeoutPromise]);
      
      if (client.user) {
        this.addCheck('Discord Connection', 'pass', `Connected as ${client.user.tag}`, {
          userId: client.user.id,
          username: client.user.username
        });
      }
      
      client.destroy();
    } catch (error: any) {
      this.addCheck('Discord Connection', 'fail', `Connection failed: ${error.message}`);
    }
  }

  private async checkClaudeCLI(): Promise<void> {
    try {
      const claudePath = execSync('which claude-code || which claude', { encoding: 'utf8' }).trim();
      
      if (claudePath) {
        // Try to get version
        try {
          const version = execSync('claude-code --version 2>/dev/null || claude --version 2>/dev/null', { encoding: 'utf8' }).trim();
          this.addCheck('Claude CLI', 'pass', `Found at ${claudePath}`, { version });
        } catch {
          this.addCheck('Claude CLI', 'pass', `Found at ${claudePath}`);
        }
      } else {
        this.addCheck('Claude CLI', 'warning', 'Claude Code CLI not found in PATH');
      }
    } catch {
      this.addCheck('Claude CLI', 'warning', 'Claude Code CLI not found (API key may be used instead)');
    }
  }

  private async checkTmux(): Promise<void> {
    try {
      const tmuxVersion = execSync('tmux -V', { encoding: 'utf8' }).trim();
      
      // Check for existing sessions
      try {
        const sessions = execSync('tmux list-sessions 2>/dev/null', { encoding: 'utf8' }).trim();
        const sessionCount = sessions ? sessions.split('\n').length : 0;
        this.addCheck('Tmux', 'pass', `${tmuxVersion} installed, ${sessionCount} active sessions`);
      } catch {
        this.addCheck('Tmux', 'pass', `${tmuxVersion} installed, no active sessions`);
      }
    } catch {
      this.addCheck('Tmux', 'warning', 'Not installed (will use PTY fallback)');
    }
  }

  private async checkGit(): Promise<void> {
    try {
      const gitVersion = execSync('git --version', { encoding: 'utf8' }).trim();
      
      // Check if in git repo
      try {
        const branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
        this.addCheck('Git', 'pass', `${gitVersion}, on branch: ${branch}`);
      } catch {
        this.addCheck('Git', 'pass', gitVersion);
      }
    } catch {
      this.addCheck('Git', 'warning', 'Not installed (Git commands will be unavailable)');
    }
  }

  private async checkDependencies(): Promise<void> {
    const packageJsonPath = './package.json';
    
    if (!fs.existsSync(packageJsonPath)) {
      this.addCheck('Dependencies', 'fail', 'package.json not found');
      return;
    }

    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const deps = Object.keys(packageJson.dependencies || {}).length;
      const devDeps = Object.keys(packageJson.devDependencies || {}).length;
      
      // Check if node_modules exists
      if (!fs.existsSync('./node_modules')) {
        this.addCheck('Dependencies', 'fail', 'node_modules not found. Run "npm install"');
      } else {
        // Count installed packages
        const installedCount = fs.readdirSync('./node_modules').filter(
          dir => !dir.startsWith('.') && !dir.startsWith('@')
        ).length;
        
        this.addCheck('Dependencies', 'pass', 
          `${deps} dependencies, ${devDeps} dev dependencies, ${installedCount}+ installed`);
      }
    } catch (error: any) {
      this.addCheck('Dependencies', 'fail', `Error checking dependencies: ${error.message}`);
    }
  }

  private async checkWebhookServer(): Promise<void> {
    const webhookEnabled = process.env.WEBHOOK_ENABLED === 'true';
    const webhookPort = process.env.WEBHOOK_PORT || '3000';
    
    if (!webhookEnabled) {
      this.addCheck('Webhook Server', 'warning', 'Not enabled');
      return;
    }

    // Check if port is in use
    try {
      execSync(`lsof -i:${webhookPort} || netstat -an | grep :${webhookPort}`, { encoding: 'utf8' });
      this.addCheck('Webhook Server', 'warning', `Port ${webhookPort} already in use`);
    } catch {
      this.addCheck('Webhook Server', 'pass', `Configured on port ${webhookPort}`);
    }
  }

  private async checkMemoryUsage(): Promise<void> {
    const percentage = this.systemInfo.memory.percentage;
    
    if (percentage < 80) {
      this.addCheck('Memory Usage', 'pass', `${percentage}% used`);
    } else if (percentage < 90) {
      this.addCheck('Memory Usage', 'warning', `${percentage}% used - approaching limit`);
    } else {
      this.addCheck('Memory Usage', 'fail', `${percentage}% used - critically high`);
    }
  }

  private async checkDiskSpace(): Promise<void> {
    const percentage = this.systemInfo.disk.percentage;
    
    if (percentage === 0) {
      this.addCheck('Disk Space', 'warning', 'Unable to determine disk usage');
    } else if (percentage < 80) {
      this.addCheck('Disk Space', 'pass', `${percentage}% used`);
    } else if (percentage < 90) {
      this.addCheck('Disk Space', 'warning', `${percentage}% used - approaching limit`);
    } else {
      this.addCheck('Disk Space', 'fail', `${percentage}% used - critically high`);
    }
  }

  private async checkProcesses(): Promise<void> {
    try {
      // Check for bot process
      const processes = execSync('ps aux | grep -E "node.*index.js|tsx.*index.ts" | grep -v grep', { encoding: 'utf8' });
      const processCount = processes.trim().split('\n').filter(line => line.trim()).length;
      
      if (processCount > 0) {
        this.addCheck('Bot Process', 'pass', `${processCount} instance(s) running`);
      } else {
        this.addCheck('Bot Process', 'warning', 'No bot process detected');
      }
    } catch {
      this.addCheck('Bot Process', 'warning', 'No bot process detected');
    }
  }

  private async checkLogFiles(): Promise<void> {
    const logDir = './logs';
    
    if (!fs.existsSync(logDir)) {
      this.addCheck('Log Files', 'warning', 'Log directory not found');
      return;
    }

    try {
      const files = fs.readdirSync(logDir);
      const logFiles = files.filter(f => f.endsWith('.log'));
      
      if (logFiles.length > 0) {
        // Check size of log files
        let totalSize = 0;
        for (const file of logFiles) {
          totalSize += fs.statSync(path.join(logDir, file)).size;
        }
        
        this.addCheck('Log Files', 'pass', 
          `${logFiles.length} log files, total size: ${this.formatBytes(totalSize)}`);
        
        // Warn if logs are too large
        if (totalSize > 100 * 1024 * 1024) { // 100MB
          this.addCheck('Log Size', 'warning', 'Log files exceed 100MB, consider rotation');
        }
      } else {
        this.addCheck('Log Files', 'warning', 'No log files found');
      }
    } catch (error: any) {
      this.addCheck('Log Files', 'fail', `Error checking logs: ${error.message}`);
    }
  }

  private async checkPermissions(): Promise<void> {
    const dirsToCheck = ['./data', './logs', './dist'];
    const issues: string[] = [];
    
    for (const dir of dirsToCheck) {
      if (fs.existsSync(dir)) {
        try {
          // Try to write a test file
          const testFile = path.join(dir, '.permission-test');
          fs.writeFileSync(testFile, 'test');
          fs.unlinkSync(testFile);
        } catch {
          issues.push(dir);
        }
      }
    }
    
    if (issues.length === 0) {
      this.addCheck('File Permissions', 'pass', 'All directories are writable');
    } else {
      this.addCheck('File Permissions', 'fail', `No write access to: ${issues.join(', ')}`);
    }
  }

  private addCheck(name: string, status: 'pass' | 'fail' | 'warning', message: string, details?: any): void {
    this.checks.push({ name, status, message, details });
    
    const icon = status === 'pass' ? '✅' : status === 'warning' ? '⚠️' : '❌';
    console.log(`${icon} ${name}: ${message}`);
    
    if (details && process.env.VERBOSE) {
      console.log(`   Details: ${JSON.stringify(details, null, 2)}`);
    }
  }

  private displayResults(): void {
    console.log('\n📋 Health Check Summary');
    console.log('-----------------------');
    
    const passed = this.checks.filter(c => c.status === 'pass').length;
    const warnings = this.checks.filter(c => c.status === 'warning').length;
    const failed = this.checks.filter(c => c.status === 'fail').length;
    
    console.log(`✅ Passed:   ${passed}/${this.checks.length}`);
    console.log(`⚠️  Warnings: ${warnings}/${this.checks.length}`);
    console.log(`❌ Failed:   ${failed}/${this.checks.length}`);
    
    if (failed > 0) {
      console.log('\n❌ Failed Checks:');
      this.checks.filter(c => c.status === 'fail').forEach(check => {
        console.log(`  - ${check.name}: ${check.message}`);
      });
    }
    
    if (warnings > 0) {
      console.log('\n⚠️  Warnings:');
      this.checks.filter(c => c.status === 'warning').forEach(check => {
        console.log(`  - ${check.name}: ${check.message}`);
      });
    }
    
    // Overall status
    console.log('\n🏥 Overall Status:');
    if (failed > 0) {
      console.log('   ❌ UNHEALTHY - Critical issues detected');
    } else if (warnings > 5) {
      console.log('   ⚠️  DEGRADED - Multiple warnings detected');
    } else if (warnings > 0) {
      console.log('   ✅ HEALTHY - Minor issues detected');
    } else {
      console.log('   ✅ EXCELLENT - All checks passed');
    }
  }

  private generateReport(): void {
    const reportPath = './health-report.json';
    
    const report = {
      timestamp: new Date().toISOString(),
      system: this.systemInfo,
      checks: this.checks,
      summary: {
        total: this.checks.length,
        passed: this.checks.filter(c => c.status === 'pass').length,
        warnings: this.checks.filter(c => c.status === 'warning').length,
        failed: this.checks.filter(c => c.status === 'fail').length
      }
    };
    
    try {
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
      console.log(`\n📄 Detailed report saved to: ${reportPath}`);
    } catch (error: any) {
      console.error(`\n❌ Failed to save report: ${error.message}`);
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  }

  private formatUptime(seconds: number): string {
    const days = Math.floor(seconds / (3600 * 24));
    const hours = Math.floor((seconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    
    return parts.join(' ') || '< 1m';
  }
}

// Run health check
const checker = new HealthChecker();
checker.run().catch(error => {
  console.error('❌ Health check failed:', error);
  process.exit(1);
});