// ============================================================================
// A harness that RUNS the demo's CallScreen.
//
// WHY THIS EXISTS. The first version of proof-demo-call-loop drove only the two pure
// functions in lib/demo/call-loop.ts and read the component with regexes. Two independent
// adversarial reviews then broke the feature while keeping the proof green — between them,
// fourteen mutations survived, and two survived the ENTIRE 215-file suite: inverting the
// capability probe (so the honest panel shows exactly when the voice works, and the call
// screen opens exactly when it does not), and deleting the microphone release from
// hangUp() (so the mic stays open after the visitor hangs up). Both were "covered" by
// assertions that matched text inside a function nothing called.
//
// So this transpiles the real app/demo/DemoPhone.tsx and executes the real CallScreen under
// a minimal hook runtime, with every browser API it touches instrumented: getUserMedia,
// MediaRecorder, AudioContext + AnalyserNode, Audio playback, URL.createObjectURL, and
// fetch. What comes back is what the component actually DID — microphones opened and
// closed, URLs minted and revoked, requests issued and their multipart fields, and what the
// visitor was told.
//
// It is a test double for the browser, not for the component: nothing here stands in for
// any logic under test.
// ============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { transform } from "sucrase";

const ROOT = process.cwd();

/** A minimal React hook runtime. Enough for useState / useRef / useEffect / useCallback,
 *  which is all CallScreen uses. Rendering produces a plain tree we can search for text. */
function makeRuntime() {
  const hooks = [];
  let idx = 0;
  let pending = [];
  let cleanups = [];
  let renderFn = null;
  let tree = null;

  const React = {
    createElement: (type, props, ...children) => ({
      type: typeof type === "function" ? type.name : type,
      props: props || {},
      children: children.flat(),
    }),
    useState(init) {
      const i = idx++;
      if (hooks.length <= i) hooks[i] = { v: typeof init === "function" ? init() : init };
      const slot = hooks[i];
      return [slot.v, (next) => {
        const v = typeof next === "function" ? next(slot.v) : next;
        if (Object.is(v, slot.v)) return;
        slot.v = v;
        render();
      }];
    },
    useRef(init) {
      const i = idx++;
      if (hooks.length <= i) hooks[i] = { current: init };
      return hooks[i];
    },
    useCallback(fn, deps) {
      const i = idx++;
      const prev = hooks[i];
      if (!prev || !sameDeps(prev.deps, deps)) hooks[i] = { fn, deps };
      return hooks[i].fn;
    },
    useMemo(fn, deps) {
      const i = idx++;
      const prev = hooks[i];
      if (!prev || !sameDeps(prev.deps, deps)) hooks[i] = { v: fn(), deps };
      return hooks[i].v;
    },
    useEffect(fn, deps) {
      const i = idx++;
      const prev = hooks[i];
      if (!prev || !sameDeps(prev.deps, deps)) {
        hooks[i] = { deps, run: fn, cleanup: prev?.cleanup };
        pending.push(i);
      } else {
        hooks[i] = { ...prev, run: fn };
      }
    },
  };

  function sameDeps(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    return a.every((v, i) => Object.is(v, b[i]));
  }

  function render() {
    idx = 0;
    pending = [];
    tree = renderFn();
    for (const i of pending) {
      // eslint-disable-next-line no-underscore-dangle
      if (typeof hooks[i].cleanup === "function") hooks[i].cleanup();
      const c = hooks[i].run?.();
      hooks[i].cleanup = typeof c === "function" ? c : undefined;
    }
    return tree;
  }

  return {
    React,
    mount(fn) { renderFn = fn; return render(); },
    rerender: render,
    unmount() {
      for (const h of hooks) if (typeof h?.cleanup === "function") h.cleanup();
      cleanups = [];
    },
    get tree() { return tree; },
  };
}

/** Find a rendered element by its aria-label and return its props, so a test can PRESS it.
 *  Driving the real onClick is the difference between testing hangUp() and testing the
 *  effect cleanup that happens to do the same work — a mutation removing release() from
 *  hangUp() survived precisely that gap. */
export function findByLabel(node, label) {
  if (node == null || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const c of node) { const hit = findByLabel(c, label); if (hit) return hit; }
    return null;
  }
  if (node.props && node.props["aria-label"] === label) return node.props;
  return findByLabel(node.children ?? [], label);
}

/** Flatten a rendered tree to the visible strings, so a proof can assert what a visitor
 *  was told rather than which state variable holds it. */
export function visibleText(node) {
  if (node == null || node === false) return [];
  if (typeof node === "string" || typeof node === "number") return [String(node)];
  if (Array.isArray(node)) return node.flatMap(visibleText);
  return visibleText(node.children ?? []);
}

/**
 * Load CallScreen out of the real DemoPhone.tsx.
 *
 * The component is not exported (it is private to that module and should stay that way),
 * so an export is appended to the SOURCE TEXT before transpiling. Nothing else about the
 * file is altered — the code that runs is the code that ships.
 */
export function loadCallScreen(React) {
  const src = readFileSync(resolve(ROOT, "app/demo/DemoPhone.tsx"), "utf8");
  const { code } = transform(src + "\nexport { CallScreen };\n", {
    transforms: ["typescript", "jsx", "imports"],
    jsxPragma: "React.createElement",
    jsxFragmentPragma: "React.Fragment",
    filePath: "DemoPhone.tsx",
  });

  const realModules = {
    "@/lib/demo/call-loop": "lib/demo/call-loop.ts",
    "@/lib/demo/audio-payload": "lib/demo/audio-payload.ts",
    "@/lib/demo/config": "lib/demo/config.ts",
  };

  const require_ = (id) => {
    if (id === "react") return { ...React, default: React, __esModule: true };
    if (realModules[id]) return loadTs(realModules[id]);
    // Anything else the page imports (styles, icons, server helpers) is inert here: the
    // call screen touches none of it, and stubbing keeps the harness honest about scope.
    return new Proxy({ __esModule: true }, { get: () => () => null });
  };

  const module = { exports: {} };
  // eslint-disable-next-line no-new-func
  new Function("require", "module", "exports", "React", code)(require_, module, module.exports, React);
  return module.exports.CallScreen;
}

const tsCache = new Map();
function loadTs(rel) {
  if (tsCache.has(rel)) return tsCache.get(rel);
  const { code } = transform(readFileSync(resolve(ROOT, rel), "utf8"), {
    transforms: ["typescript", "imports"],
    filePath: rel,
  });
  const module = { exports: {} };
  // eslint-disable-next-line no-new-func
  new Function("require", "module", "exports", code)(() => ({}), module, module.exports);
  tsCache.set(rel, module.exports);
  return module.exports;
}

/**
 * Install instrumented browser globals and return the recorder of what the component did.
 *
 * `server` is called for every /api/demo/voice request and returns `{status, body}`.
 * `capabilities` is the boolean the probe reports.
 */
export function installBrowser({ capabilities = true, server, rmsScript = [], serverDelayMs = 0, playRejects = false, playRejectTurns = null, playStallTurns = null, playStarveMs = null, playbackMs = 0 } = {}) {
  // Counts every play() attempt, so a test can fail a SPECIFIC one. See the note in play().
  let playAttempts = 0;
  const log = {
    micPrompts: 0,
    tracksOpened: 0,
    tracksStopped: 0,
    ctxOpened: 0,
    ctxClosed: 0,
    urlsCreated: [],
    urlsRevoked: [],
    voiceRequests: [],
    capabilityRequests: 0,
    played: [],
    /** How many Audio elements the COMPONENT built. One per turn means the element the tap
     *  unlocked is being thrown away, which is the Safari autoplay failure. */
    audioConstructed: 0,
    /** How many times playback was stopped mid-reply — i.e. the visitor interrupted. */
    paused: 0,
    /** How many LISTENING turns actually began. The microphone stream is opened once and
     *  reused, so `tracksOpened` cannot tell one listening turn from five — which made a
     *  silent room that re-prompts indistinguishable from one that gives up immediately. */
    recorderStarts: 0,
  };

  let urlSeq = 0;
  globalThis.URL.createObjectURL = () => { const u = `blob:demo/${++urlSeq}`; log.urlsCreated.push(u); return u; };
  globalThis.URL.revokeObjectURL = (u) => { log.urlsRevoked.push(u); };

  class FakeTrack { constructor() { log.tracksOpened++; this.live = true; } stop() { if (this.live) { this.live = false; log.tracksStopped++; } } }
  class FakeStream { constructor() { this.tracks = [new FakeTrack()]; } getTracks() { return this.tracks; } }

  // `navigator` is a getter-only global in Node 22, so it is redefined rather than assigned.
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { mediaDevices: { getUserMedia: async () => { log.micPrompts++; return new FakeStream(); } } },
  });

  globalThis.MediaRecorder = class {
    constructor() { this.state = "inactive"; this.ondataavailable = null; this.onstop = null; }
    start() { this.state = "recording"; log.recorderStarts++; }
    stop() {
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob([new Uint8Array(64)], { type: "audio/webm" }) });
      queueMicrotask(() => this.onstop?.());
    }
  };

  // The waveform the analyser reports, one RMS value per 60ms sample. It WRAPS, so each
  // turn of a multi-turn drive sees the same room and the same utterance — clamping at the
  // last value instead meant every turn after the first heard only silence, which tested
  // the loop's ability to stop rather than its ability to continue.
  let sample = 0;
  globalThis.AudioContext = class {
    constructor() { log.ctxOpened++; this.closed = false; }
    createAnalyser() {
      return {
        fftSize: 512,
        getByteTimeDomainData: (buf) => {
          const rms = rmsScript.length ? rmsScript[sample % rmsScript.length] : 0.15;
          sample++;
          // Encode the target RMS as a square wave around the 128 midpoint.
          const amp = Math.round(rms * 128);
          for (let i = 0; i < buf.length; i++) buf[i] = 128 + (i % 2 ? amp : -amp);
        },
      };
    }
    createMediaStreamSource() { return { connect: () => {} }; }
    async close() { if (!this.closed) { this.closed = true; log.ctxClosed++; } }
  };

  // TRACKS CONSTRUCTIONS AND `src`, not just plays. The component used to build a fresh
  // `new Audio(url)` for every turn, which Safari refuses: playback permission belongs to
  // the tap that opened the screen and is long expired by the time a turn has audio. The
  // fix reuses the element the parent unlocked, so "how many were constructed" and "what
  // src was played" are now the two facts that distinguish fixed from broken — and a stub
  // that only recorded a constructor argument could see neither.
  // The player must be PAUSABLE and must report that it was paused, because barge-in works
  // by pausing mid-reply — and `pause()` fires neither `ended` nor `error`, which is exactly
  // the case a naive stub cannot represent.
  globalThis.Audio = class {
    constructor(url) {
      log.audioConstructed++;
      this.url = url;
      this._src = url ?? "";
      this.onended = null;
      this.onerror = null;
      this.onplaying = null;
      this.ontimeupdate = null;
      this._progress = null;
      // THE ELEMENT'S OWN CLOCK. The component asks `currentTime` rather than latching a
      // flag on `playing`, because `playing` only means the browser STARTED — a stream that
      // starts and immediately starves fires it and produces nothing audible. Advanced by
      // the progress ticks below, so a stub that never plays reports 0 exactly as a real
      // element does.
      this.currentTime = 0;
      this.error = null;
      this.muted = false;
    }
    get src() { return this._src; }
    set src(v) { this._src = v; }
    async play() {
      // WHICH PLAYBACKS FAIL, not just whether any do. `playRejects` fails every one, which
      // is the persistently-broken-voice case. `playRejectTurns` fails only the listed
      // attempts (1-indexed), which is the case a total switch cannot express at all: a
      // transient failure, then a good reply, then another transient failure. The screen
      // forgives ONE failure in a row and ends the call on two, so "not in a row" is a
      // distinct behaviour — and without this the reset that makes it true was untested.
      playAttempts += 1;
      const rejectThis = playRejects ||
        (Array.isArray(playRejectTurns) && playRejectTurns.includes(playAttempts));
      if (rejectThis) { const e = new Error("play() blocked"); e.name = "NotAllowedError"; throw e; }

      // A STREAM THAT OPENS AND THEN DELIVERS NOTHING. `play()` RESOLVES — so this is not a
      // rejection and not an error — and then no `ended`, no `error`, no `timeupdate` ever
      // arrives. Unreachable while the audio was a local blob; entirely reachable once the
      // player fetches a URL from a provider. Without a stall exit in the component the
      // call sits on «يتكلم…» forever, which no rejection-based option can reproduce.
      if (Array.isArray(playStallTurns) && playStallTurns.includes(playAttempts)) {
        log.played.push(this._src || this.url);
        this._paused = false;
        return; // resolves, and then nothing. Ever.
      }

      // STARTS, THEN STARVES — the harder half, and the one a stall-only option cannot
      // express. `playing` fires, the clock moves for a moment, and then the body stops
      // arriving: no more `timeupdate`, no `ended`, no `error`. For a proxied provider
      // stream behind a serverless function this is an ordinary failure, and a component
      // that latches "it started" on the first event calls that a delivered reply.
      if (playStarveMs != null) {
        log.played.push(this._src || this.url);
        this._paused = false;
        this.currentTime = 0;
        queueMicrotask(() => { if (!this._paused) this.onplaying?.(); });
        if (this._progress) clearInterval(this._progress);
        const startedAt = Date.now();
        this._progress = setInterval(() => {
          if (this._paused || Date.now() - startedAt >= playStarveMs) {
            clearInterval(this._progress); this._progress = null; return;
          }
          this.currentTime += 0.25;
          this.ontimeupdate?.();
        }, 250);
        return;
      }
      log.played.push(this._src || this.url);
      // REAL PLAYBACK TAKES TIME, and with `playbackMs: 0` this resolved on a microtask —
      // so nothing that happens DURING a reply could ever be observed. Barge-in is exactly
      // that: a watcher on the microphone while the audio plays. A stub that finishes
      // instantly reports "no interruption" for a component that never got the chance.
      this._paused = false;
      // A REAL ELEMENT REPORTS PROGRESS. `playing` on start and `timeupdate` roughly four
      // times a second is what a browser does, and the component now depends on it: the
      // stall exit re-arms on progress, so without these a genuinely playing reply looks
      // identical to a stream delivering nothing. Modelling only `ended` made the difference
      // between "playing" and "silent" invisible to every scenario in the suite.
      this.currentTime = 0;
      queueMicrotask(() => { if (!this._paused) this.onplaying?.(); });
      if (playbackMs > 0) {
        // Defensive: `play()` called twice without an intervening pause would otherwise
        // leave the first interval running, and it would advance the NEXT turn's clock.
        if (this._progress) clearInterval(this._progress);
        this._progress = setInterval(() => {
          if (this._paused) { clearInterval(this._progress); return; }
          this.currentTime += 0.25;
          this.ontimeupdate?.();
        }, 250);
        this._timer = setTimeout(() => {
          if (this._progress) { clearInterval(this._progress); this._progress = null; }
          if (!this._paused) this.onended?.();
        }, playbackMs);
      } else {
        queueMicrotask(() => this.onended?.());
      }
    }
    pause() {
      log.paused++;
      this._paused = true;
      if (this._timer) { clearTimeout(this._timer); this._timer = null; }
      if (this._progress) { clearInterval(this._progress); this._progress = null; }
    }
  };

  globalThis.fetch = async (url, init) => {
    if (String(url).includes("/api/demo/capabilities")) {
      log.capabilityRequests++;
      return { ok: true, status: 200, json: async () => ({ voiceCall: capabilities }) };
    }
    if (String(url).includes("/api/demo/voice")) {
      const fields = [];
      for (const [k, v] of init.body.entries()) fields.push([k, typeof v === "string" ? v : "<blob>"]);
      log.voiceRequests.push(fields);
      // A REAL SERVER TAKES TIME. Resolving instantly meant the component was never
      // observed in its "thinking" state, so a hangup DURING a request — the state a
      // visitor is most likely to hang up in, because it is the slowest — was untested.
      if (serverDelayMs) await new Promise((r) => setTimeout(r, serverDelayMs));
      const { status = 200, body = {} } = server ? server(log.voiceRequests.length) : {};
      return { ok: status >= 200 && status < 300, status, json: async () => body };
    }
    throw new Error(`unexpected fetch: ${url}`);
  };

  return log;
}

export { makeRuntime };
