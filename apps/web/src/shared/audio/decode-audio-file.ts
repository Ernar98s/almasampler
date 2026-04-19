import type { SampleFile } from '@almasampler/shared';

export interface DecodedAudioFile {
  metadata: SampleFile;
  audioBuffer: AudioBuffer;
}

let audioContextPromise: Promise<AudioContext> | null = null;
let masterGainNodePromise: Promise<GainNode> | null = null;
let recordingDestinationPromise: Promise<MediaStreamAudioDestinationNode> | null = null;

export async function getAudioContext() {
  if (!audioContextPromise) {
    audioContextPromise = Promise.resolve(
      new AudioContext({
        latencyHint: 'interactive'
      })
    );
  }

  return audioContextPromise;
}

export async function getMasterGainNode() {
  if (!masterGainNodePromise) {
    masterGainNodePromise = getAudioContext().then((audioContext) => {
      const masterGainNode = audioContext.createGain();
      masterGainNode.gain.value = 1;
      masterGainNode.connect(audioContext.destination);
      return masterGainNode;
    });
  }

  return masterGainNodePromise;
}

export async function getRecordingDestinationNode() {
  if (!recordingDestinationPromise) {
    recordingDestinationPromise = getAudioContext().then(async (audioContext) => {
      const masterGainNode = await getMasterGainNode();
      const recordingDestination = audioContext.createMediaStreamDestination();
      masterGainNode.connect(recordingDestination);
      return recordingDestination;
    });
  }

  return recordingDestinationPromise;
}

export async function decodeAudioFile(file: File): Promise<DecodedAudioFile> {
  const audioContext = await getAudioContext();
  const arrayBuffer = await file.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));

  return {
    metadata: {
      id: crypto.randomUUID(),
      name: file.name,
      mimeType: file.type || 'audio/unknown',
      durationSeconds: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
      channelCount: audioBuffer.numberOfChannels
    },
    audioBuffer
  };
}
