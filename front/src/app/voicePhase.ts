export type VoicePhase =
  | 'idle'
  | 'requesting_microphone'
  | 'connecting_signaling'
  | 'joining_room'
  | 'negotiating'
  | 'connected'
  | 'error';
