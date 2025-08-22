import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  codeBlock,
  AttachmentBuilder
} from 'discord.js';
import { SessionManager } from '../../claude/session-manager';
import { ProcessManager } from '../../claude/process-manager';
import { logger } from '../../utils/logger';
import { config } from '../../config';
import * as pty from 'node-pty';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';

const execAsync = promisify(exec);

export const bashCommand = {
  data: new SlashCommandBuilder()
    .setName('bash')
    .setDescription('Execute bash commands safely')
    .addSubcommand(subcommand =>
      subcommand
        .setName('run')
        .setDescription('Execute a command')
        .addStringOption(option =>
          option
            .setName('command')
            .setDescription('Command to execute')
            .setRequired(true)
        )
        .addBooleanOption(option =>
          option
            .setName('stream')
            .setDescription('Stream output in real-time')
            .setRequired(false)
        )
        .addIntegerOption(option =>
          option
            .setName('timeout')
            .setDescription('Timeout in seconds (default: 30)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(300)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('script')
        .setDescription('Run a multi-line script')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('background')
        .setDescription('Start a background process')
        .addStringOption(option =>
          option
            .setName('command')
            .setDescription('Command to run in background')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('name')
            .setDescription('Process name for tracking')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('kill')
        .setDescription('Kill a running process')
        .addStringOption(option =>
          option
            .setName('id')
            .setDescription('Process ID or name')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addBooleanOption(option =>
          option
            .setName('force')
            .setDescription('Force kill (SIGKILL)')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('ps')
        .setDescription('List running processes')
        .addBooleanOption(option =>
          option
            .setName('all')
            .setDescription('Show all processes (not just yours)')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('output')
        .setDescription('Get output from a background process')
        .addStringOption(option =>
          option
            .setName('id')
            .setDescription('Process ID or name')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addIntegerOption(option =>
          option
            .setName('lines')
            .setDescription('Number of lines to show')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(100)
        )
    ) as SlashCommandBuilder,

  async execute(interaction: ChatInputCommandInteraction, sessionManager: SessionManager) {
    const subcommand = interaction.options.getSubcommand();
    const session = sessionManager.getSessionByChannel(interaction.channelId);
    
    if (!session) {
      await interaction.reply({
        content: '❌ No active session. Use `/claude chat` to start.',
        ephemeral: true
      });
      return;
    }

    // Check if command execution is enabled
    if (!config.features?.commandExecution) {
      await interaction.reply({
        content: '❌ Command execution is disabled for security reasons.',
        ephemeral: true
      });
      return;
    }

    const processManager = ProcessManager.getInstance();

    switch (subcommand) {
      case 'run':
        await this.handleRun(interaction, session, processManager);
        break;
      case 'script':
        await this.handleScript(interaction, session, processManager);
        break;
      case 'background':
        await this.handleBackground(interaction, session, processManager);
        break;
      case 'kill':
        await this.handleKill(interaction, processManager);
        break;
      case 'ps':
        await this.handlePs(interaction, processManager);
        break;
      case 'output':
        await this.handleOutput(interaction, processManager);
        break;
    }
  },

  async autocomplete(interaction: AutocompleteInteraction, sessionManager: SessionManager) {
    const focused = interaction.options.getFocused(true);
    const processManager = ProcessManager.getInstance();
    
    if (focused.name === 'id') {
      const processes = processManager.getUserProcesses(interaction.user.id);
      const choices = processes
        .map(p => ({
          name: `${p.name || p.command} (${p.id})`,
          value: p.id
        }))
        .slice(0, 25);
      
      await interaction.respond(choices);
    }
  },

  async handleRun(interaction: ChatInputCommandInteraction, session: any, processManager: ProcessManager) {
    await interaction.deferReply();
    
    const command = interaction.options.getString('command', true);
    const stream = interaction.options.getBoolean('stream') || false;
    const timeout = (interaction.options.getInteger('timeout') || 30) * 1000;
    
    // Security check - validate command
    if (!this.isCommandAllowed(command)) {
      await interaction.editReply({
        content: `❌ Command blocked for security reasons: \`${command}\``
      });
      return;
    }
    
    try {
      const startTime = Date.now();
      
      if (stream) {
        // Streaming execution with PTY
        const processId = await this.executeStreaming(
          command,
          session.projectPath || process.cwd(),
          timeout,
          async (output: string) => {
            // Update message with streaming output
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            const embed = new EmbedBuilder()
              .setTitle(`🖥️ Running: ${command}`)
              .setColor(0x00FF00)
              .setDescription(codeBlock('bash', output.substring(0, 4000)))
              .setFooter({ text: `Elapsed: ${elapsed}s` });
            
            await interaction.editReply({ embeds: [embed] }).catch(() => {});
          }
        );
        
        const finalOutput = processManager.getProcessOutput(processId);
        await this.sendFinalOutput(interaction, command, finalOutput, Date.now() - startTime);
        
      } else {
        // Non-streaming execution
        const result = await this.executeSafe(command, session.projectPath || process.cwd(), timeout);
        await this.sendFinalOutput(interaction, command, result.output, result.duration);
      }
      
      // Send to Claude for context
      await session.sendMessage(`Executed command: ${command}`);
      
    } catch (error) {
      const embed = new EmbedBuilder()
        .setTitle(`❌ Command Failed: ${command}`)
        .setColor(0xFF0000)
        .setDescription(codeBlock('bash', error.message))
        .addFields({
          name: 'Error Type',
          value: error.code || 'Unknown',
          inline: true
        });
      
      await interaction.editReply({ embeds: [embed] });
    }
  },

  async handleScript(interaction: ChatInputCommandInteraction, session: any, processManager: ProcessManager) {
    // Show modal for multi-line script input
    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
    
    const modal = new ModalBuilder()
      .setCustomId('bash_script')
      .setTitle('Run Bash Script');
    
    const scriptInput = new TextInputBuilder()
      .setCustomId('script')
      .setLabel('Bash Script')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('#!/bin/bash\n\necho "Hello World"')
      .setRequired(true)
      .setMaxLength(4000);
    
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(scriptInput)
    );
    
    await interaction.showModal(modal);
  },

  async handleBackground(interaction: ChatInputCommandInteraction, session: any, processManager: ProcessManager) {
    await interaction.deferReply();
    
    const command = interaction.options.getString('command', true);
    const name = interaction.options.getString('name') || command.split(' ')[0];
    
    // Security check
    if (!this.isCommandAllowed(command)) {
      await interaction.editReply({
        content: `❌ Command blocked for security reasons: \`${command}\``
      });
      return;
    }
    
    try {
      const processId = await processManager.startBackgroundProcess(
        command,
        session.projectPath || process.cwd(),
        interaction.user.id,
        name
      );
      
      const embed = new EmbedBuilder()
        .setTitle('🔄 Background Process Started')
        .setColor(0x00FF00)
        .setDescription(`Process started successfully`)
        .addFields(
          { name: 'Process ID', value: processId, inline: true },
          { name: 'Name', value: name, inline: true },
          { name: 'Command', value: `\`${command}\``, inline: false }
        )
        .setFooter({ text: 'Use /bash ps to list processes, /bash output to view output' });
      
      // Add control buttons
      const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`bash_output_${processId}`)
            .setLabel('View Output')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📄'),
          new ButtonBuilder()
            .setCustomId(`bash_kill_${processId}`)
            .setLabel('Kill Process')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('⏹️')
        );
      
      await interaction.editReply({ 
        embeds: [embed],
        components: [row]
      });
      
      // Send to Claude
      await session.sendMessage(`Started background process: ${name} (${command})`);
      
    } catch (error) {
      await interaction.editReply({
        content: `❌ Failed to start background process: ${error.message}`
      });
    }
  },

  async handleKill(interaction: ChatInputCommandInteraction, processManager: ProcessManager) {
    await interaction.deferReply();
    
    const processId = interaction.options.getString('id', true);
    const force = interaction.options.getBoolean('force') || false;
    
    try {
      const result = await processManager.killProcess(processId, force);
      
      if (result.success) {
        const embed = new EmbedBuilder()
          .setTitle('✅ Process Terminated')
          .setColor(0x00FF00)
          .setDescription(`Process ${processId} has been terminated`)
          .addFields(
            { name: 'Signal', value: force ? 'SIGKILL' : 'SIGTERM', inline: true },
            { name: 'Exit Code', value: String(result.exitCode || 'N/A'), inline: true }
          );
        
        await interaction.editReply({ embeds: [embed] });
      } else {
        await interaction.editReply({
          content: `❌ Failed to kill process: ${result.error}`
        });
      }
    } catch (error) {
      await interaction.editReply({
        content: `❌ Error killing process: ${error.message}`
      });
    }
  },

  async handlePs(interaction: ChatInputCommandInteraction, processManager: ProcessManager) {
    await interaction.deferReply();
    
    const showAll = interaction.options.getBoolean('all') || false;
    const processes = showAll 
      ? processManager.getAllProcesses()
      : processManager.getUserProcesses(interaction.user.id);
    
    if (processes.length === 0) {
      await interaction.editReply({
        content: '📋 No running processes found.'
      });
      return;
    }
    
    const embed = new EmbedBuilder()
      .setTitle('📋 Running Processes')
      .setColor(0x5865F2)
      .setDescription(`Found ${processes.length} running process(es)`)
      .setTimestamp();
    
    processes.slice(0, 10).forEach(proc => {
      const runtime = ((Date.now() - proc.startTime) / 1000).toFixed(0);
      embed.addFields({
        name: `${proc.name || proc.command}`,
        value: [
          `**ID:** ${proc.id}`,
          `**Status:** ${proc.status}`,
          `**Runtime:** ${runtime}s`,
          `**User:** <@${proc.userId}>`,
          `**Command:** \`${proc.command.substring(0, 50)}\``
        ].join('\n'),
        inline: true
      });
    });
    
    if (processes.length > 10) {
      embed.setFooter({ text: `Showing 10 of ${processes.length} processes` });
    }
    
    await interaction.editReply({ embeds: [embed] });
  },

  async handleOutput(interaction: ChatInputCommandInteraction, processManager: ProcessManager) {
    await interaction.deferReply();
    
    const processId = interaction.options.getString('id', true);
    const lines = interaction.options.getInteger('lines') || 50;
    
    try {
      const output = processManager.getProcessOutput(processId, lines);
      
      if (!output) {
        await interaction.editReply({
          content: `❌ No output found for process ${processId}`
        });
        return;
      }
      
      const process = processManager.getProcess(processId);
      
      if (output.length <= 4000) {
        const embed = new EmbedBuilder()
          .setTitle(`📄 Process Output: ${process?.name || processId}`)
          .setColor(0x5865F2)
          .setDescription(codeBlock('bash', output))
          .addFields(
            { name: 'Status', value: process?.status || 'Unknown', inline: true },
            { name: 'Lines', value: String(output.split('\n').length), inline: true }
          );
        
        await interaction.editReply({ embeds: [embed] });
      } else {
        // Send as file if output is large
        const buffer = Buffer.from(output);
        const attachment = new AttachmentBuilder(buffer, { 
          name: `output-${processId}.log` 
        });
        
        await interaction.editReply({
          content: `📄 Output for process: ${process?.name || processId}`,
          files: [attachment]
        });
      }
    } catch (error) {
      await interaction.editReply({
        content: `❌ Error retrieving output: ${error.message}`
      });
    }
  },

  async executeSafe(command: string, cwd: string, timeout: number): Promise<{output: string, duration: number}> {
    const startTime = Date.now();
    
    return new Promise((resolve, reject) => {
      const child = exec(command, {
        cwd,
        timeout,
        maxBuffer: 1024 * 1024 * 10, // 10MB
        env: {
          ...process.env,
          NODE_ENV: 'production'
        }
      }, (error, stdout, stderr) => {
        const duration = Date.now() - startTime;
        
        if (error) {
          if (error.killed) {
            reject(new Error(`Command timed out after ${timeout/1000}s`));
          } else {
            reject(error);
          }
          return;
        }
        
        const output = stdout + (stderr ? `\n\nSTDERR:\n${stderr}` : '');
        resolve({ output, duration });
      });
    });
  },

  async executeStreaming(command: string, cwd: string, timeout: number, onData: (data: string) => void): Promise<string> {
    const processManager = ProcessManager.getInstance();
    return processManager.startStreamingProcess(command, cwd, timeout, onData);
  },

  isCommandAllowed(command: string): boolean {
    // Security whitelist/blacklist
    const blacklist = [
      'rm -rf /',
      'sudo',
      'chmod 777',
      'curl | bash',
      'wget | sh',
      '> /dev/sda',
      'dd if=',
      'mkfs',
      'format',
      ': (){ :|:& };:' // Fork bomb
    ];
    
    const whitelist = config.security?.commandWhitelist || [
      'ls', 'cat', 'echo', 'pwd', 'cd', 'mkdir', 'touch',
      'grep', 'find', 'sed', 'awk', 'sort', 'uniq',
      'npm', 'yarn', 'node', 'python', 'pip',
      'git', 'docker', 'curl', 'wget',
      'ps', 'top', 'df', 'du', 'free'
    ];
    
    // Check blacklist
    for (const blocked of blacklist) {
      if (command.includes(blocked)) {
        return false;
      }
    }
    
    // Check if command starts with whitelisted command
    const baseCommand = command.split(' ')[0];
    if (config.security?.strictWhitelist) {
      return whitelist.some(allowed => baseCommand === allowed);
    }
    
    return true;
  },

  async sendFinalOutput(interaction: ChatInputCommandInteraction, command: string, output: string, duration: number) {
    const seconds = (duration / 1000).toFixed(2);
    
    if (!output || output.trim().length === 0) {
      output = '(No output)';
    }
    
    const embed = new EmbedBuilder()
      .setTitle(`✅ Command Executed: ${command.substring(0, 100)}`)
      .setColor(0x00FF00)
      .addFields(
        { name: 'Duration', value: `${seconds}s`, inline: true },
        { name: 'Output Length', value: `${output.length} chars`, inline: true }
      );
    
    if (output.length <= 4000) {
      embed.setDescription(codeBlock('bash', output.substring(0, 4000)));
      await interaction.editReply({ embeds: [embed] });
    } else {
      // Send as file if output is large
      embed.setDescription('Output too large - sent as attachment');
      
      const buffer = Buffer.from(output);
      const attachment = new AttachmentBuilder(buffer, { 
        name: 'command-output.log' 
      });
      
      await interaction.editReply({ 
        embeds: [embed],
        files: [attachment]
      });
    }
  }
};