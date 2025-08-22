import { Octokit } from '@octokit/rest';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { logger } from '../utils/logger';
import { GitManager } from '../claude/git-manager';
import simpleGit from 'simple-git';

interface PullRequest {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed' | 'merged';
  user: string;
  created_at: string;
  updated_at: string;
  head: string;
  base: string;
  html_url: string;
  draft: boolean;
  reviews?: Review[];
  checks?: Check[];
}

interface Issue {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  user: string;
  created_at: string;
  updated_at: string;
  labels: string[];
  assignees: string[];
  html_url: string;
}

interface Review {
  user: string;
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'PENDING';
  body: string;
}

interface Check {
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | null;
}

export class GitHubIntegration {
  private octokit: Octokit | null = null;
  private gitManager: GitManager;
  private owner: string = '';
  private repo: string = '';
  private authenticated: boolean = false;

  constructor(gitManager: GitManager) {
    this.gitManager = gitManager;
  }

  async authenticate(token: string): Promise<boolean> {
    try {
      this.octokit = new Octokit({
        auth: token,
        userAgent: 'claude-discord-bridge'
      });

      // Test authentication
      const { data } = await this.octokit.users.getAuthenticated();
      logger.info(`GitHub authenticated as: ${data.login}`);
      this.authenticated = true;

      // Try to detect repo from git remote
      await this.detectRepository();

      return true;
    } catch (error) {
      logger.error('GitHub authentication failed:', error);
      this.authenticated = false;
      return false;
    }
  }

  async detectRepository(): Promise<{ owner: string; repo: string } | null> {
    try {
      const remotes = await this.gitManager.getRemotes();
      const originRemote = remotes.find(r => r.name === 'origin');
      
      if (originRemote?.url) {
        // Parse GitHub URL formats
        const match = originRemote.url.match(/github\.com[:/]([^/]+)\/([^/.]+)(\.git)?$/);
        
        if (match) {
          this.owner = match[1];
          this.repo = match[2];
          logger.info(`Detected GitHub repo: ${this.owner}/${this.repo}`);
          return { owner: this.owner, repo: this.repo };
        }
      }
    } catch (error) {
      logger.error('Failed to detect repository:', error);
    }
    
    return null;
  }

  setRepository(owner: string, repo: string): void {
    this.owner = owner;
    this.repo = repo;
  }

  // Pull Request Operations
  async createPullRequest(
    title: string,
    body: string,
    head: string,
    base: string = 'main',
    draft: boolean = false
  ): Promise<PullRequest | null> {
    if (!this.authenticated || !this.octokit) {
      throw new Error('GitHub not authenticated');
    }

    try {
      const { data } = await this.octokit.pulls.create({
        owner: this.owner,
        repo: this.repo,
        title,
        body,
        head,
        base,
        draft
      });

      const pr: PullRequest = {
        number: data.number,
        title: data.title,
        body: data.body || '',
        state: data.state as 'open' | 'closed',
        user: data.user?.login || 'unknown',
        created_at: data.created_at,
        updated_at: data.updated_at,
        head: data.head.ref,
        base: data.base.ref,
        html_url: data.html_url,
        draft: data.draft || false
      };

      logger.info(`Created PR #${pr.number}: ${pr.title}`);
      return pr;
    } catch (error) {
      logger.error('Failed to create pull request:', error);
      return null;
    }
  }

  async generatePRFromCurrentBranch(
    sessionId: string,
    claudeSession?: any
  ): Promise<PullRequest | null> {
    try {
      // Get current branch and diff
      const currentBranch = await this.gitManager.getCurrentBranch();
      const status = await this.gitManager.getStatus();
      
      // Check for uncommitted changes
      if (status.files.length > 0) {
        throw new Error('Please commit your changes before creating a PR');
      }

      // Get commits between base and current branch
      const log = await this.gitManager.getLog(50);
      const baseBranch = 'main'; // Could be configurable
      
      // Generate PR title and body
      let title = `Update from ${currentBranch}`;
      let body = '## Changes\n\n';

      // If Claude session available, generate better PR description
      if (claudeSession) {
        const diff = await this.gitManager.getDiff();
        const prompt = `Generate a pull request title and description for these changes:\n\n${diff}\n\nFormat as JSON: {"title": "...", "body": "..."}`;
        
        // This would call Claude to generate PR content
        // For now, use basic generation
      }

      // Add commit list to body
      body += '### Commits\n';
      for (const commit of log.slice(0, 10)) {
        body += `- ${commit.message}\n`;
      }

      body += '\n---\n*Created via Claude Discord Bridge*';

      return await this.createPullRequest(title, body, currentBranch, baseBranch);
    } catch (error) {
      logger.error('Failed to generate PR:', error);
      throw error;
    }
  }

  async listPullRequests(
    state: 'open' | 'closed' | 'all' = 'open',
    limit: number = 10
  ): Promise<PullRequest[]> {
    if (!this.authenticated || !this.octokit) {
      throw new Error('GitHub not authenticated');
    }

    try {
      const { data } = await this.octokit.pulls.list({
        owner: this.owner,
        repo: this.repo,
        state,
        per_page: limit,
        sort: 'updated',
        direction: 'desc'
      });

      return data.map(pr => ({
        number: pr.number,
        title: pr.title,
        body: pr.body || '',
        state: pr.state as 'open' | 'closed',
        user: pr.user?.login || 'unknown',
        created_at: pr.created_at,
        updated_at: pr.updated_at,
        head: pr.head.ref,
        base: pr.base.ref,
        html_url: pr.html_url,
        draft: pr.draft || false
      }));
    } catch (error) {
      logger.error('Failed to list pull requests:', error);
      return [];
    }
  }

  async getPullRequest(prNumber: number): Promise<PullRequest | null> {
    if (!this.authenticated || !this.octokit) {
      throw new Error('GitHub not authenticated');
    }

    try {
      const { data } = await this.octokit.pulls.get({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber
      });

      // Get reviews
      const reviews = await this.getPullRequestReviews(prNumber);
      
      // Get checks
      const checks = await this.getPullRequestChecks(prNumber);

      return {
        number: data.number,
        title: data.title,
        body: data.body || '',
        state: data.merged ? 'merged' : data.state as 'open' | 'closed',
        user: data.user?.login || 'unknown',
        created_at: data.created_at,
        updated_at: data.updated_at,
        head: data.head.ref,
        base: data.base.ref,
        html_url: data.html_url,
        draft: data.draft || false,
        reviews,
        checks
      };
    } catch (error) {
      logger.error('Failed to get pull request:', error);
      return null;
    }
  }

  async getPullRequestReviews(prNumber: number): Promise<Review[]> {
    if (!this.authenticated || !this.octokit) {
      return [];
    }

    try {
      const { data } = await this.octokit.pulls.listReviews({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber
      });

      return data.map(review => ({
        user: review.user?.login || 'unknown',
        state: review.state as Review['state'],
        body: review.body || ''
      }));
    } catch (error) {
      logger.error('Failed to get PR reviews:', error);
      return [];
    }
  }

  async getPullRequestChecks(prNumber: number): Promise<Check[]> {
    if (!this.authenticated || !this.octokit) {
      return [];
    }

    try {
      const { data: pr } = await this.octokit.pulls.get({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber
      });

      const { data } = await this.octokit.checks.listForRef({
        owner: this.owner,
        repo: this.repo,
        ref: pr.head.sha
      });

      return data.check_runs.map(check => ({
        name: check.name,
        status: check.status as Check['status'],
        conclusion: check.conclusion as Check['conclusion']
      }));
    } catch (error) {
      logger.error('Failed to get PR checks:', error);
      return [];
    }
  }

  async mergePullRequest(
    prNumber: number,
    mergeMethod: 'merge' | 'squash' | 'rebase' = 'merge',
    commitMessage?: string
  ): Promise<boolean> {
    if (!this.authenticated || !this.octokit) {
      throw new Error('GitHub not authenticated');
    }

    try {
      await this.octokit.pulls.merge({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber,
        merge_method: mergeMethod,
        commit_message: commitMessage
      });

      logger.info(`Merged PR #${prNumber}`);
      return true;
    } catch (error) {
      logger.error('Failed to merge pull request:', error);
      return false;
    }
  }

  async closePullRequest(prNumber: number): Promise<boolean> {
    if (!this.authenticated || !this.octokit) {
      throw new Error('GitHub not authenticated');
    }

    try {
      await this.octokit.pulls.update({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber,
        state: 'closed'
      });

      logger.info(`Closed PR #${prNumber}`);
      return true;
    } catch (error) {
      logger.error('Failed to close pull request:', error);
      return false;
    }
  }

  async addReviewToPullRequest(
    prNumber: number,
    event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT',
    body: string
  ): Promise<boolean> {
    if (!this.authenticated || !this.octokit) {
      throw new Error('GitHub not authenticated');
    }

    try {
      await this.octokit.pulls.createReview({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber,
        event,
        body
      });

      logger.info(`Added review to PR #${prNumber}`);
      return true;
    } catch (error) {
      logger.error('Failed to add review:', error);
      return false;
    }
  }

  // Issue Operations
  async createIssue(
    title: string,
    body: string,
    labels?: string[],
    assignees?: string[]
  ): Promise<Issue | null> {
    if (!this.authenticated || !this.octokit) {
      throw new Error('GitHub not authenticated');
    }

    try {
      const { data } = await this.octokit.issues.create({
        owner: this.owner,
        repo: this.repo,
        title,
        body,
        labels,
        assignees
      });

      const issue: Issue = {
        number: data.number,
        title: data.title,
        body: data.body || '',
        state: data.state as 'open' | 'closed',
        user: data.user?.login || 'unknown',
        created_at: data.created_at,
        updated_at: data.updated_at,
        labels: data.labels.map(l => typeof l === 'string' ? l : l.name || ''),
        assignees: data.assignees?.map(a => a.login) || [],
        html_url: data.html_url
      };

      logger.info(`Created issue #${issue.number}: ${issue.title}`);
      return issue;
    } catch (error) {
      logger.error('Failed to create issue:', error);
      return null;
    }
  }

  async listIssues(
    state: 'open' | 'closed' | 'all' = 'open',
    labels?: string[],
    limit: number = 10
  ): Promise<Issue[]> {
    if (!this.authenticated || !this.octokit) {
      throw new Error('GitHub not authenticated');
    }

    try {
      const { data } = await this.octokit.issues.listForRepo({
        owner: this.owner,
        repo: this.repo,
        state,
        labels: labels?.join(','),
        per_page: limit,
        sort: 'updated',
        direction: 'desc'
      });

      return data.map(issue => ({
        number: issue.number,
        title: issue.title,
        body: issue.body || '',
        state: issue.state as 'open' | 'closed',
        user: issue.user?.login || 'unknown',
        created_at: issue.created_at,
        updated_at: issue.updated_at,
        labels: issue.labels.map(l => typeof l === 'string' ? l : l.name || ''),
        assignees: issue.assignees?.map(a => a.login) || [],
        html_url: issue.html_url
      }));
    } catch (error) {
      logger.error('Failed to list issues:', error);
      return [];
    }
  }

  async getIssue(issueNumber: number): Promise<Issue | null> {
    if (!this.authenticated || !this.octokit) {
      throw new Error('GitHub not authenticated');
    }

    try {
      const { data } = await this.octokit.issues.get({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber
      });

      return {
        number: data.number,
        title: data.title,
        body: data.body || '',
        state: data.state as 'open' | 'closed',
        user: data.user?.login || 'unknown',
        created_at: data.created_at,
        updated_at: data.updated_at,
        labels: data.labels.map(l => typeof l === 'string' ? l : l.name || ''),
        assignees: data.assignees?.map(a => a.login) || [],
        html_url: data.html_url
      };
    } catch (error) {
      logger.error('Failed to get issue:', error);
      return null;
    }
  }

  async closeIssue(issueNumber: number): Promise<boolean> {
    if (!this.authenticated || !this.octokit) {
      throw new Error('GitHub not authenticated');
    }

    try {
      await this.octokit.issues.update({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        state: 'closed'
      });

      logger.info(`Closed issue #${issueNumber}`);
      return true;
    } catch (error) {
      logger.error('Failed to close issue:', error);
      return false;
    }
  }

  async addCommentToIssue(issueNumber: number, body: string): Promise<boolean> {
    if (!this.authenticated || !this.octokit) {
      throw new Error('GitHub not authenticated');
    }

    try {
      await this.octokit.issues.createComment({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        body
      });

      logger.info(`Added comment to issue #${issueNumber}`);
      return true;
    } catch (error) {
      logger.error('Failed to add comment:', error);
      return false;
    }
  }

  // Workflow Operations
  async triggerWorkflow(workflowId: string | number, ref: string = 'main'): Promise<boolean> {
    if (!this.authenticated || !this.octokit) {
      throw new Error('GitHub not authenticated');
    }

    try {
      await this.octokit.actions.createWorkflowDispatch({
        owner: this.owner,
        repo: this.repo,
        workflow_id: workflowId,
        ref
      });

      logger.info(`Triggered workflow ${workflowId}`);
      return true;
    } catch (error) {
      logger.error('Failed to trigger workflow:', error);
      return false;
    }
  }

  async getWorkflowRuns(limit: number = 5): Promise<any[]> {
    if (!this.authenticated || !this.octokit) {
      throw new Error('GitHub not authenticated');
    }

    try {
      const { data } = await this.octokit.actions.listWorkflowRunsForRepo({
        owner: this.owner,
        repo: this.repo,
        per_page: limit
      });

      return data.workflow_runs.map(run => ({
        id: run.id,
        name: run.name,
        status: run.status,
        conclusion: run.conclusion,
        created_at: run.created_at,
        html_url: run.html_url
      }));
    } catch (error) {
      logger.error('Failed to get workflow runs:', error);
      return [];
    }
  }

  // Release Operations
  async createRelease(
    tagName: string,
    name: string,
    body: string,
    draft: boolean = false,
    prerelease: boolean = false
  ): Promise<any> {
    if (!this.authenticated || !this.octokit) {
      throw new Error('GitHub not authenticated');
    }

    try {
      const { data } = await this.octokit.repos.createRelease({
        owner: this.owner,
        repo: this.repo,
        tag_name: tagName,
        name,
        body,
        draft,
        prerelease
      });

      logger.info(`Created release ${tagName}`);
      return data;
    } catch (error) {
      logger.error('Failed to create release:', error);
      throw error;
    }
  }

  // Discord Embed Builders
  createPREmbed(pr: PullRequest): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle(`PR #${pr.number}: ${pr.title}`)
      .setURL(pr.html_url)
      .setDescription(pr.body.substring(0, 2000))
      .setColor(pr.state === 'open' ? 0x28a745 : pr.state === 'merged' ? 0x6f42c1 : 0xd73a49)
      .addFields(
        { name: 'Status', value: pr.state.toUpperCase(), inline: true },
        { name: 'Author', value: pr.user, inline: true },
        { name: 'Branch', value: `${pr.head} → ${pr.base}`, inline: true }
      )
      .setTimestamp(new Date(pr.updated_at));

    if (pr.draft) {
      embed.setFooter({ text: 'Draft PR' });
    }

    if (pr.reviews && pr.reviews.length > 0) {
      const approvals = pr.reviews.filter(r => r.state === 'APPROVED').length;
      const changes = pr.reviews.filter(r => r.state === 'CHANGES_REQUESTED').length;
      
      embed.addFields({
        name: 'Reviews',
        value: `✅ ${approvals} approved, ❌ ${changes} changes requested`,
        inline: false
      });
    }

    if (pr.checks && pr.checks.length > 0) {
      const passed = pr.checks.filter(c => c.conclusion === 'success').length;
      const failed = pr.checks.filter(c => c.conclusion === 'failure').length;
      
      embed.addFields({
        name: 'Checks',
        value: `✅ ${passed} passed, ❌ ${failed} failed`,
        inline: false
      });
    }

    return embed;
  }

  createIssueEmbed(issue: Issue): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle(`Issue #${issue.number}: ${issue.title}`)
      .setURL(issue.html_url)
      .setDescription(issue.body.substring(0, 2000))
      .setColor(issue.state === 'open' ? 0x28a745 : 0xd73a49)
      .addFields(
        { name: 'Status', value: issue.state.toUpperCase(), inline: true },
        { name: 'Author', value: issue.user, inline: true },
        { name: 'Created', value: new Date(issue.created_at).toLocaleDateString(), inline: true }
      )
      .setTimestamp(new Date(issue.updated_at));

    if (issue.labels.length > 0) {
      embed.addFields({
        name: 'Labels',
        value: issue.labels.join(', '),
        inline: false
      });
    }

    if (issue.assignees.length > 0) {
      embed.addFields({
        name: 'Assignees',
        value: issue.assignees.join(', '),
        inline: false
      });
    }

    return embed;
  }

  createPRActions(): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('pr_approve')
          .setLabel('Approve')
          .setStyle(ButtonStyle.Success)
          .setEmoji('✅'),
        new ButtonBuilder()
          .setCustomId('pr_request_changes')
          .setLabel('Request Changes')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('❌'),
        new ButtonBuilder()
          .setCustomId('pr_merge')
          .setLabel('Merge')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🔀'),
        new ButtonBuilder()
          .setCustomId('pr_close')
          .setLabel('Close')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🚫')
      );
  }

  createIssueActions(): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('issue_comment')
          .setLabel('Comment')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('💬'),
        new ButtonBuilder()
          .setCustomId('issue_assign')
          .setLabel('Assign')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('👤'),
        new ButtonBuilder()
          .setCustomId('issue_label')
          .setLabel('Add Label')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🏷️'),
        new ButtonBuilder()
          .setCustomId('issue_close')
          .setLabel('Close')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🚫')
      );
  }
}