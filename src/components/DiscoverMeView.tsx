import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Sparkles,
  RefreshCw,
  Loader2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Trophy,
  Flame,
  Check,
  Heart,
  Moon,
  Activity,
  Brain,
  Users,
  Quote,
  BookOpen,
} from 'lucide-react';
import type {
  DiscoverMeAnalysis,
  HealthyLivingPillar,
  JournalInteraction,
  UserProfile,
} from '../types';
import {
  getInteractionsCollectionRef,
  query,
  orderBy,
  getDocs,
} from '../firebase/config';
import {
  loadWellness,
  saveWellness,
  runDiscoverAnalysis,
  buildEntryPayload,
  applyAnalysisRewards,
  claimNudge,
  isNudgeClaimed,
  nextLevelFor,
  todayKey,
  EMPTY_WELLNESS,
  type WellnessState,
} from '../utils/discover';

interface DiscoverMeViewProps {
  user: UserProfile;
  onBackToJournal: () => void;
}

const PILLAR_ICONS: Record<HealthyLivingPillar['id'], React.ReactNode> = {
  sleep: <Moon className="h-4 w-4" />,
  vitality: <Activity className="h-4 w-4" />,
  mindfulness: <Brain className="h-4 w-4" />,
  connection: <Users className="h-4 w-4" />,
};

const PILLAR_STATUS: Record<HealthyLivingPillar['status'], { label: string; cls: string }> = {
  thriving: { label: 'Thriving', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  balanced: { label: 'Balanced', cls: 'bg-[#f5f2ed] text-[#5a5a40] border-[#e5e0d8]' },
  needs_attention: { label: 'Needs attention', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
};

function clampScore(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

const HappinessRing: React.FC<{ value: number; trend?: string }> = ({ value, trend }) => {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const pct = clampScore(value);
  const stroke =
    trend === 'improving' ? '#059669' : trend === 'dipping' ? '#dc2626' : '#5a5a40';

  return (
    <div className="relative h-32 w-32 shrink-0">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="#e5e0d8" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={stroke}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct / 100)}
          style={{ transition: 'stroke-dashoffset 700ms ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-serif text-3xl font-semibold text-[#3d3d3d]">{pct}</span>
        <span className="text-[9px] font-bold uppercase tracking-widest text-[#8c8579]">
          Happiness
        </span>
      </div>
    </div>
  );
};

export const DiscoverMeView: React.FC<DiscoverMeViewProps> = ({ user, onBackToJournal }) => {
  const [wellness, setWellness] = useState<WellnessState>(EMPTY_WELLNESS);
  const [analysis, setAnalysis] = useState<DiscoverMeAnalysis | null>(null);
  const [entriesAnalyzed, setEntriesAnalyzed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const flash = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3500);
  };

  const analyze = useCallback(
    async (current: WellnessState) => {
      setAnalyzing(true);
      setError(null);
      try {
        const snapshot = await getDocs(
          query(getInteractionsCollectionRef(user.uid), orderBy('updatedAt', 'desc'))
        );
        const interactions: JournalInteraction[] = [];
        snapshot.forEach((d) =>
          interactions.push({ ...(d.data() as JournalInteraction), id: d.id })
        );

        const { analysis: raw, entriesAnalyzed: count } = await runDiscoverAnalysis({
          entries: buildEntryPayload(interactions),
          previousHappinessIndex: current.lastHappinessIndex ?? null,
          totalPoints: current.totalPoints || 0,
        });

        // The endpoint returns entriesAnalyzed alongside the report; fold it in
        // so a cached report still shows the right count tomorrow.
        const result: DiscoverMeAnalysis = {
          ...raw,
          entriesAnalyzedCount: count,
          generatedAt: new Date().toISOString(),
        };

        const { next, awarded, alreadyClaimedToday } = applyAnalysisRewards(current, result);
        setAnalysis(result);
        setEntriesAnalyzed(count);
        setWellness(next);
        await saveWellness(user.uid, next);

        if (awarded > 0) flash(`+${awarded} wellness points banked.`);
        else if (alreadyClaimedToday) flash('Report refreshed — points already banked today.');
      } catch (err: any) {
        console.error('[DiscoverMe] analysis failed:', err);
        setError(err?.message || 'Could not generate your report right now.');
      } finally {
        setAnalyzing(false);
      }
    },
    [user.uid]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await loadWellness(user.uid);
      if (cancelled) return;
      setWellness(saved);

      // Reuse today's cached report instead of re-billing Gemini on every visit.
      if (saved.lastAnalysis && saved.lastAnalysisDate === todayKey()) {
        setAnalysis(saved.lastAnalysis);
        setEntriesAnalyzed(saved.lastAnalysis.entriesAnalyzedCount || 0);
        setLoading(false);
        return;
      }
      setLoading(false);
      await analyze(saved);
    })();
    return () => {
      cancelled = true;
    };
  }, [user.uid, analyze]);

  const handleNudge = async (nudgeId: string) => {
    if (!analysis) return;
    const nudge = analysis.dailyNudges?.find((n) => n.id === nudgeId);
    if (!nudge || isNudgeClaimed(wellness, nudge)) return;

    const { next, awarded } = claimNudge(wellness, nudge);
    setWellness(next);
    await saveWellness(user.uid, next);
    if (awarded > 0) flash(`+${awarded} points — nice one.`);
  };

  const upcoming = nextLevelFor(wellness.totalPoints || 0);
  const delta = Number(analysis?.happinessDelta) || 0;
  const TrendIcon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col bg-[#fdfbf7]">
      {/* Header */}
      <div className="shrink-0 border-b border-[#e5e0d8] px-4 py-3">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              onClick={onBackToJournal}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-[#e5e0d8] bg-white px-2.5 py-1.5 text-xs font-medium text-[#3d3d3d] transition-colors hover:bg-[#f5f2ed]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Journal</span>
            </button>
            <div className="min-w-0">
              <h1 className="truncate font-serif text-lg font-semibold text-[#3d3d3d]">
                Discover Me
              </h1>
              <p className="truncate text-[11px] text-[#8c8579]">
                {entriesAnalyzed > 0
                  ? `Synthesised from your ${entriesAnalyzed} most recent reflection${
                      entriesAnalyzed === 1 ? '' : 's'
                    }`
                  : 'Your emotional gist, guidance and wellness'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => analyze(wellness)}
            disabled={analyzing}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-[#e5e0d8] bg-white px-3 py-2 text-xs font-semibold text-[#3d3d3d] transition-colors hover:bg-[#f5f2ed] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${analyzing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{analyzing ? 'Analysing…' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {toast && (
        <div className="shrink-0 border-b border-emerald-200 bg-emerald-50 px-4 py-2 text-center text-xs font-medium text-emerald-900">
          {toast}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-4 px-4 py-5">
          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {loading || (analyzing && !analysis) ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#e5e0d8] bg-[#f5f2ed] text-[#5a5a40]">
                <Sparkles className="h-6 w-6 animate-pulse" />
              </div>
              <p className="font-serif text-lg text-[#5a5a40]">
                Reading between the lines of your journal…
              </p>
              <p className="max-w-sm text-xs text-[#8c8579]">
                Gemini is distilling your emotional patterns, happiness index and guidance for
                today.
              </p>
            </div>
          ) : !analysis ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#e5e0d8] bg-[#f5f2ed] text-[#5a5a40]">
                <BookOpen className="h-6 w-6" />
              </div>
              <h3 className="font-serif text-xl font-semibold text-[#5a5a40]">
                Nothing to read yet
              </h3>
              <p className="max-w-sm text-sm text-[#3d3d3d]">
                Write a reflection or two and come back — this space will distil how you&apos;ve
                been feeling and what might help.
              </p>
              <button
                type="button"
                onClick={onBackToJournal}
                className="mt-1 inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#5a5a40] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#4a4a35]"
              >
                <BookOpen className="h-3.5 w-3.5" />
                <span>Go to journal</span>
              </button>
            </div>
          ) : (
            <>
              {/* Happiness index + points */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
                <div className="rounded-2xl border border-[#e5e0d8] bg-white p-5 shadow-2xs lg:col-span-3">
                  <div className="flex items-center gap-5">
                    <HappinessRing
                      value={analysis.happinessIndex}
                      trend={analysis.happinessTrend}
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-[#5a5a40]/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-[#5a5a40]">
                          {analysis.primaryMood}
                        </span>
                        {analysis.secondaryMood && (
                          <span className="rounded-full border border-[#e5e0d8] px-2.5 py-0.5 text-[11px] font-medium text-[#8c8579]">
                            {analysis.secondaryMood}
                          </span>
                        )}
                      </div>
                      <div
                        className={`mt-2 inline-flex items-center gap-1.5 text-sm font-semibold ${
                          delta > 0
                            ? 'text-emerald-700'
                            : delta < 0
                            ? 'text-red-700'
                            : 'text-[#8c8579]'
                        }`}
                      >
                        <TrendIcon className="h-4 w-4" />
                        <span>
                          {delta > 0 ? '+' : ''}
                          {delta} since last check-in
                        </span>
                      </div>
                      <p className="mt-1 text-xs capitalize text-[#8c8579]">
                        Trend: {analysis.happinessTrend}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-[#e5e0d8] bg-[#f5f2ed]/70 p-5 lg:col-span-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-[#8c8579]">
                      Wellness points
                    </span>
                    <Trophy className="h-4 w-4 text-[#5a5a40]" />
                  </div>
                  <div className="mt-1 font-serif text-3xl font-semibold text-[#3d3d3d]">
                    {wellness.totalPoints || 0}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#5a5a40]">
                    <span className="font-semibold">{wellness.level}</span>
                    {(wellness.streakDays || 0) > 0 && (
                      <span className="inline-flex items-center gap-1 text-[#8c8579]">
                        <Flame className="h-3 w-3 text-amber-600" />
                        {wellness.streakDays}-day streak
                      </span>
                    )}
                  </div>
                  {upcoming && (
                    <p className="mt-2 text-[11px] text-[#8c8579]">
                      {upcoming.remaining} points to {upcoming.name}
                    </p>
                  )}
                  {wellness.recentBadges?.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {wellness.recentBadges.map((badge) => (
                        <span
                          key={badge}
                          className="rounded-full border border-[#e5e0d8] bg-white px-2 py-0.5 text-[10px] font-semibold text-[#5a5a40]"
                        >
                          {badge}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Gist of emotions */}
              <section className="rounded-2xl border border-[#e5e0d8] bg-white p-5 shadow-2xs">
                <h2 className="flex items-center gap-2 font-serif text-lg font-semibold text-[#5a5a40]">
                  <Heart className="h-4 w-4" />
                  The gist of your emotions
                </h2>
                <div className="mt-2 space-y-3 text-sm leading-relaxed text-[#3d3d3d]">
                  {String(analysis.emotionGist || '')
                    .split(/\n{2,}/)
                    .filter(Boolean)
                    .map((para, i) => (
                      <p key={i}>{para}</p>
                    ))}
                </div>

                {analysis.emotions?.length > 0 && (
                  <div className="mt-4 space-y-3 border-t border-[#e5e0d8] pt-4">
                    {analysis.emotions.map((emotion) => (
                      <div key={emotion.name}>
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-xs font-semibold text-[#3d3d3d]">
                            {emotion.name}
                          </span>
                          <span className="shrink-0 text-[11px] font-mono text-[#8c8579]">
                            {clampScore(emotion.score)} · {emotion.tendency}
                          </span>
                        </div>
                        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[#f5f2ed]">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{
                              width: `${clampScore(emotion.score)}%`,
                              backgroundColor: emotion.color || '#5a5a40',
                            }}
                          />
                        </div>
                        <p className="mt-1 text-[11px] text-[#8c8579]">{emotion.description}</p>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Therapy message */}
              {analysis.therapyMessage && (
                <section className="rounded-2xl border border-[#5a5a40]/25 bg-[#5a5a40]/5 p-5">
                  <h2 className="font-serif text-lg font-semibold text-[#5a5a40]">
                    {analysis.therapyMessage.title}
                  </h2>
                  <div className="mt-2 space-y-3 text-sm leading-relaxed text-[#3d3d3d]">
                    {String(analysis.therapyMessage.content || '')
                      .split(/\n{2,}/)
                      .filter(Boolean)
                      .map((para, i) => (
                        <p key={i}>{para}</p>
                      ))}
                  </div>

                  {analysis.therapyMessage.dailyMotivation && (
                    <div className="mt-4 rounded-xl border border-[#e5e0d8] bg-white p-4">
                      <div className="text-[11px] font-bold uppercase tracking-widest text-[#8c8579]">
                        Motivation for today
                      </div>
                      <p className="mt-1 text-sm leading-relaxed text-[#3d3d3d]">
                        {analysis.therapyMessage.dailyMotivation}
                      </p>
                    </div>
                  )}

                  {analysis.therapyMessage.mindfulAffirmation && (
                    <div className="mt-3 flex items-start gap-2.5 rounded-xl bg-white/70 p-4">
                      <Quote className="mt-0.5 h-4 w-4 shrink-0 text-[#5a5a40]" />
                      <p className="font-serif text-base italic leading-relaxed text-[#5a5a40]">
                        {analysis.therapyMessage.mindfulAffirmation}
                      </p>
                    </div>
                  )}
                </section>
              )}

              {/* Healthy living pillars */}
              {analysis.healthyLivingPillars?.length > 0 && (
                <section>
                  <h2 className="mb-2 font-serif text-lg font-semibold text-[#5a5a40]">
                    Effect on healthy living
                  </h2>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {analysis.healthyLivingPillars.map((pillar) => {
                      const status = PILLAR_STATUS[pillar.status] ?? PILLAR_STATUS.balanced;
                      return (
                        <div
                          key={pillar.id}
                          className="rounded-2xl border border-[#e5e0d8] bg-white p-4 shadow-2xs"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#f5f2ed] text-[#5a5a40]">
                                {PILLAR_ICONS[pillar.id] ?? <Activity className="h-4 w-4" />}
                              </span>
                              <h3 className="truncate text-sm font-semibold text-[#3d3d3d]">
                                {pillar.title}
                              </h3>
                            </div>
                            <span
                              className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${status.cls}`}
                            >
                              {status.label}
                            </span>
                          </div>

                          <div className="mt-3 flex items-center gap-2">
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#f5f2ed]">
                              <div
                                className="h-full rounded-full bg-[#5a5a40] transition-all duration-700"
                                style={{ width: `${clampScore(pillar.score)}%` }}
                              />
                            </div>
                            <span className="font-mono text-[11px] text-[#8c8579]">
                              {clampScore(pillar.score)}
                            </span>
                          </div>

                          <p className="mt-2 text-xs leading-relaxed text-[#8c8579]">
                            {pillar.insight}
                          </p>
                          <p className="mt-2 rounded-lg bg-[#f5f2ed] px-2.5 py-2 text-xs leading-relaxed text-[#3d3d3d]">
                            <span className="font-semibold">Try: </span>
                            {pillar.action}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Daily nudges */}
              {analysis.dailyNudges?.length > 0 && (
                <section className="rounded-2xl border border-[#e5e0d8] bg-white p-5 shadow-2xs">
                  <h2 className="font-serif text-lg font-semibold text-[#5a5a40]">
                    Today&apos;s nudges
                  </h2>
                  <p className="mt-0.5 text-xs text-[#8c8579]">
                    Small things that lift the pillars above. Each one banks points.
                  </p>
                  <div className="mt-3 space-y-2">
                    {analysis.dailyNudges.map((nudge) => {
                      const claimed = isNudgeClaimed(wellness, nudge);
                      return (
                        <button
                          key={nudge.id}
                          type="button"
                          onClick={() => handleNudge(nudge.id)}
                          disabled={claimed}
                          className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                            claimed
                              ? 'cursor-default border-emerald-200 bg-emerald-50'
                              : 'cursor-pointer border-[#e5e0d8] bg-white hover:bg-[#f5f2ed]'
                          }`}
                        >
                          <span
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                              claimed
                                ? 'border-emerald-600 bg-emerald-600 text-white'
                                : 'border-[#d4cdc3] bg-white'
                            }`}
                          >
                            {claimed && <Check className="h-3 w-3" />}
                          </span>
                          <span
                            className={`min-w-0 flex-1 text-sm ${
                              claimed ? 'text-emerald-900 line-through' : 'text-[#3d3d3d]'
                            }`}
                          >
                            {nudge.text}
                          </span>
                          <span className="shrink-0 rounded-full bg-[#f5f2ed] px-2 py-0.5 text-[11px] font-bold text-[#5a5a40]">
                            +{nudge.points}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              <p className="pb-2 text-center text-[11px] leading-relaxed text-[#8c8579]">
                Reflective guidance generated from your own entries. It supports self-reflection
                and is not a substitute for professional mental health care.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
