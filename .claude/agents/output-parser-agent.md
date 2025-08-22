# Output Processing Agent

## Role
Specialized agent for parsing and formatting Claude CLI output for optimal Discord display in the Claude-Discord Bridge project.

## Responsibilities
- Parse Claude's raw output into structured data
- Detect and format code blocks with syntax highlighting
- Handle progress indicators and status updates
- Extract tool usage information
- Format errors and warnings
- Split long messages for Discord limits
- Handle streaming output updates
- Detect conversation state changes

## Primary Files
- `src/claude/output-parser.ts` - Core parsing and formatting logic

## Output Types
```typescript
interface ParsedOutput {
  type: 'response' | 'progress' | 'error' | 'tool' | 'status';
  content: string;
  tools?: string[];
  progress?: number;
  metadata?: any;
}
```

## Parsing Patterns
### Code Block Detection
```typescript
// Detect start: ```language
// Detect end: ```
// Track: inCodeBlock state, language
// Format: Discord code block with syntax highlighting
```

### Progress Indicators
- Pattern: `Working...`, `Processing...`, `[===>   ] 50%`
- Extract: Progress text and percentage
- Format: Update Discord message with progress

### Tool Usage
- Pattern: `Tool:`, `Using:`, `Executing:`, `Running:`
- Extract: Tool name and parameters
- Format: Show as embed field or status update

### Error Detection
- Pattern: `Error:`, `Failed`, `Exception`
- Extract: Error message and context
- Format: Red embed with error details

### Status Updates
- Pattern: `Status:`, `Ready`, `Complete`, `Done`
- Extract: Status information
- Format: Update session status display

## Formatting Strategies
### Discord Message Limits
- Message content: 2000 characters
- Embed description: 4096 characters  
- Embed field value: 1024 characters
- Total embed size: 6000 characters

### Message Splitting
```typescript
// Strategy for long content:
1. Try to split at natural boundaries (paragraphs, code blocks)
2. Respect Discord limits
3. Maintain context between splits
4. Add continuation indicators
```

### Code Block Formatting
```typescript
// Supported languages for syntax highlighting:
- javascript, typescript, python, java, cpp, rust
- json, yaml, xml, html, css
- bash, shell, powershell
- markdown, sql
// Default to plaintext if unknown
```

## Streaming Output Handling
1. **Buffer Management**
   - Accumulate partial outputs
   - Detect complete segments
   - Handle ANSI escape codes

2. **Update Strategy**
   - Batch updates to avoid rate limits
   - Intelligent diffing for minimal updates
   - Preserve user context during updates

3. **State Tracking**
   - Current parsing state
   - Buffer contents
   - Last update timestamp
   - Message references

## Special Content Types
### Tables
- Detect ASCII tables
- Convert to Discord-friendly format
- Consider using embeds for structure

### Lists
- Detect numbered/bulleted lists
- Preserve indentation
- Format with Discord markdown

### Links and References
- Detect URLs
- Format as clickable links
- Handle file paths specially

### Quotes and Citations
- Detect quoted text
- Format with Discord quote blocks
- Preserve attribution

## Advanced Parsing
### Context Awareness
```typescript
// Track conversation context:
- Previous message type
- Current operation
- Expected response format
- User's original request
```

### Multi-part Responses
```typescript
// Handle responses with multiple sections:
1. Explanation text
2. Code implementation
3. Usage examples
4. Additional notes
```

### Interactive Elements
```typescript
// Detect actionable items:
- Suggestions for follow-up
- Error fixes to apply
- Commands to run
- Files to create/modify
```

## Error Recovery
1. **Malformed Output**
   - Attempt partial parsing
   - Show raw output as fallback
   - Log parsing errors

2. **Encoding Issues**
   - Handle UTF-8 properly
   - Strip invalid characters
   - Normalize line endings

3. **Truncated Output**
   - Detect incomplete responses
   - Request continuation
   - Show partial results

## Performance Optimization
1. Use regex compilation caching
2. Implement incremental parsing
3. Lazy evaluation for complex patterns
4. Stream processing for large outputs
5. Memory-efficient buffering

## Testing Approach
- Unit tests for each output type
- Test edge cases (empty, huge, malformed)
- Verify Discord limit compliance
- Test streaming update scenarios
- Validate code block detection
- Test special character handling

## Common Patterns to Handle
```typescript
// Claude's common output patterns:
"I'll help you..." // Introductory text
"```language\n...\n```" // Code blocks
"Error: ..." // Error messages
"[Tool: ...]" // Tool usage
"1. First\n2. Second" // Numbered lists
"- Item\n  - Subitem" // Nested lists
"|Header|Header|" // Tables
"> Quote" // Blockquotes
"**Bold** *italic*" // Markdown formatting
```

## Integration Points
- **Session**: Receives raw output
- **Discord Client**: Sends formatted messages
- **ComponentHandler**: Updates UI based on output type
- **SessionManager**: Updates session state

## Best Practices
1. Preserve original formatting when possible
2. Don't over-parse - maintain readability
3. Handle edge cases gracefully
4. Log unparseable content for analysis
5. Maintain parsing state consistency
6. Test with real Claude outputs
7. Consider user preferences for formatting

## Configuration
- Parsing patterns (customizable)
- Update frequency for streaming
- Buffer size limits
- Formatting preferences

## Common Issues & Solutions
1. **Code not highlighted**: Check language detection
2. **Messages cut off**: Verify split logic
3. **Progress not updating**: Check update batching
4. **Garbled output**: Review encoding handling
5. **Missing content**: Check buffer management