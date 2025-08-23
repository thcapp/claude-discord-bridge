import simpleGit, { SimpleGit, StatusResult } from 'simple-git';
import { logger } from '../utils/logger';
import path from 'path';

export class GitManager {
  private static instance: GitManager;
  private git: SimpleGit;
  private repoPath: string;

  private constructor(repoPath?: string) {
    this.repoPath = repoPath || process.cwd();
    this.git = simpleGit(this.repoPath);
    
    // Configure git with sensible defaults
    this.git.addConfig('user.name', process.env.GIT_USER_NAME || 'Claude Bot');
    this.git.addConfig('user.email', process.env.GIT_USER_EMAIL || 'claude@discord.bot');
  }

  static getInstance(repoPath?: string): GitManager {
    if (!GitManager.instance) {
      GitManager.instance = new GitManager(repoPath);
    }
    return GitManager.instance;
  }

  async initialize(): Promise<void> {
    try {
      const isRepo = await this.isRepo();
      if (!isRepo) {
        logger.info('Initializing git repository...');
        await this.git.init();
      }
      logger.info('Git manager initialized');
    } catch (error) {
      logger.error('Failed to initialize git manager:', error);
    }
  }

  async isRepo(): Promise<boolean> {
    try {
      await this.git.status();
      return true;
    } catch {
      return false;
    }
  }

  async init(directory?: string): Promise<void> {
    const targetPath = directory ? path.join(this.repoPath, directory) : this.repoPath;
    const git = simpleGit(targetPath);
    await git.init();
    await git.branch(['-M', 'main']); // Use main as default branch
    logger.info(`Initialized git repository at ${targetPath}`);
  }

  async getStatus(): Promise<StatusResult> {
    return await this.git.status();
  }

  async getDiff(file?: string, staged: boolean = false): Promise<string> {
    const options = staged ? ['--cached'] : [];
    
    if (file) {
      return await this.git.diff([...options, '--', file]);
    } else {
      return await this.git.diff(options);
    }
  }

  async getModifiedFiles(): Promise<string[]> {
    const status = await this.git.status();
    return status.files.map(f => f.path);
  }

  async stageFile(file: string): Promise<void> {
    await this.git.add(file);
    logger.info(`Staged file: ${file}`);
  }

  async stageAll(): Promise<void> {
    await this.git.add('.');
    logger.info('Staged all changes');
  }

  async unstageFile(file: string): Promise<void> {
    await this.git.reset(['HEAD', file]);
    logger.info(`Unstaged file: ${file}`);
  }

  async commit(message: string, description?: string): Promise<any> {
    const fullMessage = description ? `${message}\n\n${description}` : message;
    const result = await this.git.commit(fullMessage);
    logger.info(`Created commit: ${message}`);
    return result;
  }

  async generateCommitMessage(diff: string): Promise<string> {
    // This would integrate with Claude to generate commit messages
    // For now, return a template
    const status = await this.getStatus();
    const files = status.files.length;
    const types = new Set(status.files.map(f => {
      if (f.index === 'A') return 'Add';
      if (f.index === 'M') return 'Update';
      if (f.index === 'D') return 'Remove';
      return 'Modify';
    }));
    
    return `${Array.from(types).join('/')} ${files} file(s)`;
  }

  async getBranches(): Promise<string[]> {
    const branches = await this.git.branchLocal();
    return branches.all;
  }

  async getCurrentBranch(): Promise<string> {
    const branches = await this.git.branchLocal();
    return branches.current;
  }

  async createBranch(name: string): Promise<void> {
    await this.git.checkoutLocalBranch(name);
    logger.info(`Created and switched to branch: ${name}`);
  }

  async switchBranch(name: string): Promise<void> {
    await this.git.checkout(name);
    logger.info(`Switched to branch: ${name}`);
  }

  async deleteBranch(name: string, force: boolean = false): Promise<void> {
    const options = force ? ['-D', name] : ['-d', name];
    await this.git.branch(options);
    logger.info(`Deleted branch: ${name}`);
  }

  async renameBranch(oldName: string, newName: string): Promise<void> {
    await this.git.branch(['-m', oldName, newName]);
    logger.info(`Renamed branch: ${oldName} -> ${newName}`);
  }

  async merge(branch: string, noFf: boolean = false): Promise<{
    success: boolean;
    conflicts: string[];
    message?: string;
  }> {
    try {
      const options = noFf ? ['--no-ff', branch] : [branch];
      const result = await this.git.merge(options);
      
      return {
        success: !result.failed,
        conflicts: result.conflicts || [],
        message: result.result
      };
    } catch (error) {
      // Check for merge conflicts
      const status = await this.getStatus();
      const conflicts = status.files
        .filter(f => f.index === 'U' || f.working_dir === 'U')
        .map(f => f.path);
      
      return {
        success: false,
        conflicts,
        message: error.message
      };
    }
  }

  async abortMerge(): Promise<void> {
    await this.git.merge(['--abort']);
    logger.info('Aborted merge');
  }

  async getLog(
    limit: number = 10,
    graph: boolean = false,
    author?: string
  ): Promise<any[]> {
    const options: any = {
      maxCount: limit,
      '--pretty': 'format:%H|%h|%an|%ae|%ad|%s|%b'
    };
    
    if (graph) {
      options['--graph'] = null;
    }
    
    if (author) {
      options['--author'] = author;
    }
    
    const log = await this.git.log(options);
    
    return log.all.map(commit => ({
      hash: commit.hash,
      message: commit.message,
      author_name: commit.author_name,
      author_email: commit.author_email,
      date: commit.date,
      body: commit.body
    }));
  }

  async stash(message?: string): Promise<void> {
    if (message) {
      await this.git.stash(['push', '-m', message]);
    } else {
      await this.git.stash();
    }
    logger.info('Created stash');
  }

  async stashList(): Promise<string[]> {
    const result = await this.git.stashList();
    return result.all.map(s => s.message);
  }

  async stashApply(index: number = 0, pop: boolean = false): Promise<void> {
    if (pop) {
      await this.git.stash(['pop', `stash@{${index}}`]);
      logger.info(`Popped stash@{${index}}`);
    } else {
      await this.git.stash(['apply', `stash@{${index}}`]);
      logger.info(`Applied stash@{${index}}`);
    }
  }

  async stashDrop(index: number = 0): Promise<void> {
    await this.git.stash(['drop', `stash@{${index}}`]);
    logger.info(`Dropped stash@{${index}}`);
  }

  async stashClear(): Promise<void> {
    await this.git.stash(['clear']);
    logger.info('Cleared all stashes');
  }

  async push(remote: string = 'origin', branch?: string, force: boolean = false): Promise<any> {
    const options = [];
    
    if (force) {
      options.push('--force');
    }
    
    if (branch) {
      await this.git.push(remote, branch, options);
    } else {
      await this.git.push(remote, undefined, options);
    }
    
    logger.info(`Pushed to ${remote}/${branch || 'current branch'}`);
    return { success: true };
  }

  async pull(remote: string = 'origin', branch?: string): Promise<any> {
    let result;
    
    if (branch) {
      result = await this.git.pull(remote, branch);
    } else {
      result = await this.git.pull(remote);
    }
    
    logger.info(`Pulled from ${remote}/${branch || 'current branch'}`);
    return result;
  }

  async fetch(remote: string = 'origin'): Promise<void> {
    await this.git.fetch(remote);
    logger.info(`Fetched from ${remote}`);
  }

  async clone(url: string, directory?: string): Promise<void> {
    const targetPath = directory 
      ? path.join(this.repoPath, directory)
      : this.repoPath;
    
    const parentGit = simpleGit(path.dirname(targetPath));
    await parentGit.clone(url, path.basename(targetPath));
    logger.info(`Cloned ${url} to ${targetPath}`);
  }

  async addRemote(name: string, url: string): Promise<void> {
    await this.git.addRemote(name, url);
    logger.info(`Added remote ${name}: ${url}`);
  }

  async removeRemote(name: string): Promise<void> {
    await this.git.removeRemote(name);
    logger.info(`Removed remote ${name}`);
  }

  async getRemotes(): Promise<Array<{name: string, url: string}>> {
    const remotes = await this.git.getRemotes(true);
    return remotes.map(r => ({
      name: r.name,
      url: r.refs.fetch || r.refs.push || ''
    }));
  }

  async getTags(): Promise<string[]> {
    const tags = await this.git.tags();
    return tags.all;
  }

  async createTag(name: string, message?: string): Promise<void> {
    if (message) {
      await this.git.tag(['-a', name, '-m', message]);
    } else {
      await this.git.tag([name]);
    }
    logger.info(`Created tag: ${name}`);
  }

  async deleteTag(name: string): Promise<void> {
    await this.git.tag(['-d', name]);
    logger.info(`Deleted tag: ${name}`);
  }

  async reset(mode: 'soft' | 'mixed' | 'hard' = 'mixed', commit: string = 'HEAD'): Promise<void> {
    await this.git.reset([`--${mode}`, commit]);
    logger.info(`Reset to ${commit} (${mode})`);
  }

  async revert(commit: string): Promise<void> {
    await this.git.revert(commit);
    logger.info(`Reverted commit: ${commit}`);
  }

  async cherryPick(commit: string): Promise<void> {
    await this.git.raw(['cherry-pick', commit]);
    logger.info(`Cherry-picked commit: ${commit}`);
  }

  async getFileHistory(file: string, limit: number = 10): Promise<any[]> {
    const log = await this.git.log({
      file,
      maxCount: limit
    });
    
    return log.all;
  }

  async blame(file: string): Promise<string> {
    return await this.git.raw(['blame', file]);
  }

  async clean(force: boolean = false, directories: boolean = false): Promise<void> {
    const options = ['-f'];
    
    if (directories) {
      options.push('-d');
    }
    
    await this.git.clean(options);
    logger.info('Cleaned working directory');
  }

  async getConflicts(): Promise<string[]> {
    const status = await this.getStatus();
    return status.files
      .filter(f => f.index === 'U' || f.working_dir === 'U')
      .map(f => f.path);
  }

  async resolveConflict(file: string, resolution: 'ours' | 'theirs'): Promise<void> {
    if (resolution === 'ours') {
      await this.git.raw(['checkout', '--ours', file]);
    } else {
      await this.git.raw(['checkout', '--theirs', file]);
    }
    await this.git.add(file);
    logger.info(`Resolved conflict in ${file} using ${resolution}`);
  }

  async getConfig(key: string): Promise<string> {
    const result = await this.git.raw(['config', '--get', key]);
    return result.trim();
  }

  async setConfig(key: string, value: string): Promise<void> {
    await this.git.addConfig(key, value);
    logger.info(`Set config ${key} = ${value}`);
  }

  async getBranchInfo(branch?: string): Promise<{
    name: string;
    upstream?: string;
    ahead: number;
    behind: number;
  }> {
    const currentBranch = branch || await this.getCurrentBranch();
    const status = await this.getStatus();
    
    return {
      name: currentBranch,
      upstream: status.tracking,
      ahead: status.ahead,
      behind: status.behind
    };
  }

  async getGitVersion(): Promise<string> {
    const result = await this.git.raw(['--version']);
    return result.trim();
  }
}