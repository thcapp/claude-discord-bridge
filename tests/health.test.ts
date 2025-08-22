import { describe, it, expect } from '@jest/globals';

describe('Claude Discord Bridge', () => {
  describe('Health Check', () => {
    it('should have valid package.json', () => {
      const packageJson = require('../package.json');
      expect(packageJson.name).toBe('claude-discord-bridge');
      expect(packageJson.version).toBeDefined();
    });

    it('should have required dependencies', () => {
      const packageJson = require('../package.json');
      const requiredDeps = [
        'discord.js',
        'sqlite3',
        'dotenv',
        'node-pty',
        'simple-git',
        '@octokit/rest'
      ];
      
      requiredDeps.forEach(dep => {
        expect(packageJson.dependencies[dep]).toBeDefined();
      });
    });

    it('should have all required scripts', () => {
      const packageJson = require('../package.json');
      const requiredScripts = [
        'start',
        'dev',
        'build',
        'test',
        'lint',
        'setup',
        'migrate',
        'health',
        'backup'
      ];
      
      requiredScripts.forEach(script => {
        expect(packageJson.scripts[script]).toBeDefined();
      });
    });
  });

  describe('Configuration', () => {
    it('should have environment example file', () => {
      const fs = require('fs');
      expect(fs.existsSync('.env.example')).toBe(true);
    });

    it('should have TypeScript configuration', () => {
      const fs = require('fs');
      expect(fs.existsSync('tsconfig.json')).toBe(true);
    });
  });

  describe('Project Structure', () => {
    it('should have required directories', () => {
      const fs = require('fs');
      const requiredDirs = [
        'src',
        'src/claude',
        'src/discord',
        'src/utils',
        'scripts',
        'docs'
      ];
      
      requiredDirs.forEach(dir => {
        expect(fs.existsSync(dir)).toBe(true);
      });
    });

    it('should have main entry point', () => {
      const fs = require('fs');
      expect(fs.existsSync('src/index.ts')).toBe(true);
    });
  });
});