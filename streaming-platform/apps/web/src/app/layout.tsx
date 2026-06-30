import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth';
import { Navbar } from '@/components/Navbar';

export const metadata: Metadata = {
  title: 'KnightStream — watch live everywhere',
  description:
    'A Twitch-style live platform that brings together consented streams from Twitch, Kick, YouTube, Instagram and TikTok Live.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <Navbar />
          <main className="container">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
