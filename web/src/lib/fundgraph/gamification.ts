import { badgeForCred } from "@/lib/fundgraph/cred";
import {
  CREDIT_DELTAS,
  DAILY_ACTION_CAPS,
  DAILY_CREDITS_CAP,
  DEFAULT_STARTING_CREDITS,
  getLimits,
  getNextTierThreshold,
  getTier,
  Tier,
  TierLimits,
} from "@/lib/fundgraph/gamification.shared";
import { createId } from "@/lib/fundgraph/ids";
import { mutateFundgraphDb, readFundgraphDb } from "@/lib/fundgraph/store";
import { ContributionEventType, FundgraphDbFile, FundgraphUser } from "@/lib/fundgraph/types";

export interface GamificationUserSnapshot {
  userId: string;
  credits: number;
  contributions: number;
  tier: Tier;
  daily: NonNullable<FundgraphUser["daily"]>;
  reputation: NonNullable<FundgraphUser["reputation"]>;
  limits: TierLimits;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function ensureDaily(user: FundgraphUser): NonNullable<FundgraphUser["daily"]> {
  const date = todayKey();
  if (!user.daily || user.daily.date !== date) {
    user.daily = {
      date,
      creditsEarned: 0,
      actions: {
        verify: 0,
        signal: 0,
        source: 0,
        comment: 0,
        share: 0,
        upvote: 0,
      },
    };
  } else {
    user.daily.actions = {
      verify: Number(user.daily.actions.verify ?? 0),
      signal: Number(user.daily.actions.signal ?? 0),
      source: Number(user.daily.actions.source ?? 0),
      comment: Number(user.daily.actions.comment ?? 0),
      share: Number(user.daily.actions.share ?? 0),
      upvote: Number(user.daily.actions.upvote ?? 0),
    };
    user.daily.creditsEarned = Number(user.daily.creditsEarned ?? 0);
  }
  return user.daily;
}

function dailySnapshot(user?: FundgraphUser): NonNullable<FundgraphUser["daily"]> {
  const date = todayKey();
  const raw = user?.daily;
  if (!raw || raw.date !== date) {
    return {
      date,
      creditsEarned: 0,
      actions: { verify: 0, signal: 0, source: 0, comment: 0, share: 0, upvote: 0 },
    };
  }
  return {
    date,
    creditsEarned: Number(raw.creditsEarned ?? 0),
    actions: {
      verify: Number(raw.actions.verify ?? 0),
      signal: Number(raw.actions.signal ?? 0),
      source: Number(raw.actions.source ?? 0),
      comment: Number(raw.actions.comment ?? 0),
      share: Number(raw.actions.share ?? 0),
      upvote: Number(raw.actions.upvote ?? 0),
    },
  };
}

function ensureUser(db: FundgraphDbFile, userId: string): FundgraphUser {
  const now = new Date().toISOString();
  const hasPositiveHistory = Boolean(
    (db.contributionEvents ?? []).find((event) => event.userId === userId && event.deltaCredits > 0)
  );
  const existing = db.users.find((row) => row.id === userId || row.userId === userId);
  if (existing) {
    existing.id = userId;
    existing.userId = userId;
    existing.credits = Number(existing.credits ?? existing.credScore ?? db.credByUser[userId] ?? 0);
    if (existing.credits <= 0 && Number(existing.contributions ?? 0) === 0 && !hasPositiveHistory) {
      existing.credits = DEFAULT_STARTING_CREDITS;
    }
    existing.credScore = existing.credits;
    existing.badgeTier = badgeForCred(existing.credits);
    existing.contributions = Number(existing.contributions ?? 0);
    existing.tier = getTier(existing.contributions);
    existing.reputation = {
      ...(existing.reputation ?? {}),
      credScore: existing.credits,
    };
    ensureDaily(existing);
    existing.updatedAt = now;
    db.credByUser[userId] = existing.credits;
    return existing;
  }

  const created: FundgraphUser = {
    id: userId,
    userId,
    name: userId,
    credScore: DEFAULT_STARTING_CREDITS,
    badgeTier: badgeForCred(DEFAULT_STARTING_CREDITS),
    credits: DEFAULT_STARTING_CREDITS,
    contributions: 0,
    tier: "visitor",
    daily: {
      date: todayKey(),
      creditsEarned: 0,
      actions: { verify: 0, signal: 0, source: 0, comment: 0, share: 0, upvote: 0 },
    },
    reputation: { credScore: DEFAULT_STARTING_CREDITS },
    createdAt: now,
    updatedAt: now,
  };
  db.users.push(created);
  db.credByUser[userId] = DEFAULT_STARTING_CREDITS;
  return created;
}

function hasPriorCreditEvent(db: FundgraphDbFile, userId: string, type: ContributionEventType, targetId?: string): boolean {
  if (!targetId) return false;
  return Boolean(
    (db.contributionEvents ?? []).find(
      (event) => event.userId === userId && event.type === type && event.targetId === targetId && event.deltaCredits > 0
    )
  );
}

function incrementDailyAction(user: FundgraphUser, type: ContributionEventType) {
  const daily = ensureDaily(user);
  if (type === "verify_claim") daily.actions.verify += 1;
  if (type === "add_signal") daily.actions.signal += 1;
  if (type === "add_source") daily.actions.source += 1;
  if (type === "add_comment") daily.actions.comment = Number(daily.actions.comment ?? 0) + 1;
  if (type === "share_signal") daily.actions.share = Number(daily.actions.share ?? 0) + 1;
  if (type === "upvote") daily.actions.upvote = Number(daily.actions.upvote ?? 0) + 1;
}

function dailyActionCount(user: FundgraphUser, type: ContributionEventType): number {
  const daily = ensureDaily(user);
  if (type === "verify_claim") return daily.actions.verify;
  if (type === "add_signal") return daily.actions.signal;
  if (type === "add_source") return daily.actions.source;
  if (type === "add_comment") return Number(daily.actions.comment ?? 0);
  if (type === "share_signal") return Number(daily.actions.share ?? 0);
  if (type === "upvote") return Number(daily.actions.upvote ?? 0);
  return 0;
}

function toSnapshot(user: FundgraphUser): GamificationUserSnapshot {
  const tier = getTier(Number(user.contributions ?? 0));
  return {
    userId: user.id,
    credits: Number(user.credits ?? user.credScore ?? 0),
    contributions: Number(user.contributions ?? 0),
    tier,
    daily: ensureDaily(user),
    reputation: {
      ...(user.reputation ?? {}),
      credScore: Number(user.credits ?? user.credScore ?? 0),
    },
    limits: getLimits(tier),
  };
}

function syncLegacyCred(user: FundgraphUser, db: FundgraphDbFile) {
  const credits = Number(user.credits ?? 0);
  user.credScore = credits;
  user.badgeTier = badgeForCred(credits);
  user.reputation = {
    ...(user.reputation ?? {}),
    credScore: credits,
  };
  user.tier = getTier(Number(user.contributions ?? 0));
  user.updatedAt = new Date().toISOString();
  db.credByUser[user.id] = credits;
}

export { getLimits, getNextTierThreshold, getTier };

export async function getGamificationUser(userIdInput: string): Promise<GamificationUserSnapshot> {
  const userId = (userIdInput || "demo").trim() || "demo";
  const db = await readFundgraphDb();
  const user = db.users.find((row) => row.id === userId || row.userId === userId);
  const hasPositiveHistory = Boolean((db.contributionEvents ?? []).find((event) => event.userId === userId && event.deltaCredits > 0));
  const creditsFromUser = Number(user?.credits ?? user?.credScore ?? db.credByUser[userId] ?? 0);
  const credits =
    creditsFromUser > 0 || Number(user?.contributions ?? 0) > 0 || hasPositiveHistory ? creditsFromUser : DEFAULT_STARTING_CREDITS;
  const contributions = Number(user?.contributions ?? 0);
  const tier = getTier(contributions);
  return {
    userId,
    credits,
    contributions,
    tier,
    daily: dailySnapshot(user),
    reputation: {
      ...(user?.reputation ?? {}),
      credScore: credits,
    },
    limits: getLimits(tier),
  };
}

export async function applyContribution(
  userIdInput: string,
  eventType: ContributionEventType,
  targetId?: string
): Promise<GamificationUserSnapshot> {
  const userId = (userIdInput || "demo").trim() || "demo";
  return mutateFundgraphDb((db) => {
    db.contributionEvents = db.contributionEvents ?? [];
    const user = ensureUser(db, userId);
    const daily = ensureDaily(user);
    let delta = Math.max(0, CREDIT_DELTAS[eventType]);

    const cap = DAILY_ACTION_CAPS[eventType];
    if (dailyActionCount(user, eventType) >= cap) delta = 0;
    if (daily.creditsEarned >= DAILY_CREDITS_CAP) delta = 0;
    if (hasPriorCreditEvent(db, userId, eventType, targetId)) delta = 0;
    if (daily.creditsEarned + delta > DAILY_CREDITS_CAP) {
      delta = Math.max(0, DAILY_CREDITS_CAP - daily.creditsEarned);
    }

    if (delta > 0) {
      user.credits = Number(user.credits ?? 0) + delta;
      user.contributions = Number(user.contributions ?? 0) + 1;
      daily.creditsEarned += delta;
      incrementDailyAction(user, eventType);
    }

    db.contributionEvents.unshift({
      id: createId("fg-contrib"),
      userId,
      type: eventType,
      targetId,
      deltaCredits: delta,
      createdAt: new Date().toISOString(),
    });

    syncLegacyCred(user, db);
    return toSnapshot(user);
  });
}

export async function spendCredits(
  userIdInput: string,
  amountInput: number,
  reason: string,
  targetId?: string
): Promise<GamificationUserSnapshot> {
  const userId = (userIdInput || "demo").trim() || "demo";
  const amount = Math.max(0, Math.floor(amountInput));
  if (!amount) {
    return getGamificationUser(userId);
  }

  return mutateFundgraphDb((db) => {
    db.contributionEvents = db.contributionEvents ?? [];
    const user = ensureUser(db, userId);
    if (Number(user.credits ?? 0) < amount) {
      throw new Error("insufficient_credits");
    }

    user.credits = Number(user.credits ?? 0) - amount;
    db.contributionEvents.unshift({
      id: createId("fg-contrib"),
      userId,
      type: "memo_generate",
      targetId: targetId || reason || undefined,
      deltaCredits: -amount,
      createdAt: new Date().toISOString(),
    });

    syncLegacyCred(user, db);
    return toSnapshot(user);
  });
}

export async function resetGamificationUser(userIdInput: string): Promise<GamificationUserSnapshot> {
  const userId = (userIdInput || "demo").trim() || "demo";
  return mutateFundgraphDb((db) => {
    db.contributionEvents = (db.contributionEvents ?? []).filter((event) => event.userId !== userId);
    const user = ensureUser(db, userId);
    user.credits = DEFAULT_STARTING_CREDITS;
    user.contributions = 0;
    user.tier = "visitor";
    user.daily = {
      date: todayKey(),
      creditsEarned: 0,
      actions: { verify: 0, signal: 0, source: 0, comment: 0, share: 0, upvote: 0 },
    };
    syncLegacyCred(user, db);
    return toSnapshot(user);
  });
}

export async function getContributionEvents(userIdInput: string) {
  const userId = (userIdInput || "demo").trim() || "demo";
  const db = await readFundgraphDb();
  return (db.contributionEvents ?? []).filter((event) => event.userId === userId);
}
