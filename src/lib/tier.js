/**
 * Tier definitions for project-level feature gating.
 * Expand as pricing / feature gates are added.
 */
export const TIERS = {
  free: 'free',
  pro: 'pro',
  enterprise: 'enterprise',
};

export function canAccess(requiredTier, currentTier) {
  const order = [TIERS.free, TIERS.pro, TIERS.enterprise];
  return order.indexOf(currentTier) >= order.indexOf(requiredTier);
}
