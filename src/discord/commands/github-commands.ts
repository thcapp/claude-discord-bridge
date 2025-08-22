import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  StringSelectMenuBuilder,
  ButtonStyle,
  SelectMenuOptionBuilder
} from 'discord.js';
import { GitHubIntegration } from '../../integrations/github-integration';
import { GitManager } from '../../claude/git-manager';
import { SessionManager } from '../../claude/session-manager';
import { logger } from '../../utils/logger';
import { config } from '../../config';

let githubIntegration: GitHubIntegration | null = null;

export const githubCommand = {
  data: new SlashCommandBuilder()
    .setName('github')
    .setDescription('GitHub integration commands')
    .addSubcommand(subcommand =>
      subcommand
        .setName('auth')
        .setDescription('Authenticate with GitHub')
        .addStringOption(option =>
          option
            .setName('token')
            .setDescription('GitHub personal access token')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('pr')
        .setDescription('Pull request operations')
        .addStringOption(option =>
          option
            .setName('action')
            .setDescription('PR action to perform')
            .setRequired(true)
            .addChoices(
              { name: 'Create', value: 'create' },
              { name: 'List', value: 'list' },
              { name: 'View', value: 'view' },
              { name: 'Merge', value: 'merge' },
              { name: 'Close', value: 'close' },
              { name: 'Review', value: 'review' }
            )
        )
        .addIntegerOption(option =>
          option
            .setName('number')
            .setDescription('PR number (for view/merge/close/review)')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('title')
            .setDescription('PR title (for create)')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('body')
            .setDescription('PR body/description (for create)')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('branch')
            .setDescription('Branch name (for create)')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('issue')
        .setDescription('Issue operations')
        .addStringOption(option =>
          option
            .setName('action')
            .setDescription('Issue action to perform')
            .setRequired(true)
            .addChoices(
              { name: 'Create', value: 'create' },
              { name: 'List', value: 'list' },
              { name: 'View', value: 'view' },
              { name: 'Close', value: 'close' },
              { name: 'Comment', value: 'comment' }
            )
        )
        .addIntegerOption(option =>
          option
            .setName('number')
            .setDescription('Issue number (for view/close/comment)')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('title')
            .setDescription('Issue title (for create)')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('body')
            .setDescription('Issue body/comment (for create/comment)')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('labels')
            .setDescription('Comma-separated labels (for create)')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('workflow')
        .setDescription('GitHub Actions workflow operations')
        .addStringOption(option =>
          option
            .setName('action')
            .setDescription('Workflow action')
            .setRequired(true)
            .addChoices(
              { name: 'List', value: 'list' },
              { name: 'Trigger', value: 'trigger' },
              { name: 'Status', value: 'status' }
            )
        )
        .addStringOption(option =>
          option
            .setName('workflow')
            .setDescription('Workflow ID or filename')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('release')
        .setDescription('Create a new release')
        .addStringOption(option =>
          option
            .setName('tag')
            .setDescription('Release tag name')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('name')
            .setDescription('Release name')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('body')
            .setDescription('Release notes')
            .setRequired(false)
        )
        .addBooleanOption(option =>
          option
            .setName('draft')
            .setDescription('Create as draft')
            .setRequired(false)
        )
        .addBooleanOption(option =>
          option
            .setName('prerelease')
            .setDescription('Mark as pre-release')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('repo')
        .setDescription('Set repository for GitHub operations')
        .addStringOption(option =>
          option
            .setName('owner')
            .setDescription('Repository owner/organization')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('name')
            .setDescription('Repository name')
            .setRequired(true)
        )
    ),

  async execute(interaction: ChatInputCommandInteraction, sessionManager: SessionManager) {
    const subcommand = interaction.options.getSubcommand();
    const session = await sessionManager.getOrCreateSession(
      interaction.user.id,
      interaction.channelId
    );

    // Initialize GitHub integration if needed
    if (!githubIntegration) {
      const gitManager = new GitManager(session.workingDirectory);
      githubIntegration = new GitHubIntegration(gitManager);
    }

    try {
      switch (subcommand) {
        case 'auth':
          await handleAuth(interaction);
          break;
        case 'pr':
          await handlePullRequest(interaction, session);
          break;
        case 'issue':
          await handleIssue(interaction);
          break;
        case 'workflow':
          await handleWorkflow(interaction);
          break;
        case 'release':
          await handleRelease(interaction);
          break;
        case 'repo':
          await handleSetRepo(interaction);
          break;
      }
    } catch (error) {
      logger.error(`GitHub command error (${subcommand}):`, error);
      
      const errorMessage = error instanceof Error ? error.message : 'An error occurred';
      
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: `❌ Error: ${errorMessage}`,
          ephemeral: true
        });
      } else {
        await interaction.followUp({
          content: `❌ Error: ${errorMessage}`,
          ephemeral: true
        });
      }
    }
  }
};

async function handleAuth(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });
  
  const token = interaction.options.getString('token', true);
  
  if (!githubIntegration) {
    throw new Error('GitHub integration not initialized');
  }

  const success = await githubIntegration.authenticate(token);
  
  if (success) {
    await interaction.editReply('✅ Successfully authenticated with GitHub!');
  } else {
    await interaction.editReply('❌ Failed to authenticate with GitHub. Please check your token.');
  }
}

async function handlePullRequest(interaction: ChatInputCommandInteraction, session: any) {
  const action = interaction.options.getString('action', true);
  
  if (!githubIntegration) {
    throw new Error('GitHub not authenticated. Use `/github auth` first.');
  }

  await interaction.deferReply();

  switch (action) {
    case 'create': {
      const title = interaction.options.getString('title');
      const body = interaction.options.getString('body');
      const branch = interaction.options.getString('branch');

      let pr;
      if (!title) {
        // Generate PR from current branch
        pr = await githubIntegration.generatePRFromCurrentBranch(session.id, session);
      } else {
        pr = await githubIntegration.createPullRequest(
          title,
          body || '',
          branch || await session.gitManager.getCurrentBranch(),
          'main'
        );
      }

      if (pr) {
        const embed = githubIntegration.createPREmbed(pr);
        const actions = githubIntegration.createPRActions();
        
        await interaction.editReply({
          content: `✅ Created pull request #${pr.number}`,
          embeds: [embed],
          components: [actions]
        });
      } else {
        await interaction.editReply('❌ Failed to create pull request');
      }
      break;
    }

    case 'list': {
      const prs = await githubIntegration.listPullRequests('open', 10);
      
      if (prs.length === 0) {
        await interaction.editReply('No open pull requests found.');
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle('Open Pull Requests')
        .setColor(0x0366d6)
        .setTimestamp();

      for (const pr of prs) {
        const status = pr.draft ? '📝 Draft' : '✅ Ready';
        embed.addFields({
          name: `#${pr.number}: ${pr.title}`,
          value: `${status} | ${pr.user} | ${pr.head} → ${pr.base}\n[View PR](${pr.html_url})`,
          inline: false
        });
      }

      await interaction.editReply({ embeds: [embed] });
      break;
    }

    case 'view': {
      const prNumber = interaction.options.getInteger('number', true);
      const pr = await githubIntegration.getPullRequest(prNumber);
      
      if (pr) {
        const embed = githubIntegration.createPREmbed(pr);
        const actions = githubIntegration.createPRActions();
        
        await interaction.editReply({
          embeds: [embed],
          components: [actions]
        });
      } else {
        await interaction.editReply(`❌ Pull request #${prNumber} not found`);
      }
      break;
    }

    case 'merge': {
      const prNumber = interaction.options.getInteger('number', true);
      const success = await githubIntegration.mergePullRequest(prNumber);
      
      if (success) {
        await interaction.editReply(`✅ Successfully merged PR #${prNumber}`);
      } else {
        await interaction.editReply(`❌ Failed to merge PR #${prNumber}`);
      }
      break;
    }

    case 'close': {
      const prNumber = interaction.options.getInteger('number', true);
      const success = await githubIntegration.closePullRequest(prNumber);
      
      if (success) {
        await interaction.editReply(`✅ Closed PR #${prNumber}`);
      } else {
        await interaction.editReply(`❌ Failed to close PR #${prNumber}`);
      }
      break;
    }

    case 'review': {
      const prNumber = interaction.options.getInteger('number', true);
      
      // Create review selection menu
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`pr_review_${prNumber}`)
        .setPlaceholder('Select review action')
        .addOptions([
          {
            label: 'Approve',
            description: 'Approve this pull request',
            value: 'approve',
            emoji: '✅'
          },
          {
            label: 'Request Changes',
            description: 'Request changes to this pull request',
            value: 'request_changes',
            emoji: '❌'
          },
          {
            label: 'Comment',
            description: 'Add a comment without approval',
            value: 'comment',
            emoji: '💬'
          }
        ]);

      const row = new ActionRowBuilder<StringSelectMenuBuilder>()
        .addComponents(selectMenu);

      await interaction.editReply({
        content: `Select review action for PR #${prNumber}:`,
        components: [row]
      });
      break;
    }
  }
}

async function handleIssue(interaction: ChatInputCommandInteraction) {
  const action = interaction.options.getString('action', true);
  
  if (!githubIntegration) {
    throw new Error('GitHub not authenticated. Use `/github auth` first.');
  }

  await interaction.deferReply();

  switch (action) {
    case 'create': {
      const title = interaction.options.getString('title', true);
      const body = interaction.options.getString('body') || '';
      const labels = interaction.options.getString('labels')?.split(',').map(l => l.trim());

      const issue = await githubIntegration.createIssue(title, body, labels);
      
      if (issue) {
        const embed = githubIntegration.createIssueEmbed(issue);
        const actions = githubIntegration.createIssueActions();
        
        await interaction.editReply({
          content: `✅ Created issue #${issue.number}`,
          embeds: [embed],
          components: [actions]
        });
      } else {
        await interaction.editReply('❌ Failed to create issue');
      }
      break;
    }

    case 'list': {
      const issues = await githubIntegration.listIssues('open', undefined, 10);
      
      if (issues.length === 0) {
        await interaction.editReply('No open issues found.');
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle('Open Issues')
        .setColor(0x28a745)
        .setTimestamp();

      for (const issue of issues) {
        const labels = issue.labels.length > 0 ? `🏷️ ${issue.labels.join(', ')}` : '';
        embed.addFields({
          name: `#${issue.number}: ${issue.title}`,
          value: `${issue.user} | ${labels}\n[View Issue](${issue.html_url})`,
          inline: false
        });
      }

      await interaction.editReply({ embeds: [embed] });
      break;
    }

    case 'view': {
      const issueNumber = interaction.options.getInteger('number', true);
      const issue = await githubIntegration.getIssue(issueNumber);
      
      if (issue) {
        const embed = githubIntegration.createIssueEmbed(issue);
        const actions = githubIntegration.createIssueActions();
        
        await interaction.editReply({
          embeds: [embed],
          components: [actions]
        });
      } else {
        await interaction.editReply(`❌ Issue #${issueNumber} not found`);
      }
      break;
    }

    case 'close': {
      const issueNumber = interaction.options.getInteger('number', true);
      const success = await githubIntegration.closeIssue(issueNumber);
      
      if (success) {
        await interaction.editReply(`✅ Closed issue #${issueNumber}`);
      } else {
        await interaction.editReply(`❌ Failed to close issue #${issueNumber}`);
      }
      break;
    }

    case 'comment': {
      const issueNumber = interaction.options.getInteger('number', true);
      const body = interaction.options.getString('body', true);
      
      const success = await githubIntegration.addCommentToIssue(issueNumber, body);
      
      if (success) {
        await interaction.editReply(`✅ Added comment to issue #${issueNumber}`);
      } else {
        await interaction.editReply(`❌ Failed to add comment to issue #${issueNumber}`);
      }
      break;
    }
  }
}

async function handleWorkflow(interaction: ChatInputCommandInteraction) {
  const action = interaction.options.getString('action', true);
  
  if (!githubIntegration) {
    throw new Error('GitHub not authenticated. Use `/github auth` first.');
  }

  await interaction.deferReply();

  switch (action) {
    case 'list':
    case 'status': {
      const runs = await githubIntegration.getWorkflowRuns(5);
      
      if (runs.length === 0) {
        await interaction.editReply('No workflow runs found.');
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle('Recent Workflow Runs')
        .setColor(0x0366d6)
        .setTimestamp();

      for (const run of runs) {
        const statusEmoji = run.status === 'completed' 
          ? (run.conclusion === 'success' ? '✅' : '❌')
          : '🔄';
        
        embed.addFields({
          name: run.name,
          value: `${statusEmoji} ${run.status} ${run.conclusion ? `(${run.conclusion})` : ''}\n[View Run](${run.html_url})`,
          inline: false
        });
      }

      await interaction.editReply({ embeds: [embed] });
      break;
    }

    case 'trigger': {
      const workflowId = interaction.options.getString('workflow', true);
      const success = await githubIntegration.triggerWorkflow(workflowId);
      
      if (success) {
        await interaction.editReply(`✅ Triggered workflow: ${workflowId}`);
      } else {
        await interaction.editReply(`❌ Failed to trigger workflow: ${workflowId}`);
      }
      break;
    }
  }
}

async function handleRelease(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();
  
  if (!githubIntegration) {
    throw new Error('GitHub not authenticated. Use `/github auth` first.');
  }

  const tag = interaction.options.getString('tag', true);
  const name = interaction.options.getString('name', true);
  const body = interaction.options.getString('body') || '';
  const draft = interaction.options.getBoolean('draft') || false;
  const prerelease = interaction.options.getBoolean('prerelease') || false;

  try {
    const release = await githubIntegration.createRelease(tag, name, body, draft, prerelease);
    
    const embed = new EmbedBuilder()
      .setTitle(`Release: ${release.name}`)
      .setURL(release.html_url)
      .setDescription(release.body || 'No description')
      .setColor(0x28a745)
      .addFields(
        { name: 'Tag', value: release.tag_name, inline: true },
        { name: 'Draft', value: release.draft ? 'Yes' : 'No', inline: true },
        { name: 'Pre-release', value: release.prerelease ? 'Yes' : 'No', inline: true }
      )
      .setTimestamp();

    await interaction.editReply({
      content: '✅ Release created successfully!',
      embeds: [embed]
    });
  } catch (error) {
    await interaction.editReply(`❌ Failed to create release: ${error.message}`);
  }
}

async function handleSetRepo(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });
  
  if (!githubIntegration) {
    throw new Error('GitHub integration not initialized');
  }

  const owner = interaction.options.getString('owner', true);
  const name = interaction.options.getString('name', true);
  
  githubIntegration.setRepository(owner, name);
  
  await interaction.editReply(`✅ Repository set to: ${owner}/${name}`);
}