import { PROVIDERS, type ProviderId } from '@streaming/shared';

export function ProviderBadge({ provider }: { provider: ProviderId }) {
  const p = PROVIDERS[provider];
  return (
    <span className="provider-badge" style={{ background: p.accent }}>
      {p.name}
    </span>
  );
}
