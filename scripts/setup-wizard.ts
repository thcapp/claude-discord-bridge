#!/usr/bin/env tsx

import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import * as crypto from 'crypto';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

interface SetupConfig {
  discordToken?: string;
  discordClientId?: string;
  discordGuildId?: string;
  allowedUserIds?: string[];
  claudeApiKey?: string;
  claudeModel?: string;
  githubToken?: string;
  githubOrg?: string;
  webhookSecret?: string;
  webhookPort?: number;
  enableSecurity?: boolean;
  enableWebhook?: boolean;
  enableGitHub?: boolean;
  databasePath?: string;
  logLevel?: string;
  maxSessions?: number;
  maxTokens?: number;
}

class SetupWizard {
  private config: SetupConfig = {};
  private envPath = path.join(process.cwd(), '.env');
  private envExamplePath = path.join(process.cwd(), '.env.example');

  async run(): Promise<void> {
    console.log('🚀 Claude Discord Bridge Setup Wizard');
    console.log('=====================================\n');

    try {
      // Check prerequisites
      await this.checkPrerequisites();

      // Collect configuration
      await this.collectDiscordConfig();
      await this.collectClaudeConfig();
      await this.collectOptionalFeatures();
      await this.collectAdvancedConfig();

      // Write configuration
      await this.writeConfiguration();

      // Install dependencies
      await this.installDependencies();

      // Initialize database
      await this.initializeDatabase();

      // Register Discord commands
      await this.registerCommands();

      // Final setup
      await this.finalSetup();

      console.log('\n✅ Setup complete! Your bot is ready to run.');
      console.log('\n📝 Next steps:');
      console.log('  1. Review your .env file');
      console.log('  2. Run "npm run build" to build the TypeScript files');
      console.log('  3. Run "npm start" to start the bot');
      console.log('  4. Use "npm run dev" for development mode with auto-reload');
      console.log('\n💡 Tip: Run "npm run doctor" to verify your setup');

    } catch (error) {
      console.error('\n❌ Setup failed:', error);
      process.exit(1);
    } finally {
      rl.close();
    }
  }

  private async checkPrerequisites(): Promise<void> {
    console.log('📋 Checking prerequisites...\n');

    // Check Node.js version
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.split('.')[0].substring(1));
    
    if (majorVersion < 18) {
      throw new Error(`Node.js 18+ required. Current version: ${nodeVersion}`);
    }
    console.log(`✓ Node.js ${nodeVersion}`);

    // Check npm
    try {
      const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
      console.log(`✓ npm ${npmVersion}`);
    } catch {
      throw new Error('npm not found. Please install npm.');
    }

    // Check tmux (optional but recommended)
    try {
      const tmuxVersion = execSync('tmux -V', { encoding: 'utf8' }).trim();
      console.log(`✓ ${tmuxVersion}`);
    } catch {
      console.log('⚠️  tmux not found (optional, but recommended for better session management)');
    }

    // Check Git
    try {
      const gitVersion = execSync('git --version', { encoding: 'utf8' }).trim();
      console.log(`✓ ${gitVersion}`);
    } catch {
      console.log('⚠️  Git not found (optional, required for Git commands)');
    }

    console.log();
  }

  private async collectDiscordConfig(): Promise<void> {
    console.log('🤖 Discord Configuration\n');

    this.config.discordToken = await this.askRequired(
      'Discord Bot Token (from Discord Developer Portal): ',
      true
    );

    this.config.discordClientId = await this.askRequired(
      'Discord Client ID (Application ID): '
    );

    this.config.discordGuildId = await this.ask(
      'Discord Guild ID (leave empty for global commands): '
    );

    const userIds = await this.ask(
      'Allowed User IDs (comma-separated, leave empty for all): '
    );
    
    if (userIds) {
      this.config.allowedUserIds = userIds.split(',').map(id => id.trim());
    }

    console.log();
  }

  private async collectClaudeConfig(): Promise<void> {
    console.log('🧠 Claude Configuration\n');

    this.config.claudeApiKey = await this.ask(
      'Claude API Key (optional, uses CLI auth if not provided): ',
      true
    );

    const modelChoice = await this.askChoice(
      'Select Claude model:',
      [
        '1. Claude 3 Opus (most capable)',
        '2. Claude 3 Sonnet (balanced)',
        '3. Claude 3 Haiku (fastest)',
        '4. Claude 2.1',
        '5. Claude Instant'
      ]
    );

    const models = [
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307',
      'claude-2.1',
      'claude-instant-1.2'
    ];

    this.config.claudeModel = models[modelChoice - 1];
    console.log();
  }

  private async collectOptionalFeatures(): Promise<void> {
    console.log('🔧 Optional Features\n');

    // GitHub Integration
    const enableGitHub = await this.askYesNo('Enable GitHub integration?');
    this.config.enableGitHub = enableGitHub;

    if (enableGitHub) {
      this.config.githubToken = await this.ask(
        '  GitHub Personal Access Token: ',
        true
      );
      this.config.githubOrg = await this.ask(
        '  Default GitHub Organization (optional): '
      );
    }

    // Webhook Server
    const enableWebhook = await this.askYesNo('Enable webhook server for GitHub events?');
    this.config.enableWebhook = enableWebhook;

    if (enableWebhook) {
      const port = await this.ask('  Webhook server port (default: 3000): ');
      this.config.webhookPort = port ? parseInt(port) : 3000;
      
      // Generate webhook secret
      this.config.webhookSecret = crypto.randomBytes(32).toString('hex');
      console.log(`  Generated webhook secret: ${this.config.webhookSecret.substring(0, 10)}...`);
      console.log('  (Full secret will be saved in .env file)');
    }

    // Security Features
    this.config.enableSecurity = await this.askYesNo('Enable security features (rate limiting, sandboxing)?');

    console.log();
  }

  private async collectAdvancedConfig(): Promise<void> {
    const advanced = await this.askYesNo('Configure advanced settings?');
    if (!advanced) return;

    console.log('\n⚙️  Advanced Configuration\n');

    // Database
    const dbPath = await this.ask(
      'Database path (default: ./data/sessions.db): '
    );
    this.config.databasePath = dbPath || './data/sessions.db';

    // Logging
    const logLevel = await this.askChoice(
      'Log level:',
      ['1. error', '2. warn', '3. info', '4. debug']
    );
    const levels = ['error', 'warn', 'info', 'debug'];
    this.config.logLevel = levels[logLevel - 1];

    // Limits
    const maxSessions = await this.ask('Max concurrent sessions per user (default: 5): ');
    this.config.maxSessions = maxSessions ? parseInt(maxSessions) : 5;

    const maxTokens = await this.ask('Max tokens per response (default: 4000): ');
    this.config.maxTokens = maxTokens ? parseInt(maxTokens) : 4000;

    console.log();
  }

  private async writeConfiguration(): Promise<void> {
    console.log('💾 Writing configuration...\n');

    // Check if .env exists
    if (fs.existsSync(this.envPath)) {
      const overwrite = await this.askYesNo('.env file already exists. Overwrite?');
      if (!overwrite) {
        // Backup existing .env
        const backupPath = `${this.envPath}.backup.${Date.now()}`;
        fs.copyFileSync(this.envPath, backupPath);
        console.log(`  Backed up existing .env to ${backupPath}`);
      }
    }

    // Build .env content
    const envContent = this.buildEnvContent();

    // Write .env file
    fs.writeFileSync(this.envPath, envContent);
    console.log('✓ Created .env file');

    // Create directories
    const dirs = [
      './data',
      './logs',
      './.claude/agents',
      './sandbox'
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`✓ Created directory: ${dir}`);
      }
    }
  }

  private buildEnvContent(): string {
    const lines: string[] = [
      '# Claude Discord Bridge Configuration',
      '# Generated by setup wizard',
      `# ${new Date().toISOString()}`,
      '',
      '# Discord Configuration',
      `DISCORD_TOKEN=${this.config.discordToken || ''}`,
      `DISCORD_CLIENT_ID=${this.config.discordClientId || ''}`,
      `DISCORD_GUILD_ID=${this.config.discordGuildId || ''}`,
      `DISCORD_ALLOWED_USER_IDS=${this.config.allowedUserIds?.join(',') || ''}`,
      '',
      '# Claude Configuration',
      `CLAUDE_API_KEY=${this.config.claudeApiKey || ''}`,
      `CLAUDE_MODEL=${this.config.claudeModel || 'claude-3-sonnet-20240229'}`,
      `CLAUDE_MAX_TOKENS=${this.config.maxTokens || 4000}`,
      `CLAUDE_TEMPERATURE=0.7`,
      '',
      '# Session Configuration',
      `SESSION_TIMEOUT=1800000`,
      `MAX_SESSIONS_PER_USER=${this.config.maxSessions || 5}`,
      `SESSION_PERSIST=true`,
      '',
      '# Database Configuration',
      `DATABASE_PATH=${this.config.databasePath || './data/sessions.db'}`,
      '',
      '# Logging Configuration',
      `LOG_LEVEL=${this.config.logLevel || 'info'}`,
      `LOG_TO_FILE=true`,
      '',
      '# Security Configuration',
      `SECURITY_ENABLED=${this.config.enableSecurity || false}`,
      `RATE_LIMIT_ENABLED=${this.config.enableSecurity || false}`,
      `RATE_LIMIT_MAX_REQUESTS=10`,
      `RATE_LIMIT_WINDOW_MS=60000`,
      `SANDBOX_ENABLED=${this.config.enableSecurity || false}`,
      `SANDBOX_PATH=./sandbox`,
      ''
    ];

    // GitHub Configuration
    if (this.config.enableGitHub) {
      lines.push(
        '# GitHub Configuration',
        `GITHUB_TOKEN=${this.config.githubToken || ''}`,
        `GITHUB_DEFAULT_ORG=${this.config.githubOrg || ''}`,
        `GITHUB_API_VERSION=2022-11-28`,
        ''
      );
    }

    // Webhook Configuration
    if (this.config.enableWebhook) {
      lines.push(
        '# Webhook Configuration',
        `WEBHOOK_ENABLED=true`,
        `WEBHOOK_PORT=${this.config.webhookPort || 3000}`,
        `WEBHOOK_SECRET=${this.config.webhookSecret || ''}`,
        `WEBHOOK_PATH=/webhook`,
        ''
      );
    }

    // Feature Flags
    lines.push(
      '# Feature Flags',
      `FEATURE_FILE_OPERATIONS=true`,
      `FEATURE_WEB_SEARCH=true`,
      `FEATURE_GIT_COMMANDS=${this.config.enableGitHub || false}`,
      `FEATURE_BASH_EXECUTION=true`,
      `FEATURE_PROCESS_MANAGEMENT=true`,
      `FEATURE_TEMPLATES=true`,
      `FEATURE_COLLABORATION=true`,
      `FEATURE_TOKEN_TRACKING=true`,
      `FEATURE_REACTION_SHORTCUTS=true`,
      ''
    );

    return lines.join('\n');
  }

  private async installDependencies(): Promise<void> {
    const install = await this.askYesNo('Install npm dependencies?');
    if (!install) return;

    console.log('\n📦 Installing dependencies...\n');
    
    try {
      execSync('npm install', { stdio: 'inherit' });
      console.log('\n✓ Dependencies installed');
    } catch (error) {
      console.error('⚠️  Failed to install dependencies. Run "npm install" manually.');
    }
  }

  private async initializeDatabase(): Promise<void> {
    const init = await this.askYesNo('Initialize database?');
    if (!init) return;

    console.log('\n🗄️  Initializing database...\n');
    
    try {
      execSync('npm run db:init', { stdio: 'inherit' });
      console.log('\n✓ Database initialized');
    } catch (error) {
      console.error('⚠️  Failed to initialize database. Run "npm run db:init" manually.');
    }
  }

  private async registerCommands(): Promise<void> {
    const register = await this.askYesNo('Register Discord slash commands?');
    if (!register) return;

    console.log('\n📝 Registering Discord commands...\n');
    
    try {
      execSync('npm run register', { stdio: 'inherit' });
      console.log('\n✓ Commands registered');
    } catch (error) {
      console.error('⚠️  Failed to register commands. Run "npm run register" manually.');
    }
  }

  private async finalSetup(): Promise<void> {
    console.log('\n🎯 Final Setup\n');

    // Create CLAUDE.md if it doesn't exist
    const claudeMdPath = path.join(process.cwd(), 'CLAUDE.md');
    if (!fs.existsSync(claudeMdPath)) {
      const claudeMdContent = `# Claude Code Configuration

This file contains project-specific configuration for Claude Code.

## Commands to run
- Build: npm run build
- Test: npm test
- Lint: npm run lint
- Start: npm start
- Dev: npm run dev

## Project structure
- /src - Source code
- /dist - Compiled JavaScript
- /scripts - Utility scripts
- /data - Database and persistent data
- /logs - Application logs
- /.claude/agents - Agent configurations

## Development notes
- TypeScript project with Discord.js
- Uses SQLite for session persistence
- Integrates with Claude Code CLI via tmux
`;
      fs.writeFileSync(claudeMdPath, claudeMdContent);
      console.log('✓ Created CLAUDE.md configuration file');
    }

    // Check for TypeScript build
    if (!fs.existsSync('./dist')) {
      const build = await this.askYesNo('Build TypeScript files now?');
      if (build) {
        console.log('\n🔨 Building TypeScript...\n');
        try {
          execSync('npm run build', { stdio: 'inherit' });
          console.log('\n✓ Build complete');
        } catch (error) {
          console.error('⚠️  Build failed. Run "npm run build" manually.');
        }
      }
    }
  }

  // Helper methods
  private ask(question: string, hidden: boolean = false): Promise<string> {
    return new Promise((resolve) => {
      if (hidden) {
        // Hide input for sensitive data
        const stdin = process.stdin;
        const stdout = process.stdout;
        
        stdout.write(question);
        stdin.setRawMode(true);
        stdin.resume();
        stdin.setEncoding('utf8');
        
        let password = '';
        stdin.on('data', (char: string) => {
          char = char.toString();
          
          switch (char) {
            case '\n':
            case '\r':
            case '\u0004':
              stdin.setRawMode(false);
              stdin.pause();
              stdout.write('\n');
              resolve(password);
              break;
            case '\u0003':
              process.exit();
              break;
            case '\u007f':
              password = password.slice(0, -1);
              stdout.clearLine(0);
              stdout.cursorTo(0);
              stdout.write(question + '*'.repeat(password.length));
              break;
            default:
              password += char;
              stdout.write('*');
              break;
          }
        });
      } else {
        rl.question(question, resolve);
      }
    });
  }

  private async askRequired(question: string, hidden: boolean = false): Promise<string> {
    let answer = '';
    while (!answer) {
      answer = await this.ask(question, hidden);
      if (!answer) {
        console.log('This field is required. Please provide a value.');
      }
    }
    return answer;
  }

  private async askYesNo(question: string): Promise<boolean> {
    const answer = await this.ask(`${question} (y/n): `);
    return answer.toLowerCase().startsWith('y');
  }

  private async askChoice(question: string, choices: string[]): Promise<number> {
    console.log(question);
    choices.forEach(choice => console.log(`  ${choice}`));
    
    let choice = 0;
    while (choice < 1 || choice > choices.length) {
      const answer = await this.ask('Choice: ');
      choice = parseInt(answer);
      if (isNaN(choice) || choice < 1 || choice > choices.length) {
        console.log(`Please enter a number between 1 and ${choices.length}`);
        choice = 0;
      }
    }
    
    return choice;
  }
}

// Run the wizard
const wizard = new SetupWizard();
wizard.run();