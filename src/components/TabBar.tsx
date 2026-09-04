import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Dumbbell, User } from 'lucide-react';
import { cn } from '../lib/utils';
import { hapticTap } from '../lib/feedback';

/**
 * Routes that show the floating tab bar. Full-screen focus flows — the live
 * workout, the completion/save screen, congrats — hide it (allowlist, so any
 * future full-screen route is hidden by default).
 */
export function isTabBarRoute(pathname: string): boolean {
  return (
    pathname === '/' ||
    pathname === '/programme' ||
    pathname === '/profile' ||
    /^\/week\/[^/]+$/.test(pathname)
  );
}

const TABS = [
  { to: '/', label: 'Home', icon: Home, isActive: (p: string) => p === '/' },
  {
    to: '/programme',
    label: 'Programme',
    icon: Dumbbell,
    isActive: (p: string) => p === '/programme' || p.startsWith('/week/'),
  },
  { to: '/profile', label: 'Profile', icon: User, isActive: (p: string) => p === '/profile' },
];

export function TabBar() {
  const location = useLocation();
  if (!isTabBarRoute(location.pathname)) return null;

  return (
    <nav aria-label="Main" className="fixed bottom-4 inset-x-4 z-30">
      <div className="max-w-xl mx-auto bg-court-deep/95 backdrop-blur-md border border-white/15 rounded-full px-3 py-2 shadow-xl grid grid-cols-3">
        {TABS.map((tab) => {
          const active = tab.isActive(location.pathname);
          return (
            <Link
              key={tab.to}
              to={tab.to}
              onClick={hapticTap}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex flex-col items-center gap-0.5 py-1 rounded-full transition-colors',
                active ? 'text-mint' : 'text-mist hover:text-white'
              )}
            >
              <tab.icon className="w-5 h-5" strokeWidth={active ? 2.5 : 2} />
              <span className="text-[0.6875rem] font-bold leading-none">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
