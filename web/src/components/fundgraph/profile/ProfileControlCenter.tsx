"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AccountSnapshotCard } from "@/components/fundgraph/profile/AccountSnapshotCard";
import { CreditsHowItWorksCard } from "@/components/fundgraph/CreditsHowItWorksCard";
import { MyContributionActivity } from "@/components/fundgraph/profile/MyContributionActivity";
import { MyMemosPanel } from "@/components/fundgraph/profile/MyMemosPanel";
import { PersonalizedOutputPanel } from "@/components/fundgraph/profile/PersonalizedOutputPanel";
import { PreferenceProfileBuilder } from "@/components/fundgraph/profile/PreferenceProfileBuilder";
import { PreferenceSummaryCard } from "@/components/fundgraph/profile/PreferenceSummaryCard";
import { ProfileHeader } from "@/components/fundgraph/profile/ProfileHeader";
import { ProfileRecommendationCard } from "@/components/fundgraph/profile/ProfileRecommendationsList";
import { QuickAccessPanel } from "@/components/fundgraph/profile/QuickAccessPanel";
import { TierCreditSummary } from "@/components/fundgraph/profile/TierCreditSummary";
import { buildPreferenceNarrative, clampScore, formatMillions } from "@/components/fundgraph/profile/profileHelpers";
import { useFundGraphState } from "@/fundgraph/state";
import { Fund, FundCategory, FundStage, UserProfile } from "@/fundgraph/types";
import { listProfileFilterChips, normalizeUserProfileInput, profileHasActiveSignalFeedFilters } from "@/fundgraph/profilePreferences";
import { generateMemo, getProfile, getProfileActivity, getRecommendations, ProfileActivityResponse, saveProfile } from "@/lib/fundgraph/client";
import { getNextTier, getNextTierThreshold, TIER_THRESHOLDS, tierLabel } from "@/lib/fundgraph/gamification.shared";

const ALL_SECTORS: FundCategory[] = [
  "AI",
  "Developer Tools",
  "Fintech",
  "Cloud",
  "Security",
  "Climate",
  "Bio",
  "Consumer",
  "Enterprise",
  "Web3",
];

const ALL_STAGES: FundStage[] = ["Pre-Seed", "Seed", "Series A", "Series B+"];
const ALL_GEOS = ["US", "Europe", "India", "APAC", "LatAm"];

type RecommendationApiItem = {
  fund: Fund;
  score: number;
  reason: string;
  reasons?: string[];
};

const EMPTY_ACTIVITY: ProfileActivityResponse = {
  mode: "hybrid",
  userId: "demo",
  summary: {
    memosCreated: 0,
    signalsPublished: 0,
    contributionEvents: 0,
    citationsAdded: 0,
    verificationActions: 0,
    disputesSubmitted: 0,
    commentsAdded: 0,
    sharesSubmitted: 0,
    stancesSubmitted: 0,
  },
  recent: {
    memos: [],
    publishedSignals: [],
    contributionEvents: [],
    verifications: [],
  },
};

function defaultProfile(userId: string): UserProfile {
  return {
    userId,
    sectorFocus: [],
    stageFocus: [],
    geographyFocus: [],
    geographies: [],
    riskTolerance: "medium",
    checkSizeMinM: 0.5,
    checkSizeMaxM: 10,
    typicalCheckSizeM: 1,
    typicalCheckSizeKUsd: 1000,
    thesisKeywords: [],
  };
}

function updateDraftCheckRange(current: UserProfile, nextMinM: number, nextMaxM: number): UserProfile {
  const min = Math.max(0.05, Number(nextMinM.toFixed(2)));
  const max = Math.max(min, Number(nextMaxM.toFixed(2)));
  const typical = Number(((min + max) / 2).toFixed(2));
  return {
    ...current,
    checkSizeMinM: min,
    checkSizeMaxM: max,
    typicalCheckSizeM: typical,
    typicalCheckSizeKUsd: Math.max(10, Math.round(typical * 1000)),
  };
}

function overlap(profileValues: string[], fundValues: string[]): string[] {
  const normalized = new Set(fundValues.map((value) => value.toLowerCase()));
  return profileValues.filter((value) => normalized.has(value.toLowerCase()));
}

function recommendationReasons(item: RecommendationApiItem, profile: UserProfile | null): string[] {
  const fromApi = item.reasons?.filter(Boolean) ?? [];
  const reasons: string[] = [...fromApi];
  if (!profile) {
    reasons.push(item.reason || "Recommended based on available graph momentum and verification signals.");
    return reasons.slice(0, 3);
  }

  const sectorHits = overlap(profile.sectorFocus, item.fund.sectors);
  if (sectorHits.length) {
    reasons.push(`Matches your ${sectorHits.slice(0, 2).join(" + ")} sector focus.`);
  }

  const stageHits = overlap(profile.stageFocus, item.fund.stages);
  if (stageHits.length) {
    reasons.push(`Aligned with your ${stageHits.join(" / ")} stage preference.`);
  }

  const geoHits = overlap(profile.geographies, item.fund.geographies);
  if (geoHits.length) {
    reasons.push(`Overlaps your geography profile (${geoHits.join(", ")}).`);
  }

  const profileMin = profile.checkSizeMinM;
  const profileMax = profile.checkSizeMaxM;
  const overlapRange = profileMin <= item.fund.checkSizeMaxM && profileMax >= item.fund.checkSizeMinM;
  if (overlapRange) {
    reasons.push(`Check-size compatibility: your $${formatMillions(profileMin)}M-$${formatMillions(profileMax)}M range overlaps this fund.`);
  }

  if (!reasons.length) {
    reasons.push(item.reason || "Ranked from your profile fit + current momentum.");
  }
  return Array.from(new Set(reasons)).slice(0, 3);
}

function fitLabel(score: number): "High Fit" | "Medium Fit" | "Watch" {
  if (score >= 78) return "High Fit";
  if (score >= 60) return "Medium Fit";
  return "Watch";
}

export function ProfileControlCenter() {
  const router = useRouter();
  const {
    userId,
    userName,
    tier,
    cred,
    contributions,
    limits,
    shortlist,
    profilePreferences,
    setIdentity,
    setProfilePreferences,
    applyContributor,
    addFundToShortlist,
    isFundShortlisted,
  } = useFundGraphState();

  const [draft, setDraft] = useState<UserProfile>(() => defaultProfile(userId));
  const [savedProfile, setSavedProfile] = useState<UserProfile | null>(null);
  const [recommendations, setRecommendations] = useState<RecommendationApiItem[]>([]);
  const [activity, setActivity] = useState<ProfileActivityResponse>(EMPTY_ACTIVITY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshingOutput, setRefreshingOutput] = useState(false);
  const [memoLoading, setMemoLoading] = useState(false);
  const [showCreditsGuide, setShowCreditsGuide] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [profileResponse, activityResponse] = await Promise.all([
          getProfile(userId, 8, true),
          getProfileActivity(userId, 8).catch(() => EMPTY_ACTIVITY),
        ]);
        if (cancelled) return;

        const normalizedProfile = profileResponse.profile
          ? normalizeUserProfileInput(profileResponse.profile, userId)
          : defaultProfile(userId);
        setDraft(normalizedProfile);
        setSavedProfile(normalizedProfile);
        setProfilePreferences(normalizedProfile);
        setRecommendations(
          (profileResponse.recommendations ?? []).map((item) => ({
            fund: item.fund,
            score: item.score,
            reason: item.reason,
            reasons: item.reasons,
          }))
        );
        setActivity(activityResponse);
        if (profileResponse.user?.name) {
          setIdentity({ userName: profileResponse.user.name });
        }
        applyContributor({
          userId: profileResponse.user?.id ?? userId,
          credScore: profileResponse.cred,
          badgeTier: profileResponse.user?.badgeTier,
        });
      } catch (loadError) {
        if (cancelled) return;
        const message = loadError instanceof Error ? loadError.message : "Failed to load profile control center.";
        setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyContributor, setIdentity, setProfilePreferences, userId]);

  const activeProfile = profilePreferences ?? savedProfile ?? draft;
  const profileNarrative = useMemo(() => buildPreferenceNarrative(activeProfile), [activeProfile]);
  const draftNarrative = useMemo(() => buildPreferenceNarrative(draft), [draft]);
  const profileChips = useMemo(() => listProfileFilterChips(activeProfile), [activeProfile]);
  const draftChips = useMemo(() => listProfileFilterChips(draft), [draft]);
  const preferencesSynced = useMemo(
    () => (profileHasActiveSignalFeedFilters(activeProfile) ? "Synced to Signals + For You" : "No active feed bias"),
    [activeProfile]
  );

  const nextTier = getNextTier(tier);
  const nextThreshold = getNextTierThreshold(tier);
  const tierFloor = TIER_THRESHOLDS[tier];
  const progressDenominator = nextThreshold ? Math.max(1, nextThreshold - tierFloor) : 1;
  const progressNumerator = nextThreshold ? Math.max(0, contributions - tierFloor) : progressDenominator;
  const progressPercent = Math.max(0, Math.min(100, Math.round((progressNumerator / progressDenominator) * 100)));

  const recommendationCards = useMemo<ProfileRecommendationCard[]>(
    () =>
      recommendations.map((item) => {
        const normalizedScore = clampScore(item.score <= 1 ? item.score * 100 : item.score);
        return {
          fund: item.fund,
          score: normalizedScore,
          fitLabel: fitLabel(normalizedScore),
          reasons: recommendationReasons(item, activeProfile),
        };
      }),
    [activeProfile, recommendations]
  );

  const memoLocked = tier !== "analyst" && tier !== "insider" && cred < 2;
  const memoLockedLabel = memoLocked ? "Generate memo requires Analyst tier or at least 2 tokens." : null;

  const quickAccessItems = useMemo(
    () => [
      { label: "Saved Signals", value: shortlist.signalIds.length, href: "/cerebrosfund/signals" },
      { label: "Shortlist", value: shortlist.fundIds.length, href: "/cerebrosfund/shortlist" },
      { label: "Memos Created", value: activity.summary.memosCreated, href: "#my-memos" },
      { label: "Signals Published", value: activity.summary.signalsPublished, href: "#contribution-activity" },
      { label: "Comments Added", value: activity.summary.commentsAdded, href: "#contribution-activity" },
      { label: "Citations Added", value: activity.summary.citationsAdded, href: "#contribution-activity" },
      { label: "Shares Submitted", value: activity.summary.sharesSubmitted, href: "#contribution-activity" },
      { label: "Stances Submitted", value: activity.summary.stancesSubmitted, href: "#contribution-activity" },
      { label: "Disputes Submitted", value: activity.summary.disputesSubmitted, href: "#contribution-activity" },
    ],
    [activity.summary, shortlist.fundIds.length, shortlist.signalIds.length]
  );

  async function refreshRecommendations() {
    setRefreshingOutput(true);
    setError(null);
    try {
      const response = await getRecommendations(userId, 8);
      setRecommendations(
        response.recommendations.map((item) => ({
          fund: item.fund,
          score: item.score,
          reason: item.reason,
          reasons: item.reasons,
        }))
      );
      setToast({ tone: "success", message: "Personalized output refreshed." });
    } catch (refreshError) {
      const message = refreshError instanceof Error ? refreshError.message : "Failed to refresh recommendations.";
      setError(message);
      setToast({ tone: "error", message });
    } finally {
      setRefreshingOutput(false);
    }
  }

  async function savePreferenceProfile() {
    setSaving(true);
    setError(null);
    try {
      const normalizedDraft = normalizeUserProfileInput(draft, userId);
      const response = await saveProfile({
        userId,
        sectorFocus: normalizedDraft.sectorFocus,
        stageFocus: normalizedDraft.stageFocus,
        geographies: normalizedDraft.geographies,
        riskTolerance: normalizedDraft.riskTolerance,
        typicalCheckSizeM: normalizedDraft.typicalCheckSizeM,
        checkSizeMinM: normalizedDraft.checkSizeMinM,
        checkSizeMaxM: normalizedDraft.checkSizeMaxM,
        thesisKeywords: normalizedDraft.thesisKeywords ?? [],
      });
      const normalized = normalizeUserProfileInput(response.profile, userId);
      setDraft(normalized);
      setSavedProfile(normalized);
      setProfilePreferences(normalized);
      setRecommendations(
        response.recommendations.map((item) => ({
          fund: item.fund,
          score: item.score,
          reason: item.reason,
          reasons: item.reasons,
        }))
      );
      applyContributor({
        userId: response.user?.id ?? userId,
        credScore: response.user?.credScore,
        badgeTier: response.user?.badgeTier,
      });
      setToast({ tone: "success", message: "Preference profile saved. Signals and output updated." });
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Failed to save profile.";
      setError(message);
      setToast({ tone: "error", message });
    } finally {
      setSaving(false);
    }
  }

  async function generateMemoFromTopPick() {
    if (memoLocked) {
      setToast({ tone: "error", message: memoLockedLabel ?? "Memo is locked." });
      return;
    }
    const topRecommendation = recommendationCards[0];
    if (!topRecommendation) {
      setToast({ tone: "error", message: "No recommendation available for memo generation." });
      return;
    }
    if (tier !== "analyst" && tier !== "insider") {
      const confirmed = window.confirm("Generate memo for 2 tokens?");
      if (!confirmed) return;
    }

    setMemoLoading(true);
    try {
      const generated = await generateMemo({
        userId,
        fundId: topRecommendation.fund.id,
        memoType: "investment_memo",
        includeSignals: true,
        includePortfolio: true,
        includeGraphContext: true,
        includeCommunityDiscussion: true,
        timeWindow: "90d",
      });
      if (generated.gamification) {
        applyContributor({ userId: generated.gamification.userId, gamification: generated.gamification });
      }
      router.push(`/cerebrosfund/memos/${generated.memoId}`);
    } catch (memoError) {
      const message = memoError instanceof Error ? memoError.message : "memo_generation_failed";
      setToast({ tone: "error", message: `Memo generation failed: ${message}` });
    } finally {
      setMemoLoading(false);
    }
  }

  function resetDraft() {
    setDraft(savedProfile ?? defaultProfile(userId));
    setError(null);
  }

  return (
    <div className="space-y-4">
      {toast ? (
        <div
          className={`fixed top-5 right-5 z-50 rounded-xl px-3 py-2 text-xs font-semibold shadow ${
            toast.tone === "success" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
          }`}
        >
          {toast.message}
        </div>
      ) : null}

      <ProfileHeader
        userName={userName}
        userId={userId}
        tierLabel={tierLabel(tier)}
        tokenBalance={cred}
        contributionCount={contributions}
        syncStatus={preferencesSynced}
        summaryLine="Manage your investor identity, contribution status, preferences, and personalized research surfaces."
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <AccountSnapshotCard
          tierLabel={tierLabel(tier)}
          tokenBalance={cred}
          contributionCount={contributions}
          nextTierLabel={nextTier ? tierLabel(nextTier) : "Top tier"}
          progressPercent={progressPercent}
          progressLabel={
            nextThreshold
              ? `${contributions}/${nextThreshold} contributions (${Math.max(0, nextThreshold - contributions)} remaining)`
              : "Top tier reached"
          }
          onOpenHowItWorks={() => setShowCreditsGuide(true)}
        />
        <TierCreditSummary tierLabel={tierLabel(tier)} tokenBalance={cred} limits={limits} dailyCapLabel="50 tokens/day" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <QuickAccessPanel items={quickAccessItems} />
        <PreferenceSummaryCard summary={profileNarrative} chips={profileChips} syncLabel={preferencesSynced} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
        <PreferenceProfileBuilder
          draft={draft}
          sectors={ALL_SECTORS}
          stages={ALL_STAGES}
          geos={ALL_GEOS}
          loading={loading}
          saving={saving}
          error={error}
          narrative={draftNarrative}
          draftChips={draftChips}
          onToggleSector={(sector) =>
            setDraft((current) => ({
              ...current,
              sectorFocus: current.sectorFocus.includes(sector)
                ? current.sectorFocus.filter((item) => item !== sector)
                : [...current.sectorFocus, sector],
            }))
          }
          onToggleStage={(stage) =>
            setDraft((current) => ({
              ...current,
              stageFocus: current.stageFocus.includes(stage)
                ? current.stageFocus.filter((item) => item !== stage)
                : [...current.stageFocus, stage],
            }))
          }
          onToggleGeo={(geo) =>
            setDraft((current) => {
              const geographies = current.geographies.includes(geo)
                ? current.geographies.filter((item) => item !== geo)
                : [...current.geographies, geo];
              return { ...current, geographies, geographyFocus: geographies };
            })
          }
          onSetRisk={(risk) => setDraft((current) => ({ ...current, riskTolerance: risk }))}
          onSetCheckMin={(value) => setDraft((current) => updateDraftCheckRange(current, value, current.checkSizeMaxM))}
          onSetCheckMax={(value) => setDraft((current) => updateDraftCheckRange(current, current.checkSizeMinM, value))}
          onSave={savePreferenceProfile}
          onReset={resetDraft}
        />
        <PersonalizedOutputPanel
          profileChips={profileChips}
          recommendations={recommendationCards}
          refreshing={refreshingOutput}
          onRefresh={refreshRecommendations}
          onSaveTopThree={() => recommendationCards.slice(0, 3).forEach((item) => addFundToShortlist(item.fund.id))}
          onGenerateMemo={generateMemoFromTopPick}
          canGenerateMemo={!memoLoading && recommendationCards.length > 0 && !memoLocked}
          memoLockedLabel={memoLockedLabel}
          isFundSaved={isFundShortlisted}
          onSaveFund={addFundToShortlist}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <MyMemosPanel memos={activity.recent.memos} />
        <MyContributionActivity events={activity.recent.contributionEvents} recentSignals={activity.recent.publishedSignals} />
      </div>

      {showCreditsGuide ? (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setShowCreditsGuide(false)} aria-hidden="true" />
          <div className="absolute inset-x-4 top-8 bottom-8 mx-auto max-w-6xl overflow-y-auto">
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => setShowCreditsGuide(false)}
                className="inline-flex h-9 items-center rounded-full border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
            <CreditsHowItWorksCard showLearnMore={false} showQuickActions={false} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
