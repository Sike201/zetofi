import { Geist, Geist_Mono, Playfair_Display } from 'next/font/google';
import './globals.css';
import Header from '@/components/Header';
import Providers from '@/components/Providers';
import LenisScrollProvider from '@/components/LenisScrollProvider';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const playfairDisplay = Playfair_Display({
  variable: '--font-playfair-display',
  subsets: ['latin'],
  weight: '600',
});

export const metadata = {
  title: 'Zeto - Intent Board & Atomic Settlement',
  description: 'Non-custodial intent board and atomic settlement tool',
};

export const dynamic = 'force-dynamic';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${playfairDisplay.variable} antialiased`}
      >
        <Providers>
          <LenisScrollProvider>
            <Header />
            <main className="min-h-screen bg-black">{children}</main>
          </LenisScrollProvider>
        </Providers>
      </body>
    </html>
  );
}
