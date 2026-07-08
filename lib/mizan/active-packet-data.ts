// ============================================================================
// MaitreAI — MIZAN ACTIVE PACKET DATA (WO-MIZAN-VOICE) — GENERATED, do not hand-edit.
//
// Khalid's captured replies (text) PLUS a production-voice (ElevenLabs EL-custom-A,
// model eleven_flash_v2_5) mp3 rendering of each — audioUrl per item, hosted in the public
// mizan-khalid-audio bucket under unguessable names. Reviewers score text AND voice
// (the added spoken_dialect dimension). A final voice_compare item renders one greeting
// in 3 candidate voices for the "which sounds most Saudi?" pick. Regenerate with:
//   node scripts/mizan/mizan-voice.mjs   (see the header there).
// ============================================================================

export const ACTIVE_PACKET_DATA = {
  "packetId": "mizan-panel-2026-07-08-210945-b5db",
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
  "voiceModel": "eleven_flash_v2_5",
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
        "register_fit",
        "spoken_dialect"
      ],
      "scale": 10,
      "audioUrl": "https://zlighrbsjexrozrmuwpw.supabase.co/storage/v1/object/public/mizan-khalid-audio/k/e416e7d9b0057364d7b45c124453af43.mp3"
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
        "register_fit",
        "spoken_dialect"
      ],
      "scale": 10,
      "audioUrl": "https://zlighrbsjexrozrmuwpw.supabase.co/storage/v1/object/public/mizan-khalid-audio/k/03308987f80b527d65780857af102b55.mp3"
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
        "register_fit",
        "spoken_dialect"
      ],
      "scale": 10,
      "audioUrl": "https://zlighrbsjexrozrmuwpw.supabase.co/storage/v1/object/public/mizan-khalid-audio/k/4f0b6f1c540db32c95b852fb6c6bfb2b.mp3"
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
        "register_fit",
        "spoken_dialect"
      ],
      "scale": 10,
      "audioUrl": "https://zlighrbsjexrozrmuwpw.supabase.co/storage/v1/object/public/mizan-khalid-audio/k/ed6abd1648bc36b191576e0ca12ee81e.mp3"
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
        "brevity",
        "spoken_dialect"
      ],
      "scale": 10,
      "audioUrl": "https://zlighrbsjexrozrmuwpw.supabase.co/storage/v1/object/public/mizan-khalid-audio/k/c56a94b17340ebcc8e556c76cad9651a.mp3"
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
        "brevity",
        "spoken_dialect"
      ],
      "scale": 10,
      "audioUrl": "https://zlighrbsjexrozrmuwpw.supabase.co/storage/v1/object/public/mizan-khalid-audio/k/e9698b44f060f052e2ef4937184408e5.mp3"
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
        "brevity",
        "spoken_dialect"
      ],
      "scale": 10,
      "audioUrl": "https://zlighrbsjexrozrmuwpw.supabase.co/storage/v1/object/public/mizan-khalid-audio/k/35ae97cf05e5ef5bfd561ab356f70615.mp3"
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
        "menu_truth",
        "spoken_dialect"
      ],
      "scale": 10,
      "audioUrl": "https://zlighrbsjexrozrmuwpw.supabase.co/storage/v1/object/public/mizan-khalid-audio/k/034940c3c60f8dcd2cc177f2cc7b63e8.mp3"
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
        "menu_truth",
        "spoken_dialect"
      ],
      "scale": 10,
      "audioUrl": "https://zlighrbsjexrozrmuwpw.supabase.co/storage/v1/object/public/mizan-khalid-audio/k/3318ebd377758c95964edf7072eb2014.mp3"
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
        "face_saving",
        "spoken_dialect"
      ],
      "scale": 10,
      "audioUrl": "https://zlighrbsjexrozrmuwpw.supabase.co/storage/v1/object/public/mizan-khalid-audio/k/4f7f2abe63e77145b74145a0af7b32a9.mp3"
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
        "face_saving",
        "spoken_dialect"
      ],
      "scale": 10,
      "audioUrl": "https://zlighrbsjexrozrmuwpw.supabase.co/storage/v1/object/public/mizan-khalid-audio/k/a7fb2682b7f40577548caaa823c8a39f.mp3"
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
        "one_person",
        "spoken_dialect"
      ],
      "scale": 10,
      "audioUrl": "https://zlighrbsjexrozrmuwpw.supabase.co/storage/v1/object/public/mizan-khalid-audio/k/221ff807f946615f45d846adba4ec61d.mp3"
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
        "one_person",
        "spoken_dialect"
      ],
      "scale": 10,
      "audioUrl": "https://zlighrbsjexrozrmuwpw.supabase.co/storage/v1/object/public/mizan-khalid-audio/k/7fb3d70d9729309aed252bac3acec3f3.mp3"
    },
    {
      "scenarioId": "VOICE-COMPARE",
      "suiteId": 0,
      "suiteName": "اختيار الصوت الأنسب",
      "kind": "voice_compare",
      "region": null,
      "frame": null,
      "turns": [],
      "replies": [],
      "prompt": "أي صوت يحس سعودي أكثر؟",
      "compareText": "هلا والله، نوّرت! 🌟\n\nيسعدنا إنك استمتعت — الله يعطيك العافية، دوم تشرّفنا.",
      "voiceClips": [
        "https://zlighrbsjexrozrmuwpw.supabase.co/storage/v1/object/public/mizan-khalid-audio/c/900ab9fa109a30fa6d8bbd211e30e383.mp3",
        "https://zlighrbsjexrozrmuwpw.supabase.co/storage/v1/object/public/mizan-khalid-audio/c/ed5ac16769913b9f78614e89f9ded950.mp3",
        "https://zlighrbsjexrozrmuwpw.supabase.co/storage/v1/object/public/mizan-khalid-audio/c/65a5e2e13e4537644f9d321258b54686.mp3"
      ],
      "dimensions": [
        "voice_pick"
      ],
      "scale": 3
    }
  ]
} as const;
