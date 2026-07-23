export type SoundName =
  | "ui_click"
  | "ui_panel"
  | "launch"
  | "brick_hit"
  | "steel_hit"
  | "item_collect"
  | "stage_clear"
  | "game_over"
  | "bomb"
  | "laser"
  | "blackhole_capture"
  | "trap"
  | "shield_rewind";

const files: Record<SoundName, string> = {
  ui_click: "audio/common/ui_click.mp3",
  ui_panel: "audio/common/ui_panel.mp3",
  launch: "audio/common/launch.mp3",
  brick_hit: "audio/common/brick_hit.mp3",
  steel_hit: "audio/common/steel_hit.mp3",
  item_collect: "audio/common/item_collect.mp3",
  stage_clear: "audio/common/stage_clear.mp3",
  game_over: "audio/common/game_over.mp3",
  bomb: "audio/special/bomb.mp3",
  laser: "audio/special/laser.mp3",
  blackhole_capture: "audio/special/blackhole_capture.mp3",
  trap: "audio/special/trap.mp3",
  shield_rewind: "audio/special/shield_rewind.mp3",
};

const settings: Record<SoundName, { volume: number; cooldown: number; group: string; maxVoices: number }> = {
  ui_click: { volume: 0.28, cooldown: 0.04, group: "ui", maxVoices: 2 },
  ui_panel: { volume: 0.28, cooldown: 0.08, group: "ui", maxVoices: 2 },
  launch: { volume: 0.28, cooldown: 0.2, group: "launch", maxVoices: 1 },
  brick_hit: { volume: 0.28, cooldown: 0.05, group: "impact", maxVoices: 4 },
  steel_hit: { volume: 0.28, cooldown: 0.08, group: "impact", maxVoices: 4 },
  item_collect: { volume: 0.28, cooldown: 0.08, group: "item", maxVoices: 2 },
  stage_clear: { volume: 0.28, cooldown: 0.5, group: "result", maxVoices: 1 },
  game_over: { volume: 0.28, cooldown: 0.5, group: "result", maxVoices: 1 },
  bomb: { volume: 0.28, cooldown: 0.2, group: "special", maxVoices: 2 },
  laser: { volume: 0.28, cooldown: 0.2, group: "special", maxVoices: 2 },
  blackhole_capture: { volume: 0.28, cooldown: 0.25, group: "special", maxVoices: 2 },
  trap: { volume: 0.28, cooldown: 0.15, group: "item", maxVoices: 2 },
  shield_rewind: { volume: 0.28, cooldown: 0.5, group: "special", maxVoices: 1 },
};

const BGM_KEY = "bgm";
const BGM_FILE = "audio/music/gameplay_loop.mp3";
const DEFAULT_BGM_VOLUME = 0.5;
const BGM_FADE_IN_SECONDS = 1.25;
const BGM_STOP_FADE_SECONDS = 0.35;
const BGM_VOLUME_CHANGE_SECONDS = 0.2;
const buffers = new Map<string, AudioBuffer>();
const lastPlayedAt = new Map<SoundName, number>();
const activeVoices = new Map<string, number>();
let context: AudioContext | null = null;
let masterGain: GainNode | null = null;
let bgmGain: GainNode | null = null;
let bgmSource: AudioBufferSourceNode | null = null;
let bgmStopTimer: number | null = null;
let loadPromise: Promise<void> | null = null;
let allMuted = readMuted("swipe-breakout-all-muted") || readMuted("swipe-breakout-muted");
let bgmMuted = readMuted("swipe-breakout-bgm-muted");
let sfxMuted = readMuted("swipe-breakout-sfx-muted");
let bgmVolume = DEFAULT_BGM_VOLUME;

function readMuted(key: string): boolean {
  try {
    return localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

function writeMuted(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // 저장소를 사용할 수 없어도 현재 게임은 계속 진행합니다.
  }
}

function isBgmSilenced(): boolean {
  return allMuted || bgmMuted;
}

function isSfxSilenced(): boolean {
  return allMuted || sfxMuted;
}

function ensureContext(): AudioContext {
  if (context) return context;
  context = new AudioContext();
  masterGain = context.createGain();
  masterGain.gain.value = isSfxSilenced() ? 0 : 1;
  masterGain.connect(context.destination);
  bgmGain = context.createGain();
  bgmGain.gain.value = 0;
  bgmGain.connect(context.destination);
  return context;
}

export function canPlaySound(lastPlayed: number | undefined, now: number, cooldown: number): boolean {
  return lastPlayed === undefined || now - lastPlayed >= cooldown;
}

export function preloadAudio(): Promise<void> {
  if (loadPromise) return loadPromise;
  if (typeof AudioContext === "undefined") return Promise.resolve();
  const audioContext = ensureContext();
  const sounds: Array<[string, string]> = [...Object.entries(files), [BGM_KEY, BGM_FILE]];
  loadPromise = Promise.all(sounds.map(async ([name, path]) => {
    try {
      const response = await fetch(path);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      buffers.set(name, await audioContext.decodeAudioData(await response.arrayBuffer()));
    } catch (error) {
      console.warn(`${name} 오디오를 불러오지 못했습니다.`, error);
    }
  })).then(() => undefined);
  return loadPromise;
}

function fadeBgm(target: number, duration: number): void {
  if (!context || !bgmGain) return;
  const now = context.currentTime;
  bgmGain.gain.cancelScheduledValues(now);
  bgmGain.gain.setValueAtTime(bgmGain.gain.value, now);
  if (duration > 0) bgmGain.gain.linearRampToValueAtTime(target, now + duration);
  else bgmGain.gain.setValueAtTime(target, now);
}

function stopBgm(): void {
  const source = bgmSource;
  if (!source) return;
  fadeBgm(0, BGM_STOP_FADE_SECONDS);
  if (bgmStopTimer !== null) window.clearTimeout(bgmStopTimer);
  bgmStopTimer = window.setTimeout(() => {
    if (bgmSource !== source) return;
    source.stop();
    bgmSource = null;
    bgmStopTimer = null;
  }, BGM_STOP_FADE_SECONDS * 1000);
}

function startBgm(): void {
  if (isBgmSilenced() || !context || !bgmGain) return;
  if (bgmStopTimer !== null) {
    window.clearTimeout(bgmStopTimer);
    bgmStopTimer = null;
  }
  if (bgmSource) {
    fadeBgm(bgmVolume, BGM_FADE_IN_SECONDS);
    return;
  }
  const buffer = buffers.get(BGM_KEY);
  if (!buffer) return;
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.connect(bgmGain);
  source.onended = () => {
    if (bgmSource === source) bgmSource = null;
  };
  bgmSource = source;
  fadeBgm(0, 0);
  source.start();
  fadeBgm(bgmVolume, BGM_FADE_IN_SECONDS);
}

export async function unlockAudio(): Promise<void> {
  if (typeof AudioContext === "undefined") return;
  const audioContext = ensureContext();
  const resumePromise = audioContext.state === "suspended" ? audioContext.resume() : Promise.resolve();
  await preloadAudio();
  await resumePromise;
  startBgm();
}

export function playSound(name: SoundName, options: { volume?: number; playbackRate?: number } = {}): void {
  void unlockAudio().then(() => {
    if (!context || !masterGain || isSfxSilenced()) return;
    const buffer = buffers.get(name);
    if (!buffer) return;
    const config = settings[name];
    const now = context.currentTime;
    if (!canPlaySound(lastPlayedAt.get(name), now, config.cooldown)) return;
    if ((activeVoices.get(config.group) ?? 0) >= config.maxVoices) return;

    lastPlayedAt.set(name, now);
    activeVoices.set(config.group, (activeVoices.get(config.group) ?? 0) + 1);
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = options.playbackRate ?? 1;
    gain.gain.value = options.volume ?? config.volume;
    source.connect(gain).connect(masterGain);
    source.onended = () => activeVoices.set(config.group, Math.max(0, (activeVoices.get(config.group) ?? 1) - 1));
    source.start();
  });
}

export function isMuted(): boolean {
  return allMuted;
}

export function isBgmMuted(): boolean {
  return bgmMuted;
}

export function isSfxMuted(): boolean {
  return sfxMuted;
}

export function isAllMuted(): boolean {
  return allMuted;
}

export function getBgmVolume(): number {
  return bgmVolume;
}

export function setBgmVolume(value: number): void {
  bgmVolume = Math.min(1, Math.max(0, Number.isFinite(value) ? value : DEFAULT_BGM_VOLUME));
  if (!isBgmSilenced() && bgmSource) fadeBgm(bgmVolume, BGM_VOLUME_CHANGE_SECONDS);
}

export function setMuted(value: boolean): void {
  setAllMuted(value);
}

export function setBgmMuted(value: boolean): void {
  bgmMuted = value;
  writeMuted("swipe-breakout-bgm-muted", bgmMuted);
  if (isBgmSilenced()) stopBgm();
  else void unlockAudio();
}

export function setSfxMuted(value: boolean): void {
  sfxMuted = value;
  writeMuted("swipe-breakout-sfx-muted", sfxMuted);
  if (masterGain) masterGain.gain.value = isSfxSilenced() ? 0 : 1;
}

export function setAllMuted(value: boolean): void {
  allMuted = value;
  writeMuted("swipe-breakout-all-muted", allMuted);
  writeMuted("swipe-breakout-muted", allMuted);
  if (masterGain) masterGain.gain.value = isSfxSilenced() ? 0 : 1;
  if (isBgmSilenced()) stopBgm();
  else void unlockAudio();
}
