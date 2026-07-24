export type PrizeType =
  | "SUBSCRIPTION_DAYS"
  | "TRAFFIC_GB"
  | "PROMO_CODE_PERCENT"
  | "BONUS_ATTEMPTS"
  | "NO_PRIZE";

export type Rarity = "COMMON" | "RARE" | "EPIC" | "LEGENDARY";

export type BonusBoxPrizeView = {
  id: string;
  title: string;
  description: string | null;
  type: PrizeType;
  value: number;
  weight: number;
  rarity: Rarity;
  chance: number;
};

export type BonusBoxOpeningView = {
  id: string;
  createdAt: string;
  prize: BonusBoxPrizeView;
  promoCode: string | null;
  promoCodeExpiresAt: string | null;
  remoteSynced: boolean;
};

export type BonusBoxConfigView = {
  enabled: boolean;
  rubPerAttempt: number;
  minAttemptsPerPayment: number;
  maxAttemptsPerPayment: number;
  attemptTtlDays: number;
  weeklyEnabled: boolean;
  weeklyDay: number;
  weeklyAttempts: number;
  weeklyMaxBalance: number;
  referrerAttempts: number;
  referredAttempts: number;
  pityEnabled: boolean;
  pityOpenings: number;
  showBestRecentOpening: boolean;
  activePromoRewardsLimit: number;
};

export type BonusBoxPityProgress = {
  enabled: boolean;
  threshold: number;
  current: number;
  remaining: number | null;
  guaranteedNext: boolean;
};

export type BonusBoxOpeningStreak = {
  current: number;
  nextTarget: number | null;
  targets: number[];
  completed: number[];
};

export type ActivePromoRewardView = {
  id: string;
  code: string;
  discountPercent: number;
  expiresAt: string | null;
  prizeTitle: string;
  createdAt: string;
};

export type BestRecentOpeningView = {
  id: string;
  title: string;
  label: string;
  rarity: Rarity;
  userLabel: string;
  createdAt: string;
};

export type BonusBoxMissionView = {
  id: string;
  title: string;
  description: string | null;
  type: "PAYMENT_COUNT" | "REFERRAL_COUNT" | "LOGIN_STREAK";
  target: number;
  value: number;
  rewardAttempts: number;
  completed: boolean;
  claimed: boolean;
  endsAt: string | null;
};

export type BonusBoxEventView = {
  id: string;
  title: string;
  description: string | null;
  endsAt: string;
  attemptsPerUser: number;
  weightMultiplier: number;
  boostedPrizeTitles: string[];
  attemptsGranted: number;
};

export type BonusBoxOverview = {
  config: BonusBoxConfigView;
  hasActiveSubscription: boolean;
  attemptsCount: number;
  welcomeAttemptsCount: number;
  canOpenReason: string | null;
  pityProgress: BonusBoxPityProgress;
  openingStreak: BonusBoxOpeningStreak;
  bestRecentOpening: BestRecentOpeningView | null;
  activePromoRewards: ActivePromoRewardView[];
  missions: BonusBoxMissionView[];
  events: BonusBoxEventView[];
  prizes: BonusBoxPrizeView[];
  openings: BonusBoxOpeningView[];
};

export type OpenBoxResponse = {
  id: string;
  prize: BonusBoxPrizeView;
  reel: BonusBoxPrizeView[];
  winningIndex: number;
  stopOffsetRatio: number;
  promoCode: string | null;
  promoCodeExpiresAt: string | null;
  remainingAttempts: number;
  remoteSynced: boolean;
};

export type BonusBoxTab = "outcomes" | "history" | "rules";
