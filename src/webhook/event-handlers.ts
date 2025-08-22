import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

export interface GitHubEvent {
  id: string;
  type: string;
  action?: string;
  repository: {
    name: string;
    full_name: string;
    owner: {
      login: string;
      avatar_url?: string;
    };
    html_url: string;
  };
  sender: {
    login: string;
    avatar_url?: string;
    html_url: string;
  };
  timestamp: number;
}

export interface PushEvent extends GitHubEvent {
  ref: string;
  before: string;
  after: string;
  commits: Array<{
    id: string;
    message: string;
    author: {
      name: string;
      email: string;
    };
    url: string;
    added: string[];
    modified: string[];
    removed: string[];
  }>;
  pusher: {
    name: string;
    email: string;
  };
}

export interface PullRequestEvent extends GitHubEvent {
  action: 'opened' | 'closed' | 'merged' | 'reopened' | 'synchronize' | 'review_requested';
  number: number;
  pull_request: {
    id: number;
    number: number;
    title: string;
    body: string;
    state: 'open' | 'closed';
    merged: boolean;
    draft: boolean;
    html_url: string;
    user: {
      login: string;
      avatar_url?: string;
    };
    head: {
      ref: string;
      sha: string;
    };
    base: {
      ref: string;
      sha: string;
    };
    created_at: string;
    updated_at: string;
    merged_at?: string;
    merge_commit_sha?: string;
    additions: number;
    deletions: number;
    changed_files: number;
  };
}

export interface IssueEvent extends GitHubEvent {
  action: 'opened' | 'closed' | 'reopened' | 'assigned' | 'unassigned' | 'labeled' | 'unlabeled';
  issue: {
    id: number;
    number: number;
    title: string;
    body: string;
    state: 'open' | 'closed';
    html_url: string;
    user: {
      login: string;
      avatar_url?: string;
    };
    labels: Array<{
      name: string;
      color: string;
    }>;
    assignees: Array<{
      login: string;
      avatar_url?: string;
    }>;
    created_at: string;
    updated_at: string;
    closed_at?: string;
  };
}

export interface ReleaseEvent extends GitHubEvent {
  action: 'published' | 'created' | 'edited' | 'deleted' | 'prereleased' | 'released';
  release: {
    id: number;
    tag_name: string;
    name: string;
    body: string;
    draft: boolean;
    prerelease: boolean;
    html_url: string;
    author: {
      login: string;
      avatar_url?: string;
    };
    created_at: string;
    published_at: string;
    assets: Array<{
      name: string;
      size: number;
      download_count: number;
      browser_download_url: string;
    }>;
  };
}

export interface WorkflowRunEvent extends GitHubEvent {
  action: 'requested' | 'in_progress' | 'completed';
  workflow_run: {
    id: number;
    name: string;
    status: 'queued' | 'in_progress' | 'completed';
    conclusion?: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out';
    workflow_id: number;
    run_number: number;
    html_url: string;
    created_at: string;
    updated_at: string;
    head_branch: string;
    head_sha: string;
  };
}

export interface StarEvent extends GitHubEvent {
  action: 'created' | 'deleted';
  starred_at?: string;
}

export interface ForkEvent extends GitHubEvent {
  forkee: {
    name: string;
    full_name: string;
    owner: {
      login: string;
    };
    html_url: string;
  };
}

export interface IssueCommentEvent extends GitHubEvent {
  action: 'created' | 'edited' | 'deleted';
  issue: {
    number: number;
    title: string;
    html_url: string;
  };
  comment: {
    id: number;
    body: string;
    user: {
      login: string;
      avatar_url?: string;
    };
    created_at: string;
    updated_at: string;
    html_url: string;
  };
}

export class WebhookEventHandlers extends EventEmitter {
  private static instance: WebhookEventHandlers;

  private constructor() {
    super();
  }

  static getInstance(): WebhookEventHandlers {
    if (!WebhookEventHandlers.instance) {
      WebhookEventHandlers.instance = new WebhookEventHandlers();
    }
    return WebhookEventHandlers.instance;
  }

  /**
   * Handle push event
   */
  handlePush(payload: any): PushEvent | null {
    try {
      const event: PushEvent = {
        id: payload.after,
        type: 'push',
        repository: payload.repository,
        sender: payload.sender,
        timestamp: Date.now(),
        ref: payload.ref,
        before: payload.before,
        after: payload.after,
        commits: payload.commits,
        pusher: payload.pusher
      };

      // Extract branch name
      const branch = event.ref.replace('refs/heads/', '');
      
      logger.info(`Push event: ${event.commits.length} commits to ${branch} in ${event.repository.full_name}`);
      
      this.emit('push', event);
      return event;
    } catch (error) {
      logger.error('Error handling push event:', error);
      return null;
    }
  }

  /**
   * Handle pull request event
   */
  handlePullRequest(payload: any): PullRequestEvent | null {
    try {
      const event: PullRequestEvent = {
        id: `pr-${payload.pull_request.id}`,
        type: 'pull_request',
        action: payload.action,
        number: payload.number,
        repository: payload.repository,
        sender: payload.sender,
        timestamp: Date.now(),
        pull_request: payload.pull_request
      };

      logger.info(`Pull request event: ${event.action} PR #${event.number} in ${event.repository.full_name}`);
      
      this.emit('pull_request', event);
      this.emit(`pull_request:${event.action}`, event);
      
      return event;
    } catch (error) {
      logger.error('Error handling pull request event:', error);
      return null;
    }
  }

  /**
   * Handle issue event
   */
  handleIssue(payload: any): IssueEvent | null {
    try {
      const event: IssueEvent = {
        id: `issue-${payload.issue.id}`,
        type: 'issues',
        action: payload.action,
        repository: payload.repository,
        sender: payload.sender,
        timestamp: Date.now(),
        issue: payload.issue
      };

      logger.info(`Issue event: ${event.action} issue #${event.issue.number} in ${event.repository.full_name}`);
      
      this.emit('issue', event);
      this.emit(`issue:${event.action}`, event);
      
      return event;
    } catch (error) {
      logger.error('Error handling issue event:', error);
      return null;
    }
  }

  /**
   * Handle release event
   */
  handleRelease(payload: any): ReleaseEvent | null {
    try {
      const event: ReleaseEvent = {
        id: `release-${payload.release.id}`,
        type: 'release',
        action: payload.action,
        repository: payload.repository,
        sender: payload.sender,
        timestamp: Date.now(),
        release: payload.release
      };

      logger.info(`Release event: ${event.action} ${event.release.tag_name} in ${event.repository.full_name}`);
      
      this.emit('release', event);
      this.emit(`release:${event.action}`, event);
      
      return event;
    } catch (error) {
      logger.error('Error handling release event:', error);
      return null;
    }
  }

  /**
   * Handle workflow run event
   */
  handleWorkflowRun(payload: any): WorkflowRunEvent | null {
    try {
      const event: WorkflowRunEvent = {
        id: `workflow-${payload.workflow_run.id}`,
        type: 'workflow_run',
        action: payload.action,
        repository: payload.repository,
        sender: payload.sender,
        timestamp: Date.now(),
        workflow_run: payload.workflow_run
      };

      logger.info(`Workflow run event: ${event.workflow_run.name} ${event.action} in ${event.repository.full_name}`);
      
      this.emit('workflow_run', event);
      this.emit(`workflow_run:${event.action}`, event);
      
      // Special handling for completed workflows
      if (event.action === 'completed' && event.workflow_run.conclusion) {
        this.emit(`workflow_run:${event.workflow_run.conclusion}`, event);
      }
      
      return event;
    } catch (error) {
      logger.error('Error handling workflow run event:', error);
      return null;
    }
  }

  /**
   * Handle star event (watch in GitHub API)
   */
  handleStar(payload: any): StarEvent | null {
    try {
      const event: StarEvent = {
        id: `star-${Date.now()}`,
        type: 'watch', // GitHub uses 'watch' for star events
        action: payload.action,
        repository: payload.repository,
        sender: payload.sender,
        timestamp: Date.now(),
        starred_at: payload.starred_at
      };

      logger.info(`Star event: ${event.sender.login} ${event.action === 'created' ? 'starred' : 'unstarred'} ${event.repository.full_name}`);
      
      this.emit('star', event);
      
      return event;
    } catch (error) {
      logger.error('Error handling star event:', error);
      return null;
    }
  }

  /**
   * Handle fork event
   */
  handleFork(payload: any): ForkEvent | null {
    try {
      const event: ForkEvent = {
        id: `fork-${Date.now()}`,
        type: 'fork',
        repository: payload.repository,
        sender: payload.sender,
        timestamp: Date.now(),
        forkee: payload.forkee
      };

      logger.info(`Fork event: ${event.sender.login} forked ${event.repository.full_name} to ${event.forkee.full_name}`);
      
      this.emit('fork', event);
      
      return event;
    } catch (error) {
      logger.error('Error handling fork event:', error);
      return null;
    }
  }

  /**
   * Handle issue comment event
   */
  handleIssueComment(payload: any): IssueCommentEvent | null {
    try {
      const event: IssueCommentEvent = {
        id: `comment-${payload.comment.id}`,
        type: 'issue_comment',
        action: payload.action,
        repository: payload.repository,
        sender: payload.sender,
        timestamp: Date.now(),
        issue: payload.issue,
        comment: payload.comment
      };

      logger.info(`Issue comment event: ${event.action} on issue #${event.issue.number} in ${event.repository.full_name}`);
      
      this.emit('issue_comment', event);
      this.emit(`issue_comment:${event.action}`, event);
      
      return event;
    } catch (error) {
      logger.error('Error handling issue comment event:', error);
      return null;
    }
  }

  /**
   * Handle pull request review event
   */
  handlePullRequestReview(payload: any): any {
    try {
      const event = {
        id: `review-${payload.review.id}`,
        type: 'pull_request_review',
        action: payload.action,
        repository: payload.repository,
        sender: payload.sender,
        timestamp: Date.now(),
        pull_request: payload.pull_request,
        review: payload.review
      };

      logger.info(`PR review event: ${event.review.state} on PR #${event.pull_request.number} in ${event.repository.full_name}`);
      
      this.emit('pull_request_review', event);
      this.emit(`pull_request_review:${event.review.state.toLowerCase()}`, event);
      
      return event;
    } catch (error) {
      logger.error('Error handling pull request review event:', error);
      return null;
    }
  }

  /**
   * Route webhook event to appropriate handler
   */
  routeEvent(eventType: string, payload: any): any {
    switch (eventType) {
      case 'push':
        return this.handlePush(payload);
      
      case 'pull_request':
        return this.handlePullRequest(payload);
      
      case 'issues':
        return this.handleIssue(payload);
      
      case 'release':
        return this.handleRelease(payload);
      
      case 'workflow_run':
        return this.handleWorkflowRun(payload);
      
      case 'watch': // GitHub star event
        return this.handleStar(payload);
      
      case 'fork':
        return this.handleFork(payload);
      
      case 'issue_comment':
        return this.handleIssueComment(payload);
      
      case 'pull_request_review':
        return this.handlePullRequestReview(payload);
      
      default:
        logger.debug(`Unhandled event type: ${eventType}`);
        return null;
    }
  }

  /**
   * Get event statistics
   */
  getEventStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    
    // Count listeners for each event type
    const eventTypes = [
      'push', 'pull_request', 'issue', 'release', 
      'workflow_run', 'star', 'fork', 'issue_comment'
    ];
    
    eventTypes.forEach(type => {
      stats[type] = this.listenerCount(type);
    });
    
    return stats;
  }
}