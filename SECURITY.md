# Security Policy

## Supported Versions

We release patches for security vulnerabilities. Which versions are eligible for receiving such patches depends on the CVSS v3.0 Rating:

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report them via email to: security@claude-discord-bridge.com

You should receive a response within 48 hours. If for some reason you do not, please follow up via email to ensure we received your original message.

Please include the requested information listed below (as much as you can provide) to help us better understand the nature and scope of the possible issue:

- Type of issue (e.g. buffer overflow, SQL injection, cross-site scripting, etc.)
- Full paths of source file(s) related to the manifestation of the issue
- The location of the affected source code (tag/branch/commit or direct URL)
- Any special configuration required to reproduce the issue
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the issue, including how an attacker might exploit the issue

This information will help us triage your report more quickly.

## Preferred Languages

We prefer all communications to be in English.

## Security Best Practices

### For Users

#### 1. Token Security
- **Never share your Discord bot token**
- Store tokens in `.env` file, never in code
- Use environment-specific tokens
- Rotate tokens regularly
- Revoke compromised tokens immediately

#### 2. API Key Management
```env
# Good - Using environment variables
DISCORD_TOKEN=${DISCORD_TOKEN}
CLAUDE_API_KEY=${CLAUDE_API_KEY}
GITHUB_TOKEN=${GITHUB_TOKEN}

# Bad - Hardcoded values
DISCORD_TOKEN=MTIzNDU2Nzg5.ABC123.xyz789
```

#### 3. Access Control
- Use `DISCORD_ALLOWED_USER_IDS` to restrict bot access
- Implement role-based permissions
- Regularly audit user access
- Remove inactive users

#### 4. File Operations
- Enable sandboxing (`SANDBOX_ENABLED=true`)
- Set appropriate file size limits
- Restrict file extensions
- Use read-only mounts where possible

#### 5. Command Execution
- Enable command blacklisting
- Use whitelist mode for production
- Set command timeouts
- Monitor command logs

### For Developers

#### 1. Input Validation
All user inputs must be validated and sanitized:

```typescript
// Good
const sanitizedPath = path.normalize(userPath);
if (!sanitizedPath.startsWith(SANDBOX_PATH)) {
  throw new Error('Path traversal detected');
}

// Bad
const filePath = userPath; // Direct use without validation
```

#### 2. SQL Injection Prevention
Use parameterized queries:

```typescript
// Good
db.run('SELECT * FROM users WHERE id = ?', [userId]);

// Bad
db.run(`SELECT * FROM users WHERE id = ${userId}`);
```

#### 3. Command Injection Prevention
Never directly concatenate user input into shell commands:

```typescript
// Good
const { execFile } = require('child_process');
execFile('git', ['commit', '-m', message]);

// Bad
exec(`git commit -m "${message}"`);
```

#### 4. Rate Limiting
Implement rate limiting for all endpoints:

```typescript
const rateLimit = {
  windowMs: 60 * 1000, // 1 minute
  max: 10 // limit each user to 10 requests per minute
};
```

#### 5. Secret Management
- Use secure random generation for secrets
- Never log sensitive information
- Implement secret rotation
- Use encryption for stored secrets

## Security Features

### Built-in Security Measures

#### 1. Sandboxing
- File operations restricted to sandbox directory
- Path traversal protection
- Symlink resolution

#### 2. Rate Limiting
- Per-user rate limits
- Global rate limits
- Command cooldowns
- DDoS protection

#### 3. Command Security
- Whitelist/blacklist support
- Command timeout enforcement
- Output size limits
- Process isolation

#### 4. Authentication & Authorization
- Discord OAuth2 integration
- User ID verification
- Role-based access control
- Session management

#### 5. Data Protection
- Encrypted backups
- Secure token storage
- Database encryption support
- TLS for external connections

### Security Configuration

#### Minimal Security (Development)
```env
SECURITY_ENABLED=true
RATE_LIMIT_ENABLED=false
SANDBOX_ENABLED=false
```

#### Standard Security (Production)
```env
SECURITY_ENABLED=true
RATE_LIMIT_ENABLED=true
RATE_LIMIT_MAX_REQUESTS=10
SANDBOX_ENABLED=true
BASH_BLACKLIST_ENABLED=true
BASH_BLACKLIST_COMMANDS=rm,sudo,chmod
```

#### Maximum Security (High-Risk Environment)
```env
SECURITY_ENABLED=true
RATE_LIMIT_ENABLED=true
RATE_LIMIT_MAX_REQUESTS=5
SANDBOX_ENABLED=true
BASH_WHITELIST_ENABLED=true
BASH_WHITELIST_COMMANDS=ls,pwd,echo
MAX_FILE_SIZE=1048576
ALLOWED_FILE_EXTENSIONS=.txt,.md
```

## Security Checklist

### Pre-Deployment
- [ ] All secrets in environment variables
- [ ] No hardcoded credentials
- [ ] Input validation implemented
- [ ] Rate limiting configured
- [ ] Sandboxing enabled
- [ ] Command restrictions set
- [ ] Logging configured (without secrets)
- [ ] Error messages don't leak information

### Post-Deployment
- [ ] Monitor security logs
- [ ] Regular dependency updates
- [ ] Token rotation schedule
- [ ] Access audit performed
- [ ] Backup encryption verified
- [ ] Security patches applied
- [ ] Penetration testing (if applicable)

## Vulnerability Disclosure

We follow responsible disclosure practices:

1. **Reporter submits vulnerability** → We acknowledge within 48 hours
2. **We investigate and validate** → Work on fix begins
3. **Fix developed and tested** → Security patch prepared
4. **Coordinated disclosure** → Patch released with advisory
5. **Public disclosure** → After users have had time to update

## Security Updates

Security updates are released as:
- **Critical**: Immediate release, users notified
- **High**: Released within 7 days
- **Medium**: Released within 30 days
- **Low**: Released in next regular update

Subscribe to security advisories:
- GitHub Security Advisories
- Discord announcement channel
- Email list (security-announce@claude-discord-bridge.com)

## Compliance

This project aims to comply with:
- OWASP Top 10 recommendations
- CWE/SANS Top 25 guidelines
- Discord API Terms of Service
- Anthropic API usage policies

## Security Tools

Recommended security tools for this project:
- **npm audit** - Dependency vulnerability scanning
- **Snyk** - Continuous security monitoring
- **ESLint security plugins** - Code security analysis
- **Trivy** - Container vulnerability scanning
- **OWASP ZAP** - Web application security testing

## Contact

For security concerns, contact:
- Email: security@claude-discord-bridge.com
- GPG Key: [Public key fingerprint]

For general support:
- GitHub Issues (non-security)
- Discord support channel
- Documentation

## Acknowledgments

We thank the following researchers for responsible disclosure:
- [Will be updated as vulnerabilities are reported and fixed]

---

*This security policy is adapted from industry best practices and will be updated as the project evolves.*