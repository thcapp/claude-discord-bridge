import { EventEmitter } from 'events';
import axios from 'axios';
import { logger } from '../utils/logger';
import { config } from '../config';

interface TTSOptions {
  voice?: string;
  speed?: number;
  pitch?: number;
  volume?: number;
  format?: 'mp3' | 'opus' | 'aac' | 'flac';
  model?: string;
}

interface TTSProvider {
  name: string;
  synthesize(text: string, options?: TTSOptions): Promise<Buffer>;
  getVoices(): Promise<Voice[]>;
}

interface Voice {
  id: string;
  name: string;
  language: string;
  gender?: string;
  preview?: string;
}

class OpenAITTSProvider implements TTSProvider {
  name = 'openai-tts';
  private apiKey: string;
  private apiUrl = 'https://api.openai.com/v1/audio/speech';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async synthesize(text: string, options?: TTSOptions): Promise<Buffer> {
    try {
      const response = await axios.post(
        this.apiUrl,
        {
          model: options?.model || 'tts-1',
          input: text,
          voice: options?.voice || 'alloy',
          response_format: options?.format || 'opus',
          speed: options?.speed || 1.0
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          responseType: 'arraybuffer'
        }
      );

      return Buffer.from(response.data);
    } catch (error) {
      logger.error('OpenAI TTS error:', error);
      throw error;
    }
  }

  async getVoices(): Promise<Voice[]> {
    return [
      { id: 'alloy', name: 'Alloy', language: 'en-US', gender: 'neutral' },
      { id: 'echo', name: 'Echo', language: 'en-US', gender: 'male' },
      { id: 'fable', name: 'Fable', language: 'en-GB', gender: 'neutral' },
      { id: 'onyx', name: 'Onyx', language: 'en-US', gender: 'male' },
      { id: 'nova', name: 'Nova', language: 'en-US', gender: 'female' },
      { id: 'shimmer', name: 'Shimmer', language: 'en-US', gender: 'female' }
    ];
  }
}

class ElevenLabsTTSProvider implements TTSProvider {
  name = 'elevenlabs';
  private apiKey: string;
  private apiUrl = 'https://api.elevenlabs.io/v1';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async synthesize(text: string, options?: TTSOptions): Promise<Buffer> {
    try {
      const voiceId = options?.voice || '21m00Tcm4TlvDq8ikWAM'; // Default voice
      
      const response = await axios.post(
        `${this.apiUrl}/text-to-speech/${voiceId}`,
        {
          text,
          model_id: options?.model || 'eleven_monolingual_v1',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.5,
            style: 0.5,
            use_speaker_boost: true
          }
        },
        {
          headers: {
            'xi-api-key': this.apiKey,
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg'
          },
          responseType: 'arraybuffer'
        }
      );

      return Buffer.from(response.data);
    } catch (error) {
      logger.error('ElevenLabs TTS error:', error);
      throw error;
    }
  }

  async getVoices(): Promise<Voice[]> {
    try {
      const response = await axios.get(`${this.apiUrl}/voices`, {
        headers: {
          'xi-api-key': this.apiKey
        }
      });

      return response.data.voices.map((voice: any) => ({
        id: voice.voice_id,
        name: voice.name,
        language: voice.labels?.language || 'en',
        gender: voice.labels?.gender,
        preview: voice.preview_url
      }));
    } catch (error) {
      logger.error('Failed to fetch ElevenLabs voices:', error);
      return [];
    }
  }
}

class GoogleTTSProvider implements TTSProvider {
  name = 'google-tts';
  private apiKey: string;
  private apiUrl = 'https://texttospeech.googleapis.com/v1/text:synthesize';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async synthesize(text: string, options?: TTSOptions): Promise<Buffer> {
    try {
      const response = await axios.post(
        `${this.apiUrl}?key=${this.apiKey}`,
        {
          input: { text },
          voice: {
            languageCode: 'en-US',
            name: options?.voice || 'en-US-Neural2-J',
            ssmlGender: 'MALE'
          },
          audioConfig: {
            audioEncoding: this.getAudioFormat(options?.format),
            speakingRate: options?.speed || 1.0,
            pitch: options?.pitch || 0,
            volumeGainDb: options?.volume || 0
          }
        },
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      return Buffer.from(response.data.audioContent, 'base64');
    } catch (error) {
      logger.error('Google TTS error:', error);
      throw error;
    }
  }

  private getAudioFormat(format?: string): string {
    switch (format) {
      case 'mp3': return 'MP3';
      case 'opus': return 'OGG_OPUS';
      case 'aac': return 'AAC';
      default: return 'OGG_OPUS';
    }
  }

  async getVoices(): Promise<Voice[]> {
    try {
      const response = await axios.get(
        `https://texttospeech.googleapis.com/v1/voices?key=${this.apiKey}`
      );

      return response.data.voices.map((voice: any) => ({
        id: voice.name,
        name: voice.name,
        language: voice.languageCodes[0],
        gender: voice.ssmlGender?.toLowerCase()
      }));
    } catch (error) {
      logger.error('Failed to fetch Google voices:', error);
      return [];
    }
  }
}

class AzureTTSProvider implements TTSProvider {
  name = 'azure-tts';
  private subscriptionKey: string;
  private region: string;
  private endpoint: string;

  constructor(subscriptionKey: string, region: string) {
    this.subscriptionKey = subscriptionKey;
    this.region = region;
    this.endpoint = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
  }

  async synthesize(text: string, options?: TTSOptions): Promise<Buffer> {
    try {
      const ssml = this.buildSSML(text, options);
      
      const response = await axios.post(
        this.endpoint,
        ssml,
        {
          headers: {
            'Ocp-Apim-Subscription-Key': this.subscriptionKey,
            'Content-Type': 'application/ssml+xml',
            'X-Microsoft-OutputFormat': this.getOutputFormat(options?.format)
          },
          responseType: 'arraybuffer'
        }
      );

      return Buffer.from(response.data);
    } catch (error) {
      logger.error('Azure TTS error:', error);
      throw error;
    }
  }

  private buildSSML(text: string, options?: TTSOptions): string {
    const voice = options?.voice || 'en-US-JennyNeural';
    const rate = options?.speed ? `${(options.speed - 1) * 100}%` : '0%';
    const pitch = options?.pitch ? `${options.pitch}Hz` : '0Hz';
    const volume = options?.volume ? `${options.volume}%` : '100%';

    return `
      <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
        <voice name="${voice}">
          <prosody rate="${rate}" pitch="${pitch}" volume="${volume}">
            ${text}
          </prosody>
        </voice>
      </speak>
    `;
  }

  private getOutputFormat(format?: string): string {
    switch (format) {
      case 'mp3': return 'audio-16khz-128kbitrate-mono-mp3';
      case 'opus': return 'ogg-48khz-16bit-mono-opus';
      case 'aac': return 'audio-16khz-128kbitrate-mono-aac';
      default: return 'ogg-48khz-16bit-mono-opus';
    }
  }

  async getVoices(): Promise<Voice[]> {
    try {
      const response = await axios.get(
        `https://${this.region}.tts.speech.microsoft.com/cognitiveservices/voices/list`,
        {
          headers: {
            'Ocp-Apim-Subscription-Key': this.subscriptionKey
          }
        }
      );

      return response.data.map((voice: any) => ({
        id: voice.ShortName,
        name: voice.DisplayName,
        language: voice.Locale,
        gender: voice.Gender?.toLowerCase()
      }));
    } catch (error) {
      logger.error('Failed to fetch Azure voices:', error);
      return [];
    }
  }
}

export class TextToSpeechService extends EventEmitter {
  private static instance: TextToSpeechService;
  private providers: Map<string, TTSProvider> = new Map();
  private activeProvider: string = 'openai-tts';
  private synthesisCache: Map<string, Buffer> = new Map();
  private voiceCache: Map<string, Voice[]> = new Map();
  private cacheTimeout = 300000; // 5 minutes

  private constructor() {
    super();
    this.initializeProviders();
  }

  static getInstance(): TextToSpeechService {
    if (!TextToSpeechService.instance) {
      TextToSpeechService.instance = new TextToSpeechService();
    }
    return TextToSpeechService.instance;
  }

  private initializeProviders(): void {
    // Initialize OpenAI TTS
    if (config.OPENAI_API_KEY) {
      this.providers.set('openai-tts', new OpenAITTSProvider(config.OPENAI_API_KEY));
    }

    // Initialize ElevenLabs
    if (config.ELEVENLABS_API_KEY) {
      this.providers.set('elevenlabs', new ElevenLabsTTSProvider(config.ELEVENLABS_API_KEY));
    }

    // Initialize Google TTS
    if (config.GOOGLE_TTS_API_KEY) {
      this.providers.set('google-tts', new GoogleTTSProvider(config.GOOGLE_TTS_API_KEY));
    }

    // Initialize Azure TTS
    if (config.AZURE_SPEECH_KEY && config.AZURE_SPEECH_REGION) {
      this.providers.set('azure-tts', new AzureTTSProvider(
        config.AZURE_SPEECH_KEY,
        config.AZURE_SPEECH_REGION
      ));
    }

    logger.info(`Initialized ${this.providers.size} TTS providers`);
  }

  async synthesize(text: string, options?: TTSOptions): Promise<Buffer> {
    // Check cache
    const cacheKey = this.getCacheKey(text, options);
    const cached = this.synthesisCache.get(cacheKey);
    if (cached) {
      logger.debug('Using cached synthesis');
      return cached;
    }

    // Get provider
    const provider = this.providers.get(this.activeProvider);
    if (!provider) {
      throw new Error(`TTS provider ${this.activeProvider} not available`);
    }

    // Synthesize
    const startTime = Date.now();
    const audioBuffer = await provider.synthesize(text, options);
    const duration = Date.now() - startTime;

    // Cache result
    this.synthesisCache.set(cacheKey, audioBuffer);
    setTimeout(() => {
      this.synthesisCache.delete(cacheKey);
    }, this.cacheTimeout);

    // Emit metrics
    this.emit('synthesis', {
      provider: this.activeProvider,
      textLength: text.length,
      audioSize: audioBuffer.length,
      duration,
      voice: options?.voice
    });

    logger.info(`Synthesized ${text.length} chars in ${duration}ms`);

    return audioBuffer;
  }

  async getVoices(providerName?: string): Promise<Voice[]> {
    const targetProvider = providerName || this.activeProvider;
    
    // Check cache
    const cached = this.voiceCache.get(targetProvider);
    if (cached) {
      return cached;
    }

    // Get provider
    const provider = this.providers.get(targetProvider);
    if (!provider) {
      throw new Error(`TTS provider ${targetProvider} not available`);
    }

    // Fetch voices
    const voices = await provider.getVoices();
    
    // Cache result
    this.voiceCache.set(targetProvider, voices);
    setTimeout(() => {
      this.voiceCache.delete(targetProvider);
    }, 3600000); // 1 hour

    return voices;
  }

  setProvider(providerName: string): void {
    if (!this.providers.has(providerName)) {
      throw new Error(`Provider ${providerName} not available`);
    }
    this.activeProvider = providerName;
    logger.info(`Switched to TTS provider: ${providerName}`);
  }

  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  private getCacheKey(text: string, options?: TTSOptions): string {
    const textHash = require('crypto')
      .createHash('md5')
      .update(text)
      .digest('hex');
    const optionsStr = JSON.stringify(options || {});
    return `${this.activeProvider}_${textHash}_${optionsStr}`;
  }

  async synthesizeBatch(texts: string[], options?: TTSOptions): Promise<Buffer[]> {
    const results = await Promise.all(
      texts.map(text => this.synthesize(text, options))
    );
    return results;
  }

  clearCache(): void {
    this.synthesisCache.clear();
    this.voiceCache.clear();
    logger.info('Cleared TTS cache');
  }

  getStats(): any {
    return {
      activeProvider: this.activeProvider,
      availableProviders: this.getAvailableProviders(),
      cacheSize: this.synthesisCache.size,
      voiceCacheSize: this.voiceCache.size
    };
  }
}