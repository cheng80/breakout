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

const buffers = new Map<string, AudioBuffer>();
const lastPlayedAt = new Map<SoundName, number>();
const activeVoices = new Map<string, number>();
const bgmAudio = typeof Audio === "undefined" ? null : new Audio("audio/music/gameplay_loop.mp3");
const DEFAULT_BGM_VOLUME = 0.5;
const BGM_FADE_IN_SECONDS = 1.25;
const BGM_FADE_OUT_SECONDS = 3;
const BGM_VOLUME_CHANGE_SECONDS = 0.2;
let context: AudioContext | null = null;
let masterGain: GainNode | null = null;
let bgmGain: GainNode | null = null;
let loadPromise: Promise<void> | null = null;
let allMuted = readMuted("swipe-breakout-all-muted") || readMuted("swipe-breakout-muted");
let bgmMuted = readMuted("swipe-breakout-bgm-muted");
let sfxMuted = readMuted("swipe-breakout-sfx-muted");
let bgmEnding = false;
let bgmVolume = DEFAULT_BGM_VOLUME;

function handleBgmTimeUpdate(): void {
  if (!bgmAudio || bgmEnding || !Number.isFinite(bgmAudio.duration)) return;
  const remaining = bgmAudio.duration - bgmAudio.currentTime;
  if (remaining <= BGM_FADE_OUT_SECONDS) {
    bgmEnding = true;
    fadeBgm(0, Math.max(0.05, remaining));
  }
}

function restartBgm(): void {
  if (!bgmAudio) return;
  bgmAudio.currentTime = 0;
  bgmEnding = false;
  if (!isBgmSilenced()) {
    fadeBgm(0, 0);
    void bgmAudio.play().then(() => fadeBgm(bgmVolume, BGM_FADE_IN_SECONDS)).catch(() => undefined);
  }
}

function setupBgm(): void {
  if (!bgmAudio) return;
  bgmAudio.loop = false;
  bgmAudio.preload = "auto";
  bgmAudio.volume = 1;
  bgmAudio.addEventListener("timeupdate", handleBgmTimeUpdate);
  bgmAudio.addEventListener("ended", restartBgm);
}

setupBgm();

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

function syncSfxGain(): void {
  if (masterGain) masterGain.gain.value = isSfxSilenced() ? 0 : 1;
}

function ensureContext(): AudioContext {
  if (context) return context;
  context = new AudioContext();
  masterGain = context.createGain();
  masterGain.gain.value = isSfxSilenced() ? 0 : 1;
  masterGain.connect(context.destination);
  if (bgmAudio) {
    bgmGain = context.createGain();
    bgmGain.gain.value = 0;
    context.createMediaElementSource(bgmAudio).connect(bgmGain).connect(context.destination);
  }
  return context;
}

export function canPlaySound(lastPlayed: number | undefined, now: number, cooldown: number): boolean {
  return lastPlayed === undefined || now - lastPlayed >= cooldown;
}

export function preloadAudio(): Promise<void> {
  if (loadPromise) return loadPromise;
  const audioContext = ensureContext();
  loadPromise = Promise.all(Object.entries(files).map(async ([name, path]) => {
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
  bgmGain.gain.cancelAndHoldAtTime(now);
  if (duration > 0) bgmGain.gain.linearRampToValueAtTime(target, now + duration);
  else bgmGain.gain.setValueAtTime(target, now);
}

function startBgm(): void {
  if (!bgmAudio || isBgmSilenced() || !bgmAudio.paused) return;
  bgmEnding = false;
  fadeBgm(0, 0);
  void bgmAudio.play().then(() => fadeBgm(bgmVolume, BGM_FADE_IN_SECONDS)).catch(() => undefined);
}

export async function unlockAudio(): Promise<void> {
  const audioContext = ensureContext();
  const resumePromise = audioContext.state === "suspended" ? audioContext.resume() : Promise.resolve();
  startBgm();
  await resumePromise;
  await preloadAudio();
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
  if (bgmAudio && !isBgmSilenced() && !bgmAudio.paused && !bgmEnding) {
    fadeBgm(bgmVolume, BGM_VOLUME_CHANGE_SECONDS);
  }
}

export function setMuted(value: boolean): void {
  setAllMuted(value);
}

export function setBgmMuted(value: boolean): void {
  bgmMuted = value;
  writeMuted("swipe-breakout-bgm-muted", bgmMuted);
  if (isBgmSilenced() && bgmAudio) {
    bgmAudio.pause();
    fadeBgm(0, 0);
    bgmEnding = false;
  } else if (!isBgmSilenced()) {
    startBgm();
  }
}

export function setSfxMuted(value: boolean): void {
  sfxMuted = value;
  writeMuted("swipe-breakout-sfx-muted", sfxMuted);
  syncSfxGain();
}

export function setAllMuted(value: boolean): void {
  allMuted = value;
  writeMuted("swipe-breakout-all-muted", allMuted);
  writeMuted("swipe-breakout-muted", allMuted);
  syncSfxGain();
  if (isBgmSilenced() && bgmAudio) {
    bgmAudio.pause();
    fadeBgm(0, 0);
    bgmEnding = false;
  } else if (!isBgmSilenced() && typeof AudioContext !== "undefined") {
    void unlockAudio();
  }
}
