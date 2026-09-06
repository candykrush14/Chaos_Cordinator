/* ---------------------------------------------------------------------------
 * Deterministic journal analyser for Discover Me.
 *
 * Runs when Gemini is unavailable (no API key, quota exhausted, or an
 * unparseable response). Everything it returns is derived from the user's
 * actual entries - lexicon hit-rates over the real text, category mix, recency
 * and cadence - so two different journals never produce the same report.
 * ------------------------------------------------------------------------- */

export interface DiscoverEntry {
  title?: string;
  category?: string;
  createdAt?: string;
  excerpt?: string;
  messagesCount?: number;
}

interface Lexicon {
  name: string;
  color: string;
  words: string[];
}

const POSITIVE_FAMILIES: Lexicon[] = [
  {
    name: "Gratitude",
    color: "#10b981",
    words: ["grateful", "gratitude", "thankful", "thanks", "appreciate", "appreciation", "blessed", "lucky", "gift", "joy", "joyful", "delight", "cherish", "warmth", "glad"],
  },
  {
    name: "Inner Calm",
    color: "#3b82f6",
    // "still" is deliberately excluded - it's far more often the adverb
    // ("still tired") than the calm sense, and it poisoned the score.
    words: ["calm", "peace", "peaceful", "quiet", "stillness", "breathe", "breathing", "relaxed", "relax", "settled", "ease", "serene", "grounded", "rest", "restful"],
  },
  {
    name: "Hope & Optimism",
    color: "#f59e0b",
    words: ["hope", "hopeful", "excited", "excitement", "optimistic", "better", "improve", "improving", "progress", "opportunity", "possibility", "future", "looking forward", "forward to"],
  },
  {
    name: "Self-Compassion",
    color: "#8b5cf6",
    words: ["forgive", "gentle", "patience", "patient", "enough", "proud", "deserve", "self-care", "compassion", "kind to myself", "allow myself", "let myself"],
  },
  {
    name: "Mental Clarity",
    color: "#06b6d4",
    words: ["clear", "clarity", "focus", "focused", "understand", "understood", "realise", "realize", "realised", "realized", "figured", "insight", "decided", "decision", "perspective"],
  },
];

const STRAIN_WORDS = ["stress", "stressed", "stressful", "anxious", "anxiety", "overwhelm", "overwhelmed", "pressure", "deadline", "panic", "worried", "worry", "tense", "burnout", "dread", "frustrated", "angry", "sad", "lonely", "alone", "empty", "hurt", "grief", "crying", "hopeless", "numb", "lost", "disappointed", "regret", "exhausted", "drained"];

const SLEEP_WORDS = ["sleep", "slept", "asleep", "insomnia", "awake", "nap", "bed", "tired", "exhausted", "drained", "fatigue", "restless"];
const SLEEP_NEGATIVE = ["insomnia", "awake", "tired", "exhausted", "drained", "fatigue", "restless"];
const VITALITY_WORDS = ["walk", "walked", "walking", "run", "running", "gym", "exercise", "workout", "yoga", "cycle", "cycling", "swim", "hike", "stretch", "movement", "energy", "outside", "sunlight"];
const CONNECTION_WORDS = ["friend", "friends", "family", "mum", "mom", "dad", "partner", "wife", "husband", "brother", "sister", "call", "called", "together", "talked", "talking", "dinner", "conversation", "love", "team", "colleague"];

const STOPWORDS = new Set(["the", "and", "that", "have", "for", "not", "with", "you", "this", "but", "his", "her", "they", "from", "been", "was", "were", "are", "its", "just", "really", "very", "about", "would", "could", "should", "there", "their", "them", "then", "than", "what", "when", "which", "because", "some", "more", "much", "like", "feel", "feeling", "felt", "today", "day", "time", "think", "thought", "know", "going", "get", "got", "one", "also", "still", "even", "being", "into", "over", "after", "before", "doing", "done", "make", "made", "want", "need", "things", "thing", "something", "anything", "myself", "around", "little", "lot", "bit", "way", "back", "how", "why", "who", "all", "out", "own", "too", "any", "our", "use", "new", "will", "with"]);

function clampNum(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function escapeRe(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Hits per 100 words, so a long journal isn't automatically "more emotional". */
function density(text: string, words: string[], totalWords: number): number {
  if (!text || totalWords === 0) return 0;
  let hits = 0;
  for (const word of words) {
    const matches = text.match(new RegExp(`(^|[^a-z])${escapeRe(word)}([^a-z]|$)`, "gi"));
    if (matches) hits += matches.length;
  }
  return hits / Math.max(totalWords / 100, 1);
}

type Tendency = "increasing" | "steady" | "decreasing";

function tendencyFor(recent: number, older: number): Tendency {
  if (older === 0 && recent === 0) return "steady";
  if (recent > older * 1.2 + 0.05) return "increasing";
  if (recent < older * 0.8 - 0.05) return "decreasing";
  return "steady";
}

/** Words the user repeats - the actual subjects on their mind. */
function topThemes(text: string, limit = 4): string[] {
  const counts = new Map<string, number>();
  for (const raw of text.toLowerCase().match(/[a-z']{4,}/g) || []) {
    if (STOPWORDS.has(raw)) continue;
    counts.set(raw, (counts.get(raw) || 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}

function listPhrase(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function emptyReport(previousIndex: number | null) {
  return {
    emotionGist:
      "Welcome to Discover Me. There aren't any reflections to read yet, so there's nothing to interpret - and that's a perfectly good starting point. Once you write a few entries, this space will trace the emotional threads running through them, track how your happiness index shifts, and offer guidance grounded in what you actually wrote.",
    primaryMood: "Ready to Begin",
    secondaryMood: "Open & Curious",
    emotions: POSITIVE_FAMILIES.map((f) => ({
      name: f.name,
      score: 50,
      color: f.color,
      tendency: "steady" as Tendency,
      description: "No entries yet - this fills in as you write.",
    })),
    therapyMessage: {
      title: "A Blank First Page",
      content:
        "Starting a journal is its own small act of self-respect. You don't need the right words or a tidy narrative - a few honest sentences about how today actually went is enough for patterns to start showing through.\n\nWrite for yourself, not for an audience. This report only ever reflects back what you put in.",
      dailyMotivation:
        "Write three sentences today about how you're actually doing. Not how you should be doing - how you are.",
      mindfulAffirmation: "I begin where I am, and that is enough.",
    },
    happinessIndex: 60,
    happinessDelta: previousIndex !== null ? 60 - previousIndex : 0,
    happinessTrend: "steady",
    pointsAwarded: 10,
    healthyLivingPillars: [
      { id: "sleep", title: "Sleep & Restorative Recovery", score: 50, status: "balanced", insight: "No sleep signals in your journal yet.", action: "Note how you slept in tonight's entry - it's the fastest signal to start tracking." },
      { id: "vitality", title: "Physical Vitality & Movement", score: 50, status: "balanced", insight: "No movement signals recorded yet.", action: "Mention any walking or movement you did today, however small." },
      { id: "mindfulness", title: "Mindful Clarity & Focus", score: 50, status: "balanced", insight: "Clarity emerges once there's writing to look back on.", action: "Write one paragraph without editing yourself." },
      { id: "connection", title: "Social Connection & Empathy", score: 50, status: "balanced", insight: "No social moments captured yet.", action: "Note one person you spoke to today and how it felt." },
    ],
    dailyNudges: [
      { id: "nudge-1", text: "Write your first reflection, even three sentences", completed: false, points: 15, category: "mindfulness" },
      { id: "nudge-2", text: "Step outside for five minutes of fresh air", completed: false, points: 10, category: "vitality" },
      { id: "nudge-3", text: "Note one thing that went better than expected today", completed: false, points: 10, category: "mindfulness" },
    ],
  };
}

export function generateDeterministicDiscoverAnalysis(
  entries: DiscoverEntry[],
  previousIndex: number | null
) {
  const list = Array.isArray(entries) ? entries : [];
  if (list.length === 0) return emptyReport(previousIndex);

  // ---- Corpus built from what the user actually wrote ----------------------
  const sorted = [...list].sort((a, b) =>
    String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
  );
  const textOf = (e: DiscoverEntry) => `${e.title || ""} ${e.excerpt || ""}`.toLowerCase();
  const allText = sorted.map(textOf).join(" ");
  const totalWords = (allText.match(/[a-z']+/g) || []).length;

  const half = Math.max(1, Math.ceil(sorted.length / 2));
  const recentText = sorted.slice(0, half).map(textOf).join(" ");
  const olderText = sorted.slice(half).map(textOf).join(" ");
  const recentWords = (recentText.match(/[a-z']+/g) || []).length;
  const olderWords = (olderText.match(/[a-z']+/g) || []).length;

  const categories = sorted.map((e) => String(e.category || "personal"));
  const countCat = (name: string) => categories.filter((c) => c === name).length;
  const gratitudeCount = countCat("gratitude");
  const mindfulnessCount = countCat("mindfulness");
  const workCount = countCat("work");
  const dominantCategory = [...new Set(categories)]
    .map((c) => ({ c, n: countCat(c) }))
    .sort((a, b) => b.n - a.n)[0];

  // ---- Emotion families ----------------------------------------------------
  const emotions = POSITIVE_FAMILIES.map((family) => {
    const d = density(allText, family.words, totalWords);
    const recentD = density(recentText, family.words, recentWords);
    const olderD = density(olderText, family.words, olderWords);

    let categoryBoost = 0;
    if (family.name === "Gratitude") categoryBoost = gratitudeCount * 6;
    if (family.name === "Inner Calm") categoryBoost = mindfulnessCount * 6;
    if (family.name === "Mental Clarity") categoryBoost = workCount > 2 ? -6 : 4;

    return {
      name: family.name,
      score: clampNum(36 + d * 22 + categoryBoost, 12, 96),
      color: family.color,
      tendency: olderWords === 0 ? ("steady" as Tendency) : tendencyFor(recentD, olderD),
      description:
        d >= 1.2
          ? "A strong, recurring thread through your entries."
          : d >= 0.4
          ? "Present in your writing, though not dominant."
          : "Rarely surfaces in what you've written lately.",
    };
  });

  const strainDensity = density(allText, STRAIN_WORDS, totalWords);
  emotions.push({
    name: "Mental Load",
    score: clampNum(18 + strainDensity * 26, 5, 95),
    color: "#ef4444",
    tendency:
      olderWords === 0
        ? ("steady" as Tendency)
        : tendencyFor(
            density(recentText, STRAIN_WORDS, recentWords),
            density(olderText, STRAIN_WORDS, olderWords)
          ),
    description:
      strainDensity >= 1
        ? "Pressure and worry show up often - worth naming directly."
        : strainDensity >= 0.3
        ? "Some strain surfaces, at a manageable level."
        : "Very little pressure language in your entries.",
  });

  const positiveAvg = emotions.slice(0, 5).reduce((sum, e) => sum + e.score, 0) / 5;

  // ---- Cadence & recency ---------------------------------------------------
  const now = Date.now();
  const dayMs = 86400000;
  const dates = sorted.map((e) => Date.parse(e.createdAt || "")).filter((n) => Number.isFinite(n));
  const entriesLastWeek = dates.filter((t) => now - t <= 7 * dayMs).length;
  const daysSinceLast = dates.length ? Math.max(0, Math.floor((now - Math.max(...dates)) / dayMs)) : 0;
  const spanDays =
    dates.length > 1 ? Math.max(1, Math.round((Math.max(...dates) - Math.min(...dates)) / dayMs)) : 1;

  // ---- Happiness index -----------------------------------------------------
  const happinessIndex = clampNum(
    positiveAvg * 0.72 -
      strainDensity * 8 +
      entriesLastWeek * 1.6 +
      (gratitudeCount + mindfulnessCount) * 1.5 +
      14,
    22,
    96
  );
  const delta = previousIndex !== null ? happinessIndex - previousIndex : 0;
  const happinessTrend =
    previousIndex === null
      ? "steady"
      : delta >= 4
      ? "improving"
      : delta <= -4
      ? "dipping"
      : Math.abs(delta) >= 2
      ? "fluctuating"
      : "steady";
  const pointsAwarded = clampNum(12 + (delta > 0 ? delta * 3 : 0) + entriesLastWeek * 2, 10, 50);

  // ---- Moods ---------------------------------------------------------------
  const ranked = emotions.slice(0, 5).sort((a, b) => b.score - a.score);
  const strongest = ranked[0];
  const second = ranked[1];
  const MOOD_LABEL: Record<string, string> = {
    Gratitude: "Grateful & Grounded",
    "Inner Calm": "Mindfully Present",
    "Hope & Optimism": "Quietly Hopeful",
    "Self-Compassion": "Gentle With Yourself",
    "Mental Clarity": "Clear & Deliberate",
  };
  const primaryMood =
    strainDensity >= 1.4 ? "Carrying A Lot" : MOOD_LABEL[strongest.name] || "Thoughtfully Contemplative";
  const secondaryMood = (second && MOOD_LABEL[second.name]) || "Reflective";

  // ---- Gist, written from observed signals ---------------------------------
  const themes = topThemes(allText);
  const themeLine = themes.length
    ? `The words that keep returning are ${listPhrase(themes)} - those are the threads your mind is working on right now.`
    : "Your entries are varied enough that no single subject dominates yet.";
  const cadenceLine =
    entriesLastWeek >= 4
      ? `You've written ${entriesLastWeek} times in the past week, which is a genuinely consistent practice.`
      : entriesLastWeek >= 1
      ? `You've written ${entriesLastWeek} time${entriesLastWeek === 1 ? "" : "s"} in the past week.`
      : `It's been about ${daysSinceLast} day${daysSinceLast === 1 ? "" : "s"} since your last entry.`;

  const emotionGist = [
    `Across ${sorted.length} reflection${sorted.length === 1 ? "" : "s"} spanning roughly ${spanDays} day${spanDays === 1 ? "" : "s"}, your writing reads as ${primaryMood.toLowerCase()}. ${strongest.name} is the clearest signal at ${strongest.score}/100${second ? `, with ${second.name.toLowerCase()} close behind` : ""}.${dominantCategory ? ` Most of what you write sits under ${dominantCategory.c}.` : ""}`,
    themeLine,
    strainDensity >= 1
      ? `There's a real amount of pressure language here too - stress and worry appear often enough to be worth naming rather than pushing past. ${cadenceLine}`
      : strainDensity >= 0.3
      ? `Some strain surfaces, but it sits alongside steadier material rather than dominating it. ${cadenceLine}`
      : `Notably, there's very little pressure or worry language - your entries read as relatively settled. ${cadenceLine}`,
  ].join("\n\n");

  // ---- Therapy message, chosen by the dominant signal -----------------------
  const therapyMessage =
    strainDensity >= 1
      ? {
          title: "Putting Some Of It Down",
          content: `Your entries carry a real weight of pressure at the moment${themes.length ? `, much of it circling ${listPhrase(themes.slice(0, 2))}` : ""}. Naming that on the page is not a small thing - externalising a worry is one of the better-evidenced ways to stop it looping.\n\nYou don't have to resolve all of it at once. Notice that ${strongest.name.toLowerCase()} still shows up at ${strongest.score}/100 even under load. That's the part of you still keeping perspective while the rest feels heavy.`,
          dailyMotivation:
            "Pick the single heaviest thing on your list and give it twenty honest minutes today. Not the whole thing - twenty minutes. Momentum beats magnitude.",
          mindfulAffirmation: "I can hold difficulty without being defined by it.",
        }
      : strongest.name === "Gratitude"
      ? {
          title: "The Habit Of Noticing",
          content: `Gratitude runs strongly through your writing at ${strongest.score}/100, and it doesn't read as forced - you're noticing specific things rather than performing positivity. That distinction matters; specific appreciation is what actually shifts baseline mood over time.\n\n${themes.length ? `The recurring presence of ${listPhrase(themes.slice(0, 2))} suggests where your attention naturally rests. ` : ""}Keep letting it rest there.`,
          dailyMotivation:
            "Name one specific thing today - not a category, a moment. The specificity is what makes it land.",
          mindfulAffirmation: "I notice what is already good, and it is genuinely mine.",
        }
      : {
          title: "Steady Ground",
          content: `Your entries read as measured and self-aware. ${strongest.name} leads at ${strongest.score}/100, and there's little pressure language pulling against it.\n\n${cadenceLine} Consistency matters more than intensity here - a short honest entry beats a long performed one, and it's the pattern across ${sorted.length} reflection${sorted.length === 1 ? "" : "s"} that this report can actually read.`,
          dailyMotivation:
            "Protect one small pocket of today for something that isn't productive. You've earned the room.",
          mindfulAffirmation: "I meet this day with steady breath and an open mind.",
        };

  // ---- Healthy living pillars, from real signals ---------------------------
  const sleepNeg = density(allText, SLEEP_NEGATIVE, totalWords);
  const sleepMention = density(allText, SLEEP_WORDS, totalWords);
  const vitality = density(allText, VITALITY_WORDS, totalWords);
  const connection = density(allText, CONNECTION_WORDS, totalWords);
  const calmScore = emotions.find((e) => e.name === "Inner Calm")?.score ?? 50;
  const clarityScore = emotions.find((e) => e.name === "Mental Clarity")?.score ?? 50;

  const sleepScore = clampNum(72 - sleepNeg * 22 - strainDensity * 6, 15, 96);
  const vitalityScore = clampNum(48 + vitality * 20 - strainDensity * 4, 15, 96);
  const mindfulnessScore = clampNum((calmScore + clarityScore) / 2, 15, 96);
  const connectionScore = clampNum(46 + connection * 18, 15, 96);
  const statusFor = (n: number) => (n >= 75 ? "thriving" : n >= 55 ? "balanced" : "needs_attention");

  const healthyLivingPillars = [
    {
      id: "sleep",
      title: "Sleep & Restorative Recovery",
      score: sleepScore,
      status: statusFor(sleepScore),
      insight:
        sleepNeg >= 0.5
          ? "Tiredness and poor rest come up repeatedly in your entries."
          : sleepMention >= 0.3
          ? "You mention rest without much complaint - a reasonable sign."
          : "Sleep barely features in your writing, which usually means it isn't troubling you.",
      action:
        sleepNeg >= 0.5
          ? "Set a wind-down alarm 45 minutes before bed, and write tomorrow's first task down so your mind can release it."
          : "Keep the wind-down consistent - dim lights and no screens for the last 20 minutes.",
    },
    {
      id: "vitality",
      title: "Physical Vitality & Movement",
      score: vitalityScore,
      status: statusFor(vitalityScore),
      insight:
        vitality >= 0.5
          ? "Movement shows up regularly in your entries - it's clearly part of your rhythm."
          : "Very little movement language appears in your writing.",
      action:
        vitality >= 0.5
          ? "Keep it going, and note afterwards how it changed your mood - the link compounds once you can see it."
          : "Take one unhurried 10-minute walk outdoors today and mention it in tonight's entry.",
    },
    {
      id: "mindfulness",
      title: "Mindful Clarity & Focus",
      score: mindfulnessScore,
      status: statusFor(mindfulnessScore),
      insight:
        mindfulnessScore >= 70
          ? "Your writing is clear-headed - you're processing rather than just venting."
          : "Your entries read as somewhat scattered, which is normal under load.",
      action:
        "Before your next entry, take three slow exhalations and name the single feeling that's loudest.",
    },
    {
      id: "connection",
      title: "Social Connection & Empathy",
      score: connectionScore,
      status: statusFor(connectionScore),
      insight:
        connection >= 0.5
          ? "Other people feature meaningfully in your reflections."
          : "Your entries are mostly inward-facing, with few other people in them.",
      action:
        connection >= 0.5
          ? "Tell one of those people something you appreciated about them this week."
          : "Send one unprompted message to someone you've been meaning to reach.",
    },
  ];

  // ---- Nudges, prioritised by the weakest pillars --------------------------
  const NUDGE_POOL: Record<string, { text: string; points: number; category: string }> = {
    sleep: { text: "Put screens away 20 minutes before bed tonight", points: 15, category: "rest" },
    vitality: { text: "Take a 10-minute walk outdoors in daylight", points: 15, category: "vitality" },
    mindfulness: { text: "Do a 60-second sensory check-in: 3 sights, 2 sounds, 1 sensation", points: 10, category: "mindfulness" },
    connection: { text: "Send one warm, unprompted message to someone you value", points: 15, category: "connection" },
  };

  const dailyNudges = [...healthyLivingPillars]
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map((pillar, idx) => ({
      id: `nudge-${idx + 1}`,
      text: NUDGE_POOL[pillar.id].text,
      completed: false,
      points: NUDGE_POOL[pillar.id].points,
      category: NUDGE_POOL[pillar.id].category,
    }));

  return {
    emotionGist,
    primaryMood,
    secondaryMood,
    emotions,
    therapyMessage,
    happinessIndex,
    happinessDelta: delta,
    happinessTrend,
    pointsAwarded,
    healthyLivingPillars,
    dailyNudges,
  };
}
