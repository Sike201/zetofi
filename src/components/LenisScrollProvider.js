'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { ReactLenis, useLenis } from 'lenis/react';
import 'lenis/dist/lenis.css';

function ScrollToTopOnRoute() {
  const pathname = usePathname();
  const lenis = useLenis();

  useEffect(() => {
    if (lenis) lenis.scrollTo(0, { immediate: true });
  }, [pathname, lenis]);

  return null;
}

function LenisClassManager() {
  useEffect(() => {
    document.documentElement.classList.add('lenis');
    return () => document.documentElement.classList.remove('lenis');
  }, []);
  return null;
}

export default function LenisScrollProvider({ children }) {
  return (
    <ReactLenis
      root
      options={{
        duration: 1.2,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
      }}
    >
      <LenisClassManager />
      <ScrollToTopOnRoute />
      {children}
    </ReactLenis>
  );
}
