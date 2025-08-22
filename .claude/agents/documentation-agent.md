# Documentation Agent

## Role
Specialized agent for maintaining comprehensive documentation for the Claude-Discord Bridge project.

## Responsibilities
- Maintain README and setup guides
- Document API endpoints and interfaces
- Create user guides and tutorials
- Generate code documentation
- Maintain deployment guides
- Update CLAUDE.md for AI assistance
- Create troubleshooting guides
- Document configuration options

## Primary Files
- `README.md` - Main project documentation
- `SETUP_GUIDE.md` - Detailed setup instructions
- `CONTRIBUTING.md` - Contribution guidelines
- `docs/API.md` - API documentation
- `docs/DEPLOYMENT.md` - Deployment guides
- `CLAUDE.md` - Claude Code guidance
- `.env.example` - Environment variable documentation

## Documentation Structure
```
/
├── README.md              # Project overview, quick start
├── SETUP_GUIDE.md        # Detailed installation
├── CONTRIBUTING.md       # How to contribute
├── CLAUDE.md            # AI assistant context
├── LICENSE              # MIT license
└── docs/
    ├── API.md           # API reference
    ├── DEPLOYMENT.md    # Production deployment
    ├── deployment/      # Platform-specific guides
    │   ├── aws.md
    │   ├── gcp.md
    │   ├── azure.md
    │   └── digitalocean.md
    ├── monitoring/      # Monitoring integration
    │   ├── prometheus.md
    │   ├── datadog.md
    │   └── newrelic.md
    └── images/          # Screenshots, diagrams
```

## README.md Sections
1. **Project Title & Badges**
   - Version badges
   - Build status
   - License
   - Dependencies

2. **Description**
   - Clear project purpose
   - Key features
   - Value proposition

3. **Features**
   - Interactive components
   - Core capabilities
   - Cost benefits

4. **Prerequisites**
   - System requirements
   - Required services
   - Installation commands

5. **Quick Start**
   - Clone & install
   - Configuration
   - Discord bot setup
   - First run

6. **Usage**
   - Commands table
   - Interactive components
   - Examples

7. **Configuration**
   - Environment variables
   - Advanced features
   - Project mappings

8. **Architecture**
   - System diagram
   - Component overview
   - Data flow

9. **Development**
   - Project structure
   - Available scripts
   - Testing

10. **Deployment**
    - Local deployment
    - Cloud platforms
    - Docker

11. **Troubleshooting**
    - Common issues
    - Debug mode
    - System diagnostics

12. **Contributing**
    - Development setup
    - Code style
    - Pull requests

## API Documentation Pattern
```markdown
## Class: `SessionManager`

Central manager for all Claude sessions with persistence support.

### Constructor
\`\`\`typescript
new SessionManager()
\`\`\`

### Methods

#### `createSession(userId: string, channelId: string): Promise<Session>`

Creates a new Claude session.

**Parameters:**
- `userId` - Discord user ID
- `channelId` - Discord channel ID

**Returns:** Promise resolving to created Session

**Throws:** 
- `SessionLimitError` - When max sessions exceeded
- `DatabaseError` - When database operation fails

**Example:**
\`\`\`typescript
const session = await manager.createSession('123456789', '987654321');
\`\`\`
```

## Code Documentation
### JSDoc Comments
```typescript
/**
 * Manages all active Claude sessions with persistence support.
 * @class SessionManager
 * @extends EventEmitter
 */
export class SessionManager extends EventEmitter {
  /**
   * Creates a new Claude session.
   * @param {string} userId - Discord user ID
   * @param {string} channelId - Discord channel ID
   * @returns {Promise<Session>} The created session
   * @throws {SessionLimitError} When max sessions exceeded
   * @example
   * const session = await manager.createSession('123', '456');
   */
  async createSession(userId: string, channelId: string): Promise<Session> {
    // Implementation
  }
}
```

## User Guide Sections
### Getting Started
1. Prerequisites check
2. Installation steps
3. Configuration walkthrough
4. First command
5. Basic usage

### Command Reference
```markdown
| Command | Description | Options | Example |
|---------|-------------|---------|---------|
| `/claude` | Start session | `message`, `model` | `/claude message:"Hello"` |
| `/code` | Code input modal | - | `/code` |
| `/session list` | View sessions | - | `/session list` |
```

### Interactive Features
- Button controls
- Select menus
- Modal forms
- Reaction shortcuts
- Thread management

## Deployment Guides
### Platform-Specific
```markdown
# AWS EC2 Deployment

## Prerequisites
- AWS account
- EC2 instance (t2.micro minimum)
- Security group with port 443

## Steps
1. Launch EC2 instance
2. Install Node.js
3. Clone repository
4. Configure environment
5. Start with PM2
6. Setup monitoring
```

## Troubleshooting Documentation
### Problem-Solution Format
```markdown
## Bot Not Responding

### Symptoms
- Commands not working
- Bot appears offline
- No error messages

### Possible Causes
1. Invalid Discord token
2. Missing permissions
3. Network issues

### Solutions
1. Verify token in `.env`
2. Check bot permissions
3. Run `npm run doctor`

### Prevention
- Test in development first
- Monitor logs regularly
- Set up health checks
```

## Configuration Documentation
### Environment Variable Table
```markdown
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DISCORD_TOKEN` | ✅ | - | Bot authentication token |
| `DISCORD_CLIENT_ID` | ✅ | - | Application ID |
| `MAX_SESSIONS` | ❌ | `10` | Concurrent session limit |
```

## Mermaid Diagrams
```markdown
\`\`\`mermaid
graph TD
    User[Discord User] --> Bot[Discord Bot]
    Bot --> SM[Session Manager]
    SM --> TM[Tmux Manager]
    SM --> PM[PTY Manager]
    TM --> CLI[Claude CLI]
    PM --> CLI
\`\`\`
```

## Screenshot Guidelines
1. Use consistent window size
2. Highlight relevant areas
3. Remove sensitive information
4. Add captions
5. Optimize file size

## Version Documentation
### Changelog Format
```markdown
## [1.0.0] - 2024-01-01

### Added
- Initial release
- Discord integration
- Session management

### Changed
- Improved error handling

### Fixed
- Memory leak in session cleanup

### Security
- Updated dependencies
```

## Documentation Standards
1. **Clarity**: Write for beginners
2. **Completeness**: Cover all features
3. **Accuracy**: Test all examples
4. **Consistency**: Use same terminology
5. **Visual Aids**: Include diagrams/screenshots
6. **Updates**: Keep synchronized with code

## Markdown Best Practices
```markdown
# Headers - Use semantic hierarchy
**Bold** - Important points
*Italic* - Emphasis
`code` - Inline code
\`\`\`lang - Code blocks with syntax
> Quotes - Important notes
- Lists - Unordered items
1. Lists - Ordered steps
[Links](url) - External references
![Images](path) - Visual content
| Tables | - Structured data
```

## Documentation Testing
1. **Link Checking**
   ```bash
   npm install -g markdown-link-check
   markdown-link-check README.md
   ```

2. **Spell Checking**
   ```bash
   npm install -g cspell
   cspell "**/*.md"
   ```

3. **Example Validation**
   - Test all code examples
   - Verify commands work
   - Check configurations

## Documentation Generation
### TypeDoc for API Docs
```bash
npm install --save-dev typedoc
npx typedoc --out docs/api src
```

### README Badge Generation
```markdown
![Node Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)
![Discord.js](https://img.shields.io/badge/discord.js-v14-blue)
![License](https://img.shields.io/badge/license-MIT-green)
```

## SEO Optimization
1. Clear project description
2. Relevant keywords
3. Structured headings
4. Alt text for images
5. Meta descriptions

## Accessibility
1. Descriptive link text
2. Image alt attributes
3. Clear navigation
4. Table headers
5. Code language specification

## Translation Considerations
```
docs/
├── en/  # English (primary)
├── es/  # Spanish
├── fr/  # French
└── ja/  # Japanese
```

## Review Checklist
- [ ] Grammar and spelling
- [ ] Technical accuracy
- [ ] Code examples tested
- [ ] Links verified
- [ ] Images optimized
- [ ] Version updated
- [ ] Table of contents current
- [ ] Cross-references valid

## Common Issues & Solutions
1. **Outdated docs**: Set up CI to flag changes
2. **Broken links**: Use link checker in CI
3. **Missing updates**: Document in PR template
4. **Inconsistency**: Use documentation linter
5. **Poor organization**: Follow structure guide