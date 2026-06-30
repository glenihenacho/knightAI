'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth';

export function Navbar() {
  const { user, logout, loading } = useAuth();
  return (
    <nav className="navbar">
      <Link href="/" className="brand">
        <span className="knight">Knight</span>Stream
      </Link>
      <div className="nav-links">
        <Link href="/" className="nav-link">
          Browse
        </Link>
        {user && (
          <Link href="/dashboard" className="nav-link">
            Go Live
          </Link>
        )}
      </div>
      <div className="nav-spacer" />
      {!loading && user ? (
        <>
          <Link href={`/channel/${user.handle}`} className="nav-link">
            @{user.handle}
          </Link>
          <button className="btn btn-sm" onClick={logout}>
            Log out
          </button>
        </>
      ) : !loading ? (
        <Link href="/login" className="btn btn-primary btn-sm">
          Log in
        </Link>
      ) : null}
    </nav>
  );
}
