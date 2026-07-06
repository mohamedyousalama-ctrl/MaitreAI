#!/usr/bin/env python3
# ============================================================================
# WO-VOICE-0 — bake-off SCORER (the keyed scoring half of the deliverable).
#
# Reproducible harness over scripts/voice/khalid-voice-eval-set.json:
#   • TTS: synthesize the 10 Najdi scripts on each candidate voice → audio samples
#     for Mohamed's ear (naturalness/dialect/warmth/pace are a human call).
#   • STT: synthesize each of the 20 scripted Saudi voice notes (clean + noise-mixed
#     for the noise-tagged items), transcribe, and score SAFETY-TERM RECALL and a
#     per-item confidence → the fail-closed SAFETY_STT_CONFIDENCE_FLOOR.
#
# Keys come from the ENVIRONMENT only (OPENAI_API_KEY); nothing is written to the repo.
# Audio goes to $VOICE_OUT (default: a temp dir).
#
# VALIDITY CAVEATS (honest):
#  - No human recordings → STT fixtures are TTS-synthesized (a DIFFERENT engine than the
#    Whisper STT) — a PROXY. Re-confirm the production floor on REAL Saudi audio (WO-VOICE-1).
#  - Noise is ADDITIVE Gaussian at a target SNR — a partial proxy for babble/traffic; it does
#    NOT reproduce child_pitch (pitch shift) or *_fast_speech (rate). Those tags are flagged
#    `noise_proxy_only` in the scorecard.
#  - gpt-4o-transcribe / *-mini-transcribe only support response_format=json (no segments), so
#    they yield recall but NO confidence; the confidence floor is derived from whisper-1 only.
# ============================================================================
import os, sys, json, wave, tempfile, urllib.request, urllib.error, math, re, time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EVAL = os.path.join(ROOT, "scripts", "voice", "khalid-voice-eval-set.json")
OUT = os.environ.get("VOICE_OUT", tempfile.mkdtemp(prefix="voice-bakeoff-"))
OPENAI = os.environ.get("OPENAI_API_KEY", "")
os.makedirs(os.path.join(OUT, "tts"), exist_ok=True)
os.makedirs(os.path.join(OUT, "stt"), exist_ok=True)

TTS_VOICES = os.environ.get("TTS_VOICES", "onyx,ash,verse").split(",")  # candidate Khalid voices
STT_SYNTH_VOICE = os.environ.get("STT_SYNTH_VOICE", "sage")            # a distinct "speaker" for STT fixtures
STT_MODEL = os.environ.get("STT_MODEL", "whisper-1")                   # whisper-1 → avg_logprob confidence

# Real eval-set noise tags → additive-noise SNR (dB). Unknown tags are a HARD ERROR (never
# silently skipped). child_pitch / traffic_fast_speech are additive-noise proxies ONLY.
NOISE_SNR = {"none": None, "mild": 13, "restaurant_babble_medium": 8,
             "traffic_fast_speech": 6, "child_pitch": 10}
NOISE_PROXY_ONLY = {"child_pitch", "traffic_fast_speech"}

def _post(url, data, headers, raw=False, tries=3):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, data=data, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=180) as r:
                b = r.read()
                return b if raw else json.loads(b)
        except urllib.error.HTTPError as e:
            last = f"HTTP {e.code}: {e.read()[:200]!r}"
            if e.code in (429, 500, 502, 503, 504) and i < tries - 1:
                time.sleep(2 * (i + 1)); continue
            raise RuntimeError(last)
        except Exception as e:  # transient network
            last = str(e)
            if i < tries - 1:
                time.sleep(2 * (i + 1)); continue
            raise RuntimeError(last)
    raise RuntimeError(last or "unknown")

def tts(text, voice, path, model="gpt-4o-mini-tts", fmt="wav", instructions=None):
    body = {"model": model, "voice": voice, "input": text, "response_format": fmt}
    if instructions:
        body["instructions"] = instructions
    audio = _post("https://api.openai.com/v1/audio/speech", json.dumps(body).encode(),
                  {"Authorization": f"Bearer {OPENAI}", "Content-Type": "application/json"}, raw=True)
    with open(path, "wb") as f:
        f.write(audio)
    return len(audio)

def add_noise(in_wav, out_wav, snr_db):
    import numpy as np
    rng = np.random.default_rng(int(os.environ.get("NOISE_SEED", "0")))  # seeded → reproducible noise
    with wave.open(in_wav, "rb") as w:
        ch, sw, fr = w.getnchannels(), w.getsampwidth(), w.getframerate()
        frames = w.readframes(-1)  # read all available; do NOT trust nframes (streaming-wav placeholder)
    if sw != 2:  # int16 only; leave others untouched
        with open(out_wav, "wb") as f, open(in_wav, "rb") as g: f.write(g.read()); return
    x = np.frombuffer(frames, dtype=np.int16).astype(np.float64)
    if x.size == 0:
        with open(out_wav, "wb") as f, open(in_wav, "rb") as g: f.write(g.read()); return
    sig_p = np.mean(x**2) + 1e-9
    noise = rng.normal(0, math.sqrt(sig_p / (10 ** (snr_db / 10.0))), x.shape)
    y = np.clip(x + noise, -32768, 32767).astype(np.int16)
    # Write with EXPLICIT params (writeframes recomputes nframes) — avoids the source header's
    # placeholder frame count overflowing the WAV 'L' field.
    with wave.open(out_wav, "wb") as w:
        w.setnchannels(ch); w.setsampwidth(2); w.setframerate(fr); w.writeframes(y.tobytes())

def transcribe(path, model=STT_MODEL):
    # whisper-1 supports verbose_json (→ segments w/ avg_logprob); gpt-4o-transcribe only json.
    verbose = model.startswith("whisper")
    fmt = "verbose_json" if verbose else "json"
    boundary = "----voicebakeoff"
    with open(path, "rb") as f:
        audio = f.read()
    parts = []
    def field(name, val):
        parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{val}\r\n".encode())
    field("model", model); field("response_format", fmt); field("language", "ar")
    parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"a.wav\"\r\nContent-Type: audio/wav\r\n\r\n".encode())
    parts.append(audio); parts.append(f"\r\n--{boundary}--\r\n".encode())
    return _post("https://api.openai.com/v1/audio/transcriptions", b"".join(parts),
                 {"Authorization": f"Bearer {OPENAI}", "Content-Type": f"multipart/form-data; boundary={boundary}"})

def normalize_ar(s):
    s = re.sub(r"[ً-ْٰ]", "", s or "")       # tashkeel
    s = s.translate(str.maketrans("أإآىؤئة", "اااايیه".replace("ی", "ي")))
    s = re.sub(r"^ال| ال", " ", s)          # strip leading/space-led definite article (affix-insensitive)
    s = re.sub(r"[^؀-ۿ0-9a-zA-Z ]", " ", s)
    return re.sub(r"\s+", " ", s).strip()

def main():
    d = json.load(open(EVAL, encoding="utf-8"))
    report = {"tts": [], "stt": [], "summary": {}}

    print(f"# TTS bake-off → {OUT}/tts  (voices: {','.join(TTS_VOICES)})", flush=True)
    for sc in d["tts"]["scripts"]:
        row = {"id": sc["id"], "intent": sc.get("intent"), "voices": {}}
        for v in TTS_VOICES:
            path = os.path.join(OUT, "tts", f"{sc['id']}_{v}.wav")
            try:
                n = tts(sc["text"], v, path, instructions="Warm Saudi Najdi male host; unhurried, hospitable.")
                row["voices"][v] = {"bytes": n, "file": path}
            except Exception as e:
                row["voices"][v] = {"error": str(e)}
                print(f"  {sc['id']} {v}: ERROR {e}", flush=True)
        report["tts"].append(row)
    print(f"  {len(report['tts'])} scripts × {len(TTS_VOICES)} voices synthesized", flush=True)

    print(f"\n# STT bake-off → {OUT}/stt  (synth voice: {STT_SYNTH_VOICE}, stt: {STT_MODEL})", flush=True)
    total_terms = matched_terms = 0
    mustflag_ok = mustflag_total = 0
    errored_safety = 0
    conf_ok_safety, conf_missed = [], []
    for it in d["stt"]["items"]:
        terms = it.get("safetyTerms", [])
        noise = it.get("noise", "none")
        if noise not in NOISE_SNR:
            raise ValueError(f"unknown noise tag '{noise}' for {it['id']} — map it in NOISE_SNR or fix the eval set")
        # denominator is fixed up-front, so a transient failure counts as a MISS, not a removal (Codex P1).
        if terms:
            total_terms += len(terms)
        if it.get("mustFlag"):
            mustflag_total += 1

        clean = os.path.join(OUT, "stt", f"{it['id']}_clean.wav")
        try:
            tts(it["spoken"], STT_SYNTH_VOICE, clean)
            use = clean
            if NOISE_SNR.get(noise):
                noisy = os.path.join(OUT, "stt", f"{it['id']}_{noise}.wav")
                add_noise(clean, noisy, NOISE_SNR[noise]); use = noisy
            tr = transcribe(use)
        except Exception as e:
            errored_safety += 1 if terms else 0
            report["stt"].append({"id": it["id"], "noise": noise, "error": str(e),
                                   "safetyTerms": terms, "captured": [], "recall": (0.0 if terms else None)})
            print(f"  {it['id']} [{noise}] ERROR (counts as miss): {e}", flush=True)
            continue

        text = tr.get("text", "")
        segs = tr.get("segments") or []
        conf = round(math.exp(min(s.get("avg_logprob", 0.0) for s in segs)), 3) if segs else None
        nsp = round(max((s.get("no_speech_prob", 0.0) for s in segs), default=0.0), 3) if segs else None
        nt = normalize_ar(text)
        hit = [t for t in terms if normalize_ar(t) in nt]
        report["stt"].append({"id": it["id"], "category": it.get("category"), "noise": noise,
                              "noise_proxy_only": noise in NOISE_PROXY_ONLY,
                              "containsSafety": it.get("containsSafety"), "mustFlag": it.get("mustFlag"),
                              "safetyTerms": terms, "captured": hit,
                              "recall": (len(hit) / len(terms) if terms else None),
                              "conf": conf, "no_speech_prob": nsp, "transcript": text})
        if terms:
            matched_terms += len(hit)
            if conf is not None:
                (conf_ok_safety if len(hit) == len(terms) else conf_missed).append(conf)
        if it.get("mustFlag") and terms and len(hit) == len(terms):
            mustflag_ok += 1
        print(f"  {it['id']} [{noise}{'*' if noise in NOISE_PROXY_ONLY else ''}] "
              f"recall={len(hit)}/{len(terms)} conf={conf}  «{text[:46]}»", flush=True)

    overall = round(matched_terms / total_terms, 3) if total_terms else None
    floor = (max(conf_missed) if conf_missed else (min(conf_ok_safety) if conf_ok_safety else 0.66))
    report["summary"] = {
        "stt_model": STT_MODEL, "tts_voices": TTS_VOICES,
        "safety_term_recall": overall, "safety_terms_total": total_terms,
        "errored_safety_items_counted_as_miss": errored_safety,
        "mustFlag_fully_captured": f"{mustflag_ok}/{mustflag_total}",
        "conf_missed_terms": sorted(conf_missed),
        "conf_captured_min": (min(conf_ok_safety) if conf_ok_safety else None),
        "confidence_available": bool(conf_ok_safety or conf_missed),
        "recommended_SAFETY_STT_CONFIDENCE_FLOOR": round(floor, 3),
        "noise_proxy_only_tags": sorted(NOISE_PROXY_ONLY),
    }
    with open(os.path.join(OUT, "scorecard.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print("\n# SUMMARY"); print(json.dumps(report["summary"], ensure_ascii=False, indent=2))
    print(f"\nscorecard → {OUT}/scorecard.json")

if __name__ == "__main__":
    if not OPENAI:
        print("OPENAI_API_KEY not set", file=sys.stderr); sys.exit(2)
    main()
