// STT health readout proof — reporting only, no engine change.
// Run: node --import ./scripts/ts-ext-loader.mjs --experimental-strip-types scripts/proof-stt-health-readout.test.ts
import { readFileSync } from "node:fs";
import { readSttHealth } from "../lib/ai/stt/index.ts";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => {
  if (cond) pass++;
  else {
    fail++;
    console.log("  FAIL", name);
  }
};

const ENV_KEYS = [
  "NODE_ENV",
  "STT_ADAPTER",
  "OPENAI_API_KEY",
  "GROQ_API_KEY",
  "DEEPGRAM_API_KEY",
  "ENABLE_MOCK_STT",
  "AGENT_TIMEOUT_MS",
] as const;
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

function resetEnv() {
  for (const k of ENV_KEYS) {
    const v = saved[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

function clearSttEnv() {
  delete process.env.STT_ADAPTER;
  delete process.env.OPENAI_API_KEY;
  delete process.env.GROQ_API_KEY;
  delete process.env.DEEPGRAM_API_KEY;
  delete process.env.ENABLE_MOCK_STT;
  delete process.env.AGENT_TIMEOUT_MS;
}

try {
  clearSttEnv();
  process.env.NODE_ENV = "production";
  process.env.OPENAI_API_KEY = "sk-secret-health-proof";
  const prodUnset = readSttHealth();
  ok("production + unset STT_ADAPTER is loudly unverified even when a key would auto-resolve", prodUnset.status === "unverified");
  ok("production unset still reports the actual resolved adapter name only", prodUnset.adapterName === "openai");
  ok("production unset readout does not leak API key material", !JSON.stringify(prodUnset).includes("sk-secret-health-proof"));

  clearSttEnv();
  process.env.NODE_ENV = "production";
  process.env.STT_ADAPTER = "groq";
  process.env.GROQ_API_KEY = "gsk-secret-health-proof";
  process.env.AGENT_TIMEOUT_MS = "60000";
  const groq = readSttHealth();
  ok("explicit Groq with key is working", groq.adapterName === "groq" && groq.status === "working");
  ok("explicit Groq records that STT_ADAPTER was explicit", groq.explicitAdapter === true);
  ok("AI timeout safety reports working when AGENT_TIMEOUT_MS is positive", groq.aiTimeout.status === "working" && groq.aiTimeout.enabled === true);
  ok("Groq readout does not leak key material", !JSON.stringify(groq).includes("gsk-secret-health-proof"));

  clearSttEnv();
  process.env.NODE_ENV = "production";
  process.env.STT_ADAPTER = "openai";
  const openaiMissing = readSttHealth();
  ok("explicit OpenAI without key is not-configured", openaiMissing.adapterName === "openai" && openaiMissing.status === "not-configured");

  clearSttEnv();
  process.env.NODE_ENV = "production";
  process.env.STT_ADAPTER = "mock";
  process.env.ENABLE_MOCK_STT = "true";
  const mockOn = readSttHealth();
  ok("explicit mock with mock STT enabled is test-mode-on", mockOn.status === "test-mode-on");
  ok("pretend/test transcript mode reports ON only when mock transcripts can run", mockOn.mockTranscriptMode.status === "test-mode-on" && mockOn.mockTranscriptMode.enabled === true);

  clearSttEnv();
  process.env.NODE_ENV = "production";
  process.env.STT_ADAPTER = "deepgram";
  process.env.DEEPGRAM_API_KEY = "dg-secret-health-proof";
  process.env.AGENT_TIMEOUT_MS = "0";
  const deepgram = readSttHealth();
  ok("explicit Deepgram with key is working", deepgram.adapterName === "deepgram" && deepgram.status === "working");
  ok("AI timeout safety reports not-configured when AGENT_TIMEOUT_MS is absent/invalid", deepgram.aiTimeout.status === "not-configured" && deepgram.aiTimeout.enabled === false);
  ok("Deepgram readout does not leak key material", !JSON.stringify(deepgram).includes("dg-secret-health-proof"));

  const route = readFileSync("app/api/settings/whatsapp-health/route.ts", "utf8");
  ok("health route imports the STT readout", route.includes("readSttHealth"));
  ok("health route includes stt in the authenticated JSON response", /stt:\s*readSttHealth\(\)/.test(route));

  const page = readFileSync("app/(console-v2)/c/(app)/(manager)/settings/page.tsx", "utf8");
  ok("new console settings renders the STT health gauge", page.includes("SttHealthGauge") && page.includes("Speech-to-text service"));
  ok("new console settings renders production unverified loudly", page.includes("unverified") && page.includes("UNVERIFIED"));
} finally {
  resetEnv();
}

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} stt-health-readout: ${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
