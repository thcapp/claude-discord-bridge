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

## Help System

### `/help`
Get help and documentation.

**Options:**
- `topic` (optional) - Specific help topic

**Examples:**
```
/help
/help topic:start
/help topic:commands
/help topic:sessions
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