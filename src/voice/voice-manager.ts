import { 
  VoiceChannel, 
  VoiceConnection, 
  StageChannel,
  Client,
  GuildMember,
  VoiceState
} from 'discord.js';
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayer,
  VoiceConnectionStatus,
  AudioPlayerStatus,
  entersState,
  getVoiceConnection,
  EndBehaviorType
} from '@discordjs/voice';
import { EventEmitter } from 'events';
import { Readable, Transform } from 'stream';
import * as prism from 'prism-media';
import { SpeechToTextService } from './speech-to-text';
import { TextToSpeechService } from './text-to-speech';
import { VoiceCommandProcessor } from './voice-command-processor';
import { logger } from '../utils/logger';

interface VoiceSession {
  id: string;
  channelId: string;
  guildId: string;
  connection: VoiceConnection;
  audioPlayer: AudioPlayer;
  activeUsers: Map<string, VoiceUserState>;
  transcriptionBuffer: Map<string, string>;
  isRecording: boolean;
  commandQueue: VoiceCommand[];
  createdAt: Date;
  lastActivity: Date;
}

interface VoiceUserState {
  userId: string;
  username: string;
  isListening: boolean;
  audioStream?: Readable;
  transcriptionStream?: Transform;
  lastSpeech?: Date;
}

interface VoiceCommand {
  userId: string;
  command: string;
  timestamp: Date;
  processed: boolean;
}

export class VoiceManager extends EventEmitter {
  private static instance: VoiceManager;
  private sessions: Map<string, VoiceSession> = new Map();
  private stt: SpeechToTextService;
  private tts: TextToSpeechService;
  private commandProcessor: VoiceCommandProcessor;
  private client: Client;

  private constructor() {
    super();
    this.stt = SpeechToTextService.getInstance();
    this.tts = TextToSpeechService.getInstance();
    this.commandProcessor = VoiceCommandProcessor.getInstance();
  }

  static getInstance(): VoiceManager {
    if (!VoiceManager.instance) {
      VoiceManager.instance = new VoiceManager();
    }
    return VoiceManager.instance;
  }

  initialize(client: Client): void {
    this.client = client;
    
    // Listen for voice state updates
    client.on('voiceStateUpdate', (oldState, newState) => {
      this.handleVoiceStateUpdate(oldState, newState);
    });

    logger.info('Voice Manager initialized');
  }

  async joinChannel(channel: VoiceChannel | StageChannel, member: GuildMember): Promise<VoiceSession> {
    try {
      // Check if already in channel
      const existingSession = this.sessions.get(channel.id);
      if (existingSession) {
        logger.info(`Already connected to voice channel ${channel.name}`);
        return existingSession;
      }

      // Create voice connection
      const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false
      });

      // Wait for connection to be ready
      await entersState(connection, VoiceConnectionStatus.Ready, 30_000);

      // Create audio player
      const audioPlayer = createAudioPlayer();
      connection.subscribe(audioPlayer);

      // Create session
      const session: VoiceSession = {
        id: `voice_${Date.now()}`,
        channelId: channel.id,
        guildId: channel.guild.id,
        connection,
        audioPlayer,
        activeUsers: new Map(),
        transcriptionBuffer: new Map(),
        isRecording: false,
        commandQueue: [],
        createdAt: new Date(),
        lastActivity: new Date()
      };

      // Set up connection event handlers
      this.setupConnectionHandlers(session);

      // Store session
      this.sessions.set(channel.id, session);

      // Start listening to users in channel
      await this.startListening(session, channel);

      logger.info(`Joined voice channel: ${channel.name} (${channel.id})`);
      this.emit('channelJoined', { session, channel, member });

      return session;
    } catch (error) {
      logger.error('Failed to join voice channel:', error);
      throw error;
    }
  }

  async leaveChannel(channelId: string): Promise<void> {
    const session = this.sessions.get(channelId);
    if (!session) {
      logger.warn(`No active session for channel ${channelId}`);
      return;
    }

    try {
      // Stop recording all users
      for (const [userId, userState] of session.activeUsers) {
        if (userState.audioStream) {
          userState.audioStream.destroy();
        }
        if (userState.transcriptionStream) {
          userState.transcriptionStream.destroy();
        }
      }

      // Destroy connection
      session.connection.destroy();
      
      // Clean up session
      this.sessions.delete(channelId);

      logger.info(`Left voice channel: ${channelId}`);
      this.emit('channelLeft', { sessionId: session.id, channelId });
    } catch (error) {
      logger.error('Error leaving voice channel:', error);
      throw error;
    }
  }

  private async startListening(session: VoiceSession, channel: VoiceChannel | StageChannel): Promise<void> {
    session.isRecording = true;

    // Get all members in the voice channel
    const members = channel.members;
    
    for (const [memberId, member] of members) {
      // Don't listen to bots or self
      if (member.user.bot || member.user.id === this.client.user?.id) {
        continue;
      }

      await this.startListeningToUser(session, member);
    }
  }

  private async startListeningToUser(session: VoiceSession, member: GuildMember): Promise<void> {
    try {
      const userId = member.user.id;
      
      // Check if already listening
      if (session.activeUsers.has(userId)) {
        return;
      }

      // Create audio stream for user
      const audioStream = session.connection.receiver.subscribe(userId, {
        end: {
          behavior: EndBehaviorType.AfterSilence,
          duration: 1000
        }
      });

      // Create transcription stream
      const transcriptionStream = new Transform({
        transform: async (chunk, encoding, callback) => {
          try {
            // Convert Opus to PCM
            const pcmData = await this.opusToPCM(chunk);
            
            // Send to speech-to-text service
            const transcription = await this.stt.transcribe(pcmData, {
              userId,
              language: 'en-US',
              model: 'whisper-1'
            });

            if (transcription && transcription.text) {
              // Add to transcription buffer
              const currentBuffer = session.transcriptionBuffer.get(userId) || '';
              session.transcriptionBuffer.set(userId, currentBuffer + ' ' + transcription.text);
              
              // Emit transcription event
              this.emit('transcription', {
                sessionId: session.id,
                userId,
                text: transcription.text,
                confidence: transcription.confidence
              });

              // Check for commands
              await this.processVoiceCommand(session, userId, transcription.text);
            }

            callback();
          } catch (error) {
            logger.error('Transcription error:', error);
            callback();
          }
        }
      });

      // Pipe audio to transcription
      audioStream.pipe(transcriptionStream);

      // Store user state
      const userState: VoiceUserState = {
        userId,
        username: member.user.username,
        isListening: true,
        audioStream,
        transcriptionStream,
        lastSpeech: new Date()
      };

      session.activeUsers.set(userId, userState);
      session.lastActivity = new Date();

      logger.info(`Started listening to user: ${member.user.username} (${userId})`);
    } catch (error) {
      logger.error(`Failed to start listening to user ${member.user.username}:`, error);
    }
  }

  private async processVoiceCommand(session: VoiceSession, userId: string, text: string): Promise<void> {
    // Check for wake word or command prefix
    const lowerText = text.toLowerCase();
    const wakeWords = ['hey claude', 'ok claude', 'claude'];
    
    const hasWakeWord = wakeWords.some(word => lowerText.includes(word));
    if (!hasWakeWord) {
      return;
    }

    // Extract command after wake word
    let command = text;
    for (const wakeWord of wakeWords) {
      const index = lowerText.indexOf(wakeWord);
      if (index !== -1) {
        command = text.substring(index + wakeWord.length).trim();
        break;
      }
    }

    if (!command) {
      return;
    }

    // Add to command queue
    const voiceCommand: VoiceCommand = {
      userId,
      command,
      timestamp: new Date(),
      processed: false
    };

    session.commandQueue.push(voiceCommand);

    // Process command
    try {
      const response = await this.commandProcessor.process(command, {
        userId,
        sessionId: session.id,
        channelId: session.channelId,
        guildId: session.guildId
      });

      voiceCommand.processed = true;

      // Convert response to speech
      if (response && response.text) {
        await this.speak(session, response.text, {
          voice: response.voice || 'alloy',
          speed: response.speed || 1.0
        });
      }

      this.emit('commandProcessed', {
        sessionId: session.id,
        userId,
        command,
        response
      });
    } catch (error) {
      logger.error('Failed to process voice command:', error);
      await this.speak(session, 'Sorry, I encountered an error processing your command.');
    }
  }

  async speak(session: VoiceSession, text: string, options?: any): Promise<void> {
    try {
      // Generate speech audio
      const audioBuffer = await this.tts.synthesize(text, options);
      
      // Create audio resource
      const resource = createAudioResource(Readable.from(audioBuffer), {
        inputType: prism.FFmpeg.AUDIO_FORMAT_OPUS
      });

      // Play audio
      session.audioPlayer.play(resource);

      // Wait for playback to finish
      await new Promise((resolve, reject) => {
        session.audioPlayer.once(AudioPlayerStatus.Idle, resolve);
        session.audioPlayer.once('error', reject);
      });

      logger.info(`Spoke text in voice channel: ${text.substring(0, 50)}...`);
    } catch (error) {
      logger.error('Failed to speak in voice channel:', error);
      throw error;
    }
  }

  private async opusToPCM(opusData: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const decoder = new prism.opus.Decoder({
        frameSize: 960,
        channels: 2,
        rate: 48000
      });

      const chunks: Buffer[] = [];
      
      decoder.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      decoder.on('end', () => {
        resolve(Buffer.concat(chunks));
      });

      decoder.on('error', reject);

      decoder.write(opusData);
      decoder.end();
    });
  }

  private setupConnectionHandlers(session: VoiceSession): void {
    session.connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        // Try to reconnect
        await Promise.race([
          entersState(session.connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(session.connection, VoiceConnectionStatus.Connecting, 5_000)
        ]);
        logger.info('Reconnecting to voice channel...');
      } catch (error) {
        // Connection destroyed or couldn't reconnect
        logger.error('Voice connection lost:', error);
        this.sessions.delete(session.channelId);
      }
    });

    session.connection.on('error', (error) => {
      logger.error('Voice connection error:', error);
    });

    session.audioPlayer.on('error', (error) => {
      logger.error('Audio player error:', error);
    });
  }

  private handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): void {
    const session = this.sessions.get(oldState.channelId || newState.channelId || '');
    if (!session) return;

    // User joined the channel
    if (!oldState.channel && newState.channel && newState.member) {
      if (!newState.member.user.bot) {
        this.startListeningToUser(session, newState.member);
      }
    }

    // User left the channel
    if (oldState.channel && !newState.channel) {
      const userState = session.activeUsers.get(oldState.member?.user.id || '');
      if (userState) {
        if (userState.audioStream) userState.audioStream.destroy();
        if (userState.transcriptionStream) userState.transcriptionStream.destroy();
        session.activeUsers.delete(oldState.member?.user.id || '');
      }
    }
  }

  getSession(channelId: string): VoiceSession | undefined {
    return this.sessions.get(channelId);
  }

  getAllSessions(): VoiceSession[] {
    return Array.from(this.sessions.values());
  }

  async muteUser(sessionId: string, userId: string): Promise<void> {
    const session = Array.from(this.sessions.values()).find(s => s.id === sessionId);
    if (!session) throw new Error('Session not found');

    const userState = session.activeUsers.get(userId);
    if (userState) {
      userState.isListening = false;
      if (userState.audioStream) {
        userState.audioStream.pause();
      }
    }
  }

  async unmuteUser(sessionId: string, userId: string): Promise<void> {
    const session = Array.from(this.sessions.values()).find(s => s.id === sessionId);
    if (!session) throw new Error('Session not found');

    const userState = session.activeUsers.get(userId);
    if (userState) {
      userState.isListening = true;
      if (userState.audioStream) {
        userState.audioStream.resume();
      }
    }
  }

  getTranscriptionHistory(sessionId: string, userId?: string): string {
    const session = Array.from(this.sessions.values()).find(s => s.id === sessionId);
    if (!session) return '';

    if (userId) {
      return session.transcriptionBuffer.get(userId) || '';
    }

    // Return all transcriptions
    const allTranscriptions: string[] = [];
    for (const [uid, text] of session.transcriptionBuffer) {
      const user = session.activeUsers.get(uid);
      allTranscriptions.push(`${user?.username || 'Unknown'}: ${text}`);
    }
    return allTranscriptions.join('\n');
  }

  clearTranscriptionBuffer(sessionId: string, userId?: string): void {
    const session = Array.from(this.sessions.values()).find(s => s.id === sessionId);
    if (!session) return;

    if (userId) {
      session.transcriptionBuffer.delete(userId);
    } else {
      session.transcriptionBuffer.clear();
    }
  }
}