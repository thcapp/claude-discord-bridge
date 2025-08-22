# Contributing to Claude-Discord Bridge

First off, thank you for considering contributing to Claude-Discord Bridge! It's people like you that make this tool better for everyone.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Style Guidelines](#style-guidelines)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Community](#community)

## Code of Conduct

This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code. Please report unacceptable behavior to the project maintainers.

### Our Standards

- Be respectful and inclusive
- Welcome newcomers and help them get started
- Focus on constructive criticism
- Show empathy towards other community members

## Getting Started

1. Fork the repository on GitHub
2. Clone your fork locally
3. Create a new branch for your feature/fix
4. Make your changes
5. Test thoroughly
6. Submit a pull request

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates. When creating a bug report, include:

- **Clear title and description**
- **Steps to reproduce**
- **Expected behavior**
- **Actual behavior**
- **Screenshots if applicable**
- **System information:**
  - Node.js version
  - OS and version
  - Discord.js version
  - Claude CLI version

**Bug Report Template:**
```markdown
### Description
[Clear description of the bug]

### Steps to Reproduce
1. [First step]
2. [Second step]
3. [...]

### Expected Behavior
[What should happen]

### Actual Behavior
[What actually happens]

### Environment
- Node.js: [version]
- OS: [e.g., Ubuntu 22.04]
- Discord.js: [version]
- Claude CLI: [version]

### Additional Context
[Any other relevant information]
```

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, include:

- **Clear title and description**
- **Use case and motivation**
- **Possible implementation approach**
- **Alternative solutions considered**

**Enhancement Template:**
```markdown
### Feature Description
[Clear description of the feature]

### Use Case
[Why is this feature needed? What problem does it solve?]

### Proposed Implementation
[How could this be implemented?]

### Alternatives Considered
[What other approaches were considered?]

### Additional Context
[Any other relevant information]
```

### Your First Code Contribution

Unsure where to begin? Look for these labels:

- `good first issue` - Simple issues perfect for beginners
- `help wanted` - Issues where we need community help
- `documentation` - Documentation improvements
- `enhancement` - New features or improvements

## Development Setup

### Prerequisites

```bash
# Required
node --version  # 18.0.0 or higher
npm --version   # 8.0.0 or higher

# Recommended
tmux -V        # Any recent version
```

### Local Development

1. **Fork and Clone**
   ```bash
   git clone https://github.com/your-username/claude-discord-bridge.git
   cd claude-discord-bridge
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Set Up Environment**
   ```bash
   cp .env.example .env.development
   # Edit .env.development with your test bot token
   ```

4. **Initialize Database**
   ```bash
   npm run db:init
   ```

5. **Run in Development Mode**
   ```bash
   npm run dev
   ```

### Running Tests

```bash
# Run all tests
npm test

# Run specific test suite
npm test -- session.test.ts

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch
```

### Testing Your Changes

Before submitting a PR, ensure:

1. **All tests pass**
   ```bash
   npm test
   ```

2. **Code is properly formatted**
   ```bash
   npm run format
   ```

3. **No linting errors**
   ```bash
   npm run lint
   ```

4. **Build succeeds**
   ```bash
   npm run build
   ```

5. **Manual testing completed**
   - Test with a real Discord bot
   - Test all affected commands
   - Test error scenarios

## Style Guidelines

### TypeScript Style

We use TypeScript with strict mode enabled. Follow these guidelines:

```typescript
// ✅ Good: Use explicit types
interface SessionConfig {
  id: string;
  userId: string;
  timeout: number;
}

// ❌ Bad: Avoid 'any' type
function processData(data: any) { }

// ✅ Good: Use async/await
async function fetchData(): Promise<Data> {
  try {
    const result = await api.get();
    return result;
  } catch (error) {
    logger.error('Failed to fetch:', error);
    throw error;
  }
}

// ✅ Good: Use descriptive names
const sessionManager = new SessionManager();

// ❌ Bad: Avoid abbreviations
const sMgr = new SMgr();
```

### File Organization

```
src/
├── claude/          # Claude-specific logic
├── discord/         # Discord-specific logic
├── interactions/    # Interaction handlers
├── utils/          # Shared utilities
└── types/          # TypeScript type definitions
```

### Documentation

- Add JSDoc comments to all public functions
- Update README.md for user-facing changes
- Add inline comments for complex logic

```typescript
/**
 * Creates a new Claude session for the specified user
 * @param userId - Discord user ID
 * @param channelId - Discord channel ID
 * @returns Promise resolving to the created session
 * @throws {SessionLimitError} When user exceeds max sessions
 */
async function createSession(userId: string, channelId: string): Promise<Session> {
  // Complex logic explanation here
  // ...
}
```

## Commit Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/):

### Format
```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Test additions or fixes
- `build`: Build system changes
- `ci`: CI configuration changes
- `chore`: Maintenance tasks

### Examples

```bash
# Feature
git commit -m "feat(session): add multi-model support"

# Bug fix
git commit -m "fix(parser): handle multiline code blocks correctly"

# Documentation
git commit -m "docs: update installation guide for Windows"

# Breaking change
git commit -m "feat(api)!: change session ID format

BREAKING CHANGE: Session IDs now use UUID v4 format"
```

## Pull Request Process

### Before Submitting

1. **Update documentation** if needed
2. **Add tests** for new functionality
3. **Update CHANGELOG.md** with your changes
4. **Ensure all checks pass**

### PR Template

```markdown
## Description
[Brief description of changes]

## Type of Change
- [ ] Bug fix (non-breaking change)
- [ ] New feature (non-breaking change)
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] All tests pass
- [ ] Manual testing completed
- [ ] Added new tests

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No new warnings
- [ ] Breaking changes documented

## Related Issues
Fixes #[issue number]

## Screenshots
[If applicable]
```

### Review Process

1. **Automated checks** run on all PRs
2. **Code review** by at least one maintainer
3. **Testing** in development environment
4. **Merge** when all checks pass and approved

### After Your PR is Merged

- Delete your branch
- Pull latest changes to your fork
- Celebrate! 🎉

## Project Structure

### Key Directories

```
claude-discord-bridge/
├── src/                 # Source code
│   ├── claude/         # Claude integration
│   ├── discord/        # Discord integration
│   ├── interactions/   # Component handlers
│   └── utils/          # Utilities
├── tests/              # Test files
├── docs/               # Documentation
├── scripts/            # Build/setup scripts
└── .github/            # GitHub specific files
```

### Important Files

- `src/index.ts` - Entry point
- `src/config.ts` - Configuration management
- `src/claude/session-manager.ts` - Core session logic
- `src/discord/commands.ts` - Command definitions

## Testing Guidelines

### Unit Tests

```typescript
describe('SessionManager', () => {
  let manager: SessionManager;
  
  beforeEach(() => {
    manager = new SessionManager();
  });
  
  it('should create a new session', async () => {
    const session = await manager.createSession('user123', 'channel456');
    expect(session).toBeDefined();
    expect(session.userId).toBe('user123');
  });
  
  it('should handle session limits', async () => {
    // Fill up to max sessions
    for (let i = 0; i < MAX_SESSIONS; i++) {
      await manager.createSession('user123', `channel${i}`);
    }
    
    // Expect error on next creation
    await expect(
      manager.createSession('user123', 'overflow')
    ).rejects.toThrow(SessionLimitError);
  });
});
```

### Integration Tests

Test interactions between components:

```typescript
it('should handle Discord command interaction', async () => {
  const interaction = createMockInteraction();
  await commandHandler.execute(interaction);
  expect(interaction.reply).toHaveBeenCalledWith(
    expect.objectContaining({
      embeds: expect.any(Array)
    })
  );
});
```

## Community

### Getting Help

- **Discord**: Join our [Discord server](https://discord.gg/yourinvite)
- **Discussions**: Use [GitHub Discussions](https://github.com/yourusername/claude-discord-bridge/discussions)
- **Issues**: Check [existing issues](https://github.com/yourusername/claude-discord-bridge/issues)

### Acknowledgments

Contributors will be added to:
- README.md contributors section
- AUTHORS file
- GitHub contributors page

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

## Questions?

Feel free to ask in:
- GitHub Discussions
- Discord server
- Issue comments

Thank you for contributing to Claude-Discord Bridge! 🚀