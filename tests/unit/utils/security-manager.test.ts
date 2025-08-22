import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { SecurityManager } from '../../../src/utils/security-manager';

describe('SecurityManager', () => {
  let securityManager: SecurityManager;

  beforeEach(() => {
    securityManager = SecurityManager.getInstance();
    // Reset rate limits
    (securityManager as any).rateLimits.clear();
  });

  describe('Path Validation', () => {
    it('should validate safe paths', () => {
      expect(securityManager.isPathSafe('./sandbox/test.txt')).toBe(true);
      expect(securityManager.isPathSafe('sandbox/subdir/file.js')).toBe(true);
    });

    it('should reject path traversal attempts', () => {
      expect(securityManager.isPathSafe('../../../etc/passwd')).toBe(false);
      expect(securityManager.isPathSafe('sandbox/../../sensitive')).toBe(false);
      expect(securityManager.isPathSafe('/etc/passwd')).toBe(false);
    });

    it('should reject symlinks outside sandbox', () => {
      // Mock fs.lstatSync to simulate symlink
      jest.spyOn(require('fs'), 'lstatSync').mockReturnValue({
        isSymbolicLink: () => true
      } as any);
      
      expect(securityManager.isPathSafe('sandbox/symlink')).toBe(false);
    });
  });

  describe('Command Validation', () => {
    it('should allow whitelisted commands', () => {
      process.env.BASH_WHITELIST_ENABLED = 'true';
      process.env.BASH_WHITELIST_COMMANDS = 'ls,pwd,echo';
      
      expect(securityManager.isCommandAllowed('ls -la')).toBe(true);
      expect(securityManager.isCommandAllowed('echo hello')).toBe(true);
    });

    it('should block blacklisted commands', () => {
      process.env.BASH_BLACKLIST_ENABLED = 'true';
      process.env.BASH_BLACKLIST_COMMANDS = 'rm,sudo,chmod';
      
      expect(securityManager.isCommandAllowed('rm -rf /')).toBe(false);
      expect(securityManager.isCommandAllowed('sudo apt-get')).toBe(false);
    });

    it('should detect command injection attempts', () => {
      expect(securityManager.isCommandAllowed('ls; rm -rf /')).toBe(false);
      expect(securityManager.isCommandAllowed('echo && sudo')).toBe(false);
      expect(securityManager.isCommandAllowed('ls | sudo')).toBe(false);
    });
  });

  describe('Input Sanitization', () => {
    it('should sanitize file names', () => {
      expect(securityManager.sanitizeFileName('../../../etc/passwd')).toBe('etcpasswd');
      expect(securityManager.sanitizeFileName('file<script>.txt')).toBe('filescript.txt');
      expect(securityManager.sanitizeFileName('my file.txt')).toBe('my_file.txt');
    });

    it('should sanitize command arguments', () => {
      expect(securityManager.sanitizeCommandArg('hello')).toBe('hello');
      expect(securityManager.sanitizeCommandArg('hello; rm -rf')).toBe('hello rm -rf');
      expect(securityManager.sanitizeCommandArg('$HOME')).toBe('HOME');
    });

    it('should escape HTML', () => {
      expect(securityManager.escapeHtml('<script>alert("xss")</script>'))
        .toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    });
  });

  describe('Rate Limiting', () => {
    beforeEach(() => {
      process.env.RATE_LIMIT_ENABLED = 'true';
      process.env.RATE_LIMIT_MAX_REQUESTS = '5';
      process.env.RATE_LIMIT_WINDOW_MS = '60000';
    });

    it('should allow requests within limit', () => {
      const userId = 'user123';
      
      for (let i = 0; i < 5; i++) {
        expect(securityManager.checkRateLimit(userId)).toBe(true);
      }
    });

    it('should block requests exceeding limit', () => {
      const userId = 'user123';
      
      // Use up the limit
      for (let i = 0; i < 5; i++) {
        securityManager.checkRateLimit(userId);
      }
      
      // Next request should be blocked
      expect(securityManager.checkRateLimit(userId)).toBe(false);
    });

    it('should reset after window expires', () => {
      jest.useFakeTimers();
      const userId = 'user123';
      
      // Use up the limit
      for (let i = 0; i < 5; i++) {
        securityManager.checkRateLimit(userId);
      }
      
      // Should be blocked
      expect(securityManager.checkRateLimit(userId)).toBe(false);
      
      // Advance time past window
      jest.advanceTimersByTime(61000);
      
      // Should be allowed again
      expect(securityManager.checkRateLimit(userId)).toBe(true);
      
      jest.useRealTimers();
    });
  });

  describe('File Size Validation', () => {
    it('should validate file sizes', () => {
      process.env.MAX_FILE_SIZE = '1048576'; // 1MB
      
      expect(securityManager.isFileSizeAllowed(500000)).toBe(true);
      expect(securityManager.isFileSizeAllowed(1048576)).toBe(true);
      expect(securityManager.isFileSizeAllowed(2000000)).toBe(false);
    });
  });

  describe('Extension Validation', () => {
    it('should allow safe extensions', () => {
      process.env.ALLOWED_FILE_EXTENSIONS = '.txt,.md,.js';
      
      expect(securityManager.isExtensionAllowed('file.txt')).toBe(true);
      expect(securityManager.isExtensionAllowed('README.md')).toBe(true);
      expect(securityManager.isExtensionAllowed('script.js')).toBe(true);
    });

    it('should block dangerous extensions', () => {
      process.env.BLOCKED_FILE_EXTENSIONS = '.exe,.dll,.sh';
      
      expect(securityManager.isExtensionAllowed('virus.exe')).toBe(false);
      expect(securityManager.isExtensionAllowed('library.dll')).toBe(false);
      expect(securityManager.isExtensionAllowed('script.sh')).toBe(false);
    });
  });

  describe('URL Validation', () => {
    it('should validate URLs', () => {
      expect(securityManager.isUrlSafe('https://github.com')).toBe(true);
      expect(securityManager.isUrlSafe('http://localhost')).toBe(true);
      expect(securityManager.isUrlSafe('javascript:alert(1)')).toBe(false);
      expect(securityManager.isUrlSafe('file:///etc/passwd')).toBe(false);
    });
  });
});