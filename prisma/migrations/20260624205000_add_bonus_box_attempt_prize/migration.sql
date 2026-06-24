-- Add prize type for granting extra box openings from the box itself.
ALTER TYPE "BonusBoxPrizeType" ADD VALUE 'BONUS_ATTEMPTS';

-- Track attempts that were won from another box opening separately from manual admin grants.
ALTER TYPE "BonusBoxAttemptSource" ADD VALUE 'PRIZE';
