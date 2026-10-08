import type { User } from '@supabase/supabase-js';

export const ACCOUNT_SETUP_REQUIRED_CODE = 'ACCOUNT_SETUP_REQUIRED';
export const ACCOUNT_SETUP_REQUIRED_MESSAGE = 'Use the setup link sent to your email to choose your password.';

export function requiresAccountSetup(user: Pick<User, 'app_metadata'>): boolean {
  return user.app_metadata?.must_reset_password === true;
}

// Call only with claims returned by auth.getClaims(), which verifies the JWT.
// Supabase's implicit email recovery/invite flow records the method as "otp".
export function hasVerifiedSetupSession(
  claims: Record<string, unknown>,
  user: Pick<User, 'id' | 'app_metadata' | 'factors'>,
  nowMs = Date.now(),
): boolean {
  if (claims.sub !== user.id || !Array.isArray(claims.amr)) return false;
  if (user.factors?.some((factor) => factor.status === 'verified') && claims.aal !== 'aal2') return false;
  const requiredAt = Date.parse(user.app_metadata?.setup_required_at ?? '');
  return claims.amr.some((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return false;
    const method = (entry as { method?: unknown }).method;
    const timestamp = (entry as { timestamp?: unknown }).timestamp;
    return ['recovery', 'invite', 'otp', 'magiclink'].includes(String(method))
      && typeof timestamp === 'number'
      && Number.isFinite(timestamp)
      && timestamp * 1000 >= nowMs - 60 * 60 * 1000
      && timestamp * 1000 <= nowMs + 60 * 1000
      && (!Number.isFinite(requiredAt) || timestamp * 1000 >= Math.floor(requiredAt / 1000) * 1000);
  });
}
