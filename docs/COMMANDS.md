# Complete Command Reference & Examples

## Table of Contents
- [Claude Interaction Commands](#claude-interaction-commands)
- [Code Operations](#code-operations)
- [Session Management](#session-management)
- [Project Workspace](#project-workspace)
- [Tools Control](#tools-control)
- [Settings Configuration](#settings-configuration)
- [Administrative Commands](#administrative-commands)
- [Help System](#help-system)
- [Command Patterns](#command-patterns)
- [Advanced Usage](#advanced-usage)

---

## Claude Interaction Commands

### `/claude chat`
Start or continue a conversation with Claude.

**Options:**
- `message` (optional) - Initial message to send
- `model` (optional) - Claude model to use
- `project` (optional) - Project directory context

**Examples:**
```
/claude chat message:"Help me write a Python function"
/claude chat model:opus message:"Explain quantum computing"
/claude chat project:my-app message:"Review the authentication logic"
```

### `/claude continue`
Continue the current conversation from where it left off.

**Examples:**
```
/claude continue
```

### `/claude regenerate`
Regenerate Claude's last response with optional feedback.

**Options:**
- `feedback` (optional) - Guidance for better regeneration

**Examples:**
```
/claude regenerate
/claude regenerate feedback:"Make it more concise"
/claude regenerate feedback:"Include error handling"
```

### `/claude stop`
Stop the current Claude operation.

**Examples:**
```
/claude stop
```

### `/claude branch`
Create a new conversation branch from the current point.

**Options:**
- `name` (optional) - Name for the new branch

**Examples:**
```
/claude branch
/claude branch name:"alternative-solution"
```

### `/claude model`
Switch the Claude model for the current session.

**Options:**
- `model` (required) - Model to switch to

**Examples:**
```
/claude model model:opus
/claude model model:sonnet
```

---

## Code Operations

### `/code review`
Submit code for comprehensive review.

**Options:**
- `file` (optional) - File attachment to review

**Modal Fields:**
- Code input (required)
- Additional context (optional)

**Examples:**
```
/code review
# Then paste code in modal for review

/code review file:app.js
# Attaches and reviews the file
```

### `/code fix`
Fix errors in your code.

**Options:**
- `error` (required) - Error message or description

**Modal Fields:**
- Code with error (required)
- Additional context (optional)

**Examples:**
```
/code fix error:"TypeError: undefined is not a function"
/code fix error:"Memory leak in event listeners"
```

### `/code refactor`
Refactor code for better quality.

**Options:**
- `goal` (optional) - Refactoring goal

**Modal Fields:**
- Code to refactor (required)
- Specific requirements (optional)

**Examples:**
```
/code refactor
/code refactor goal:"performance"
/code refactor goal:"readability"
```

### `/code explain`
Get detailed explanation of code.

**Modal Fields:**
- Code to explain (required)
- Specific questions (optional)

**Examples:**
```
/code explain
# Paste complex algorithm for explanation
```

### `/code test`
Generate test cases for your code.

**Options:**
- `framework` (optional) - Testing framework

**Modal Fields:**
- Code to test (required)
- Test requirements (optional)

**Examples:**
```
/code test
/code test framework:jest
/code test framework:pytest
```

### `/code document`
Generate documentation for code.

**Options:**
- `style` (optional) - Documentation style

**Modal Fields:**
- Code to document (required)
- Documentation requirements (optional)

**Examples:**
```
/code document
/code document style:jsdoc
/code document style:markdown
```

### `/code convert`
Convert code to another language.

**Options:**
- `language` (required) - Target language

**Modal Fields:**
- Source code (required)
- Conversion notes (optional)

**Examples:**
```
/code convert language:typescript
/code convert language:python
/code convert language:rust
```

---

## Session Management

### `/session list`
List all your active sessions.

**Options:**
- `detailed` (optional) - Show detailed information

**Examples:**
```
/session list
/session list detailed:true
```

### `/session info`
Get information about the current session.

**Examples:**
```
/session info
```

### `/session switch`
Switch to a different session.

**Options:**
- `id` (required) - Session ID (autocomplete)

**Examples:**
```
/session switch id:session_abc123
```

### `/session rename`
Rename the current session.

**Options:**
- `name` (required) - New name

**Examples:**
```
/session rename name:"Project Refactor"
/session rename name:"Bug Fix #123"
```

### `/session clear`
Clear session history.

**Options:**
- `target` (required) - What to clear

**Examples:**
```
/session clear target:current
/session clear target:all
/session clear target:inactive
```

### `/session export`
Export session data.

**Options:**
- `format` (optional) - Export format

**Examples:**
```
/session export
/session export format:json
/session export format:markdown
```

### `/session import`
Import session from file.

**Options:**
- `file` (required) - Session file

**Examples:**
```
/session import file:session-backup.json
```

### `/session stats`
View session statistics.

**Options:**
- `period` (optional) - Time period

**Examples:**
```
/session stats
/session stats period:today
/session stats period:week
/session stats period:month
```

### `/session history`
View conversation history.

**Options:**
- `limit` (optional) - Number of messages

**Examples:**
```
/session history
/session history limit:10
/session history limit:50
```

---

## Project Workspace

### `/project create`
Create a new project workspace.

**Options:**
- `name` (required) - Project name
- `template` (optional) - Project template

**Examples:**
```
/project create name:my-app
/project create name:api-server template:nodejs
/project create name:website template:react
```

### `/project list`
List available projects.

**Examples:**
```
/project list
```

### `/project open`
Open a project workspace.

**Options:**
- `name` (required) - Project name (autocomplete)

**Examples:**
```
/project open name:my-app
```

### `/project files`
List files in current project.

**Options:**
- `path` (optional) - Directory path

**Examples:**
```
/project files
/project files path:src
/project files path:src/components
```

### `/project run`
Run a project command.

**Options:**
- `command` (required) - Command to run

**Examples:**
```
/project run command:"npm test"
/project run command:"python manage.py migrate"
/project run command:"cargo build --release"
```

---

## Tools Control

### `/tools enable`
Enable specific Claude tools.

**Options:**
- `tool` (required) - Tool to enable

**Examples:**
```
/tools enable tool:search
/tools enable tool:calculator
/tools enable tool:filesystem
```

### `/tools disable`
Disable specific Claude tools.

**Options:**
- `tool` (required) - Tool to disable

**Examples:**
```
/tools disable tool:execute
/tools disable tool:git
```

### `/tools list`
List available tools and their status.

**Examples:**
```
/tools list
```

---

## Settings Configuration

### `/settings view`
View your current settings.

**Examples:**
```
/settings view
```

### `/settings model`
Set default Claude model.

**Options:**
- `model` (required) - Default model

**Examples:**
```
/settings model model:opus
/settings model model:sonnet
```

### `/settings notifications`
Configure notifications.

**Options:**
- `enabled` (required) - Enable/disable

**Examples:**
```
/settings notifications enabled:true
/settings notifications enabled:false
```

### `/settings threads`
Configure auto-threading.

**Options:**
- `enabled` (required) - Enable/disable

**Examples:**
```
/settings threads enabled:true
/settings threads enabled:false
```

### `/settings streaming`
Configure response streaming.

**Options:**
- `enabled` (required) - Enable/disable

**Examples:**
```
/settings streaming enabled:true
/settings streaming enabled:false
```

---

## Administrative Commands
*Requires administrator permissions*

### `/admin status`
System health check.

**Examples:**
```
/admin status
```

**Response includes:**
- Active sessions count
- Memory usage
- CPU utilization
- Database status
- Tmux backend status

### `/admin sessions`
View all active sessions across the server.

**Examples:**
```
/admin sessions
```

### `/admin cleanup`
Clean up inactive sessions.

**Options:**
- `age` (optional) - Hours of inactivity

**Examples:**
```
/admin cleanup
/admin cleanup age:24
/admin cleanup age:72
```

### `/admin restart`
Restart backend services.

**Options:**
- `type` (required) - What to restart

**Examples:**
```
/admin restart type:all
/admin restart type:tmux
/admin restart type:database
```

### `/admin config`
View or reload configuration.

**Options:**
- `action` (required) - Action to perform

**Examples:**
```
/admin config action:view
/admin config action:reload
```

### `/admin logs`
View system logs.

**Options:**
- `level` (optional) - Log level
- `lines` (optional) - Number of lines

**Examples:**
```
/admin logs
/admin logs level:error
/admin logs level:debug lines:50
```

---

## File Operations

### `/file read`
Read file contents with syntax highlighting.

**Options:**
- `path` (required) - File path to read
- `start` (optional) - Starting line number
- `end` (optional) - Ending line number

**Examples:**
```
/file read path:src/index.ts
/file read path:config.json start:10 end:50
```

### `/file write`
Create or overwrite a file.

**Options:**
- `path` (required) - File path to write
- `content` (required) - Content to write
- `overwrite` (optional) - Overwrite if exists

**Examples:**
```
/file write path:README.md content:"# My Project"
/file write path:src/new.js content:"console.log('Hello');" overwrite:true
```

### `/file edit`
Edit files with find and replace.

**Options:**
- `path` (required) - File to edit
- `find` (required) - Text to find
- `replace` (required) - Replacement text
- `all` (optional) - Replace all occurrences

**Examples:**
```
/file edit path:config.js find:"localhost" replace:"127.0.0.1"
/file edit path:app.js find:"var" replace:"const" all:true
```

### `/file search`
Search files with regex support.

**Options:**
- `pattern` (required) - Search pattern (regex supported)
- `path` (optional) - Directory to search in
- `type` (optional) - File type filter

**Examples:**
```
/file search pattern:"TODO"
/file search pattern:"function.*test" path:src type:js
/file search pattern:"import.*React" type:tsx
```

### `/file delete`
Delete files or directories.

**Options:**
- `path` (required) - Path to delete
- `force` (optional) - Skip confirmation

**Examples:**
```
/file delete path:temp.txt
/file delete path:old-backup force:true
```

### `/file ls`
List directory contents.

**Options:**
- `path` (optional) - Directory path
- `hidden` (optional) - Show hidden files
- `sort` (optional) - Sort by (name, size, date)

**Examples:**
```
/file ls
/file ls path:src hidden:true
/file ls path:dist sort:size
```

### `/file tree`
Display directory tree structure.

**Options:**
- `path` (optional) - Root directory
- `depth` (optional) - Max depth to display
- `ignore` (optional) - Patterns to ignore

**Examples:**
```
/file tree
/file tree path:src depth:3
/file tree ignore:node_modules,dist
```

---

## Web Integration

### `/web search`
Search the web and get summarized results.

**Options:**
- `query` (required) - Search query
- `limit` (optional) - Number of results

**Examples:**
```
/web search query:"TypeScript best practices"
/web search query:"React hooks tutorial" limit:5
```

### `/web fetch`
Fetch and parse web pages.

**Options:**
- `url` (required) - URL to fetch
- `selector` (optional) - CSS selector to extract

**Examples:**
```
/web fetch url:https://docs.python.org
/web fetch url:https://api.github.com/repos/nodejs/node selector:".content"
```

### `/web api`
Make API requests.

**Options:**
- `url` (required) - API endpoint
- `method` (optional) - HTTP method
- `headers` (optional) - Request headers
- `body` (optional) - Request body

**Examples:**
```
/web api url:https://api.github.com/user
/web api url:https://jsonplaceholder.typicode.com/posts method:POST body:{"title":"Test"}
```

---

## Bash & Process Management

### `/bash run`
Execute bash commands safely.

**Options:**
- `command` (required) - Command to execute
- `timeout` (optional) - Timeout in seconds
- `background` (optional) - Run in background

**Examples:**
```
/bash run command:"ls -la"
/bash run command:"npm test" timeout:60
/bash run command:"npm run dev" background:true
```

### `/bash process`
Manage background processes.

**Options:**
- `action` (required) - list, info, kill
- `id` (optional) - Process ID

**Examples:**
```
/bash process action:list
/bash process action:info id:process_123
/bash process action:kill id:process_123
```

---

## Git Operations

### `/git status`
Show repository status.

**Examples:**
```
/git status
```

### `/git commit`
Create a commit.

**Options:**
- `message` (required) - Commit message
- `all` (optional) - Stage all changes

**Examples:**
```
/git commit message:"Fix authentication bug"
/git commit message:"Add new feature" all:true
```

### `/git branch`
Manage branches.

**Options:**
- `action` (optional) - create, switch, delete, list
- `name` (optional) - Branch name

**Examples:**
```
/git branch action:list
/git branch action:create name:feature/auth
/git branch action:switch name:main
```

### `/git push`
Push to remote repository.

**Examples:**
```
/git push
/git push remote:origin branch:main
```

### `/git pull`
Pull from remote repository.

**Examples:**
```
/git pull
/git pull remote:origin branch:main
```

---

## GitHub Integration

### `/github pr`
Manage pull requests.

**Options:**
- `action` (required) - create, list, merge, close
- `title` (optional) - PR title
- `body` (optional) - PR description

**Examples:**
```
/github pr action:create title:"Add login feature"
/github pr action:list
/github pr action:merge number:42
```

### `/github issue`
Manage issues.

**Options:**
- `action` (required) - create, list, close, comment
- `title` (optional) - Issue title
- `body` (optional) - Issue description

**Examples:**
```
/github issue action:create title:"Bug in auth"
/github issue action:list
/github issue action:comment number:15 body:"Fixed"
```

---

## Template System

### `/template list`
List available AI templates.

**Available Templates:**
- `reviewer` - Code review expert
- `architect` - System design specialist
- `debugger` - Bug fixing expert
- `teacher` - Educational explanations
- `devops` - CI/CD and infrastructure
- `fullstack` - Full-stack development
- `datascientist` - Data analysis and ML
- `security` - Security analysis

**Examples:**
```
/template list
/template use name:reviewer
```

---

## Collaboration

### `/collab invite`
Invite users to session.

**Examples:**
```
/collab invite user:@teammate
/collab invite user:@mentor role:observer
```

### `/collab mode`
Set collaboration mode.

**Examples:**
```
/collab mode mode:collaborative
/collab mode mode:handoff
```

---

## Token Management

### `/token usage`
View token consumption.

**Examples:**
```
/token usage
/token usage period:today
```

### `/token budget`
Set usage limits.

**Examples:**
```
/token budget daily:10000
/token budget monthly:500000
```

---

## Context Menu Commands

Right-click on any message to access:
- **Analyze Code** - Deep code analysis
- **Debug Error** - Debug errors and stack traces
- **Explain Selection** - Detailed explanations
- **Optimize Code** - Performance suggestions
- **Security Scan** - Vulnerability check

---

## Help System

### `/help`
Get help and documentation.

**Options:**
- `topic` (optional) - Specific help topic

**Examples:**
```
/help
/help topic:commands
/help topic:troubleshoot
```

---

## Command Patterns

### Conversation Flow
```
1. /claude chat message:"Let's build a REST API"
2. [Claude responds with initial guidance]
3. /claude continue
4. [Claude continues with implementation]
5. /claude regenerate feedback:"Use Express instead"
6. [Claude regenerates with Express]
```

### Code Review Workflow
```
1. /code review [paste code]
2. [Claude provides review]
3. /code fix error:"Issue Claude mentioned"
4. [Claude fixes the issue]
5. /code test framework:jest
6. [Claude generates tests]
```

### Project Development
```
1. /project create name:my-app template:nodejs
2. /project open name:my-app
3. /claude chat project:my-app message:"Set up authentication"
4. /project files path:src
5. /project run command:"npm install"
```

### Session Management
```
1. /session list
2. /session switch id:previous_session
3. /session history limit:20
4. /session export format:markdown
```

---

## Advanced Usage

### Multi-Model Comparison
```
# Session 1
/claude chat model:opus message:"Solve this algorithm"
/session rename name:"Opus Solution"

# Session 2  
/claude chat model:sonnet message:"Solve this algorithm"
/session rename name:"Sonnet Solution"

# Compare approaches
/session list detailed:true
```

### Branching Conversations
```
/claude chat message:"Design a database schema"
# After initial design
/claude branch name:"NoSQL approach"
/claude regenerate feedback:"Use MongoDB instead"

# Return to original
/session switch id:original_session
/claude branch name:"PostgreSQL approach"
```

### Automated Testing Pipeline
```
/code review [attach file]
/code test framework:jest
/bash run command:"npm test"
/git commit message:"Add tests" all:true
/github pr action:create title:"Add test coverage"
```

### Full Development Workflow
```
# Start with template
/template use name:fullstack

# Create project
/project create name:api template:express

# Develop feature
/claude chat message:"Create user authentication"
/file write path:src/auth.js content:[generated code]

# Test
/bash run command:"npm test"

# Version control
/git commit message:"Add authentication" all:true
/git push

# Deploy
/github workflow name:"Deploy"
```

---

## Tips and Best Practices

### Performance Optimization
- Use `/token stats` to monitor usage
- Enable caching for repeated operations
- Use templates for consistent behavior
- Batch file operations when possible

### Security
- Never commit sensitive data
- Use environment variables for secrets
- Enable sandboxing for file operations
- Review bash commands before execution

### Collaboration
- Use observation mode for training
- Set clear permissions for team members
- Document session purpose with `/session rename`
- Export important sessions for reference

---

## Quick Reference

### Most Used Commands
```
/claude chat           # Start conversation
/claude continue       # Continue response
/file read            # Read files
/git status           # Check git status
/bash run             # Execute commands
/session list         # View sessions
/help                 # Get help
/code review
# After review
/code fix error:"[issues from review]"
/code test framework:jest
/project run command:"npm test"
```

### Export and Backup
```
# Regular backup
/session export format:json
# Save important conversations
/session rename name:"Important-Feature-Discussion"
/session export format:markdown
```

---

## Tips & Best Practices

1. **Use descriptive session names** - Makes it easier to switch between projects
2. **Export important sessions** - Regular backups prevent data loss
3. **Leverage branching** - Explore multiple solutions without losing context
4. **Set project context** - Claude performs better with project awareness
5. **Use appropriate models** - Opus for complex tasks, Haiku for quick responses
6. **Enable threading** - Keeps conversations organized in busy channels
7. **Utilize code commands** - Specialized commands give better results than general chat
8. **Configure settings** - Customize the bot to your workflow

---

## Troubleshooting

### Command Not Responding
- Check bot permissions in channel
- Verify bot is online with `/admin status`
- Try `/claude stop` then retry

### Session Issues
- Use `/session info` to check current state
- Clear problematic session with `/session clear target:current`
- Start fresh with `/claude chat`

### Code Modal Not Opening
- Check Discord client is updated
- Verify bot has proper permissions
- Try alternative: attach file with `/code review file:yourfile.js`

### Performance Issues
- Switch to Haiku model for faster responses
- Disable streaming if connection is slow
- Use `/admin cleanup` to free resources