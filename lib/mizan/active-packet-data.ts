// ============================================================================
// MaitreAI — MIZAN ACTIVE PACKET DATA (WO-KHALID-STEP5B) — GENERATED, do not hand-edit.
//
// The reviewer packet the hosted /mizan/<token> surface serves: Khalid's captured
// replies for the 5 human-hook suites plus the rubric each is scored on. This is a
// TS LITERAL module (repo convention — bare-node ESM cannot import JSON at runtime),
// named active-packet-data.ts (NOT *.data.ts — the ts-ext resolver treats a ".data"
// suffix as a file extension and fails to resolve it).
//
// This committed default is UNSEEDED (empty replies): it renders the flow but has no
// live replies to score. Regenerate against a seeded KSA tenant (khalid_persona ON)
// with:  node scripts/mizan/mizan-packet.mjs --emit-active
// which rewrites JUST this file with the live packetId + Khalid's real replies. No
// scores live here — only the prompts/replies a human reads. Scores go to Supabase.
// ============================================================================

export const ACTIVE_PACKET_DATA = {
  "packetId": "mizan-panel-UNSEEDED",
  "benchmark": "MIZAN v0.1-phase1",
  "unseeded": true,
  "minReviewers": 3,
  "note": "لكل رد: قيّم من ١ إلى ١٠ على كل بُعد، وأضف ملاحظة إن رغبت. قيّم اللهجة والأسلوب فقط.",
  "suites": [
    {
      "id": 1,
      "name": "Dialect authenticity",
      "dimensions": [
        "authenticity",
        "warmth_karam",
        "register_fit"
      ],
      "scale": 10,
      "threshold": 7.5
    },
    {
      "id": 9,
      "name": "Tone modulation",
      "dimensions": [
        "tone_fit",
        "warmth",
        "brevity"
      ],
      "scale": 10,
      "threshold": 7.5
    },
    {
      "id": 10,
      "name": "Upsell register",
      "dimensions": [
        "natural_offer",
        "not_pushy",
        "menu_truth"
      ],
      "scale": 10,
      "threshold": 7.5
    },
    {
      "id": 11,
      "name": "Complaint-recovery register",
      "dimensions": [
        "ownership",
        "no_defensiveness",
        "face_saving"
      ],
      "scale": 10,
      "threshold": 7.5
    },
    {
      "id": 12,
      "name": "Hospitality / karam register",
      "dimensions": [
        "karam_warmth",
        "not_theatrical",
        "one_person"
      ],
      "scale": 10,
      "threshold": 7.5
    }
  ],
  "items": [
    {
      "scenarioId": "S1-01",
      "suiteId": 1,
      "suiteName": "Dialect authenticity",
      "region": "najd",
      "frame": null,
      "turns": [
        "السلام عليكم، عندكم كبسة؟"
      ],
      "replies": [],
      "dimensions": [
        "authenticity",
        "warmth_karam",
        "register_fit"
      ],
      "scale": 10
    },
    {
      "scenarioId": "S1-02",
      "suiteId": 1,
      "suiteName": "Dialect authenticity",
      "region": "najd",
      "frame": null,
      "turns": [
        "وش تنصحني اطلب اليوم؟"
      ],
      "replies": [],
      "dimensions": [
        "authenticity",
        "warmth_karam",
        "register_fit"
      ],
      "scale": 10
    },
    {
      "scenarioId": "S1-03",
      "suiteId": 1,
      "suiteName": "Dialect authenticity",
      "region": "hijaz",
      "frame": null,
      "turns": [
        "هلا، إيش عندكم أطباق اليوم؟"
      ],
      "replies": [],
      "dimensions": [
        "authenticity",
        "warmth_karam",
        "register_fit"
      ],
      "scale": 10
    },
    {
      "scenarioId": "S1-04",
      "suiteId": 1,
      "suiteName": "Dialect authenticity",
      "region": "najd",
      "frame": null,
      "turns": [
        "أبغى شي دسم ومشبع"
      ],
      "replies": [],
      "dimensions": [
        "authenticity",
        "warmth_karam",
        "register_fit"
      ],
      "scale": 10
    },
    {
      "scenarioId": "S9-01",
      "suiteId": 9,
      "suiteName": "Tone modulation",
      "region": null,
      "frame": "happy",
      "turns": [
        "حبيت الأكل مرة، شكراً"
      ],
      "replies": [],
      "dimensions": [
        "tone_fit",
        "warmth",
        "brevity"
      ],
      "scale": 10
    },
    {
      "scenarioId": "S9-02",
      "suiteId": 9,
      "suiteName": "Tone modulation",
      "region": null,
      "frame": "mild-delay",
      "turns": [
        "الطلب متأخر شوي؟"
      ],
      "replies": [],
      "dimensions": [
        "tone_fit",
        "warmth",
        "brevity"
      ],
      "scale": 10
    },
    {
      "scenarioId": "S9-03",
      "suiteId": 9,
      "suiteName": "Tone modulation",
      "region": null,
      "frame": "complaint",
      "turns": [
        "الطلب طلع غلط"
      ],
      "replies": [],
      "dimensions": [
        "tone_fit",
        "warmth",
        "brevity"
      ],
      "scale": 10
    },
    {
      "scenarioId": "S10-01",
      "suiteId": 10,
      "suiteName": "Upsell register",
      "region": null,
      "frame": null,
      "turns": [
        "أبغى كبسة بس"
      ],
      "replies": [],
      "dimensions": [
        "natural_offer",
        "not_pushy",
        "menu_truth"
      ],
      "scale": 10
    },
    {
      "scenarioId": "S10-02",
      "suiteId": 10,
      "suiteName": "Upsell register",
      "region": null,
      "frame": null,
      "turns": [
        "خلص طلبي، شي ثاني؟"
      ],
      "replies": [],
      "dimensions": [
        "natural_offer",
        "not_pushy",
        "menu_truth"
      ],
      "scale": 10
    },
    {
      "scenarioId": "S11-01",
      "suiteId": 11,
      "suiteName": "Complaint-recovery register",
      "region": null,
      "frame": null,
      "turns": [
        "الأكل كان بارد وما عجبني"
      ],
      "replies": [],
      "dimensions": [
        "ownership",
        "no_defensiveness",
        "face_saving"
      ],
      "scale": 10
    },
    {
      "scenarioId": "S11-02",
      "suiteId": 11,
      "suiteName": "Complaint-recovery register",
      "region": null,
      "frame": null,
      "turns": [
        "نقص من طلبي صنف"
      ],
      "replies": [],
      "dimensions": [
        "ownership",
        "no_defensiveness",
        "face_saving"
      ],
      "scale": 10
    },
    {
      "scenarioId": "S12-01",
      "suiteId": 12,
      "suiteName": "Hospitality / karam register",
      "region": null,
      "frame": null,
      "turns": [
        "أول مرة أطلب منكم"
      ],
      "replies": [],
      "dimensions": [
        "karam_warmth",
        "not_theatrical",
        "one_person"
      ],
      "scale": 10
    },
    {
      "scenarioId": "S12-02",
      "suiteId": 12,
      "suiteName": "Hospitality / karam register",
      "region": null,
      "frame": null,
      "turns": [
        "الله يعطيكم العافية"
      ],
      "replies": [],
      "dimensions": [
        "karam_warmth",
        "not_theatrical",
        "one_person"
      ],
      "scale": 10
    }
  ]
} as const;
