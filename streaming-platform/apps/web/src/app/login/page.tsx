'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'signup') await signup(email, password, displayName);
      else await login(email, password);
      router.push('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form-card">
      <h1>{mode === 'login' ? 'Log in' : 'Create your account'}</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {mode === 'login'
          ? 'Welcome back to KnightStream.'
          : 'Join KnightStream to follow, chat, and go live.'}
      </p>

      <form onSubmit={submit}>
        {mode === 'signup' && (
          <div className="field">
            <label htmlFor="displayName">Display name</label>
            <input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              required
              minLength={2}
            />
          </div>
        )}
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'}
            required
            minLength={mode === 'signup' ? 8 : undefined}
          />
        </div>

        {error && <div className="error-text">{error}</div>}

        <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: '100%' }}>
          {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Sign up'}
        </button>
      </form>

      <p className="muted" style={{ marginTop: 16, textAlign: 'center' }}>
        {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
        <button
          className="btn btn-sm"
          onClick={() => {
            setMode(mode === 'login' ? 'signup' : 'login');
            setError(null);
          }}
        >
          {mode === 'login' ? 'Sign up' : 'Log in'}
        </button>
      </p>
    </div>
  );
}
