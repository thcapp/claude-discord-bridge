import { EventEmitter } from 'events';
import axios from 'axios';
import FormData from 'form-data';
import { Readable } from 'stream';
import { logger } from '../utils/logger';
import { config } from '../config';

interface TranscriptionOptions {
  userId: string;
  language?: string;
  model?: string;
  prompt?: string;
  temperature?: number;
}

interface TranscriptionResult {
  text: string;
  confidence?: number;
  language?: string;
  duration?: number;
  words?: Word[];
}

interface Word {
  text: string;
  start: number;
  end: number;
  confidence: number;
}

interface STTProvider {
  name: string;
  transcribe(audio: Buffer, options: TranscriptionOptions): Promise<TranscriptionResult>;
}

class OpenAIWhisperProvider implements STTProvider {
  name = 'openai-whisper';
  private apiKey: string;
  private apiUrl = 'https://api.openai.com/v1/audio/transcriptions';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async transcribe(audio: Buffer, options: TranscriptionOptions): Promise<TranscriptionResult> {
    try {
      const formData = new FormData();
      
      // Convert buffer to stream
      const audioStream = Readable.from(audio);
      formData.append('file', audioStream, {
        filename: 'audio.wav',
        contentType: 'audio/wav'
      });
      
      formData.append('model', options.model || 'whisper-1');
      if (options.language) formData.append('language', options.language);
      if (options.prompt) formData.append('prompt', options.prompt);
      if (options.temperature) formData.append('temperature', options.temperature.toString());
      formData.append('response_format', 'verbose_json');

      const response = await axios.post(this.apiUrl, formData, {
        headers: {
          ...formData.getHeaders(),
          'Authorization': `Bearer ${this.apiKey}`
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity
      });

      const data = response.data;
      
      return {
        text: data.text,
        language: data.language,
        duration: data.duration,
        words: data.words?.map((w: any) => ({
          text: w.word,
          start: w.start,
          end: w.end,
          confidence: w.probability || 1.0
        }))
      };
    } catch (error) {
      logger.error('OpenAI Whisper transcription error:', error);
      throw error;
    }
  }
}

class GoogleSpeechProvider implements STTProvider {
  name = 'google-speech';
  private apiKey: string;
  private apiUrl = 'https://speech.googleapis.com/v1/speech:recognize';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async transcribe(audio: Buffer, options: TranscriptionOptions): Promise<TranscriptionResult> {
    try {
      const request = {
        config: {
          encoding: 'LINEAR16',
          sampleRateHertz: 48000,
          languageCode: options.language || 'en-US',
          enableWordTimeOffsets: true,
          enableWordConfidence: true,
          model: options.model || 'latest_long',
          useEnhanced: true
        },
        audio: {
          content: audio.toString('base64')
        }
      };

      const response = await axios.post(
        `${this.apiUrl}?key=${this.apiKey}`,
        request,
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      const result = response.data.results?.[0];
      if (!result) {
        return { text: '', confidence: 0 };
      }

      const alternative = result.alternatives[0];
      
      return {
        text: alternative.transcript,
        confidence: alternative.confidence,
        words: alternative.words?.map((w: any) => ({
          text: w.word,
          start: parseFloat(w.startTime.replace('s', '')),
          end: parseFloat(w.endTime.replace('s', '')),
          confidence: w.confidence || alternative.confidence
        }))
      };
    } catch (error) {
      logger.error('Google Speech transcription error:', error);
      throw error;
    }
  }
}

class AzureSpeechProvider implements STTProvider {
  name = 'azure-speech';
  private subscriptionKey: string;
  private region: string;
  private endpoint: string;

  constructor(subscriptionKey: string, region: string) {
    this.subscriptionKey = subscriptionKey;
    this.region = region;
    this.endpoint = `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1`;
  }

  async transcribe(audio: Buffer, options: TranscriptionOptions): Promise<TranscriptionResult> {
    try {
      const params = new URLSearchParams({
        language: options.language || 'en-US',
        format: 'detailed',
        profanity: 'masked'
      });

      const response = await axios.post(
        `${this.endpoint}?${params}`,
        audio,
        {
          headers: {
            'Ocp-Apim-Subscription-Key': this.subscriptionKey,
            'Content-Type': 'audio/wav',
            'Accept': 'application/json'
          }
        }
      );

      const data = response.data;
      
      if (data.RecognitionStatus !== 'Success') {
        throw new Error(`Recognition failed: ${data.RecognitionStatus}`);
      }

      return {
        text: data.DisplayText,
        confidence: data.NBest?.[0]?.Confidence,
        duration: data.Duration / 10000000, // Convert from ticks to seconds
        words: data.NBest?.[0]?.Words?.map((w: any) => ({
          text: w.Word,
          start: w.Offset / 10000000,
          end: (w.Offset + w.Duration) / 10000000,
          confidence: w.Confidence || data.NBest[0].Confidence
        }))
      };
    } catch (error) {
      logger.error('Azure Speech transcription error:', error);
      throw error;
    }
  }
}

export class SpeechToTextService extends EventEmitter {
  private static instance: SpeechToTextService;
  private providers: Map<string, STTProvider> = new Map();
  private activeProvider: string = 'openai-whisper';
  private transcriptionCache: Map<string, TranscriptionResult> = new Map();
  private cacheTimeout = 60000; // 1 minute

  private constructor() {
    super();
    this.initializeProviders();
  }

  static getInstance(): SpeechToTextService {
    if (!SpeechToTextService.instance) {
      SpeechToTextService.instance = new SpeechToTextService();
    }
    return SpeechToTextService.instance;
  }

  private initializeProviders(): void {
    // Initialize OpenAI Whisper
    if (config.OPENAI_API_KEY) {
      this.providers.set('openai-whisper', new OpenAIWhisperProvider(config.OPENAI_API_KEY));
    }

    // Initialize Google Speech
    if (config.GOOGLE_SPEECH_API_KEY) {
      this.providers.set('google-speech', new GoogleSpeechProvider(config.GOOGLE_SPEECH_API_KEY));
    }

    // Initialize Azure Speech
    if (config.AZURE_SPEECH_KEY && config.AZURE_SPEECH_REGION) {
      this.providers.set('azure-speech', new AzureSpeechProvider(
        config.AZURE_SPEECH_KEY,
        config.AZURE_SPEECH_REGION
      ));
    }

    logger.info(`Initialized ${this.providers.size} STT providers`);
  }

  async transcribe(audio: Buffer, options: TranscriptionOptions): Promise<TranscriptionResult> {
    // Check cache
    const cacheKey = this.getCacheKey(audio, options);
    const cached = this.transcriptionCache.get(cacheKey);
    if (cached) {
      logger.debug('Using cached transcription');
      return cached;
    }

    // Get provider
    const provider = this.providers.get(this.activeProvider);
    if (!provider) {
      throw new Error(`STT provider ${this.activeProvider} not available`);
    }

    // Transcribe
    const startTime = Date.now();
    const result = await provider.transcribe(audio, options);
    const duration = Date.now() - startTime;

    // Cache result
    this.transcriptionCache.set(cacheKey, result);
    setTimeout(() => {
      this.transcriptionCache.delete(cacheKey);
    }, this.cacheTimeout);

    // Emit metrics
    this.emit('transcription', {
      provider: this.activeProvider,
      userId: options.userId,
      duration,
      textLength: result.text.length,
      confidence: result.confidence
    });

    logger.info(`Transcribed audio in ${duration}ms: ${result.text.substring(0, 50)}...`);

    return result;
  }

  setProvider(providerName: string): void {
    if (!this.providers.has(providerName)) {
      throw new Error(`Provider ${providerName} not available`);
    }
    this.activeProvider = providerName;
    logger.info(`Switched to STT provider: ${providerName}`);
  }

  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  private getCacheKey(audio: Buffer, options: TranscriptionOptions): string {
    const audioHash = require('crypto')
      .createHash('md5')
      .update(audio)
      .digest('hex');
    return `${audioHash}_${options.language}_${options.model}`;
  }

  async transcribeStream(audioStream: Readable, options: TranscriptionOptions): Promise<TranscriptionResult> {
    // Collect audio chunks
    const chunks: Buffer[] = [];
    
    return new Promise((resolve, reject) => {
      audioStream.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      audioStream.on('end', async () => {
        try {
          const audioBuffer = Buffer.concat(chunks);
          const result = await this.transcribe(audioBuffer, options);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      audioStream.on('error', reject);
    });
  }

  clearCache(): void {
    this.transcriptionCache.clear();
    logger.info('Cleared transcription cache');
  }
}