import { Socket } from 'socket.io-client';
import { convertFloat32ToInt16 } from './audioUtils';
import { AudioConfig } from '../types/audio';

export class AudioRecorder {
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;

  private readonly config: AudioConfig = {
    channelCount: 1,
    sampleRate: 44100,
    echoCancellation: true,
    noiseSuppression: true
  };

  constructor(private socket: Socket) {}

 async start(): Promise<void> {
  try {
    // Get media stream
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: this.config.channelCount,
        sampleRate: this.config.sampleRate,
        echoCancellation: this.config.echoCancellation,
        noiseSuppression: this.config.noiseSuppression
      }
    });

    // Initialize Web Audio API
    this.audioContext = new AudioContext({
      sampleRate: this.config.sampleRate
    });

    // Create source node
    this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

    // Create processor node for raw audio data
    this.processorNode = this.audioContext.createScriptProcessor(4096, 1, 1);

    let audioBuffer: Int16Array[] = [];  // Buffer to accumulate audio data
    let chunkDuration = 5 * 1000; // 5 seconds in milliseconds
    let lastEmitTime = Date.now(); // Track when to emit

    // Process audio data
    this.processorNode.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      const audioData = convertFloat32ToInt16(inputData);

      // Add the processed audio data to the buffer
      audioBuffer.push(audioData);

      // Check if it's time to emit the chunk (every 5 seconds)
      if (Date.now() - lastEmitTime >= chunkDuration) {
        // Emit the accumulated chunk of audio data
        this.socket.emit('audio_data', {
          buffer: concatenateBuffers(audioBuffer), // Concatenate the buffered chunks
          timestamp: Date.now(),
          mode: 'both'
        });

        // Reset the buffer and update the last emit time
        audioBuffer = [];
        lastEmitTime = Date.now();
      }
    };

    // Connect nodes
    this.sourceNode.connect(this.processorNode);
    this.processorNode.connect(this.audioContext.destination);

  } catch (error) {
    console.error('Audio recording error:', error);
    throw new Error('Failed to initialize audio recording');
  }
}

  stop(): void {
    // Disconnect and cleanup audio nodes
    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}