import { logger } from './logger';

export interface TokenUsage {
  input: number;
  output: number;
  total: number;
  model: string;
  timestamp: number;
}

export interface SessionTokenStats {
  sessionId: string;
  userId: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  messageCount: number;
  estimatedCost: number;
  startTime: number;
  lastUpdate: number;
}

export interface TokenBudget {
  userId: string;
  dailyLimit: number;
  monthlyLimit: number;
  currentDaily: number;
  currentMonthly: number;
  resetDaily: number;
  resetMonthly: number;
}

export class TokenCounter {
  private static instance: TokenCounter;
  private sessionStats: Map<string, SessionTokenStats> = new Map();
  private userBudgets: Map<string, TokenBudget> = new Map();
  private tokenHistory: TokenUsage[] = [];
  
  // Approximate token costs per 1M tokens (in USD)
  private readonly MODEL_COSTS = {
    'claude-3-opus': { input: 15.00, output: 75.00 },
    'claude-3-sonnet': { input: 3.00, output: 15.00 },
    'claude-3-haiku': { input: 0.25, output: 1.25 },
    'claude-2.1': { input: 8.00, output: 24.00 },
    'claude-2': { input: 8.00, output: 24.00 },
    'claude-instant': { input: 0.80, output: 2.40 }
  };

  // Character to token ratios (approximate)
  private readonly CHAR_TO_TOKEN_RATIO = 4; // ~4 characters per token

  private constructor() {
    this.startCleanupInterval();
  }

  static getInstance(): TokenCounter {
    if (!TokenCounter.instance) {
      TokenCounter.instance = new TokenCounter();
    }
    return TokenCounter.instance;
  }

  /**
   * Estimate tokens from text
   */
  estimateTokens(text: string): number {
    // Basic estimation: ~4 characters per token
    // More sophisticated: account for whitespace, punctuation, etc.
    
    // Remove excessive whitespace
    const normalizedText = text.replace(/\s+/g, ' ').trim();
    
    // Count words and characters
    const words = normalizedText.split(/\s+/).length;
    const chars = normalizedText.length;
    
    // Use a combination of word and character count
    // Generally, 1 token ≈ 0.75 words or 4 characters
    const tokensByWords = Math.ceil(words / 0.75);
    const tokensByChars = Math.ceil(chars / this.CHAR_TO_TOKEN_RATIO);
    
    // Return the average, slightly favoring character count
    return Math.ceil((tokensByWords * 0.4 + tokensByChars * 0.6));
  }

  /**
   * Estimate tokens for code
   */
  estimateCodeTokens(code: string, language: string = 'unknown'): number {
    // Code typically has different token density
    const baseTokens = this.estimateTokens(code);
    
    // Adjust based on language characteristics
    const languageMultipliers: Record<string, number> = {
      'python': 0.9,      // Python is generally concise
      'javascript': 1.0,  // Average
      'typescript': 1.1,  // Slightly more verbose with types
      'java': 1.2,        // More verbose
      'cpp': 1.15,        // Moderately verbose
      'html': 0.8,        // Markup is token-efficient
      'css': 0.85,        // Relatively efficient
      'json': 0.7,        // Very structured
      'yaml': 0.75,       // Structured but less than JSON
      'unknown': 1.0      // Default
    };
    
    const multiplier = languageMultipliers[language.toLowerCase()] || 1.0;
    return Math.ceil(baseTokens * multiplier);
  }

  /**
   * Track token usage for a session
   */
  trackUsage(
    sessionId: string,
    userId: string,
    inputText: string,
    outputText: string,
    model: string = 'claude-3-sonnet'
  ): TokenUsage {
    const inputTokens = this.estimateTokens(inputText);
    const outputTokens = this.estimateTokens(outputText);
    const totalTokens = inputTokens + outputTokens;
    
    const usage: TokenUsage = {
      input: inputTokens,
      output: outputTokens,
      total: totalTokens,
      model,
      timestamp: Date.now()
    };
    
    // Update session stats
    this.updateSessionStats(sessionId, userId, usage);
    
    // Update user budget
    this.updateUserBudget(userId, totalTokens);
    
    // Add to history
    this.tokenHistory.push(usage);
    if (this.tokenHistory.length > 10000) {
      this.tokenHistory.shift(); // Keep last 10k entries
    }
    
    logger.debug(`Token usage - Session ${sessionId}: ${totalTokens} tokens (${inputTokens} in, ${outputTokens} out)`);
    
    return usage;
  }

  /**
   * Update session statistics
   */
  private updateSessionStats(sessionId: string, userId: string, usage: TokenUsage): void {
    let stats = this.sessionStats.get(sessionId);
    
    if (!stats) {
      stats = {
        sessionId,
        userId,
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        messageCount: 0,
        estimatedCost: 0,
        startTime: Date.now(),
        lastUpdate: Date.now()
      };
      this.sessionStats.set(sessionId, stats);
    }
    
    stats.totalTokens += usage.total;
    stats.inputTokens += usage.input;
    stats.outputTokens += usage.output;
    stats.messageCount++;
    stats.lastUpdate = Date.now();
    
    // Calculate cost
    const modelCosts = this.MODEL_COSTS[usage.model as keyof typeof this.MODEL_COSTS] || 
                       this.MODEL_COSTS['claude-3-sonnet'];
    
    const inputCost = (usage.input / 1_000_000) * modelCosts.input;
    const outputCost = (usage.output / 1_000_000) * modelCosts.output;
    stats.estimatedCost += inputCost + outputCost;
  }

  /**
   * Get session statistics
   */
  getSessionStats(sessionId: string): SessionTokenStats | undefined {
    return this.sessionStats.get(sessionId);
  }

  /**
   * Get user's total usage
   */
  getUserUsage(userId: string): {
    sessions: SessionTokenStats[];
    totalTokens: number;
    totalCost: number;
    sessionCount: number;
  } {
    const userSessions = Array.from(this.sessionStats.values())
      .filter(s => s.userId === userId);
    
    const totalTokens = userSessions.reduce((sum, s) => sum + s.totalTokens, 0);
    const totalCost = userSessions.reduce((sum, s) => sum + s.estimatedCost, 0);
    
    return {
      sessions: userSessions,
      totalTokens,
      totalCost,
      sessionCount: userSessions.length
    };
  }

  /**
   * Set user budget
   */
  setUserBudget(
    userId: string,
    dailyLimit: number,
    monthlyLimit: number
  ): void {
    const now = Date.now();
    const budget: TokenBudget = {
      userId,
      dailyLimit,
      monthlyLimit,
      currentDaily: 0,
      currentMonthly: 0,
      resetDaily: now + 24 * 60 * 60 * 1000,
      resetMonthly: now + 30 * 24 * 60 * 60 * 1000
    };
    
    this.userBudgets.set(userId, budget);
    logger.info(`Set budget for user ${userId}: ${dailyLimit} daily, ${monthlyLimit} monthly`);
  }

  /**
   * Update user budget usage
   */
  private updateUserBudget(userId: string, tokens: number): void {
    const budget = this.userBudgets.get(userId);
    if (!budget) return;
    
    const now = Date.now();
    
    // Reset daily if needed
    if (now > budget.resetDaily) {
      budget.currentDaily = 0;
      budget.resetDaily = now + 24 * 60 * 60 * 1000;
    }
    
    // Reset monthly if needed
    if (now > budget.resetMonthly) {
      budget.currentMonthly = 0;
      budget.resetMonthly = now + 30 * 24 * 60 * 60 * 1000;
    }
    
    budget.currentDaily += tokens;
    budget.currentMonthly += tokens;
  }

  /**
   * Check if user has budget remaining
   */
  checkBudget(userId: string, estimatedTokens: number): {
    allowed: boolean;
    reason?: string;
    dailyRemaining?: number;
    monthlyRemaining?: number;
  } {
    const budget = this.userBudgets.get(userId);
    if (!budget) {
      return { allowed: true }; // No budget set, allow
    }
    
    const dailyRemaining = budget.dailyLimit - budget.currentDaily;
    const monthlyRemaining = budget.monthlyLimit - budget.currentMonthly;
    
    if (estimatedTokens > dailyRemaining) {
      return {
        allowed: false,
        reason: `Daily token limit exceeded. ${dailyRemaining} tokens remaining.`,
        dailyRemaining,
        monthlyRemaining
      };
    }
    
    if (estimatedTokens > monthlyRemaining) {
      return {
        allowed: false,
        reason: `Monthly token limit exceeded. ${monthlyRemaining} tokens remaining.`,
        dailyRemaining,
        monthlyRemaining
      };
    }
    
    return {
      allowed: true,
      dailyRemaining,
      monthlyRemaining
    };
  }

  /**
   * Get cost estimate
   */
  estimateCost(
    tokens: number,
    model: string = 'claude-3-sonnet',
    type: 'input' | 'output' | 'both' = 'both'
  ): number {
    const modelCosts = this.MODEL_COSTS[model as keyof typeof this.MODEL_COSTS] || 
                       this.MODEL_COSTS['claude-3-sonnet'];
    
    let cost = 0;
    
    if (type === 'input' || type === 'both') {
      cost += (tokens / 1_000_000) * modelCosts.input;
    }
    
    if (type === 'output' || type === 'both') {
      cost += (tokens / 1_000_000) * modelCosts.output;
    }
    
    return cost;
  }

  /**
   * Get usage analytics
   */
  getAnalytics(startTime?: number, endTime?: number): {
    totalTokens: number;
    totalCost: number;
    averageTokensPerMessage: number;
    tokensByModel: Record<string, number>;
    costByModel: Record<string, number>;
    peakHour: number;
    sessions: number;
  } {
    const start = startTime || 0;
    const end = endTime || Date.now();
    
    const relevantHistory = this.tokenHistory.filter(
      h => h.timestamp >= start && h.timestamp <= end
    );
    
    const totalTokens = relevantHistory.reduce((sum, h) => sum + h.total, 0);
    
    const tokensByModel: Record<string, number> = {};
    const costByModel: Record<string, number> = {};
    
    relevantHistory.forEach(h => {
      tokensByModel[h.model] = (tokensByModel[h.model] || 0) + h.total;
      
      const modelCosts = this.MODEL_COSTS[h.model as keyof typeof this.MODEL_COSTS] || 
                         this.MODEL_COSTS['claude-3-sonnet'];
      const cost = (h.input / 1_000_000) * modelCosts.input + 
                   (h.output / 1_000_000) * modelCosts.output;
      costByModel[h.model] = (costByModel[h.model] || 0) + cost;
    });
    
    const totalCost = Object.values(costByModel).reduce((sum, c) => sum + c, 0);
    
    // Find peak hour
    const hourCounts: Record<number, number> = {};
    relevantHistory.forEach(h => {
      const hour = new Date(h.timestamp).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });
    
    const peakHour = Object.entries(hourCounts)
      .sort(([, a], [, b]) => b - a)[0]?.[0] || 0;
    
    const relevantSessions = Array.from(this.sessionStats.values()).filter(
      s => s.startTime >= start && s.lastUpdate <= end
    );
    
    return {
      totalTokens,
      totalCost,
      averageTokensPerMessage: relevantHistory.length > 0 
        ? Math.round(totalTokens / relevantHistory.length)
        : 0,
      tokensByModel,
      costByModel,
      peakHour: parseInt(peakHour),
      sessions: relevantSessions.length
    };
  }

  /**
   * Export usage data
   */
  exportUsageData(userId?: string): {
    sessions: SessionTokenStats[];
    history: TokenUsage[];
    analytics: any;
  } {
    const sessions = userId
      ? Array.from(this.sessionStats.values()).filter(s => s.userId === userId)
      : Array.from(this.sessionStats.values());
    
    const history = userId
      ? this.tokenHistory.filter(h => {
          const session = Array.from(this.sessionStats.values())
            .find(s => s.totalTokens > 0 && s.userId === userId);
          return session !== undefined;
        })
      : this.tokenHistory;
    
    return {
      sessions,
      history,
      analytics: this.getAnalytics()
    };
  }

  /**
   * Get optimization suggestions
   */
  getOptimizationSuggestions(sessionId: string): string[] {
    const stats = this.sessionStats.get(sessionId);
    if (!stats) return [];
    
    const suggestions: string[] = [];
    
    // High token usage per message
    const avgTokensPerMessage = stats.totalTokens / stats.messageCount;
    if (avgTokensPerMessage > 2000) {
      suggestions.push('Consider breaking down large requests into smaller, focused queries');
    }
    
    // High output ratio
    const outputRatio = stats.outputTokens / stats.totalTokens;
    if (outputRatio > 0.8) {
      suggestions.push('Request more concise responses to reduce output tokens');
    }
    
    // High input ratio
    const inputRatio = stats.inputTokens / stats.totalTokens;
    if (inputRatio > 0.7) {
      suggestions.push('Consider summarizing context or using references instead of full text');
    }
    
    // Cost optimization
    if (stats.estimatedCost > 1) {
      suggestions.push('Consider using Claude 3 Haiku for simpler tasks to reduce costs');
    }
    
    // Session duration
    const duration = (stats.lastUpdate - stats.startTime) / (60 * 60 * 1000);
    if (duration > 2 && stats.messageCount > 50) {
      suggestions.push('Long sessions may accumulate unnecessary context. Consider starting fresh for new topics');
    }
    
    return suggestions;
  }

  /**
   * Clear old data
   */
  private startCleanupInterval(): void {
    setInterval(() => {
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days
      
      // Clean old sessions
      for (const [id, stats] of this.sessionStats.entries()) {
        if (stats.lastUpdate < cutoff) {
          this.sessionStats.delete(id);
        }
      }
      
      // Clean old history
      this.tokenHistory = this.tokenHistory.filter(h => h.timestamp > cutoff);
      
      logger.debug('Token counter cleanup completed');
    }, 24 * 60 * 60 * 1000); // Daily
  }

  /**
   * Get cost breakdown
   */
  getCostBreakdown(sessionId: string): {
    inputCost: number;
    outputCost: number;
    totalCost: number;
    costPerMessage: number;
    costPerHour: number;
  } | null {
    const stats = this.sessionStats.get(sessionId);
    if (!stats) return null;
    
    // Assume default model if not tracked
    const modelCosts = this.MODEL_COSTS['claude-3-sonnet'];
    
    const inputCost = (stats.inputTokens / 1_000_000) * modelCosts.input;
    const outputCost = (stats.outputTokens / 1_000_000) * modelCosts.output;
    const totalCost = inputCost + outputCost;
    
    const duration = (stats.lastUpdate - stats.startTime) / (60 * 60 * 1000);
    
    return {
      inputCost,
      outputCost,
      totalCost,
      costPerMessage: stats.messageCount > 0 ? totalCost / stats.messageCount : 0,
      costPerHour: duration > 0 ? totalCost / duration : 0
    };
  }
}