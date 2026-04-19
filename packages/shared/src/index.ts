export interface SampleFile {
  id: string;
  name: string;
  mimeType: string;
  durationSeconds: number;
  sampleRate: number;
  channelCount: number;
}

export interface Slice {
  id: string;
  startTime: number;
  endTime: number;
  padId?: string;
  rootNote: number;
  pitchSemitones?: number;
  color?: string;
  label?: string;
}

export interface Pad {
  id: string;
  index: number;
  sliceId?: string;
  keyBinding: string;
  rootNote: number;
}

export interface NoteEvent {
  id: string;
  padId: string;
  startBeat: number;
  durationBeats: number;
  pitchOffset: number;
  velocity: number;
}

export interface TransportState {
  bpm: number;
  isPlaying: boolean;
  currentBeat: number;
  loopStartBeat: number;
  loopEndBeat: number;
  metronomeEnabled: boolean;
}

export interface PianoRollState {
  totalBars: number;
  beatsPerBar: number;
  snapDivisionsPerBeat: number;
  notes: NoteEvent[];
}

export interface Project {
  id: string;
  name: string;
  sampleFile?: SampleFile;
  slices: Slice[];
  pads: Pad[];
  pianoRoll: PianoRollState;
  transport: TransportState;
  createdAt: string;
  updatedAt: string;
}
