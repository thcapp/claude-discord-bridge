import {
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  MessageContextMenuCommandInteraction,
  UserContextMenuCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  codeBlock
} from 'discord.js';
import { SessionManager } from '../claude/session-manager';
import { logger } from '../utils/logger';

// Message Context Menu Commands
export const analyzeCodeCommand = {
  data: new ContextMenuCommandBuilder()
    .setName('Analyze Code')
    .setType(ApplicationCommandType.Message),
  
  async execute(interaction: MessageContextMenuCommandInteraction, sessionManager: SessionManager) {
    const message = interaction.targetMessage;
    
    // Check if message contains code
    const codeBlockRegex = /```[\s\S]*?```/g;
    const inlineCodeRegex = /`[^`]+`/g;
    
    const codeBlocks = message.content.match(codeBlockRegex) || [];
    const inlineCode = message.content.match(inlineCodeRegex) || [];
    
    if (codeBlocks.length === 0 && inlineCode.length === 0) {
      await interaction.reply({
        content: '❌ No code found in this message.',
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply();

    // Get or create session
    const session = await sessionManager.getOrCreateSession(
      interaction.user.id,
      interaction.channelId
    );

    // Prepare code for analysis
    let codeToAnalyze = '';
    
    for (const block of codeBlocks) {
      // Extract language and code
      const match = block.match(/```(\w+)?\n?([\s\S]*?)```/);
      if (match) {
        const language = match[1] || 'unknown';
        const code = match[2];
        codeToAnalyze += `\n[Language: ${language}]\n${code}\n`;
      }
    }

    // Send to Claude for analysis
    const analysisPrompt = `Please analyze this code and provide:
1. Brief summary of what the code does
2. Potential issues or bugs
3. Suggestions for improvement
4. Security considerations if applicable

Code to analyze:
${codeToAnalyze}`;

    try {
      const analysis = await session.sendMessage(analysisPrompt);
      
      const embed = new EmbedBuilder()
        .setTitle('🔍 Code Analysis')
        .setDescription(analysis.substring(0, 4000))
        .setColor(0x0099ff)
        .setFooter({ text: `Analyzed by Claude | Session: ${session.id}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error('Code analysis error:', error);
      await interaction.editReply('❌ Failed to analyze code.');
    }
  }
};

export const explainCodeCommand = {
  data: new ContextMenuCommandBuilder()
    .setName('Explain Code')
    .setType(ApplicationCommandType.Message),
  
  async execute(interaction: MessageContextMenuCommandInteraction, sessionManager: SessionManager) {
    const message = interaction.targetMessage;
    
    // Check if message contains code
    const codeBlockRegex = /```[\s\S]*?```/g;
    const codeBlocks = message.content.match(codeBlockRegex) || [];
    
    if (codeBlocks.length === 0) {
      await interaction.reply({
        content: '❌ No code blocks found in this message.',
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply();

    // Get or create session
    const session = await sessionManager.getOrCreateSession(
      interaction.user.id,
      interaction.channelId
    );

    // Extract first code block
    const firstBlock = codeBlocks[0];
    const match = firstBlock.match(/```(\w+)?\n?([\s\S]*?)```/);
    
    if (!match) {
      await interaction.editReply('❌ Could not extract code from message.');
      return;
    }

    const language = match[1] || 'unknown';
    const code = match[2];

    // Send to Claude for explanation
    const explainPrompt = `Please explain this ${language} code in detail:
- What does it do?
- How does it work?
- What are the key concepts used?
- Include a step-by-step breakdown if complex

Code:
${code}`;

    try {
      const explanation = await session.sendMessage(explainPrompt);
      
      const embed = new EmbedBuilder()
        .setTitle('📚 Code Explanation')
        .setDescription(explanation.substring(0, 4000))
        .setColor(0x00ff00)
        .addFields({
          name: 'Language',
          value: language,
          inline: true
        })
        .setFooter({ text: `Explained by Claude | Session: ${session.id}` })
        .setTimestamp();

      const actions = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('explain_more')
            .setLabel('More Details')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🔍'),
          new ButtonBuilder()
            .setCustomId('explain_simplify')
            .setLabel('Simplify')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📝')
        );

      await interaction.editReply({ 
        embeds: [embed],
        components: [actions]
      });
    } catch (error) {
      logger.error('Code explanation error:', error);
      await interaction.editReply('❌ Failed to explain code.');
    }
  }
};

export const refactorCodeCommand = {
  data: new ContextMenuCommandBuilder()
    .setName('Refactor Code')
    .setType(ApplicationCommandType.Message),
  
  async execute(interaction: MessageContextMenuCommandInteraction, sessionManager: SessionManager) {
    const message = interaction.targetMessage;
    
    // Check if message contains code
    const codeBlockRegex = /```[\s\S]*?```/g;
    const codeBlocks = message.content.match(codeBlockRegex) || [];
    
    if (codeBlocks.length === 0) {
      await interaction.reply({
        content: '❌ No code blocks found in this message.',
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply();

    // Get or create session
    const session = await sessionManager.getOrCreateSession(
      interaction.user.id,
      interaction.channelId
    );

    // Extract first code block
    const firstBlock = codeBlocks[0];
    const match = firstBlock.match(/```(\w+)?\n?([\s\S]*?)```/);
    
    if (!match) {
      await interaction.editReply('❌ Could not extract code from message.');
      return;
    }

    const language = match[1] || 'unknown';
    const code = match[2];

    // Send to Claude for refactoring
    const refactorPrompt = `Please refactor this ${language} code to improve:
- Readability and maintainability
- Performance where possible
- Follow best practices and conventions
- Add appropriate comments
- Fix any obvious bugs or issues

Original code:
${code}

Provide the refactored code and explain the key changes made.`;

    try {
      const response = await session.sendMessage(refactorPrompt);
      
      // Extract refactored code and explanation
      const refactoredCodeMatch = response.match(/```[\s\S]*?```/);
      const refactoredCode = refactoredCodeMatch ? refactoredCodeMatch[0] : '';
      
      const embed = new EmbedBuilder()
        .setTitle('♻️ Refactored Code')
        .setDescription('Code has been refactored for better quality')
        .setColor(0x9b59b6)
        .addFields({
          name: 'Original Language',
          value: language,
          inline: true
        })
        .setFooter({ text: `Refactored by Claude | Session: ${session.id}` })
        .setTimestamp();

      // Send refactored code as a separate message for easy copying
      await interaction.editReply({ 
        content: `**Refactored Code:**\n${refactoredCode}`,
        embeds: [embed]
      });

      // Send explanation as follow-up
      const explanation = response.replace(refactoredCodeMatch ? refactoredCodeMatch[0] : '', '').trim();
      if (explanation) {
        const explainEmbed = new EmbedBuilder()
          .setTitle('📝 Refactoring Explanation')
          .setDescription(explanation.substring(0, 4000))
          .setColor(0x9b59b6);
        
        await interaction.followUp({ embeds: [explainEmbed] });
      }
    } catch (error) {
      logger.error('Code refactoring error:', error);
      await interaction.editReply('❌ Failed to refactor code.');
    }
  }
};

export const generateTestsCommand = {
  data: new ContextMenuCommandBuilder()
    .setName('Generate Tests')
    .setType(ApplicationCommandType.Message),
  
  async execute(interaction: MessageContextMenuCommandInteraction, sessionManager: SessionManager) {
    const message = interaction.targetMessage;
    
    // Check if message contains code
    const codeBlockRegex = /```[\s\S]*?```/g;
    const codeBlocks = message.content.match(codeBlockRegex) || [];
    
    if (codeBlocks.length === 0) {
      await interaction.reply({
        content: '❌ No code blocks found in this message.',
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply();

    // Get or create session
    const session = await sessionManager.getOrCreateSession(
      interaction.user.id,
      interaction.channelId
    );

    // Extract first code block
    const firstBlock = codeBlocks[0];
    const match = firstBlock.match(/```(\w+)?\n?([\s\S]*?)```/);
    
    if (!match) {
      await interaction.editReply('❌ Could not extract code from message.');
      return;
    }

    const language = match[1] || 'unknown';
    const code = match[2];

    // Send to Claude for test generation
    const testPrompt = `Generate comprehensive unit tests for this ${language} code:
- Cover all functions/methods
- Include edge cases
- Test error handling
- Use appropriate testing framework for ${language}
- Include both positive and negative test cases

Code to test:
${code}

Provide the test code and explain the test coverage.`;

    try {
      const response = await session.sendMessage(testPrompt);
      
      // Extract test code
      const testCodeMatch = response.match(/```[\s\S]*?```/);
      const testCode = testCodeMatch ? testCodeMatch[0] : '';
      
      const embed = new EmbedBuilder()
        .setTitle('🧪 Generated Tests')
        .setDescription('Unit tests have been generated for your code')
        .setColor(0x2ecc71)
        .addFields({
          name: 'Target Language',
          value: language,
          inline: true
        })
        .setFooter({ text: `Generated by Claude | Session: ${session.id}` })
        .setTimestamp();

      // Send test code
      await interaction.editReply({ 
        content: `**Generated Tests:**\n${testCode}`,
        embeds: [embed]
      });

      // Send coverage explanation as follow-up
      const explanation = response.replace(testCodeMatch ? testCodeMatch[0] : '', '').trim();
      if (explanation) {
        const coverageEmbed = new EmbedBuilder()
          .setTitle('📊 Test Coverage')
          .setDescription(explanation.substring(0, 4000))
          .setColor(0x2ecc71);
        
        await interaction.followUp({ embeds: [coverageEmbed] });
      }
    } catch (error) {
      logger.error('Test generation error:', error);
      await interaction.editReply('❌ Failed to generate tests.');
    }
  }
};

export const documentCodeCommand = {
  data: new ContextMenuCommandBuilder()
    .setName('Document Code')
    .setType(ApplicationCommandType.Message),
  
  async execute(interaction: MessageContextMenuCommandInteraction, sessionManager: SessionManager) {
    const message = interaction.targetMessage;
    
    // Check if message contains code
    const codeBlockRegex = /```[\s\S]*?```/g;
    const codeBlocks = message.content.match(codeBlockRegex) || [];
    
    if (codeBlocks.length === 0) {
      await interaction.reply({
        content: '❌ No code blocks found in this message.',
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply();

    // Get or create session
    const session = await sessionManager.getOrCreateSession(
      interaction.user.id,
      interaction.channelId
    );

    // Extract first code block
    const firstBlock = codeBlocks[0];
    const match = firstBlock.match(/```(\w+)?\n?([\s\S]*?)```/);
    
    if (!match) {
      await interaction.editReply('❌ Could not extract code from message.');
      return;
    }

    const language = match[1] || 'unknown';
    const code = match[2];

    // Send to Claude for documentation
    const docPrompt = `Generate comprehensive documentation for this ${language} code:
- Add inline comments explaining complex logic
- Generate function/method documentation (JSDoc, docstrings, etc.)
- Create a README section explaining usage
- Document parameters, return values, and exceptions
- Include example usage where appropriate

Code to document:
${code}`;

    try {
      const response = await session.sendMessage(docPrompt);
      
      // Extract documented code
      const docCodeMatch = response.match(/```[\s\S]*?```/);
      const documentedCode = docCodeMatch ? docCodeMatch[0] : '';
      
      const embed = new EmbedBuilder()
        .setTitle('📖 Documented Code')
        .setDescription('Documentation has been added to your code')
        .setColor(0xf39c12)
        .addFields({
          name: 'Language',
          value: language,
          inline: true
        })
        .setFooter({ text: `Documented by Claude | Session: ${session.id}` })
        .setTimestamp();

      // Send documented code
      await interaction.editReply({ 
        content: `**Documented Code:**\n${documentedCode}`,
        embeds: [embed]
      });

      // Extract and send README section if present
      const readmeMatch = response.match(/## (?:README|Usage|Documentation)[\s\S]*?(?=```|$)/);
      if (readmeMatch) {
        const readmeEmbed = new EmbedBuilder()
          .setTitle('📄 README Documentation')
          .setDescription(readmeMatch[0].substring(0, 4000))
          .setColor(0xf39c12);
        
        await interaction.followUp({ embeds: [readmeEmbed] });
      }
    } catch (error) {
      logger.error('Documentation generation error:', error);
      await interaction.editReply('❌ Failed to document code.');
    }
  }
};

// User Context Menu Commands
export const getUserInfoCommand = {
  data: new ContextMenuCommandBuilder()
    .setName('Get User Sessions')
    .setType(ApplicationCommandType.User),
  
  async execute(interaction: UserContextMenuCommandInteraction, sessionManager: SessionManager) {
    const targetUser = interaction.targetUser;
    
    // Check if user has permission to view other users' sessions
    const isAdmin = interaction.memberPermissions?.has('Administrator');
    const isSelf = interaction.user.id === targetUser.id;
    
    if (!isAdmin && !isSelf) {
      await interaction.reply({
        content: '❌ You can only view your own sessions.',
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const sessions = sessionManager.getUserSessions(targetUser.id);
    
    if (sessions.length === 0) {
      await interaction.editReply(`No active sessions found for ${targetUser.username}.`);
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`Sessions for ${targetUser.username}`)
      .setColor(0x0099ff)
      .setThumbnail(targetUser.displayAvatarURL())
      .setTimestamp();

    for (const session of sessions) {
      const status = session.isActive ? '🟢 Active' : '🔴 Inactive';
      const messageCount = session.messageHistory.length;
      
      embed.addFields({
        name: `Session ${session.id}`,
        value: `${status} | Channel: <#${session.channelId}>\nMessages: ${messageCount} | Created: ${new Date(session.createdAt).toLocaleString()}`,
        inline: false
      });
    }

    await interaction.editReply({ embeds: [embed] });
  }
};

// Export all context menu commands
export const contextMenuCommands = [
  analyzeCodeCommand,
  explainCodeCommand,
  refactorCodeCommand,
  generateTestsCommand,
  documentCodeCommand,
  getUserInfoCommand
];