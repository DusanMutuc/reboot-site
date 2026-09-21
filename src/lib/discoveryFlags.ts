import 'server-only';

/**
 * Member discovery deliberately ships behind a server-only, default-off flag.
 * Admin curation remains available while the catalogue is being prepared.
 */
export function isMemberDiscoveryEnabled(): boolean {
  return process.env.MEMBER_DISCOVERY_ENABLED?.trim().toLowerCase() === 'true';
}
