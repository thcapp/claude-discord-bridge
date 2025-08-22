import {
  ButtonInteraction,
  StringSelectMenuInteraction,
  ModalSubmitInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  StringSelectMenuBuilder
} from 'discord.js';
import { SessionManager } from '../claude/session-manager';
import { GitHubIntegration } from '../integrations/github-integration';
import { GitManager } from '../claude/git-manager';
import { logger } from '../utils/logger';
import { config } from '../config';

export class ComponentHandler {
  private githubIntegration: GitHubIntegration | null = null;
  
  constructor(private sessionManager: SessionManager) {}

  async handleButton(interaction: ButtonInteraction): Promise<void> {
    const [action, ...params] = interaction.customId.split('_');
    const sessionId = params[0];
    
    await interaction.deferUpdate().catch(() => {});
    
    try {
      switch (action) {
        case 'continue':
          await this.handleContinue(interaction, sessionId);
          break;
        case 'regenerate':
          await this.handleRegenerate(interaction, sessionId);
          break;
        case 'stop':
          await this.handleStop(interaction, sessionId);
          break;
        case 'branch':
          await this.handleBranch(interaction, sessionId);
          break;
        case 'debug':
          await this.handleDebug(interaction, sessionId);
          break;
        case 'session':
          await this.handleSessionAction(interaction, params);
          break;
        case 'nav':
          await this.handleNavigation(interaction, params);
          break;
        case 'tool':
          await this.handleToolAction(interaction, params);
          break;
        case 'fix':
        case 'explain':
        case 'ignore':
          await this.handleCodeReviewAction(interaction, action, params[0]);
          break;
        // GitHub PR/Issue actions
        case 'pr':
          await this.handlePRAction(interaction, params);
          break;
        case 'issue':
          await this.handleIssueAction(interaction, params);
          break;
        // File navigation
        case 'file':
          await this.handleFileAction(interaction, params);
          break;
        // Process management
        case 'process':
          await this.handleProcessAction(interaction, params);
          break;
        // Pagination
        case 'page':
          await this.handlePagination(interaction, params);
          break;
        default:
          logger.warn(`Unknown button action: ${action}`);
      }
    } catch (error) {
      logger.error(`Button handler error (${action}):`, error);
      await interaction.followUp({
        content: '❌ An error occurred while processing your action.',
        ephemeral: true
      });
    }
  }

  async handleSelectMenu(interaction: StringSelectMenuInteraction): Promise<void> {
    const [type, ...params] = interaction.customId.split('_');
    
    await interaction.deferUpdate().catch(() => {});
    
    try {
      switch (type) {
        case 'model':
          await this.handleModelSelect(interaction);
          break;
        case 'project':
          await this.handleProjectSelect(interaction);
          break;
        case 'session':
          await this.handleSessionSelect(interaction);
          break;
        case 'tool':
          await this.handleToolSelect(interaction);
          break;
        case 'history':
          await this.handleHistorySelect(interaction);
          break;
        case 'pr':
          await this.handlePRReviewSelect(interaction, params);
          break;
        case 'branch':
          await this.handleBranchSelect(interaction);
          break;
        case 'file':
          await this.handleFileSelect(interaction);
          break;
        default:
          logger.warn(`Unknown select menu type: ${type}`);
      }
    } catch (error) {
      logger.error(`Select menu handler error (${type}):`, error);
      await interaction.followUp({
        content: '❌ An error occurred while processing your selection.',
        ephemeral: true
      });
    }
  }

  async handleModal(interaction: ModalSubmitInteraction): Promise<void> {
    const [type, ...params] = interaction.customId.split('_');
    
    await interaction.deferReply({ ephemeral: false }).catch(() => {});
    
    try {
      switch (type) {
        case 'code':
          await this.handleCodeInput(interaction);
          break;
        case 'quick':
          await this.handleQuickAction(interaction);
          break;
        case 'config':
          await this.handleConfigModal(interaction);
          break;
        case 'feedback':
          await this.handleFeedback(interaction);
          break;
        default:
          logger.warn(`Unknown modal type: ${type}`);
      }
    } catch (error) {
      logger.error(`Modal handler error (${type}):`, error);
      await interaction.followUp({
        content: '❌ An error occurred while processing your submission.',
        ephemeral: true
      });
    }
  }

  private async handleContinue(interaction: ButtonInteraction, sessionId: string): Promise<void> {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      await interaction.followUp({
        content: '❌ Session not found or expired.',
        ephemeral: true
      });
      return;
    }
    
    await session.continue();
    await interaction.followUp({
      content: '▶️ Continuing conversation...',
      ephemeral: true
    });
  }

  private async handleRegenerate(interaction: ButtonInteraction, sessionId: string): Promise<void> {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      await interaction.followUp({
        content: '❌ Session not found or expired.',
        ephemeral: true
      });
      return;
    }
    
    await session.regenerate();
    await interaction.followUp({
      content: '🔄 Regenerating response...',
      ephemeral: true
    });
  }

  private async handleStop(interaction: ButtonInteraction, sessionId: string): Promise<void> {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      await interaction.followUp({
        content: '❌ Session not found or expired.',
        ephemeral: true
      });
      return;
    }
    
    await session.stop();
    await interaction.followUp({
      content: '⏹️ Stopped.',
      ephemeral: true
    });
  }

  private async handleBranch(interaction: ButtonInteraction, sessionId: string): Promise<void> {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      await interaction.followUp({
        content: '❌ Session not found or expired.',
        ephemeral: true
      });
      return;
    }
    
    const newSession = await this.sessionManager.branchSession(sessionId);
    if (newSession) {
      await interaction.followUp({
        content: `🌿 Created new branch: Session ${newSession.id}`,
        ephemeral: true
      });
    }
  }

  private async handleDebug(interaction: ButtonInteraction, sessionId: string): Promise<void> {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      await interaction.followUp({
        content: '❌ Session not found or expired.',
        ephemeral: true
      });
      return;
    }
    
    const debugInfo = await session.getDebugInfo();
    const embed = new EmbedBuilder()
      .setTitle('🐛 Debug Information')
      .setColor(0x7289DA)
      .addFields(
        { name: 'Session ID', value: debugInfo.id, inline: true },
        { name: 'Status', value: debugInfo.status, inline: true },
        { name: 'Messages', value: String(debugInfo.messageCount), inline: true },
        { name: 'Created', value: debugInfo.created, inline: true },
        { name: 'Last Active', value: debugInfo.lastActive, inline: true },
        { name: 'Process', value: debugInfo.process || 'None', inline: true }
      );
    
    if (debugInfo.lastError) {
      embed.addFields({ name: 'Last Error', value: debugInfo.lastError, inline: false });
    }
    
    await interaction.followUp({
      embeds: [embed],
      ephemeral: true
    });
  }

  private async handleSessionAction(interaction: ButtonInteraction, params: string[]): Promise<void> {
    const action = params[0];
    
    switch (action) {
      case 'new':
        const session = await this.sessionManager.createSession(
          interaction.user.id,
          interaction.channelId
        );
        await interaction.followUp({
          content: `✅ Created new session: ${session.id}`,
          ephemeral: true
        });
        break;
        
      case 'clear':
        if (params[1]) {
          await this.sessionManager.clearSession(params[1]);
          await interaction.followUp({
            content: '🗑️ Session cleared.',
            ephemeral: true
          });
        } else {
          await this.sessionManager.clearUserSessions(interaction.user.id);
          await interaction.followUp({
            content: '🗑️ All sessions cleared.',
            ephemeral: true
          });
        }
        break;
        
      case 'export':
        const exportData = await this.sessionManager.exportSessions(interaction.user.id);
        await interaction.followUp({
          content: '📥 Sessions exported.',
          files: [{
            attachment: Buffer.from(JSON.stringify(exportData, null, 2)),
            name: 'sessions-export.json'
          }],
          ephemeral: true
        });
        break;
        
      case 'stats':
        const stats = await this.sessionManager.getStatistics(interaction.user.id);
        const statsEmbed = new EmbedBuilder()
          .setTitle('📊 Session Statistics')
          .setColor(0x00FF00)
          .addFields(
            { name: 'Total Sessions', value: String(stats.total), inline: true },
            { name: 'Active', value: String(stats.active), inline: true },
            { name: 'Messages', value: String(stats.messages), inline: true },
            { name: 'Uptime', value: stats.uptime, inline: true }
          );
        await interaction.followUp({
          embeds: [statsEmbed],
          ephemeral: true
        });
        break;
    }
  }

  private async handleNavigation(interaction: ButtonInteraction, params: string[]): Promise<void> {
    const direction = params[0];
    const sessionId = params[1];
    
    const session = this.sessionManager.getSession(sessionId);
    if (!session) return;
    
    switch (direction) {
      case 'first':
        await session.navigateToFirst();
        break;
      case 'prev':
        await session.navigatePrevious();
        break;
      case 'next':
        await session.navigateNext();
        break;
      case 'last':
        await session.navigateToLast();
        break;
    }
    
    await interaction.followUp({
      content: `📍 Navigated to message`,
      ephemeral: true
    });
  }

  private async handleToolAction(interaction: ButtonInteraction, params: string[]): Promise<void> {
    const tool = params[0];
    const sessionId = params[1];
    
    const session = this.sessionManager.getSession(sessionId);
    if (!session) return;
    
    const modal = this.createToolModal(tool);
    await interaction.showModal(modal);
  }

  private createToolModal(tool: string): ModalBuilder {
    const modal = new ModalBuilder()
      .setCustomId(`tool_${tool}`)
      .setTitle(`Tool: ${tool}`);
    
    switch (tool) {
      case 'read':
        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('filepath')
              .setLabel('File Path')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );
        break;
        
      case 'write':
        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('filepath')
              .setLabel('File Path')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('content')
              .setLabel('Content')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
          )
        );
        break;
        
      case 'command':
        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('command')
              .setLabel('Command')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );
        break;
        
      case 'search':
        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('query')
              .setLabel('Search Query')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('path')
              .setLabel('Path (optional)')
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
          )
        );
        break;
    }
    
    return modal;
  }

  private async handleCodeReviewAction(interaction: ButtonInteraction, action: string, suggestionId: string): Promise<void> {
    const session = this.sessionManager.getSessionByChannel(interaction.channelId);
    if (!session) return;
    
    switch (action) {
      case 'fix':
        await session.sendMessage(`Fix the issue with ID: ${suggestionId}`);
        break;
      case 'explain':
        await session.sendMessage(`Explain the issue with ID: ${suggestionId} in more detail`);
        break;
      case 'ignore':
        await interaction.followUp({
          content: '✅ Issue ignored.',
          ephemeral: true
        });
        break;
    }
  }

  private async handleModelSelect(interaction: StringSelectMenuInteraction): Promise<void> {
    const model = interaction.values[0];
    const session = this.sessionManager.getSessionByChannel(interaction.channelId);
    
    if (session) {
      await session.setModel(model);
      await interaction.followUp({
        content: `✅ Model changed to: ${model}`,
        ephemeral: true
      });
    }
  }

  private async handleProjectSelect(interaction: StringSelectMenuInteraction): Promise<void> {
    const projectId = interaction.values[0];
    const session = this.sessionManager.getSessionByChannel(interaction.channelId);
    
    if (session) {
      await session.switchProject(projectId);
      await interaction.followUp({
        content: `✅ Switched to project: ${projectId}`,
        ephemeral: true
      });
    }
  }

  private async handleSessionSelect(interaction: StringSelectMenuInteraction): Promise<void> {
    const sessionId = interaction.values[0];
    const session = this.sessionManager.getSession(sessionId);
    
    if (session) {
      await session.activate();
      await interaction.followUp({
        content: `✅ Activated session: ${sessionId}`,
        ephemeral: true
      });
    }
  }

  private async handleToolSelect(interaction: StringSelectMenuInteraction): Promise<void> {
    const category = interaction.values[0];
    const session = this.sessionManager.getSessionByChannel(interaction.channelId);
    
    if (session) {
      await interaction.followUp({
        content: `Selected tool category: ${category}`,
        ephemeral: true
      });
    }
  }

  private async handleHistorySelect(interaction: StringSelectMenuInteraction): Promise<void> {
    const messageId = interaction.values[0];
    const session = this.sessionManager.getSessionByChannel(interaction.channelId);
    
    if (session) {
      await session.jumpToMessage(messageId);
      await interaction.followUp({
        content: `📍 Jumped to message`,
        ephemeral: true
      });
    }
  }

  private async handleCodeInput(interaction: ModalSubmitInteraction): Promise<void> {
    const code = interaction.fields.getTextInputValue('code');
    const instructions = interaction.fields.getTextInputValue('instructions');
    
    const session = await this.sessionManager.getOrCreateSession(
      interaction.user.id,
      interaction.channelId
    );
    
    const message = `Here's my code:\n\`\`\`\n${code}\n\`\`\`\n\n${instructions}`;
    await session.sendMessage(message);
    
    await interaction.followUp({
      content: '✅ Code submitted to Claude.',
      ephemeral: false
    });
  }

  private async handleQuickAction(interaction: ModalSubmitInteraction): Promise<void> {
    const action = interaction.fields.getTextInputValue('action');
    const context = interaction.fields.getTextInputValue('context');
    
    const session = await this.sessionManager.getOrCreateSession(
      interaction.user.id,
      interaction.channelId
    );
    
    await session.sendMessage(`${action}\n\nContext: ${context}`);
    
    await interaction.followUp({
      content: '✅ Quick action submitted.',
      ephemeral: false
    });
  }

  private async handleConfigModal(interaction: ModalSubmitInteraction): Promise<void> {
    await interaction.followUp({
      content: '✅ Configuration updated.',
      ephemeral: true
    });
  }

  private async handleFeedback(interaction: ModalSubmitInteraction): Promise<void> {
    const feedback = interaction.fields.getTextInputValue('feedback');
    logger.info(`User feedback from ${interaction.user.tag}: ${feedback}`);
    
    await interaction.followUp({
      content: '✅ Thank you for your feedback!',
      ephemeral: true
    });
  }

  createControlPanel(sessionId: string): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`continue_${sessionId}`)
          .setLabel('Continue')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('▶️'),
        new ButtonBuilder()
          .setCustomId(`regenerate_${sessionId}`)
          .setLabel('Regenerate')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🔄'),
        new ButtonBuilder()
          .setCustomId(`stop_${sessionId}`)
          .setLabel('Stop')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('⏹️'),
        new ButtonBuilder()
          .setCustomId(`branch_${sessionId}`)
          .setLabel('Branch')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🌿'),
        new ButtonBuilder()
          .setCustomId(`debug_${sessionId}`)
          .setLabel('Debug')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🐛')
      );
  }

  // GitHub PR Action Handlers
  private async handlePRAction(interaction: ButtonInteraction, params: string[]): Promise<void> {
    const action = params[0];
    const prNumber = params[1] ? parseInt(params[1]) : undefined;
    
    if (!this.githubIntegration) {
      const session = this.sessionManager.getSessionByChannel(interaction.channelId);
      if (session) {
        const gitManager = new GitManager(session.workingDirectory);
        this.githubIntegration = new GitHubIntegration(gitManager);
      }
    }

    if (!this.githubIntegration) {
      await interaction.followUp({
        content: '❌ GitHub integration not available',
        ephemeral: true
      });
      return;
    }

    switch (action) {
      case 'approve':
        if (prNumber) {
          await this.githubIntegration.addReviewToPullRequest(prNumber, 'APPROVE', 'Approved via Discord');
          await interaction.followUp({
            content: `✅ Approved PR #${prNumber}`,
            ephemeral: true
          });
        }
        break;
      case 'request':
        // Show modal for changes request
        const modal = new ModalBuilder()
          .setCustomId(`pr_changes_${prNumber}`)
          .setTitle('Request Changes');
        
        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('feedback')
              .setLabel('What changes are needed?')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
          )
        );
        
        await interaction.showModal(modal);
        break;
      case 'merge':
        if (prNumber) {
          await this.githubIntegration.mergePullRequest(prNumber);
          await interaction.followUp({
            content: `✅ Merged PR #${prNumber}`,
            ephemeral: true
          });
        }
        break;
      case 'close':
        if (prNumber) {
          await this.githubIntegration.closePullRequest(prNumber);
          await interaction.followUp({
            content: `✅ Closed PR #${prNumber}`,
            ephemeral: true
          });
        }
        break;
    }
  }

  // Issue Action Handlers
  private async handleIssueAction(interaction: ButtonInteraction, params: string[]): Promise<void> {
    const action = params[0];
    const issueNumber = params[1] ? parseInt(params[1]) : undefined;
    
    switch (action) {
      case 'comment':
        // Show modal for comment
        const modal = new ModalBuilder()
          .setCustomId(`issue_comment_${issueNumber}`)
          .setTitle('Add Comment');
        
        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('comment')
              .setLabel('Your comment')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
          )
        );
        
        await interaction.showModal(modal);
        break;
      case 'close':
        if (issueNumber && this.githubIntegration) {
          await this.githubIntegration.closeIssue(issueNumber);
          await interaction.followUp({
            content: `✅ Closed issue #${issueNumber}`,
            ephemeral: true
          });
        }
        break;
    }
  }

  // File Action Handlers
  private async handleFileAction(interaction: ButtonInteraction, params: string[]): Promise<void> {
    const action = params[0];
    const path = params[1];
    
    const session = this.sessionManager.getSessionByChannel(interaction.channelId);
    if (!session) return;

    switch (action) {
      case 'open':
        await session.sendMessage(`/file read ${path}`);
        break;
      case 'edit':
        await session.sendMessage(`/file edit ${path}`);
        break;
      case 'delete':
        await session.sendMessage(`/file delete ${path}`);
        break;
    }
  }

  // Process Action Handlers
  private async handleProcessAction(interaction: ButtonInteraction, params: string[]): Promise<void> {
    const action = params[0];
    const processId = params[1];
    
    const session = this.sessionManager.getSessionByChannel(interaction.channelId);
    if (!session) return;

    switch (action) {
      case 'kill':
        await session.sendMessage(`/bash kill ${processId}`);
        break;
      case 'output':
        await session.sendMessage(`/bash output ${processId}`);
        break;
    }
  }

  // Pagination Handlers
  private async handlePagination(interaction: ButtonInteraction, params: string[]): Promise<void> {
    const direction = params[0]; // first, prev, next, last
    const messageId = params[1];
    const currentPage = parseInt(params[2]) || 1;
    const totalPages = parseInt(params[3]) || 1;
    
    let newPage = currentPage;
    
    switch (direction) {
      case 'first':
        newPage = 1;
        break;
      case 'prev':
        newPage = Math.max(1, currentPage - 1);
        break;
      case 'next':
        newPage = Math.min(totalPages, currentPage + 1);
        break;
      case 'last':
        newPage = totalPages;
        break;
    }
    
    // This would need to be integrated with a pagination manager
    await interaction.followUp({
      content: `📄 Page ${newPage}/${totalPages}`,
      ephemeral: true
    });
  }

  // PR Review Select Handler
  private async handlePRReviewSelect(interaction: StringSelectMenuInteraction, params: string[]): Promise<void> {
    const prNumber = parseInt(params[0]);
    const reviewType = interaction.values[0];
    
    if (!this.githubIntegration) return;

    switch (reviewType) {
      case 'approve':
        await this.githubIntegration.addReviewToPullRequest(prNumber, 'APPROVE', 'Approved via Discord');
        await interaction.followUp({
          content: `✅ Approved PR #${prNumber}`,
          ephemeral: true
        });
        break;
      case 'request_changes':
        // Show modal for feedback
        const modal = new ModalBuilder()
          .setCustomId(`pr_review_changes_${prNumber}`)
          .setTitle('Request Changes');
        
        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('feedback')
              .setLabel('What changes are needed?')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
          )
        );
        
        await interaction.showModal(modal);
        break;
      case 'comment':
        // Show modal for comment
        const commentModal = new ModalBuilder()
          .setCustomId(`pr_review_comment_${prNumber}`)
          .setTitle('Add Review Comment');
        
        commentModal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('comment')
              .setLabel('Your comment')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
          )
        );
        
        await interaction.showModal(commentModal);
        break;
    }
  }

  // Branch Select Handler
  private async handleBranchSelect(interaction: StringSelectMenuInteraction): Promise<void> {
    const branch = interaction.values[0];
    const session = this.sessionManager.getSessionByChannel(interaction.channelId);
    
    if (session) {
      await session.sendMessage(`/git branch switch ${branch}`);
    }
  }

  // File Select Handler
  private async handleFileSelect(interaction: StringSelectMenuInteraction): Promise<void> {
    const file = interaction.values[0];
    const session = this.sessionManager.getSessionByChannel(interaction.channelId);
    
    if (session) {
      await session.sendMessage(`/file read ${file}`);
    }
  }
}