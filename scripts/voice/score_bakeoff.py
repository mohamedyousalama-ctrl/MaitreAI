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
# Keys come from the ENVIRONMENT only (OPENAI_API_KEY, [ELEVENLABS_API_KEY]); nothing
# is written to the repo. Audio goes to $VOICE_OUT (default: a temp dir).
#
# NOTE ON VALIDITY: without human recordings, the STT half uses TTS-synthesized audio
# as a PROXY (a different engine than the Whisper STT, plus injected noise). It exercises
# the scoring path and the threshold logic end-to-end and produces real numbers, but the
# production floor must be re-confirmed on REAL Saudi recordings (WO-VOICE-1). Clearly
# labeled throughout.
# ============================================================================
import os, sys, json, wave, struct, tempfile, urllib.request, urllib.error, math, re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EVAL = os.path.join(ROOT, "scripts", "voice", "khalid-voice-eval-set.json")
OUT = os.environ.get("VOICE_OUT", tempfile.mkdtemp(prefix="voice-bakeoff-"))
OPENAI = os.environ.get("OPENAI_API_KEY", "")
os.makedirs(os.path.join(OUT, "tts"), exist_ok=True)
os.makedirs(os.path.join(OUT, "stt"), exist_ok=True)

TTS_VOICES = os.environ.get("TTS_VOICES", "onyx,ash,verse").split(",")  # candidate Khalid voices
STT_SYNTH_VOICE = os.environ.get("STT_SYNTH_VOICE", "sage")             # a distinct "speaker" for STT fixtures
STT_MODEL = os.environ.get("STT_MODEL", "whisper-1")                    # verbose_json → avg_logprob

def _post(url, data, headers, raw=False):
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read() if raw else json.loads(r.read())

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
    with wave.open(in_wav, "rb") as w:
        p = w.getparams(); frames = w.readframes(w.getnframes())
    x = np.frombuffer(frames, dtype=np.int16).astype(np.float64)
    if x.size == 0:
        with open(out_wav, "wb") as f, open(in_wav, "rb") as g: f.write(g.read()); return
    sig_p = np.mean(x**2) + 1e-9
    noise_p = sig_p / (10**(snr_db/10.0))
    noise = np.random.normal(0, math.sqrt(noise_p), x.shape)
    y = np.clip(x + noise, -32768, 32767).astype(np.int16)
    with wave.open(out_wav, "wb") as w:
        w.setparams(p); w.writeframes(y.tobytes())

def transcribe(path, model=STT_MODEL):
    # multipart/form-data by hand (no deps)
    boundary = "----voicebakeoff"
    with open(path, "rb") as f: audio = f.read()
    parts = []
    def field(name, val):
        parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{val}\r\n".encode())
    field("model", model); field("response_format", "verbose_json"); field("language", "ar")
    parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"a.wav\"\r\nContent-Type: audio/wav\r\n\r\n".encode())
    parts.append(audio); parts.append(f"\r\n--{boundary}--\r\n".encode())
    body = b"".join(parts)
    return _post("https://api.openai.com/v1/audio/transcriptions", body,
                 {"Authorization": f"Bearer {OPENAI}", "Content-Type": f"multipart/form-data; boundary={boundary}"})

def normalize_ar(s):
    s = re.sub(r"[ً-ْٰ]", "", s or "")     # tashkeel
    s = s.translate(str.maketrans("أإآىؤئة", "اااايیه".replace("ی","ي")))
    s = re.sub(r"[^؀-ۿ0-9a-zA-Z ]", " ", s)
    return re.sub(r"\s+", " ", s).strip()

NOISE_SNR = {"none": None, "cafe": 8, "traffic": 6, "kitchen": 7, "wind": 5, "tv": 9, "crowd": 6, "market": 6}

def main():
    d = json.load(open(EVAL, encoding="utf-8"))
    report = {"tts": [], "stt": [], "summary": {}}

    # ---- TTS bake-off: samples for the human ear ----
    print(f"# TTS bake-off → {OUT}/tts  (voices: {','.join(TTS_VOICES)})", flush=True)
    for sc in d["tts"]["scripts"]:
        row = {"id": sc["id"], "intent": sc.get("intent"), "voices": {}}
        for v in TTS_VOICES:
            path = os.path.join(OUT, "tts", f"{sc['id']}_{v}.wav")
            try:
                n = tts(sc["text"], v, path, instructions="Warm Saudi Najdi male host; unhurried, hospitable.")
                row["voices"][v] = {"bytes": n, "file": path}
                print(f"  {sc['id']} {v}: {n} bytes", flush=True)
            except Exception as e:
                row["voices"][v] = {"error": str(e)}
                print(f"  {sc['id']} {v}: ERROR {e}", flush=True)
        report["tts"].append(row)

    # ---- STT bake-off: synth → (noise) → transcribe → score safety recall + confidence ----
    print(f"\n# STT bake-off → {OUT}/stt  (synth voice: {STT_SYNTH_VOICE}, stt: {STT_MODEL})", flush=True)
    total_terms = matched_terms = 0
    mustflag_ok = mustflag_total = 0
    conf_ok_safety = []   # confidence of safety items whose terms were fully captured
    conf_missed = []      # confidence of items with a missed safety term
    for it in d["stt"]["items"]:
        clean = os.path.join(OUT, "stt", f"{it['id']}_clean.wav")
        try:
            tts(it["spoken"], STT_SYNTH_VOICE, clean)
        except Exception as e:
            report["stt"].append({"id": it["id"], "error": f"tts:{e}"}); continue
        use = clean
        noise = it.get("noise", "none")
        if noise and noise != "none" and NOISE_SNR.get(noise):
            noisy = os.path.join(OUT, "stt", f"{it['id']}_{noise}.wav")
            try:
                add_noise(clean, noisy, NOISE_SNR[noise]); use = noisy
            except Exception as e:
                print(f"  {it['id']}: noise-mix failed ({e}); using clean", flush=True)
        try:
            tr = transcribe(use)
        except Exception as e:
            report["stt"].append({"id": it["id"], "error": f"stt:{e}"}); continue
        text = tr.get("text", "")
        segs = tr.get("segments", []) or [{}]
        avglp = min((s.get("avg_logprob", 0.0) for s in segs), default=0.0)
        conf = round(math.exp(avglp), 3)       # avg_logprob → prob proxy
        nsp = max((s.get("no_speech_prob", 0.0) for s in segs), default=0.0)
        nt = normalize_ar(text)
        terms = it.get("safetyTerms", [])
        hit = [t for t in terms if normalize_ar(t) in nt]
        row = {"id": it["id"], "category": it.get("category"), "noise": noise,
               "containsSafety": it.get("containsSafety"), "mustFlag": it.get("mustFlag"),
               "safetyTerms": terms, "captured": hit, "recall": (len(hit)/len(terms) if terms else None),
               "conf": conf, "no_speech_prob": round(nsp, 3), "transcript": text}
        report["stt"].append(row)
        if terms:
            total_terms += len(terms); matched_terms += len(hit)
            (conf_ok_safety if len(hit) == len(terms) else conf_missed).append(conf)
        if it.get("mustFlag"):
            mustflag_total += 1
            if terms and len(hit) == len(terms): mustflag_ok += 1
        print(f"  {it['id']} [{noise}] recall={len(hit)}/{len(terms)} conf={conf} nsp={round(nsp,3)}  «{text[:50]}»", flush=True)

    overall_recall = round(matched_terms/total_terms, 3) if total_terms else None
    # fail-closed floor: the highest confidence at which a safety term was still MISSED
    # (anything at/below → treat as safety-positive). If nothing missed, fall back to the
    # min confidence among captured safety items (conservative), or the design 0.66.
    floor = max(conf_missed) if conf_missed else (min(conf_ok_safety) if conf_ok_safety else 0.66)
    report["summary"] = {
        "tts_voices": TTS_VOICES, "stt_model": STT_MODEL,
        "safety_term_recall": overall_recall, "safety_terms_total": total_terms,
        "mustFlag_fully_captured": f"{mustflag_ok}/{mustflag_total}",
        "conf_missed_terms": sorted(conf_missed), "conf_captured_min": (min(conf_ok_safety) if conf_ok_safety else None),
        "recommended_SAFETY_STT_CONFIDENCE_FLOOR": round(floor, 3),
    }
    with open(os.path.join(OUT, "scorecard.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print("\n# SUMMARY"); print(json.dumps(report["summary"], ensure_ascii=False, indent=2))
    print(f"\nscorecard → {OUT}/scorecard.json")

if __name__ == "__main__":
    if not OPENAI:
        print("OPENAI_API_KEY not set", file=sys.stderr); sys.exit(2)
    main()
