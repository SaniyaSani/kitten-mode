// Speech-to-text adapter. Two providers behind one function: transcribe(file, dir, opts) -> [{t, text, lowconf?}]
//   STT_PROVIDER=local   whisper.cpp on this machine (audio never leaves it). Needs ffmpeg, whisper-cli, WHISPER_MODEL=/path/ggml-*.bin
//   STT_PROVIDER=openai  OpenAI audio API (audio is sent to OpenAI). Needs ffmpeg, OPENAI_API_KEY. Chunked into 10-minute pieces.
// Cloud is never picked automatically: it must be chosen explicitly.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
const run = promisify(execFile);
const CHUNK = 600;

export function sttProvider() {
  const p = process.env.STT_PROVIDER;
  if (p === "openai") return process.env.OPENAI_API_KEY ? "openai" : null;
  if ((p === "local" || !p) && process.env.WHISPER_MODEL) return "local";
  return null;
}

async function local(file, dir, { prompt }) {
  const wav = path.join(dir, "in.wav");
  await run("ffmpeg", ["-y", "-i", file, "-ar", "16000", "-ac", "1", wav], { maxBuffer: 1e7 });
  const args = ["-m", process.env.WHISPER_MODEL, "-f", wav, "-oj", "-of", path.join(dir, "out"), "-l", process.env.WHISPER_LANG || "auto"];
  if (prompt) args.push("--prompt", prompt);
  await run(process.env.WHISPER_BIN || "whisper-cli", args, { maxBuffer: 1e7, timeout: 3 * 3600e3 });
  const j = JSON.parse(await readFile(path.join(dir, "out.json"), "utf8"));
  return j.transcription.map(x => ({ t: Math.floor(x.offsets.from / 1000), text: String(x.text).trim() })).filter(s => s.text);
}

async function openai(file, dir, { prompt, onProgress }) {
  await run("ffmpeg", ["-y", "-i", file, "-ac", "1", "-ar", "16000", "-c:a", "libopus", "-b:a", "24k", "-f", "segment", "-segment_time", String(CHUNK), "-reset_timestamps", "1", path.join(dir, "c%03d.ogg")], { maxBuffer: 1e7 });
  const chunks = (await readdir(dir)).filter(f => /^c\d+\.ogg$/.test(f)).sort();
  const out = [];
  for (let i = 0; i < chunks.length; i++) {
    const fd = new FormData();
    fd.set("file", new Blob([await readFile(path.join(dir, chunks[i]))], { type: "audio/ogg" }), chunks[i]);
    fd.set("model", process.env.OPENAI_STT_MODEL || "whisper-1");
    fd.set("response_format", "verbose_json");
    fd.append("timestamp_granularities[]", "segment");
    if (prompt) fd.set("prompt", prompt);
    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { authorization: "Bearer " + process.env.OPENAI_API_KEY }, body: fd });
    if (!r.ok) throw new Error("stt " + r.status);
    const j = await r.json();
    for (const s of j.segments || []) {
      const text = String(s.text || "").trim();
      if (text) out.push({ t: Math.floor(i * CHUNK + s.start), text, lowconf: typeof s.avg_logprob === "number" && s.avg_logprob < -1 });
    }
    onProgress?.((i + 1) / chunks.length);
  }
  return out;
}

export function transcribe(file, dir, opts = {}) {
  const p = sttProvider();
  if (p === "local") return local(file, dir, opts);
  if (p === "openai") return openai(file, dir, opts);
  throw new Error("no provider");
}
