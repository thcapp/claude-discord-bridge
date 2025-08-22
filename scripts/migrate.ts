#!/usr/bin/env tsx

import * as fs from 'fs';
import * as path from 'path';
import Database from 'sqlite3';
import { logger } from '../src/utils/logger';

interface Migration {
  version: number;
  name: string;
  up: string;
  down: string;
}

class MigrationRunner {
  private db: Database.Database;
  private dbPath: string;
  private migrations: Migration[] = [];

  constructor(dbPath: string = './data/sessions.db') {
    this.dbPath = path.resolve(dbPath);
    this.db = new Database.Database(this.dbPath);
    this.initializeMigrations();
  }

  private initializeMigrations(): void {
    // Define all migrations
    this.migrations = [
      {
        version: 1,
        name: 'initial_schema',
        up: `
          CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            status TEXT NOT NULL,
            model TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            data TEXT
          );
          
          CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
          CREATE INDEX IF NOT EXISTS idx_sessions_channel_id ON sessions(channel_id);
          CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
        `,
        down: `DROP TABLE IF EXISTS sessions;`
      },
      {
        version: 2,
        name: 'add_collaboration_tables',
        up: `
          CREATE TABLE IF NOT EXISTS collaboration_sessions (
            id TEXT PRIMARY KEY,
            host_user_id TEXT NOT NULL,
            session_id TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            mode TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            data TEXT,
            FOREIGN KEY (session_id) REFERENCES sessions(id)
          );
          
          CREATE TABLE IF NOT EXISTS collaboration_participants (
            collaboration_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            role TEXT NOT NULL,
            joined_at INTEGER NOT NULL,
            PRIMARY KEY (collaboration_id, user_id),
            FOREIGN KEY (collaboration_id) REFERENCES collaboration_sessions(id)
          );
          
          CREATE INDEX IF NOT EXISTS idx_collab_host ON collaboration_sessions(host_user_id);
          CREATE INDEX IF NOT EXISTS idx_collab_session ON collaboration_sessions(session_id);
        `,
        down: `
          DROP TABLE IF EXISTS collaboration_participants;
          DROP TABLE IF EXISTS collaboration_sessions;
        `
      },
      {
        version: 3,
        name: 'add_token_tracking',
        up: `
          CREATE TABLE IF NOT EXISTS token_usage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            input_tokens INTEGER NOT NULL,
            output_tokens INTEGER NOT NULL,
            total_tokens INTEGER NOT NULL,
            model TEXT NOT NULL,
            estimated_cost REAL,
            timestamp INTEGER NOT NULL,
            FOREIGN KEY (session_id) REFERENCES sessions(id)
          );
          
          CREATE TABLE IF NOT EXISTS user_budgets (
            user_id TEXT PRIMARY KEY,
            daily_limit INTEGER NOT NULL,
            monthly_limit INTEGER NOT NULL,
            current_daily INTEGER DEFAULT 0,
            current_monthly INTEGER DEFAULT 0,
            reset_daily INTEGER NOT NULL,
            reset_monthly INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          );
          
          CREATE INDEX IF NOT EXISTS idx_token_session ON token_usage(session_id);
          CREATE INDEX IF NOT EXISTS idx_token_user ON token_usage(user_id);
          CREATE INDEX IF NOT EXISTS idx_token_timestamp ON token_usage(timestamp);
        `,
        down: `
          DROP TABLE IF EXISTS user_budgets;
          DROP TABLE IF EXISTS token_usage;
        `
      },
      {
        version: 4,
        name: 'add_templates_and_webhooks',
        up: `
          CREATE TABLE IF NOT EXISTS custom_templates (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            icon TEXT,
            system_prompt TEXT NOT NULL,
            temperature REAL,
            max_tokens INTEGER,
            created_by TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            data TEXT
          );
          
          CREATE TABLE IF NOT EXISTS webhook_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT NOT NULL,
            payload TEXT NOT NULL,
            source TEXT NOT NULL,
            processed BOOLEAN DEFAULT 0,
            error TEXT,
            created_at INTEGER NOT NULL,
            processed_at INTEGER
          );
          
          CREATE INDEX IF NOT EXISTS idx_template_creator ON custom_templates(created_by);
          CREATE INDEX IF NOT EXISTS idx_webhook_type ON webhook_events(event_type);
          CREATE INDEX IF NOT EXISTS idx_webhook_processed ON webhook_events(processed);
        `,
        down: `
          DROP TABLE IF EXISTS webhook_events;
          DROP TABLE IF EXISTS custom_templates;
        `
      },
      {
        version: 5,
        name: 'add_process_management',
        up: `
          CREATE TABLE IF NOT EXISTS background_processes (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            command TEXT NOT NULL,
            status TEXT NOT NULL,
            pid INTEGER,
            started_at INTEGER NOT NULL,
            ended_at INTEGER,
            exit_code INTEGER,
            output TEXT,
            error TEXT,
            FOREIGN KEY (session_id) REFERENCES sessions(id)
          );
          
          CREATE INDEX IF NOT EXISTS idx_process_session ON background_processes(session_id);
          CREATE INDEX IF NOT EXISTS idx_process_user ON background_processes(user_id);
          CREATE INDEX IF NOT EXISTS idx_process_status ON background_processes(status);
        `,
        down: `DROP TABLE IF EXISTS background_processes;`
      },
      {
        version: 6,
        name: 'add_audit_log',
        up: `
          CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            action TEXT NOT NULL,
            resource_type TEXT,
            resource_id TEXT,
            details TEXT,
            ip_address TEXT,
            timestamp INTEGER NOT NULL
          );
          
          CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
          CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
          CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
        `,
        down: `DROP TABLE IF EXISTS audit_log;`
      }
    ];
  }

  async run(targetVersion?: number): Promise<void> {
    console.log('🔄 Running database migrations...\n');

    try {
      // Create migrations table if it doesn't exist
      await this.createMigrationsTable();

      // Get current version
      const currentVersion = await this.getCurrentVersion();
      console.log(`Current database version: ${currentVersion}`);

      // Determine target version
      const target = targetVersion ?? this.migrations[this.migrations.length - 1].version;
      console.log(`Target version: ${target}\n`);

      if (currentVersion === target) {
        console.log('✅ Database is already up to date');
        return;
      }

      // Run migrations
      if (currentVersion < target) {
        await this.migrateUp(currentVersion, target);
      } else {
        await this.migrateDown(currentVersion, target);
      }

      console.log('\n✅ Migrations completed successfully');
    } catch (error) {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    } finally {
      this.db.close();
    }
  }

  private async createMigrationsTable(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at INTEGER NOT NULL
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private async getCurrentVersion(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT MAX(version) as version FROM migrations',
        (err, row: any) => {
          if (err) reject(err);
          else resolve(row?.version || 0);
        }
      );
    });
  }

  private async migrateUp(from: number, to: number): Promise<void> {
    const migrationsToRun = this.migrations.filter(
      m => m.version > from && m.version <= to
    ).sort((a, b) => a.version - b.version);

    for (const migration of migrationsToRun) {
      console.log(`⬆️  Applying migration ${migration.version}: ${migration.name}`);
      
      await this.runMigration(migration.up);
      await this.recordMigration(migration.version, migration.name);
      
      console.log(`   ✓ Applied successfully`);
    }
  }

  private async migrateDown(from: number, to: number): Promise<void> {
    const migrationsToRun = this.migrations.filter(
      m => m.version <= from && m.version > to
    ).sort((a, b) => b.version - a.version);

    for (const migration of migrationsToRun) {
      console.log(`⬇️  Reverting migration ${migration.version}: ${migration.name}`);
      
      await this.runMigration(migration.down);
      await this.removeMigration(migration.version);
      
      console.log(`   ✓ Reverted successfully`);
    }
  }

  private async runMigration(sql: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.exec(sql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private async recordMigration(version: number, name: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO migrations (version, name, applied_at) VALUES (?, ?, ?)',
        [version, name, Date.now()],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  private async removeMigration(version: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'DELETE FROM migrations WHERE version = ?',
        [version],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async status(): Promise<void> {
    console.log('📊 Migration Status\n');

    try {
      await this.createMigrationsTable();
      const currentVersion = await this.getCurrentVersion();
      const latestVersion = this.migrations[this.migrations.length - 1].version;

      console.log(`Current version: ${currentVersion}`);
      console.log(`Latest version: ${latestVersion}`);
      console.log();

      // Show applied migrations
      const applied = await this.getAppliedMigrations();
      if (applied.length > 0) {
        console.log('Applied migrations:');
        for (const migration of applied) {
          const date = new Date(migration.applied_at).toLocaleString();
          console.log(`  ✓ ${migration.version}: ${migration.name} (${date})`);
        }
      } else {
        console.log('No migrations applied yet');
      }

      // Show pending migrations
      const pending = this.migrations.filter(m => m.version > currentVersion);
      if (pending.length > 0) {
        console.log('\nPending migrations:');
        for (const migration of pending) {
          console.log(`  ○ ${migration.version}: ${migration.name}`);
        }
      } else {
        console.log('\n✅ Database is up to date');
      }
    } finally {
      this.db.close();
    }
  }

  private async getAppliedMigrations(): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM migrations ORDER BY version',
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  async reset(): Promise<void> {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question(
        '⚠️  This will delete all data and reset the database. Are you sure? (yes/no): ',
        async (answer: string) => {
          rl.close();
          
          if (answer.toLowerCase() !== 'yes') {
            console.log('Reset cancelled');
            resolve();
            return;
          }

          console.log('\n🔄 Resetting database...\n');

          try {
            // Get all tables
            const tables = await this.getAllTables();
            
            // Drop all tables
            for (const table of tables) {
              console.log(`Dropping table: ${table}`);
              await this.runMigration(`DROP TABLE IF EXISTS ${table}`);
            }

            console.log('\n✅ Database reset complete');
            console.log('Run migrations again to recreate the schema');
          } catch (error) {
            console.error('❌ Reset failed:', error);
          } finally {
            this.db.close();
          }
          
          resolve();
        }
      );
    });
  }

  private async getAllTables(): Promise<string[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        "SELECT name FROM sqlite_master WHERE type='table'",
        (err, rows: any[]) => {
          if (err) reject(err);
          else resolve(rows.map(r => r.name));
        }
      );
    });
  }
}

// CLI handling
const args = process.argv.slice(2);
const command = args[0];
const dbPath = process.env.DATABASE_PATH || './data/sessions.db';

const runner = new MigrationRunner(dbPath);

switch (command) {
  case 'up':
    runner.run(args[1] ? parseInt(args[1]) : undefined);
    break;
  case 'down':
    if (!args[1]) {
      console.error('Please specify target version for down migration');
      process.exit(1);
    }
    runner.run(parseInt(args[1]));
    break;
  case 'status':
    runner.status();
    break;
  case 'reset':
    runner.reset();
    break;
  default:
    console.log('Database Migration Tool');
    console.log('======================\n');
    console.log('Usage:');
    console.log('  npm run migrate up [version]     - Run migrations up to version (or latest)');
    console.log('  npm run migrate down <version>   - Rollback to specific version');
    console.log('  npm run migrate status           - Show migration status');
    console.log('  npm run migrate reset            - Reset database (WARNING: deletes all data)');
    console.log('\nExamples:');
    console.log('  npm run migrate up              - Migrate to latest version');
    console.log('  npm run migrate up 3            - Migrate up to version 3');
    console.log('  npm run migrate down 2          - Rollback to version 2');
    console.log('  npm run migrate status          - Check current migration status');
}