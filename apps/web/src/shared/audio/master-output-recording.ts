import { getAudioContext, getRecordingDestinationNode } from './decode-audio-file';
import { encodeWavFromAudioBuffer } from './encode-wav';

let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];
let stoppedBlobPromise: Promise<Blob> | null = null;

function getSupportedMimeType() {
  const mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  return mimeTypes.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? '';
}

export async function startMasterOutputRecording() {
  const audioContext = await getAudioContext();
  const recordingDestination = await getRecordingDestinationNode();
  const mimeType = getSupportedMimeType();

  if (!mimeType) {
    throw new Error('This browser does not support master output recording.');
  }

  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }

  if (mediaRecorder?.state === 'recording') {
    return;
  }

  recordedChunks = [];
  mediaRecorder = new MediaRecorder(recordingDestination.stream, { mimeType });
  stoppedBlobPromise = new Promise<Blob>((resolve) => {
    mediaRecorder!.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    mediaRecorder!.onstop = () => {
      resolve(new Blob(recordedChunks, { type: mimeType }));
    };
  });

  mediaRecorder.start();
}

export async function stopMasterOutputRecording() {
  if (!mediaRecorder || mediaRecorder.state !== 'recording' || !stoppedBlobPromise) {
    throw new Error('Recording is not active.');
  }

  mediaRecorder.stop();
  const recordedBlob = await stoppedBlobPromise;
  mediaRecorder = null;
  stoppedBlobPromise = null;

  const audioContext = await getAudioContext();
  const arrayBuffer = await recordedBlob.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
  return encodeWavFromAudioBuffer(audioBuffer);
}
