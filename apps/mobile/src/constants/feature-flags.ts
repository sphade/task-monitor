/**
 * Feature flags (PRD 11.1 — Safe Deployment Requirements).
 *
 * Both post-v1.0 modules ship behind per-environment flags so they can be
 * rolled out to a limited internal group and disabled without a redeploy.
 *
 * Set in `.env` / EAS environment:
 *   EXPO_PUBLIC_FEATURE_CHAT=true
 *   EXPO_PUBLIC_FEATURE_DOCS=true
 */

function flag(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return value === 'true' || value === '1';
}

export const FEATURES = {
  /** PRD 11.2 — persistent user-to-user chat / forum. */
  CHAT: flag(process.env.EXPO_PUBLIC_FEATURE_CHAT, true),
  /** PRD 11.3 — integrated PRD/SDD documentation repository. */
  DOCS: flag(process.env.EXPO_PUBLIC_FEATURE_DOCS, true),
  /** Kanban board view for tasks. */
  KANBAN: flag(process.env.EXPO_PUBLIC_FEATURE_KANBAN, true),
} as const;

export type FeatureKey = keyof typeof FEATURES;

export function isEnabled(key: FeatureKey): boolean {
  return FEATURES[key];
}
