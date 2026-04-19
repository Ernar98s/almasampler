import { getAudioContext } from './decode-audio-file';
import { encodeWavFromAudioBuffer } from './encode-wav';
import type { OfflineRenderClip } from './render-arrangement';

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export async function renderMonophonicPerformanceToWav(options: {
  sourceBuffer: AudioBuffer;
  clips: OfflineRenderClip[];
  totalDurationSeconds: number;
}) {
  const audioContext = await getAudioContext();
  const sampleRate = options.sourceBuffer.sampleRate;
  const channelCount = Math.max(2, options.sourceBuffer.numberOfChannels);
  const frameCount = Math.max(1, Math.ceil(options.totalDurationSeconds * sampleRate));
  const outputBuffer = audioContext.createBuffer(channelCount, frameCount, sampleRate);
  const fadeOutFrames = 64;

  for (const clip of options.clips) {
    const outputStartFrame = Math.max(0, Math.floor(clip.startSeconds * sampleRate));
    const outputFrameLength = Math.floor(clip.outputDurationSeconds * sampleRate);

    if (outputFrameLength <= 0) {
      continue;
    }
    const sourceStartFrame = Math.max(0, clip.sliceStartSeconds * sampleRate);
    const sourceEndFrame = Math.min(
      options.sourceBuffer.length,
      Math.ceil(clip.sliceEndSeconds * sampleRate)
    );
    const usableFrameLength = Math.min(
      outputFrameLength,
      Math.floor((sourceEndFrame - sourceStartFrame) / Math.max(0.0001, clip.playbackRate))
    );

    for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
      const sourceChannel =
        options.sourceBuffer.getChannelData(
          Math.min(channelIndex, options.sourceBuffer.numberOfChannels - 1)
        );
      const outputChannel = outputBuffer.getChannelData(channelIndex);

      for (let frameIndex = 0; frameIndex < usableFrameLength; frameIndex += 1) {
        const outputFrameIndex = outputStartFrame + frameIndex;

        if (outputFrameIndex >= outputChannel.length) {
          break;
        }

        const sourceFramePosition = sourceStartFrame + frameIndex * clip.playbackRate;
        const sourceFrameFloor = Math.floor(sourceFramePosition);
        const sourceFrameCeil = Math.min(sourceEndFrame - 1, sourceFrameFloor + 1);
        const sourceFrameT = sourceFramePosition - sourceFrameFloor;
        const drySample = lerp(
          sourceChannel[sourceFrameFloor] ?? 0,
          sourceChannel[sourceFrameCeil] ?? 0,
          sourceFrameT
        );

        let sample = drySample * 0.95;
        const framesFromEnd = usableFrameLength - frameIndex;

        if (framesFromEnd <= fadeOutFrames) {
          sample *= Math.max(0, framesFromEnd / fadeOutFrames);
        }

        outputChannel[outputFrameIndex] = sample;
      }
    }
  }

  return encodeWavFromAudioBuffer(outputBuffer);
}
