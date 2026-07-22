import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const specs = [
  ["ui_click", "public/audio/common/ui_click.mp3", 0.5, false, "Very short soft UI button click for a polished neon sci-fi mobile puzzle game, clean glass and light electronic tap, friendly, crisp, subtle, no harsh transient, no voice, no music, one-shot"],
  ["ui_panel", "public/audio/common/ui_panel.mp3", 0.6, false, "Short smooth UI panel transition for a polished neon sci-fi game, soft glass slide with a gentle airy electronic shimmer, clean and unobtrusive, no voice, no music, one-shot"],
  ["launch", "public/audio/common/launch.mp3", 0.5, false, "Very short bright playful ball volley launch cue for a neon sci-fi brick breaker game, cheerful rising electronic pluck with a light airy pop and soft whoosh, crisp friendly arcade feel, quick clean decay, low volume, no bass boom, no static, no distortion, no clipping, no harsh high frequencies, no voice, no music, one-shot"],
  ["brick_hit", "public/audio/common/brick_hit.mp3", 0.5, false, "Short soft rounded block impact for a casual sci-fi brick breaker game, a single ball gently tapping a colored block, warm muted thump with a cushioned glassy body, smooth low-mid tone, quick clean decay, no sharp high ping, no metallic ring, no click, no static, no distortion, no explosion, no music, no voice, one-shot"],
  ["steel_hit", "public/audio/common/steel_hit.mp3", 0.5, false, "Short soft rounded steel block ricochet for a neon sci-fi brick breaker game, muted low metallic thud with a cushioned body, warm brief resonance, clean fast decay, no sharp ping, no high ring, no click, no static, no distortion, no voice, no music, one-shot"],
  ["item_collect", "public/audio/common/item_collect.mp3", 0.6, false, "Short warm friendly item pickup for a neon sci-fi puzzle game, rounded soft marimba-like pluck with a gentle airy chime, smooth midrange sparkle, rewarding but calm, fast decay, no piercing high tone, no glass ping, no static, no distortion, no voice, no music, one-shot"],
  ["stage_clear", "public/audio/common/stage_clear.mp3", 1, false, "Short stage clear stinger for a neon sci-fi casual puzzle game, clean uplifting electronic chime with restrained sparkle, rewarding but not a grand fanfare, no voice, no drums, one-shot"],
  ["game_over", "public/audio/common/game_over.mp3", 1, false, "Short game over sting for a neon sci-fi casual puzzle game, gentle descending electronic tone with a soft low ending, clear but not alarming, no voice, no harsh buzzer, no music bed, one-shot"],
  ["bomb", "public/audio/special/bomb.mp3", 1, false, "Compact neon energy bomb explosion for a sci-fi brick breaker game, deep controlled impact with a bright expanding electronic shockwave, powerful but clean, no debris, no voice, no music, one-shot"],
  ["laser", "public/audio/special/laser.mp3", 0.8, false, "Wide horizontal neon laser beam firing across a sci-fi game board, thick energetic sweep with a bright electric core and fast clean decay, powerful but not piercing, no voice, no music, one-shot"],
  ["blackhole_capture", "public/audio/special/blackhole_capture.mp3", 1.2, false, "Sci-fi black hole capturing a small ball, warped low electronic pull that accelerates inward and ends with a tight deep vacuum snap, smooth curved motion, no horror, no voice, no music, one-shot"],
  ["trap", "public/audio/special/trap.mp3", 0.6, false, "Short negative trap pickup for a casual neon sci-fi puzzle game, gentle downward electronic blip with a soft hollow click, noticeable but not punishing, no buzzer, no voice, no music, one-shot"],
  ["shield_rewind", "public/audio/special/shield_rewind.mp3", 1, false, "Protective blue energy shield activates then rewinds the game board one step, bright electric flash followed by a smooth reverse sci-fi sweep, reassuring and clean, no voice, no music, one-shot"],
  ["gameplay_loop", "public/audio/music/gameplay_loop.mp3", 30, true, "밝고 경쾌한 캐주얼 퍼즐 게임용 30초 루프 음악. 장조, 88BPM, 따라 하기 쉬운 짧은 멜로디와 가벼운 리듬, 알록달록하고 즐거운 분위기. 중간에 작은 변화를 주고 자연스럽게 반복. 특정 악기 소리가 튀지 않는 균형 잡힌 깨끗한 믹스. 미스터리, 어두움, 긴장감, 보컬, 효과음, 배경 잡음, 화이트 노이즈, 지직거림, 디지털 아티팩트 없음."],
].map(([name, path, duration, loop, text]) => ({ name, path, duration, loop, text }));

const generate = process.argv.includes("--generate");
const force = process.argv.includes("--force");
const only = process.argv.find((argument) => argument.startsWith("--only="))?.slice(7);
const selected = only ? specs.filter((spec) => spec.name === only) : specs;
if (selected.length === 0) throw new Error(`알 수 없는 오디오 이름입니다: ${only}`);

const pending = [];
for (const spec of selected) {
  try {
    if (force) throw new Error("강제 재생성");
    await access(resolve(root, spec.path));
    console.log(`- ${spec.name}: 기존 파일 사용`);
  } catch {
    pending.push(spec);
    const estimate = spec.name === "gameplay_loop" ? "음악 API 분량" : `${spec.duration * 20}크레딧`;
    console.log(`- ${spec.name}: ${spec.duration}초 · ${estimate}`);
  }
}
const plannedCredits = pending.filter((spec) => spec.name !== "gameplay_loop").reduce((sum, spec) => sum + spec.duration * 20, 0);
const hasMusic = pending.some((spec) => spec.name === "gameplay_loop");
console.log(`신규 ${pending.length}개 · SFX 최대 예상 ${plannedCredits}크레딧${hasMusic ? " · BGM 음악 API 분량 사용" : ""}`);
if (!generate) process.exit(0);

const env = await readFile(resolve(root, ".env"), "utf8");
const rawKey = env.match(/^ELEVENLABS_API_KEY=(.+)$/m)?.[1].trim() ?? "";
const apiKey = rawKey.replace(/^(['"])(.*)\1$/, "$2");
if (!apiKey) throw new Error(".env에 ELEVENLABS_API_KEY를 설정하세요.");

for (const spec of selected) {
  const output = resolve(root, spec.path);
  try {
    if (force) throw new Error("강제 재생성");
    await readFile(output);
    console.log(`건너뜀: ${spec.name}`);
    continue;
  } catch {}

  console.log(`생성 중: ${spec.name}`);
  const isMusic = spec.name === "gameplay_loop";
  const endpoint = isMusic
    ? "https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128"
    : "https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128";
  const body = isMusic
    ? {
        prompt: spec.text,
        music_length_ms: spec.duration * 1000,
        model_id: "music_v1",
        force_instrumental: true,
      }
    : {
        text: spec.text,
        duration_seconds: spec.duration,
        prompt_influence: 0.5,
        loop: spec.loop,
        model_id: "eleven_text_to_sound_v2",
      };
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "xi-api-key": apiKey },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${spec.name} 생성 실패: HTTP ${response.status} ${(await response.text()).slice(0, 300)}`);

  const bytes = Buffer.from(await response.arrayBuffer());
  if (!response.headers.get("content-type")?.startsWith("audio/") || bytes.length < 1000) {
    throw new Error(`${spec.name} 응답이 유효한 오디오가 아닙니다.`);
  }
  await mkdir(dirname(output), { recursive: true });
  const temporary = `${output}.tmp`;
  await writeFile(temporary, bytes);
  await rename(temporary, output);
  console.log(`완료: ${spec.path}`);
}
