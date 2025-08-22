import * as dotenv from 'dotenv';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { config } from '../src/config';

dotenv.config();

interface CheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
}

class SystemDoctor {
  private checks: CheckResult[] = [];

  async run() {
    console.log('🏥 Claude-Discord Bridge System Doctor');
    console.log('=====================================\\n');
    
    await this.checkNodeVersion();
    await this.checkDiscordConfig();
    await this.checkClaudeCLI();
    await this.checkTmux();
    await this.checkDatabase();
    await this.checkPermissions();
    await this.checkDependencies();
    
    this.printResults();
  }

  private async checkNodeVersion() {
    const nodeVersion = process.version;
    const major = parseInt(nodeVersion.slice(1).split('.')[0]);
    
    if (major >= 18) {
      this.addCheck('Node.js Version', 'pass', `${nodeVersion} ✓`);
    } else {
      this.addCheck('Node.js Version', 'fail', `${nodeVersion} (requires 18+)`);
    }
  }

  private async checkDiscordConfig() {
    if (config.discord.token && config.discord.token !== 'your_bot_token_here') {
      this.addCheck('Discord Token', 'pass', 'Configured ✓');
    } else {
      this.addCheck('Discord Token', 'fail', 'Not configured');
    }
    
    if (config.discord.clientId && config.discord.clientId !== 'your_client_id_here') {
      this.addCheck('Discord Client ID', 'pass', 'Configured ✓');
    } else {
      this.addCheck('Discord Client ID', 'fail', 'Not configured');
    }
  }

  private async checkClaudeCLI() {
    const result = await this.commandExists(config.claude.cliPath);
    if (result) {
      this.addCheck('Claude CLI', 'pass', `Found at ${config.claude.cliPath} ✓`);
    } else {
      this.addCheck('Claude CLI', 'fail', `Not found at ${config.claude.cliPath}`);
    }
  }

  private async checkTmux() {
    if (config.claude.sessionType !== 'tmux') {
      this.addCheck('Tmux', 'warn', 'Not required (using PTY mode)');
      return;
    }
    
    const result = await this.commandExists('tmux');
    if (result) {
      this.addCheck('Tmux', 'pass', 'Installed ✓');
    } else {
      this.addCheck('Tmux', 'warn', 'Not installed (fallback to PTY)');
    }
  }

  private async checkDatabase() {
    const dbPath = path.resolve(config.database.path);
    if (fs.existsSync(dbPath)) {
      const stats = fs.statSync(dbPath);
      const size = (stats.size / 1024).toFixed(2);
      this.addCheck('Database', 'pass', `Exists (${size} KB) ✓`);
    } else {
      this.addCheck('Database', 'warn', 'Not initialized (run npm run db:init)');
    }
  }

  private async checkPermissions() {
    const dirs = ['logs', 'data'];
    let allGood = true;
    
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      try {
        const testFile = path.join(dir, '.test');
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
      } catch (error) {
        allGood = false;
        this.addCheck(`${dir} directory`, 'fail', 'No write permission');
      }
    }
    
    if (allGood) {
      this.addCheck('Directory Permissions', 'pass', 'All directories writable ✓');
    }
  }

  private async checkDependencies() {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
    const requiredDeps = Object.keys(packageJson.dependencies);
    let missing: string[] = [];
    
    requiredDeps.forEach(dep => {
      const depPath = path.join('node_modules', dep);
      if (!fs.existsSync(depPath)) {
        missing.push(dep);
      }
    });
    
    if (missing.length === 0) {
      this.addCheck('NPM Dependencies', 'pass', 'All installed ✓');
    } else {
      this.addCheck('NPM Dependencies', 'fail', `Missing: ${missing.join(', ')}`);
    }
  }

  private async commandExists(command: string): Promise<boolean> {
    return new Promise((resolve) => {
      const check = spawn('which', [command]);
      check.on('close', (code) => {
        resolve(code === 0);
      });
    });
  }

  private addCheck(name: string, status: CheckResult['status'], message: string) {
    this.checks.push({ name, status, message });
  }

  private printResults() {
    console.log('\\n📋 Check Results:');
    console.log('─────────────────');
    
    this.checks.forEach(check => {
      const icon = check.status === 'pass' ? '✅' : 
                   check.status === 'fail' ? '❌' : '⚠️';
      console.log(`${icon} ${check.name}: ${check.message}`);
    });
    
    const failCount = this.checks.filter(c => c.status === 'fail').length;
    const warnCount = this.checks.filter(c => c.status === 'warn').length;
    
    console.log('\\n📊 Summary:');
    console.log('───────────');
    
    if (failCount === 0 && warnCount === 0) {
      console.log('✨ All systems operational!');
    } else if (failCount === 0) {
      console.log(`⚠️  ${warnCount} warning(s) - System should work`);
    } else {
      console.log(`❌ ${failCount} error(s), ${warnCount} warning(s) - Please fix errors`);
    }
    
    if (failCount > 0) {
      process.exit(1);
    }
  }
}

const doctor = new SystemDoctor();
doctor.run();