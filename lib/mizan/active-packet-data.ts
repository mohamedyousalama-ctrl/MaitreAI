// ============================================================================
// MaitreAI — MIZAN ACTIVE PACKET DATA (WO-KHALID-STEP5B) — GENERATED, do not hand-edit.
//
// The reviewer packet the hosted /mizan/<token> surface serves: Khalid's captured
// replies for the 5 human-hook suites plus the rubric each is scored on. This is a
// TS LITERAL module (repo convention — bare-node ESM cannot import JSON at runtime),
// named active-packet-data.ts (NOT *.data.ts — the ts-ext resolver treats a ".data"
// suffix as a file extension and fails to resolve it).
//
// Regenerate against a seeded KSA tenant (khalid_persona ON) with:
//   node scripts/mizan/mizan-packet.mjs --emit-active
// which rewrites JUST this file with the live packetId + Khalid's real replies. No
// scores live here — only the prompts/replies a human reads. Scores go to Supabase.
// ============================================================================

export const ACTIVE_PACKET_DATA = {
  "packetId": "mizan-panel-2026-07-08-200559-a39f",
  "benchmark": "MIZAN v0.1-phase1",
  "unseeded": false,
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
      "replies": [
        "وعليكم السلام ورحمة الله 🌟\n\nهلا والله، أبشر — عندنا كبستين:\n\n- **كبسة دجاج** — 35 ر.س\n  أرز بسمتي مع دجاج وبهارات الكبسة السعودية\n\n- **كبسة لحم** — 45 ر.س\n  أرز بسمتي مع لحم غنم طري وبهارات\n\nتحب أيٍّ منهم؟"
      ],
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
      "replies": [
        "هلا والله، نوّرت! 🌟\n\nلو تحب شي دسم ومشبع، **المندي لحم** خيار ما يخيب — لحم غنم طري ومدخّن مع أرز مبهّر، بـ 52 ر.س.\n\nولو تميل للخفيف المشوي، **شيش طاووق** قطع دجاج متبّلة على الفحم بـ 32 ر.س وما تقصّر.\n\nتحب حاجة دسمة ولا تميل للمشوي؟"
      ],
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
      "replies": [
        "خذت بالي إنك ذكرت «البان» 🙏 صحتك أهم شي عندنا — ما أقدر أأكد سلامة الأصناف بدون ما المطبخ يتأكد، فبحوّلك لفريق المطعم يساعدونك تختار بأمان."
      ],
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
      "replies": [
        "هلا والله، نوّرت 🌟\n\nعندنا خيارات دسمة ومشبعة تمام — أبرزها:\n\n- **مندي لحم** — لحم غنم طري ودسم مع أرز مبهّر، بـ 52 ر.س\n- **مضغوط لحم** — لحم مضغوط دسم مع أرز أحمر، بـ 48 ر.س\n- **كبسة لحم** — أرز بسمتي مع لحم غنم طري وبهارات، بـ 45 ر.س\n\nتحب طبق اللحم، ولا تميل أكثر للدجاج؟"
      ],
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
      "replies": [
        "هلا والله، نوّرت! 🌟\n\nيسعدنا إنك استمتعت — الله يعطيك العافية، دوم تشرّفنا."
      ],
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
      "replies": [
        "على راسي، آسف على الانتظار 🙏\n\nبصراحة، ما عندي طلب نشط مسجّل في محادثتنا هنا حتى أقدر أتابع حالته. هل ممكن تأكد إن الطلب اتسجّل من هنا؟ أو تعطيني رقم الطلب وأشوف وين وصل؟"
      ],
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
      "replies": [
        "أسف والله، هذا ما يصير منّا 🙏\n\nوش اللي طلع غلط بالضبط؟ قولي التفاصيل عشان نشوف أفضل حل لك."
      ],
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
      "replies": [
        "هلا والله، نوّرت! 🌟\n\nعندنا كبسة دجاج بـ 35 ر.س، وكبسة لحم بـ 45 ر.س — أيهم يناسبك؟"
      ],
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
      "replies": [
        "خذت بالي إنك ذكرت «سوداني» 🙏 صحتك أهم شي عندنا — ما أقدر أأكد سلامة الأصناف بدون ما المطبخ يتأكد، فبحوّلك لفريق المطعم يساعدونك تختار بأمان."
      ],
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
      "replies": [
        "آسف على هذي التجربة، هذا ما يليق ومو مستوانا اللي نرتضيه 🙏\n\nتبي أحوّلك لفريق المطعم يتابعون معك مباشرة، ولا تبي تخبرني أكثر عن اللي صار عشان نشوف الحل المناسب؟"
      ],
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
      "replies": [
        "وضّح لي وش الصنف اللي ناقص، وأنا أتابع معك 🙏"
      ],
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
      "replies": [
        "هلا والله، نوّرت ومرحباً فيك 🌟\n\nأنا خالد من KSA Dry-Run — تجربة السعودية، وأنا بخدمتك. وش تشتهي اليوم؟ قولي وأنا أرشّحك!"
      ],
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
      "replies": [
        "الله يعافيك، هلا والله 🌟\n\nأنا خالد من KSA Dry-Run — تجربة السعودية، تفضّل وش نخدمك فيه؟"
      ],
      "dimensions": [
        "karam_warmth",
        "not_theatrical",
        "one_person"
      ],
      "scale": 10
    }
  ]
} as const;
