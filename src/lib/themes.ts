export type ThemeVars = {
  surface: string;
  surfaceDeep: string;
  primary: string;
  accent: string;
  secondary: string;
  danger: string;
};

export type Theme = { id: string; name: string; vars: ThemeVars };

export const THEME_KEY = 'vb-theme-v1';

// Grounds must stay dark: the app's cards are white-opacity overlays and all
// text is white-based, so a light ground would need a contrast rework.
export const THEMES: Theme[] = [
  {
    id: 'court',
    name: 'Court',
    vars: {
      surface: '#2a2ae0',
      surfaceDeep: '#1e1eb8',
      primary: '#7bf1a8',
      accent: '#f7e353',
      secondary: '#b9b9f2',
      danger: '#ff3d2e',
    },
  },
  {
    id: 'midnight',
    name: 'Midnight',
    vars: {
      surface: '#131316',
      surfaceDeep: '#000000',
      primary: '#4ade80',
      accent: '#fbbf24',
      secondary: '#a1a1aa',
      danger: '#f87171',
    },
  },
  {
    id: 'ember',
    name: 'Ember',
    vars: {
      surface: '#3d1414',
      surfaceDeep: '#2a0d0d',
      primary: '#fca311',
      accent: '#ffd166',
      secondary: '#d8b4b4',
      danger: '#ff5d47',
    },
  },
  {
    id: 'pine',
    name: 'Pine',
    vars: {
      surface: '#14352a',
      surfaceDeep: '#0c241c',
      primary: '#7bf1a8',
      accent: '#ffe14d',
      secondary: '#a9cabc',
      danger: '#ff6b5e',
    },
  },
];

export const DEFAULT_THEME = THEMES[0];

const CSS_PROP: Record<keyof ThemeVars, string> = {
  surface: '--color-surface',
  surfaceDeep: '--color-surface-deep',
  primary: '--color-primary',
  accent: '--color-accent',
  secondary: '--color-secondary',
  danger: '--color-danger',
};

export function getSavedThemeId(): string {
  try {
    const raw = JSON.parse(window.localStorage.getItem(THEME_KEY) ?? 'null');
    const id = typeof raw === 'string' ? raw : raw?.id;
    return THEMES.some((t) => t.id === id) ? id : DEFAULT_THEME.id;
  } catch {
    return DEFAULT_THEME.id;
  }
}

/** Apply + persist. Stores vars alongside the id so the index.html boot script
 * can restore the theme before first paint without importing this module. */
export function applyTheme(id: string) {
  const theme = THEMES.find((t) => t.id === id) ?? DEFAULT_THEME;
  const root = document.documentElement;
  for (const key of Object.keys(CSS_PROP) as (keyof ThemeVars)[]) {
    if (theme.id === DEFAULT_THEME.id) root.style.removeProperty(CSS_PROP[key]);
    else root.style.setProperty(CSS_PROP[key], theme.vars[key]);
  }
  root.dataset.theme = theme.id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.vars.surface);
  try {
    window.localStorage.setItem(THEME_KEY, JSON.stringify({ id: theme.id, vars: theme.vars }));
  } catch {
    /* storage full/blocked — theme still applies for this session */
  }
}

/** Resolve a semantic token's current value (canvas/SVG code can't use CSS vars in 2D contexts). */
export function themeColor(token: keyof ThemeVars): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(CSS_PROP[token]).trim();
  return v || DEFAULT_THEME.vars[token];
}
