'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  PROVIDERS,
  PROVIDER_IDS,
  type Connection,
  type ProviderId,
} from '@streaming/shared';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ProviderBadge } from '@/components/ProviderBadge';

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [connections, setConnections] = useState<Connection[]>([]);
  const [provider, setProvider] = useState<ProviderId>('twitch');
  const [handle, setHandle] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    api
      .connections()
      .then((res) => setConnections(res.connections))
      .catch(() => setConnections([]));
  }, []);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [authLoading, user, router]);

  useEffect(() => {
    if (user) refresh();
  }, [user, refresh]);

  // Surface OAuth callback results (?linked=… / ?error=…).
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const linked = sp.get('linked');
    const err = sp.get('error');
    if (linked) setNotice(`Linked your ${linked} account (verified).`);
    if (err) setError(err);
    if (linked || err) {
      window.history.replaceState({}, '', '/dashboard');
    }
  }, []);

  async function link(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!consent) {
      setError('Please confirm you consent to linking this account.');
      return;
    }
    setBusy(true);
    try {
      await api.linkConnection(provider, handle.trim());
      setHandle('');
      setConsent(false);
      setNotice(`Linked ${PROVIDERS[provider].name}: ${handle.trim()}`);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to link account');
    } finally {
      setBusy(false);
    }
  }

  async function startOAuth(p: 'twitch' | 'google') {
    setError(null);
    try {
      const { authorizeUrl } = await api.oauthStart(p);
      window.location.href = authorizeUrl;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'OAuth is not available');
    }
  }

  async function unlink(id: number) {
    await api.unlinkConnection(id);
    refresh();
  }

  if (authLoading || !user) return <div className="empty">Loading…</div>;

  const def = PROVIDERS[provider];
  const oauthProvider: 'twitch' | 'google' | null =
    def.oauth === 'twitch' ? 'twitch' : def.oauth === 'google' ? 'google' : null;

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24 }}>Go Live — your linked platforms</h1>
      <p className="muted">
        Link the platforms you stream on. KnightStream surfaces your live streams to viewers
        and only ever shows channels you&apos;ve explicitly consented to link.
      </p>

      {notice && <div className="notice">{notice}</div>}
      {error && <div className="error-text">{error}</div>}

      <div className="form-card" style={{ maxWidth: '100%', margin: '16px 0' }}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Link a platform</h2>
        <form onSubmit={link}>
          <div className="field">
            <label htmlFor="provider">Platform</label>
            <select
              id="provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value as ProviderId)}
            >
              {PROVIDER_IDS.map((p) => (
                <option key={p} value={p}>
                  {PROVIDERS[p].name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="handle">Channel</label>
            <input
              id="handle"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder={def.handleHint}
              required
            />
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              {def.handleHint}
            </div>
          </div>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              I own this {def.name} channel (or am authorised to manage it) and consent to
              KnightStream displaying its live status and embedded stream.
            </span>
          </label>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button className="btn btn-primary" type="submit" disabled={busy || !consent}>
              {busy ? 'Linking…' : 'Link account'}
            </button>
            {oauthProvider && (
              <button
                type="button"
                className="btn"
                onClick={() => startOAuth(oauthProvider)}
              >
                Verify via {def.name} login ↗
              </button>
            )}
          </div>
        </form>
      </div>

      <h2 className="section-title">Linked accounts</h2>
      {connections.length === 0 ? (
        <div className="empty">No linked accounts yet. Add one above to go live.</div>
      ) : (
        connections.map((c) => (
          <div key={c.id} className="conn-row">
            <ProviderBadge provider={c.provider} />
            <div className="grow">
              <div style={{ fontWeight: 700 }}>{c.channelHandle}</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {c.verified ? 'Verified via OAuth' : 'Consented (manual)'} ·{' '}
                {c.consent ? 'consent on file' : 'no consent'}
              </div>
            </div>
            <button className="btn btn-danger btn-sm" onClick={() => unlink(c.id)}>
              Unlink
            </button>
          </div>
        ))
      )}
    </div>
  );
}
