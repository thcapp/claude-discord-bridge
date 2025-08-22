import {
  Client,
  TextChannel,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import {
  WebhookEventHandlers,
  PushEvent,
  PullRequestEvent,
  IssueEvent,
  ReleaseEvent,
  WorkflowRunEvent,
  StarEvent,
  ForkEvent,
  IssueCommentEvent
} from './event-handlers';
import { config } from '../config';
import { logger } from '../utils/logger';
import { OutputFormatter } from '../utils/output-formatter';

interface NotificationConfig {
  channelId?: string;
  mentionUsers?: Map<string, string>; // GitHub username -> Discord user ID
  enabledEvents?: string[];
  filters?: {
    branches?: string[];
    authors?: string[];
    labels?: string[];
  };
}

export class EventNotifier {
  private static instance: EventNotifier;
  private client: Client | null = null;
  private eventHandlers: WebhookEventHandlers;
  private notificationConfig: NotificationConfig;
  private formatter: OutputFormatter;
  private eventCounts: Map<string, number> = new Map();

  private constructor() {
    this.eventHandlers = WebhookEventHandlers.getInstance();
    this.formatter = OutputFormatter.getInstance();
    this.notificationConfig = {
      channelId: config.github.notificationChannel,
      mentionUsers: new Map(),
      enabledEvents: ['push', 'pull_request', 'issue', 'release', 'workflow_run'],
      filters: {}
    };
    
    this.setupEventListeners();
  }

  static getInstance(): EventNotifier {
    if (!EventNotifier.instance) {
      EventNotifier.instance = new EventNotifier();
    }
    return EventNotifier.instance;
  }

  /**
   * Initialize with Discord client
   */
  initialize(client: Client): void {
    this.client = client;
    logger.info('EventNotifier initialized with Discord client');
  }

  /**
   * Set notification channel
   */
  setNotificationChannel(channelId: string): void {
    this.notificationConfig.channelId = channelId;
  }

  /**
   * Add user mention mapping
   */
  addUserMapping(githubUsername: string, discordUserId: string): void {
    this.notificationConfig.mentionUsers?.set(githubUsername, discordUserId);
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Push events
    this.eventHandlers.on('push', (event: PushEvent) => {
      this.notifyPush(event);
    });

    // Pull request events
    this.eventHandlers.on('pull_request:opened', (event: PullRequestEvent) => {
      this.notifyPullRequest(event, '🆕 Pull Request Opened');
    });

    this.eventHandlers.on('pull_request:closed', (event: PullRequestEvent) => {
      if (event.pull_request.merged) {
        this.notifyPullRequest(event, '🎉 Pull Request Merged');
      } else {
        this.notifyPullRequest(event, '❌ Pull Request Closed');
      }
    });

    this.eventHandlers.on('pull_request:reopened', (event: PullRequestEvent) => {
      this.notifyPullRequest(event, '♻️ Pull Request Reopened');
    });

    // Issue events
    this.eventHandlers.on('issue:opened', (event: IssueEvent) => {
      this.notifyIssue(event, '📋 Issue Opened');
    });

    this.eventHandlers.on('issue:closed', (event: IssueEvent) => {
      this.notifyIssue(event, '✅ Issue Closed');
    });

    // Release events
    this.eventHandlers.on('release:published', (event: ReleaseEvent) => {
      this.notifyRelease(event);
    });

    // Workflow events
    this.eventHandlers.on('workflow_run:completed', (event: WorkflowRunEvent) => {
      this.notifyWorkflowRun(event);
    });

    // Star events
    this.eventHandlers.on('star', (event: StarEvent) => {
      if (event.action === 'created') {
        this.notifyStar(event);
      }
    });

    // Fork events
    this.eventHandlers.on('fork', (event: ForkEvent) => {
      this.notifyFork(event);
    });

    // Comment events
    this.eventHandlers.on('issue_comment:created', (event: IssueCommentEvent) => {
      this.notifyIssueComment(event);
    });
  }

  /**
   * Send notification to Discord
   */
  private async sendNotification(embed: EmbedBuilder, components?: ActionRowBuilder<ButtonBuilder>[]): Promise<void> {
    if (!this.client || !this.notificationConfig.channelId) {
      logger.warn('Cannot send notification: client or channel not configured');
      return;
    }

    try {
      const channel = await this.client.channels.fetch(this.notificationConfig.channelId);
      
      if (!channel || !channel.isTextBased()) {
        logger.error('Invalid notification channel');
        return;
      }

      const message = {
        embeds: [embed],
        components: components || []
      };

      await (channel as TextChannel).send(message);
      
      // Track event counts
      const eventType = embed.data.footer?.text || 'unknown';
      this.eventCounts.set(eventType, (this.eventCounts.get(eventType) || 0) + 1);
    } catch (error) {
      logger.error('Failed to send notification:', error);
    }
  }

  /**
   * Notify push event
   */
  private async notifyPush(event: PushEvent): Promise<void> {
    const branch = event.ref.replace('refs/heads/', '');
    
    // Apply branch filter
    if (this.notificationConfig.filters?.branches?.length) {
      if (!this.notificationConfig.filters.branches.includes(branch)) {
        return;
      }
    }

    const embed = new EmbedBuilder()
      .setTitle(`⬆️ Push to ${branch}`)
      .setURL(`${event.repository.html_url}/commits/${branch}`)
      .setColor(0x0366d6)
      .setAuthor({
        name: event.pusher.name,
        iconURL: event.sender.avatar_url,
        url: event.sender.html_url
      })
      .setDescription(`**${event.commits.length} commit(s)** pushed to \`${branch}\``)
      .setTimestamp();

    // Add commit details (max 5)
    const commitsToShow = event.commits.slice(0, 5);
    commitsToShow.forEach(commit => {
      const message = commit.message.split('\n')[0];
      const shortSha = commit.id.substring(0, 7);
      embed.addFields({
        name: `\`${shortSha}\``,
        value: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
        inline: false
      });
    });

    if (event.commits.length > 5) {
      embed.addFields({
        name: '\u200b',
        value: `...and ${event.commits.length - 5} more commits`,
        inline: false
      });
    }

    // Add statistics
    let filesChanged = 0;
    let additions = 0;
    let deletions = 0;

    event.commits.forEach(commit => {
      filesChanged += commit.added.length + commit.modified.length + commit.removed.length;
      // Note: GitHub webhook doesn't provide line counts, would need API call
    });

    embed.addFields({
      name: '📊 Statistics',
      value: `**Files changed:** ${filesChanged}`,
      inline: true
    });

    embed.setFooter({
      text: `${event.repository.full_name} • push`,
      iconURL: event.repository.owner.avatar_url
    });

    // Create action buttons
    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setLabel('View Commits')
          .setStyle(ButtonStyle.Link)
          .setURL(`${event.repository.html_url}/commits/${branch}`)
          .setEmoji('📜'),
        new ButtonBuilder()
          .setLabel('Compare')
          .setStyle(ButtonStyle.Link)
          .setURL(`${event.repository.html_url}/compare/${event.before.substring(0, 7)}...${event.after.substring(0, 7)}`)
          .setEmoji('🔍')
      );

    await this.sendNotification(embed, [buttons]);
  }

  /**
   * Notify pull request event
   */
  private async notifyPullRequest(event: PullRequestEvent, title: string): Promise<void> {
    const pr = event.pull_request;
    
    const color = pr.merged ? 0x6f42c1 : pr.state === 'open' ? 0x28a745 : 0xd73a49;
    
    const embed = new EmbedBuilder()
      .setTitle(`${title} #${pr.number}`)
      .setURL(pr.html_url)
      .setColor(color)
      .setAuthor({
        name: pr.user.login,
        iconURL: pr.user.avatar_url,
        url: `https://github.com/${pr.user.login}`
      })
      .setDescription(pr.title)
      .setTimestamp();

    // Add PR body preview
    if (pr.body) {
      const bodyPreview = pr.body.substring(0, 300);
      embed.addFields({
        name: 'Description',
        value: bodyPreview + (pr.body.length > 300 ? '...' : ''),
        inline: false
      });
    }

    // Add branch info
    embed.addFields({
      name: '🌿 Branches',
      value: `\`${pr.head.ref}\` → \`${pr.base.ref}\``,
      inline: true
    });

    // Add statistics
    embed.addFields({
      name: '📊 Changes',
      value: `**+${pr.additions}** / **-${pr.deletions}** in **${pr.changed_files}** files`,
      inline: true
    });

    // Add labels if present
    if (event.action === 'opened' && pr.draft) {
      embed.addFields({
        name: '⚠️ Status',
        value: 'Draft PR',
        inline: true
      });
    }

    embed.setFooter({
      text: `${event.repository.full_name} • pull_request`,
      iconURL: event.repository.owner.avatar_url
    });

    // Create action buttons
    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setLabel('View PR')
          .setStyle(ButtonStyle.Link)
          .setURL(pr.html_url)
          .setEmoji('👀'),
        new ButtonBuilder()
          .setLabel('View Changes')
          .setStyle(ButtonStyle.Link)
          .setURL(`${pr.html_url}/files`)
          .setEmoji('📝')
      );

    // Add merge button if applicable
    if (pr.state === 'open' && !pr.draft) {
      buttons.addComponents(
        new ButtonBuilder()
          .setLabel('Review')
          .setStyle(ButtonStyle.Link)
          .setURL(`${pr.html_url}/files`)
          .setEmoji('✅')
      );
    }

    await this.sendNotification(embed, [buttons]);
  }

  /**
   * Notify issue event
   */
  private async notifyIssue(event: IssueEvent, title: string): Promise<void> {
    const issue = event.issue;
    
    const color = issue.state === 'open' ? 0x28a745 : 0xd73a49;
    
    const embed = new EmbedBuilder()
      .setTitle(`${title} #${issue.number}`)
      .setURL(issue.html_url)
      .setColor(color)
      .setAuthor({
        name: issue.user.login,
        iconURL: issue.user.avatar_url,
        url: `https://github.com/${issue.user.login}`
      })
      .setDescription(issue.title)
      .setTimestamp();

    // Add issue body preview
    if (issue.body) {
      const bodyPreview = issue.body.substring(0, 300);
      embed.addFields({
        name: 'Description',
        value: bodyPreview + (issue.body.length > 300 ? '...' : ''),
        inline: false
      });
    }

    // Add labels
    if (issue.labels.length > 0) {
      const labels = issue.labels.map(l => `\`${l.name}\``).join(' ');
      embed.addFields({
        name: '🏷️ Labels',
        value: labels,
        inline: true
      });
    }

    // Add assignees
    if (issue.assignees.length > 0) {
      const assignees = issue.assignees.map(a => a.login).join(', ');
      embed.addFields({
        name: '👤 Assignees',
        value: assignees,
        inline: true
      });
    }

    embed.setFooter({
      text: `${event.repository.full_name} • issue`,
      iconURL: event.repository.owner.avatar_url
    });

    // Create action buttons
    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setLabel('View Issue')
          .setStyle(ButtonStyle.Link)
          .setURL(issue.html_url)
          .setEmoji('📋')
      );

    await this.sendNotification(embed, [buttons]);
  }

  /**
   * Notify release event
   */
  private async notifyRelease(event: ReleaseEvent): Promise<void> {
    const release = event.release;
    
    const embed = new EmbedBuilder()
      .setTitle(`🚀 New Release: ${release.name || release.tag_name}`)
      .setURL(release.html_url)
      .setColor(0x00ff00)
      .setAuthor({
        name: release.author.login,
        iconURL: release.author.avatar_url,
        url: `https://github.com/${release.author.login}`
      })
      .setDescription(release.body ? release.body.substring(0, 1000) : 'No release notes provided')
      .setTimestamp();

    // Add version info
    embed.addFields({
      name: '🏷️ Version',
      value: release.tag_name,
      inline: true
    });

    // Add pre-release/draft status
    if (release.prerelease || release.draft) {
      embed.addFields({
        name: '⚠️ Status',
        value: release.prerelease ? 'Pre-release' : 'Draft',
        inline: true
      });
    }

    // Add assets if any
    if (release.assets.length > 0) {
      const assetList = release.assets
        .slice(0, 5)
        .map(a => `• [${a.name}](${a.browser_download_url}) (${this.formatFileSize(a.size)})`)
        .join('\n');
      
      embed.addFields({
        name: `📦 Assets (${release.assets.length})`,
        value: assetList,
        inline: false
      });
    }

    embed.setFooter({
      text: `${event.repository.full_name} • release`,
      iconURL: event.repository.owner.avatar_url
    });

    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setLabel('View Release')
          .setStyle(ButtonStyle.Link)
          .setURL(release.html_url)
          .setEmoji('🚀')
      );

    await this.sendNotification(embed, [buttons]);
  }

  /**
   * Notify workflow run event
   */
  private async notifyWorkflowRun(event: WorkflowRunEvent): Promise<void> {
    const run = event.workflow_run;
    
    if (!run.conclusion) return; // Only notify completed runs
    
    const emoji = run.conclusion === 'success' ? '✅' : 
                  run.conclusion === 'failure' ? '❌' : 
                  run.conclusion === 'cancelled' ? '⏹️' : '⚠️';
    
    const color = run.conclusion === 'success' ? 0x28a745 : 
                  run.conclusion === 'failure' ? 0xd73a49 : 0xf39c12;
    
    const embed = new EmbedBuilder()
      .setTitle(`${emoji} Workflow: ${run.name}`)
      .setURL(run.html_url)
      .setColor(color)
      .setDescription(`Run #${run.run_number} ${run.conclusion}`)
      .addFields(
        { name: '🌿 Branch', value: run.head_branch, inline: true },
        { name: '📊 Status', value: run.conclusion || 'unknown', inline: true }
      )
      .setFooter({
        text: `${event.repository.full_name} • workflow`,
        iconURL: event.repository.owner.avatar_url
      })
      .setTimestamp();

    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setLabel('View Run')
          .setStyle(ButtonStyle.Link)
          .setURL(run.html_url)
          .setEmoji('🔍')
      );

    await this.sendNotification(embed, [buttons]);
  }

  /**
   * Notify star event
   */
  private async notifyStar(event: StarEvent): Promise<void> {
    const embed = new EmbedBuilder()
      .setTitle('⭐ New Star!')
      .setURL(event.repository.html_url)
      .setColor(0xffd700)
      .setDescription(`${event.sender.login} starred ${event.repository.full_name}`)
      .setFooter({
        text: `${event.repository.full_name} • star`,
        iconURL: event.repository.owner.avatar_url
      })
      .setTimestamp();

    await this.sendNotification(embed);
  }

  /**
   * Notify fork event
   */
  private async notifyFork(event: ForkEvent): Promise<void> {
    const embed = new EmbedBuilder()
      .setTitle('🍴 Repository Forked!')
      .setURL(event.forkee.html_url)
      .setColor(0x0366d6)
      .setDescription(`${event.sender.login} forked ${event.repository.full_name}`)
      .addFields({
        name: 'New Fork',
        value: `[${event.forkee.full_name}](${event.forkee.html_url})`,
        inline: false
      })
      .setFooter({
        text: `${event.repository.full_name} • fork`,
        iconURL: event.repository.owner.avatar_url
      })
      .setTimestamp();

    await this.sendNotification(embed);
  }

  /**
   * Notify issue comment event
   */
  private async notifyIssueComment(event: IssueCommentEvent): Promise<void> {
    const embed = new EmbedBuilder()
      .setTitle(`💬 Comment on Issue #${event.issue.number}`)
      .setURL(event.comment.html_url)
      .setColor(0x0366d6)
      .setAuthor({
        name: event.comment.user.login,
        iconURL: event.comment.user.avatar_url
      })
      .setDescription(event.issue.title)
      .addFields({
        name: 'Comment',
        value: event.comment.body.substring(0, 500) + (event.comment.body.length > 500 ? '...' : ''),
        inline: false
      })
      .setFooter({
        text: `${event.repository.full_name} • comment`,
        iconURL: event.repository.owner.avatar_url
      })
      .setTimestamp();

    const buttons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setLabel('View Comment')
          .setStyle(ButtonStyle.Link)
          .setURL(event.comment.html_url)
          .setEmoji('💬')
      );

    await this.sendNotification(embed, [buttons]);
  }

  /**
   * Format file size
   */
  private formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  /**
   * Get notification statistics
   */
  getStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    this.eventCounts.forEach((count, type) => {
      stats[type] = count;
    });
    return stats;
  }
}