#!/usr/bin/env tsx

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { execSync } from 'child_process';
import Database from 'sqlite3';
import * as dotenv from 'dotenv';
import { createReadStream, createWriteStream } from 'fs';
import { createGzip, createGunzip } from 'zlib';
import { pipeline } from 'stream/promises';

dotenv.config();

interface BackupMetadata {
  version: string;
  timestamp: string;
  type: 'full' | 'incremental';
  files: string[];
  database: boolean;
  compressed: boolean;
  encrypted: boolean;
  checksum: string;
  size: number;
  botVersion?: string;
}

interface RestoreOptions {
  database?: boolean;
  config?: boolean;
  logs?: boolean;
  sessions?: boolean;
  force?: boolean;
}

class BackupManager {
  private backupDir: string;
  private dbPath: string;
  private encryptionKey?: string;

  constructor() {
    this.backupDir = process.env.BACKUP_DIR || './backups';
    this.dbPath = process.env.DATABASE_PATH || './data/sessions.db';
    this.encryptionKey = process.env.BACKUP_ENCRYPTION_KEY;

    // Create backup directory if it doesn't exist
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  async backup(options: {
    type?: 'full' | 'incremental';
    compress?: boolean;
    encrypt?: boolean;
    schedule?: boolean;
  } = {}): Promise<void> {
    const type = options.type || 'full';
    const compress = options.compress ?? true;
    const encrypt = options.encrypt ?? false;

    console.log(`🔄 Starting ${type} backup...`);
    console.log('============================\n');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `backup-${type}-${timestamp}`;
    const backupPath = path.join(this.backupDir, backupName);

    try {
      // Create temporary backup directory
      fs.mkdirSync(backupPath, { recursive: true });

      // Backup components
      const files: string[] = [];

      // 1. Backup database
      if (fs.existsSync(this.dbPath)) {
        await this.backupDatabase(backupPath);
        files.push('database');
        console.log('✓ Database backed up');
      }

      // 2. Backup configuration files
      await this.backupConfig(backupPath);
      files.push('config');
      console.log('✓ Configuration backed up');

      // 3. Backup sessions (if full backup)
      if (type === 'full') {
        await this.backupSessions(backupPath);
        files.push('sessions');
        console.log('✓ Sessions backed up');
      }

      // 4. Backup logs (optional)
      if (type === 'full' && fs.existsSync('./logs')) {
        await this.backupLogs(backupPath);
        files.push('logs');
        console.log('✓ Logs backed up');
      }

      // 5. Backup custom templates and agents
      await this.backupCustomContent(backupPath);
      files.push('custom');
      console.log('✓ Custom content backed up');

      // Create metadata
      const metadata: BackupMetadata = {
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        type,
        files,
        database: files.includes('database'),
        compressed: compress,
        encrypted: encrypt,
        checksum: '',
        size: 0,
        botVersion: this.getBotVersion()
      };

      // Write metadata
      fs.writeFileSync(
        path.join(backupPath, 'metadata.json'),
        JSON.stringify(metadata, null, 2)
      );

      // Compress if requested
      let finalPath = backupPath;
      if (compress) {
        finalPath = await this.compressBackup(backupPath);
        console.log('✓ Backup compressed');
      }

      // Encrypt if requested
      if (encrypt && this.encryptionKey) {
        finalPath = await this.encryptBackup(finalPath);
        console.log('✓ Backup encrypted');
      }

      // Calculate checksum
      const checksum = this.calculateChecksum(finalPath);
      metadata.checksum = checksum;
      metadata.size = this.getDirectorySize(finalPath);

      // Update metadata with final info
      if (compress || encrypt) {
        fs.writeFileSync(
          `${finalPath}.meta`,
          JSON.stringify(metadata, null, 2)
        );
      }

      // Clean up temporary directory if compressed/encrypted
      if (finalPath !== backupPath) {
        this.removeDirectory(backupPath);
      }

      // Clean old backups
      await this.cleanOldBackups();

      console.log('\n✅ Backup completed successfully!');
      console.log(`📁 Location: ${finalPath}`);
      console.log(`📊 Size: ${this.formatBytes(metadata.size)}`);
      console.log(`🔑 Checksum: ${checksum.substring(0, 16)}...`);

      // Schedule next backup if requested
      if (options.schedule) {
        this.scheduleNextBackup();
      }

    } catch (error) {
      console.error('❌ Backup failed:', error);
      
      // Clean up failed backup
      if (fs.existsSync(backupPath)) {
        this.removeDirectory(backupPath);
      }
      
      throw error;
    }
  }

  async restore(backupFile: string, options: RestoreOptions = {}): Promise<void> {
    console.log('📥 Starting restore...');
    console.log('=====================\n');

    if (!fs.existsSync(backupFile)) {
      throw new Error(`Backup file not found: ${backupFile}`);
    }

    // Check if we should prompt for confirmation
    if (!options.force) {
      const confirm = await this.promptConfirmation(
        '⚠️  This will overwrite existing data. Continue? (yes/no): '
      );
      
      if (!confirm) {
        console.log('Restore cancelled.');
        return;
      }
    }

    const tempDir = path.join(this.backupDir, `restore-${Date.now()}`);

    try {
      // Create temporary extraction directory
      fs.mkdirSync(tempDir, { recursive: true });

      let extractPath = backupFile;

      // Check if encrypted
      if (backupFile.endsWith('.enc')) {
        if (!this.encryptionKey) {
          throw new Error('Backup is encrypted but no encryption key provided');
        }
        extractPath = await this.decryptBackup(backupFile, tempDir);
        console.log('✓ Backup decrypted');
      }

      // Check if compressed
      if (extractPath.endsWith('.tar.gz') || extractPath.endsWith('.tgz')) {
        extractPath = await this.decompressBackup(extractPath, tempDir);
        console.log('✓ Backup decompressed');
      }

      // Read metadata
      const metadataPath = path.join(extractPath, 'metadata.json');
      if (!fs.existsSync(metadataPath)) {
        // Try external metadata
        const externalMeta = `${backupFile}.meta`;
        if (fs.existsSync(externalMeta)) {
          fs.copyFileSync(externalMeta, metadataPath);
        } else {
          throw new Error('Backup metadata not found');
        }
      }

      const metadata: BackupMetadata = JSON.parse(
        fs.readFileSync(metadataPath, 'utf8')
      );

      console.log(`📋 Backup Info:`);
      console.log(`  Type: ${metadata.type}`);
      console.log(`  Date: ${metadata.timestamp}`);
      console.log(`  Files: ${metadata.files.join(', ')}`);
      console.log();

      // Restore components based on options
      if (options.database !== false && metadata.files.includes('database')) {
        await this.restoreDatabase(extractPath);
        console.log('✓ Database restored');
      }

      if (options.config !== false && metadata.files.includes('config')) {
        await this.restoreConfig(extractPath);
        console.log('✓ Configuration restored');
      }

      if (options.sessions !== false && metadata.files.includes('sessions')) {
        await this.restoreSessions(extractPath);
        console.log('✓ Sessions restored');
      }

      if (options.logs !== false && metadata.files.includes('logs')) {
        await this.restoreLogs(extractPath);
        console.log('✓ Logs restored');
      }

      if (metadata.files.includes('custom')) {
        await this.restoreCustomContent(extractPath);
        console.log('✓ Custom content restored');
      }

      console.log('\n✅ Restore completed successfully!');

    } catch (error) {
      console.error('❌ Restore failed:', error);
      throw error;
    } finally {
      // Clean up temporary directory
      if (fs.existsSync(tempDir)) {
        this.removeDirectory(tempDir);
      }
    }
  }

  async list(): Promise<void> {
    console.log('📦 Available Backups');
    console.log('===================\n');

    const backups = fs.readdirSync(this.backupDir)
      .filter(file => file.startsWith('backup-'))
      .sort((a, b) => b.localeCompare(a));

    if (backups.length === 0) {
      console.log('No backups found.');
      return;
    }

    for (const backup of backups) {
      const backupPath = path.join(this.backupDir, backup);
      const stats = fs.statSync(backupPath);
      
      // Try to read metadata
      let metadata: Partial<BackupMetadata> = {};
      const metaFile = `${backupPath}.meta`;
      const internalMeta = path.join(backupPath, 'metadata.json');
      
      if (fs.existsSync(metaFile)) {
        metadata = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
      } else if (fs.existsSync(internalMeta)) {
        metadata = JSON.parse(fs.readFileSync(internalMeta, 'utf8'));
      }

      console.log(`📁 ${backup}`);
      console.log(`   Size: ${this.formatBytes(stats.size)}`);
      console.log(`   Date: ${stats.mtime.toLocaleString()}`);
      
      if (metadata.type) {
        console.log(`   Type: ${metadata.type}`);
        console.log(`   Files: ${metadata.files?.join(', ') || 'Unknown'}`);
      }
      
      console.log();
    }

    // Show disk usage
    const totalSize = backups.reduce((sum, backup) => {
      const stats = fs.statSync(path.join(this.backupDir, backup));
      return sum + stats.size;
    }, 0);

    console.log(`Total backup size: ${this.formatBytes(totalSize)}`);
  }

  private async backupDatabase(backupPath: string): Promise<void> {
    if (!fs.existsSync(this.dbPath)) return;

    const dbBackupPath = path.join(backupPath, 'database');
    fs.mkdirSync(dbBackupPath, { recursive: true });

    // Copy database file
    fs.copyFileSync(this.dbPath, path.join(dbBackupPath, 'sessions.db'));

    // Also export as SQL for portability
    try {
      const sql = execSync(`sqlite3 ${this.dbPath} .dump`, { encoding: 'utf8' });
      fs.writeFileSync(path.join(dbBackupPath, 'sessions.sql'), sql);
    } catch {
      // SQLite3 command not available, skip SQL export
    }
  }

  private async backupConfig(backupPath: string): Promise<void> {
    const configPath = path.join(backupPath, 'config');
    fs.mkdirSync(configPath, { recursive: true });

    // Backup .env file (with sensitive data masked)
    if (fs.existsSync('.env')) {
      const envContent = fs.readFileSync('.env', 'utf8');
      const maskedContent = this.maskSensitiveData(envContent);
      fs.writeFileSync(path.join(configPath, '.env.backup'), maskedContent);
    }

    // Backup package.json
    if (fs.existsSync('package.json')) {
      fs.copyFileSync('package.json', path.join(configPath, 'package.json'));
    }

    // Backup CLAUDE.md if exists
    if (fs.existsSync('CLAUDE.md')) {
      fs.copyFileSync('CLAUDE.md', path.join(configPath, 'CLAUDE.md'));
    }
  }

  private async backupSessions(backupPath: string): Promise<void> {
    const sessionsPath = path.join(backupPath, 'sessions');
    fs.mkdirSync(sessionsPath, { recursive: true });

    // Export active sessions from database
    const db = new Database.Database(this.dbPath);
    
    await new Promise<void>((resolve, reject) => {
      db.all('SELECT * FROM sessions WHERE status = "active"', (err, rows) => {
        if (err) {
          reject(err);
        } else {
          fs.writeFileSync(
            path.join(sessionsPath, 'active-sessions.json'),
            JSON.stringify(rows, null, 2)
          );
          resolve();
        }
      });
    });

    db.close();
  }

  private async backupLogs(backupPath: string): Promise<void> {
    const logsPath = path.join(backupPath, 'logs');
    fs.mkdirSync(logsPath, { recursive: true });

    // Copy recent log files (last 7 days)
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    
    const logFiles = fs.readdirSync('./logs').filter(file => {
      const stats = fs.statSync(path.join('./logs', file));
      return stats.mtime.getTime() > cutoff;
    });

    for (const file of logFiles) {
      fs.copyFileSync(
        path.join('./logs', file),
        path.join(logsPath, file)
      );
    }
  }

  private async backupCustomContent(backupPath: string): Promise<void> {
    const customPath = path.join(backupPath, 'custom');
    fs.mkdirSync(customPath, { recursive: true });

    // Backup custom agents
    if (fs.existsSync('./.claude/agents')) {
      this.copyDirectory('./.claude/agents', path.join(customPath, 'agents'));
    }

    // Backup any custom templates from database
    if (fs.existsSync(this.dbPath)) {
      const db = new Database.Database(this.dbPath);
      
      await new Promise<void>((resolve) => {
        db.all('SELECT * FROM custom_templates', (err, rows) => {
          if (!err && rows) {
            fs.writeFileSync(
              path.join(customPath, 'templates.json'),
              JSON.stringify(rows, null, 2)
            );
          }
          resolve();
        });
      });

      db.close();
    }
  }

  private async compressBackup(backupPath: string): Promise<string> {
    const tarPath = `${backupPath}.tar.gz`;
    
    // Use tar command if available
    try {
      execSync(`tar -czf ${tarPath} -C ${path.dirname(backupPath)} ${path.basename(backupPath)}`);
    } catch {
      // Fallback to Node.js compression
      await this.compressDirectory(backupPath, tarPath);
    }

    return tarPath;
  }

  private async encryptBackup(backupPath: string): Promise<string> {
    if (!this.encryptionKey) {
      throw new Error('No encryption key provided');
    }

    const encryptedPath = `${backupPath}.enc`;
    
    const cipher = crypto.createCipher('aes-256-cbc', this.encryptionKey);
    const input = createReadStream(backupPath);
    const output = createWriteStream(encryptedPath);

    await pipeline(input, cipher, output);
    
    // Remove unencrypted file
    fs.unlinkSync(backupPath);

    return encryptedPath;
  }

  private async decryptBackup(encryptedPath: string, outputDir: string): Promise<string> {
    if (!this.encryptionKey) {
      throw new Error('No encryption key provided');
    }

    const decryptedPath = path.join(outputDir, 'decrypted.tar.gz');
    
    const decipher = crypto.createDecipher('aes-256-cbc', this.encryptionKey);
    const input = createReadStream(encryptedPath);
    const output = createWriteStream(decryptedPath);

    await pipeline(input, decipher, output);

    return decryptedPath;
  }

  private async decompressBackup(compressedPath: string, outputDir: string): Promise<string> {
    const extractPath = path.join(outputDir, 'extracted');
    
    // Use tar command if available
    try {
      execSync(`tar -xzf ${compressedPath} -C ${outputDir}`);
      
      // Find the extracted directory
      const dirs = fs.readdirSync(outputDir).filter(f => 
        fs.statSync(path.join(outputDir, f)).isDirectory()
      );
      
      if (dirs.length === 1) {
        return path.join(outputDir, dirs[0]);
      }
    } catch {
      // Fallback to Node.js decompression
      await this.decompressFile(compressedPath, extractPath);
    }

    return extractPath;
  }

  private async restoreDatabase(backupPath: string): Promise<void> {
    const dbBackupPath = path.join(backupPath, 'database', 'sessions.db');
    
    if (!fs.existsSync(dbBackupPath)) {
      // Try SQL file
      const sqlPath = path.join(backupPath, 'database', 'sessions.sql');
      if (fs.existsSync(sqlPath)) {
        const sql = fs.readFileSync(sqlPath, 'utf8');
        execSync(`sqlite3 ${this.dbPath}`, { input: sql });
        return;
      }
      throw new Error('Database backup not found');
    }

    // Backup current database
    if (fs.existsSync(this.dbPath)) {
      fs.copyFileSync(this.dbPath, `${this.dbPath}.old`);
    }

    // Restore database
    fs.copyFileSync(dbBackupPath, this.dbPath);
  }

  private async restoreConfig(backupPath: string): Promise<void> {
    const configBackupPath = path.join(backupPath, 'config', '.env.backup');
    
    if (fs.existsSync(configBackupPath)) {
      // Backup current .env
      if (fs.existsSync('.env')) {
        fs.copyFileSync('.env', '.env.old');
      }
      
      // Note: The backup has masked sensitive data
      console.log('⚠️  Note: .env backup has masked sensitive data. Please update manually.');
      fs.copyFileSync(configBackupPath, '.env.restored');
    }
  }

  private async restoreSessions(backupPath: string): Promise<void> {
    const sessionsFile = path.join(backupPath, 'sessions', 'active-sessions.json');
    
    if (!fs.existsSync(sessionsFile)) return;

    const sessions = JSON.parse(fs.readFileSync(sessionsFile, 'utf8'));
    
    // Import sessions to database
    const db = new Database.Database(this.dbPath);
    
    for (const session of sessions) {
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT OR REPLACE INTO sessions (id, user_id, channel_id, status, model, created_at, updated_at, data) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [session.id, session.user_id, session.channel_id, session.status, 
           session.model, session.created_at, session.updated_at, session.data],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    }
    
    db.close();
  }

  private async restoreLogs(backupPath: string): Promise<void> {
    const logsBackupPath = path.join(backupPath, 'logs');
    
    if (!fs.existsSync(logsBackupPath)) return;

    // Create logs directory if it doesn't exist
    if (!fs.existsSync('./logs')) {
      fs.mkdirSync('./logs', { recursive: true });
    }

    // Copy log files
    const files = fs.readdirSync(logsBackupPath);
    for (const file of files) {
      fs.copyFileSync(
        path.join(logsBackupPath, file),
        path.join('./logs', file)
      );
    }
  }

  private async restoreCustomContent(backupPath: string): Promise<void> {
    const customPath = path.join(backupPath, 'custom');
    
    // Restore agents
    const agentsPath = path.join(customPath, 'agents');
    if (fs.existsSync(agentsPath)) {
      this.copyDirectory(agentsPath, './.claude/agents');
    }

    // Restore templates
    const templatesFile = path.join(customPath, 'templates.json');
    if (fs.existsSync(templatesFile)) {
      const templates = JSON.parse(fs.readFileSync(templatesFile, 'utf8'));
      
      const db = new Database.Database(this.dbPath);
      
      for (const template of templates) {
        await new Promise<void>((resolve, reject) => {
          db.run(
            `INSERT OR REPLACE INTO custom_templates 
             (id, name, description, icon, system_prompt, temperature, max_tokens, created_by, created_at, updated_at, data) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [template.id, template.name, template.description, template.icon,
             template.system_prompt, template.temperature, template.max_tokens,
             template.created_by, template.created_at, template.updated_at, template.data],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });
      }
      
      db.close();
    }
  }

  private async cleanOldBackups(): Promise<void> {
    const maxBackups = parseInt(process.env.MAX_BACKUPS || '10');
    const maxAge = parseInt(process.env.BACKUP_MAX_AGE_DAYS || '30');
    
    const backups = fs.readdirSync(this.backupDir)
      .filter(file => file.startsWith('backup-'))
      .map(file => ({
        name: file,
        path: path.join(this.backupDir, file),
        stats: fs.statSync(path.join(this.backupDir, file))
      }))
      .sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime());

    // Remove old backups beyond max count
    if (backups.length > maxBackups) {
      const toRemove = backups.slice(maxBackups);
      for (const backup of toRemove) {
        this.removeBackup(backup.path);
        console.log(`  Removed old backup: ${backup.name}`);
      }
    }

    // Remove backups older than max age
    const cutoff = Date.now() - maxAge * 24 * 60 * 60 * 1000;
    for (const backup of backups) {
      if (backup.stats.mtime.getTime() < cutoff) {
        this.removeBackup(backup.path);
        console.log(`  Removed expired backup: ${backup.name}`);
      }
    }
  }

  private removeBackup(backupPath: string): void {
    if (fs.statSync(backupPath).isDirectory()) {
      this.removeDirectory(backupPath);
    } else {
      fs.unlinkSync(backupPath);
    }
    
    // Also remove metadata file if exists
    const metaFile = `${backupPath}.meta`;
    if (fs.existsSync(metaFile)) {
      fs.unlinkSync(metaFile);
    }
  }

  private scheduleNextBackup(): void {
    const schedule = process.env.BACKUP_SCHEDULE;
    
    if (!schedule) return;

    // Parse schedule (e.g., "daily", "weekly", "0 2 * * *")
    let interval: number;
    
    switch (schedule.toLowerCase()) {
      case 'hourly':
        interval = 60 * 60 * 1000;
        break;
      case 'daily':
        interval = 24 * 60 * 60 * 1000;
        break;
      case 'weekly':
        interval = 7 * 24 * 60 * 60 * 1000;
        break;
      default:
        // Assume cron format - not implemented in this example
        console.log('⚠️  Cron schedules not yet supported');
        return;
    }

    console.log(`\n⏰ Next backup scheduled in ${this.formatDuration(interval)}`);
    
    setTimeout(() => {
      this.backup({ schedule: true }).catch(error => {
        console.error('Scheduled backup failed:', error);
      });
    }, interval);
  }

  // Utility methods
  private maskSensitiveData(content: string): string {
    const sensitiveKeys = [
      'TOKEN', 'KEY', 'SECRET', 'PASSWORD', 'API', 'PRIVATE'
    ];
    
    const lines = content.split('\n');
    const masked = lines.map(line => {
      for (const key of sensitiveKeys) {
        if (line.includes(key) && line.includes('=')) {
          const [varName, ] = line.split('=');
          return `${varName}=***MASKED***`;
        }
      }
      return line;
    });
    
    return masked.join('\n');
  }

  private calculateChecksum(filePath: string): string {
    const hash = crypto.createHash('sha256');
    
    if (fs.statSync(filePath).isDirectory()) {
      // Calculate checksum for directory
      const files = this.getAllFiles(filePath);
      for (const file of files) {
        const content = fs.readFileSync(file);
        hash.update(content);
      }
    } else {
      // Calculate checksum for file
      const content = fs.readFileSync(filePath);
      hash.update(content);
    }
    
    return hash.digest('hex');
  }

  private getAllFiles(dir: string): string[] {
    const files: string[] = [];
    
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stats = fs.statSync(fullPath);
      
      if (stats.isDirectory()) {
        files.push(...this.getAllFiles(fullPath));
      } else {
        files.push(fullPath);
      }
    }
    
    return files;
  }

  private getDirectorySize(dir: string): number {
    let size = 0;
    
    const stats = fs.statSync(dir);
    if (stats.isFile()) {
      return stats.size;
    }
    
    const files = this.getAllFiles(dir);
    for (const file of files) {
      size += fs.statSync(file).size;
    }
    
    return size;
  }

  private copyDirectory(src: string, dest: string): void {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    
    const items = fs.readdirSync(src);
    for (const item of items) {
      const srcPath = path.join(src, item);
      const destPath = path.join(dest, item);
      
      if (fs.statSync(srcPath).isDirectory()) {
        this.copyDirectory(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  private removeDirectory(dir: string): void {
    if (!fs.existsSync(dir)) return;
    
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const itemPath = path.join(dir, item);
      
      if (fs.statSync(itemPath).isDirectory()) {
        this.removeDirectory(itemPath);
      } else {
        fs.unlinkSync(itemPath);
      }
    }
    
    fs.rmdirSync(dir);
  }

  private async compressDirectory(srcDir: string, destFile: string): Promise<void> {
    // Simple tar.gz implementation using Node.js streams
    const gzip = createGzip();
    const output = createWriteStream(destFile);
    
    // This is a simplified version - for production use a proper tar library
    const files = this.getAllFiles(srcDir);
    
    for (const file of files) {
      const content = fs.readFileSync(file);
      gzip.write(content);
    }
    
    gzip.end();
    await pipeline(gzip, output);
  }

  private async decompressFile(srcFile: string, destDir: string): Promise<void> {
    const gunzip = createGunzip();
    const input = createReadStream(srcFile);
    
    fs.mkdirSync(destDir, { recursive: true });
    
    // This is a simplified version - for production use a proper tar library
    const output = createWriteStream(path.join(destDir, 'extracted'));
    await pipeline(input, gunzip, output);
  }

  private getBotVersion(): string {
    try {
      const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
      return packageJson.version || '1.0.0';
    } catch {
      return '1.0.0';
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  }

  private formatDuration(ms: number): string {
    const hours = Math.floor(ms / (60 * 60 * 1000));
    const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
    
    if (hours > 0) {
      return `${hours} hour${hours > 1 ? 's' : ''}`;
    }
    return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  }

  private async promptConfirmation(message: string): Promise<boolean> {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question(message, (answer: string) => {
        rl.close();
        resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
      });
    });
  }
}

// CLI handling
const args = process.argv.slice(2);
const command = args[0];
const manager = new BackupManager();

switch (command) {
  case 'create':
  case 'backup':
    manager.backup({
      type: args.includes('--incremental') ? 'incremental' : 'full',
      compress: !args.includes('--no-compress'),
      encrypt: args.includes('--encrypt'),
      schedule: args.includes('--schedule')
    }).catch(error => {
      console.error('Backup failed:', error);
      process.exit(1);
    });
    break;
    
  case 'restore':
    if (!args[1]) {
      console.error('Please specify backup file to restore');
      process.exit(1);
    }
    manager.restore(args[1], {
      force: args.includes('--force'),
      database: !args.includes('--no-database'),
      config: !args.includes('--no-config'),
      sessions: !args.includes('--no-sessions'),
      logs: args.includes('--logs')
    }).catch(error => {
      console.error('Restore failed:', error);
      process.exit(1);
    });
    break;
    
  case 'list':
    manager.list();
    break;
    
  default:
    console.log('Claude Discord Bridge Backup Tool');
    console.log('==================================\n');
    console.log('Usage:');
    console.log('  npm run backup create [options]    - Create a new backup');
    console.log('  npm run backup restore <file>      - Restore from backup');
    console.log('  npm run backup list                - List available backups');
    console.log('\nOptions:');
    console.log('  --incremental      Create incremental backup (default: full)');
    console.log('  --no-compress      Don\'t compress backup');
    console.log('  --encrypt          Encrypt backup (requires BACKUP_ENCRYPTION_KEY)');
    console.log('  --schedule         Schedule automatic backups');
    console.log('  --force            Force restore without confirmation');
    console.log('  --no-database      Don\'t restore database');
    console.log('  --no-config        Don\'t restore configuration');
    console.log('  --no-sessions      Don\'t restore sessions');
    console.log('  --logs             Include logs in restore');
    console.log('\nExamples:');
    console.log('  npm run backup create --encrypt');
    console.log('  npm run backup restore backups/backup-full-2024-01-01.tar.gz');
    console.log('  npm run backup list');
}