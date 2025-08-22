import * as vscode from 'vscode';
import { WebSocketClient } from './websocket-client';
import { DiscordAuthProvider } from './discord-auth';
import { ClaudeCompletionProvider } from './completion-provider';
import { CollaborationManager } from './collaboration-manager';
import { ChatViewProvider } from './chat-view';
import { SessionsViewProvider } from './sessions-view';
import { StatusBarManager } from './status-bar';

let client: WebSocketClient;
let authProvider: DiscordAuthProvider;
let completionProvider: ClaudeCompletionProvider;
let collaborationManager: CollaborationManager;
let statusBar: StatusBarManager;
let chatView: ChatViewProvider;
let sessionsView: SessionsViewProvider;

export async function activate(context: vscode.ExtensionContext) {
    console.log('Claude Discord Bridge extension is activating...');

    // Initialize components
    client = new WebSocketClient(context);
    authProvider = new DiscordAuthProvider(context);
    completionProvider = new ClaudeCompletionProvider(client);
    collaborationManager = new CollaborationManager(client);
    statusBar = new StatusBarManager();
    chatView = new ChatViewProvider(context, client);
    sessionsView = new SessionsViewProvider(context, client);

    // Register authentication provider
    context.subscriptions.push(
        vscode.authentication.registerAuthenticationProvider(
            'claude-discord',
            'Claude Discord',
            authProvider
        )
    );

    // Register views
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('claude-discord.chat', chatView)
    );
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('claude-discord.sessions', sessionsView)
    );

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('claude-discord.connect', async () => {
            try {
                await connect(context);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to connect: ${error.message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('claude-discord.disconnect', async () => {
            await disconnect();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('claude-discord.executeCommand', async () => {
            const command = await vscode.window.showInputBox({
                prompt: 'Enter command to execute',
                placeHolder: 'npm test'
            });
            if (command) {
                await executeCommand(command);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('claude-discord.askClaude', async () => {
            const question = await vscode.window.showInputBox({
                prompt: 'Ask Claude a question',
                placeHolder: 'How do I implement a binary search tree?'
            });
            if (question) {
                await askClaude(question);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('claude-discord.explainCode', async () => {
            await explainSelectedCode();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('claude-discord.refactorCode', async () => {
            await refactorSelectedCode();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('claude-discord.generateTests', async () => {
            await generateTests();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('claude-discord.fixErrors', async () => {
            await fixErrors();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('claude-discord.startCollaboration', async () => {
            await startCollaboration();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('claude-discord.joinCollaboration', async () => {
            const sessionId = await vscode.window.showInputBox({
                prompt: 'Enter collaboration session ID',
                placeHolder: 'session_123456'
            });
            if (sessionId) {
                await joinCollaboration(sessionId);
            }
        })
    );

    // Register inline completion provider if enabled
    const config = vscode.workspace.getConfiguration('claude-discord');
    if (config.get('enableInlineCompletions')) {
        context.subscriptions.push(
            vscode.languages.registerInlineCompletionItemProvider(
                { pattern: '**' },
                completionProvider
            )
        );
    }

    // Register hover provider for code explanations
    context.subscriptions.push(
        vscode.languages.registerHoverProvider(
            { pattern: '**' },
            {
                provideHover: async (document, position) => {
                    const wordRange = document.getWordRangeAtPosition(position);
                    if (!wordRange) return;

                    const word = document.getText(wordRange);
                    const explanation = await client.request('getExplanation', {
                        word,
                        context: document.getText(),
                        language: document.languageId
                    });

                    if (explanation) {
                        return new vscode.Hover(
                            new vscode.MarkdownString(explanation)
                        );
                    }
                }
            }
        )
    );

    // Register code lens provider for inline actions
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(
            { pattern: '**' },
            {
                provideCodeLenses: (document) => {
                    const lenses: vscode.CodeLens[] = [];
                    
                    // Add code lens for functions
                    const regex = /function\s+(\w+)\s*\(/g;
                    let match;
                    while (match = regex.exec(document.getText())) {
                        const line = document.positionAt(match.index).line;
                        const range = new vscode.Range(line, 0, line, 0);
                        
                        lenses.push(
                            new vscode.CodeLens(range, {
                                title: '✨ Explain',
                                command: 'claude-discord.explainCode',
                                arguments: [range]
                            })
                        );
                        
                        lenses.push(
                            new vscode.CodeLens(range, {
                                title: '🔧 Refactor',
                                command: 'claude-discord.refactorCode',
                                arguments: [range]
                            })
                        );
                        
                        lenses.push(
                            new vscode.CodeLens(range, {
                                title: '🧪 Generate Tests',
                                command: 'claude-discord.generateTests',
                                arguments: [range]
                            })
                        );
                    }
                    
                    return lenses;
                }
            }
        )
    );

    // Auto-connect if enabled
    if (config.get('autoConnect')) {
        await connect(context);
    }

    // Set up workspace change listeners
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(async (event) => {
            if (collaborationManager.isActive()) {
                await collaborationManager.handleDocumentChange(event);
            }
        })
    );

    context.subscriptions.push(
        vscode.window.onDidChangeTextEditorSelection(async (event) => {
            if (collaborationManager.isActive()) {
                await collaborationManager.handleSelectionChange(event);
            }
        })
    );

    console.log('Claude Discord Bridge extension activated!');
}

async function connect(context: vscode.ExtensionContext) {
    // Get authentication
    const session = await vscode.authentication.getSession(
        'claude-discord',
        ['identify', 'guilds'],
        { createIfNone: true }
    );

    if (!session) {
        throw new Error('Authentication failed');
    }

    // Connect to WebSocket server
    const config = vscode.workspace.getConfiguration('claude-discord');
    const serverUrl = config.get<string>('serverUrl') || 'ws://localhost:3002';
    
    await client.connect(serverUrl, session.accessToken);
    
    statusBar.setConnected(true);
    vscode.window.showInformationMessage('Connected to Claude Discord Bridge!');
    
    // Create session
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    await client.request('createSession', {
        type: 'tmux',
        workspace: workspacePath
    });
}

async function disconnect() {
    await client.disconnect();
    statusBar.setConnected(false);
    vscode.window.showInformationMessage('Disconnected from Claude Discord Bridge');
}

async function executeCommand(command: string) {
    try {
        const result = await client.request('executeCommand', { command });
        
        // Show output in output channel
        const outputChannel = vscode.window.createOutputChannel('Claude Discord');
        outputChannel.clear();
        outputChannel.appendLine(`$ ${command}`);
        outputChannel.appendLine(result.output || '');
        if (result.error) {
            outputChannel.appendLine(`Error: ${result.error}`);
        }
        outputChannel.show();
    } catch (error) {
        vscode.window.showErrorMessage(`Command failed: ${error.message}`);
    }
}

async function askClaude(question: string) {
    try {
        const response = await client.request('askClaude', { question });
        
        // Show response in new editor
        const document = await vscode.workspace.openTextDocument({
            content: response.answer,
            language: 'markdown'
        });
        await vscode.window.showTextDocument(document);
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to get response: ${error.message}`);
    }
}

async function explainSelectedCode() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const selection = editor.selection;
    const code = editor.document.getText(selection);
    
    if (!code) {
        vscode.window.showWarningMessage('Please select some code first');
        return;
    }

    try {
        const response = await client.request('explainCode', {
            code,
            language: editor.document.languageId
        });

        // Show explanation in hover or new document
        const document = await vscode.workspace.openTextDocument({
            content: `# Code Explanation\n\n${response.explanation}`,
            language: 'markdown'
        });
        await vscode.window.showTextDocument(document, vscode.ViewColumn.Beside);
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to explain code: ${error.message}`);
    }
}

async function refactorSelectedCode() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const selection = editor.selection;
    const code = editor.document.getText(selection);
    
    if (!code) {
        vscode.window.showWarningMessage('Please select some code first');
        return;
    }

    // Ask for refactoring type
    const refactorType = await vscode.window.showQuickPick([
        'Extract Method',
        'Rename Variable',
        'Simplify Logic',
        'Improve Performance',
        'Add Error Handling',
        'Convert to Async',
        'Add Type Annotations',
        'General Improvement'
    ], {
        placeHolder: 'Select refactoring type'
    });

    if (!refactorType) return;

    try {
        const response = await client.request('refactor', {
            code,
            type: refactorType,
            language: editor.document.languageId
        });

        // Show diff view
        const originalUri = editor.document.uri;
        const refactoredUri = vscode.Uri.parse(`claude-refactored:${originalUri.path}`);
        
        await vscode.commands.executeCommand('vscode.diff',
            originalUri,
            refactoredUri,
            `Refactor: ${refactorType}`
        );

        // Ask if user wants to apply
        const apply = await vscode.window.showInformationMessage(
            'Apply refactoring?',
            'Yes',
            'No'
        );

        if (apply === 'Yes') {
            await editor.edit(editBuilder => {
                editBuilder.replace(selection, response.refactoredCode);
            });
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Refactoring failed: ${error.message}`);
    }
}

async function generateTests() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;

    const selection = editor.selection;
    const code = editor.document.getText(selection.isEmpty ? undefined : selection);

    try {
        const response = await client.request('generateTests', {
            code,
            language: editor.document.languageId,
            framework: await detectTestFramework()
        });

        // Create new test file
        const testFileName = editor.document.fileName.replace(/\.(ts|js|py|java)$/, '.test.$1');
        const testUri = vscode.Uri.file(testFileName);
        
        const edit = new vscode.WorkspaceEdit();
        edit.createFile(testUri, { overwrite: false });
        edit.insert(testUri, new vscode.Position(0, 0), response.tests);
        
        await vscode.workspace.applyEdit(edit);
        await vscode.window.showTextDocument(testUri);
        
        vscode.window.showInformationMessage('Tests generated successfully!');
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to generate tests: ${error.message}`);
    }
}

async function fixErrors() {
    const diagnostics = vscode.languages.getDiagnostics();
    const errors: any[] = [];

    for (const [uri, diags] of diagnostics) {
        for (const diag of diags) {
            if (diag.severity === vscode.DiagnosticSeverity.Error) {
                errors.push({
                    file: uri.fsPath,
                    line: diag.range.start.line,
                    column: diag.range.start.character,
                    message: diag.message,
                    code: diag.code
                });
            }
        }
    }

    if (errors.length === 0) {
        vscode.window.showInformationMessage('No errors to fix!');
        return;
    }

    try {
        const response = await client.request('fixErrors', { errors });
        
        // Apply fixes
        for (const fix of response.fixes) {
            const uri = vscode.Uri.file(fix.file);
            const document = await vscode.workspace.openTextDocument(uri);
            const editor = await vscode.window.showTextDocument(document);
            
            await editor.edit(editBuilder => {
                const range = new vscode.Range(
                    fix.range.start.line,
                    fix.range.start.character,
                    fix.range.end.line,
                    fix.range.end.character
                );
                editBuilder.replace(range, fix.replacement);
            });
        }
        
        vscode.window.showInformationMessage(`Fixed ${response.fixes.length} errors!`);
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to fix errors: ${error.message}`);
    }
}

async function startCollaboration() {
    try {
        const response = await client.request('startCollaboration', {
            workspace: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
        });
        
        collaborationManager.startSession(response.sessionId);
        
        // Copy session ID to clipboard
        await vscode.env.clipboard.writeText(response.sessionId);
        
        vscode.window.showInformationMessage(
            `Collaboration started! Session ID: ${response.sessionId} (copied to clipboard)`
        );
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to start collaboration: ${error.message}`);
    }
}

async function joinCollaboration(sessionId: string) {
    try {
        await client.request('joinCollaboration', { sessionId });
        collaborationManager.joinSession(sessionId);
        
        vscode.window.showInformationMessage(`Joined collaboration session: ${sessionId}`);
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to join collaboration: ${error.message}`);
    }
}

async function detectTestFramework(): Promise<string> {
    // Check package.json for test framework
    const packageJson = vscode.workspace.findFiles('package.json', null, 1);
    if (packageJson) {
        // Parse and detect framework
        return 'jest'; // Default for now
    }
    return 'jest';
}

export function deactivate() {
    if (client) {
        client.disconnect();
    }
}