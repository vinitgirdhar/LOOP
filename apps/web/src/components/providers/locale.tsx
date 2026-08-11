'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { LOCALES, LOCALE_NAMES, RTL_LOCALES, isLocale, translate, type Locale, type TranslationKey } from '@/lib/i18n/dictionaries';

const STORAGE_KEY = 'loop-locale';

interface LocaleValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: (key: TranslationKey) => string;
}

const LocaleContext = createContext<LocaleValue>({ locale: 'en', setLocale: () => {}, t: (key) => translate('en', key) });

export const useLocale = () => useContext(LocaleContext);
/** Shorthand for the common case: `const t = useT()`. */
export const useT = () => useContext(LocaleContext).t;

/**
 * Runs before paint so the first frame is already in the right language, in
 * the same way the theme script works. Without it a Spanish reader sees a
 * flash of English on every cold load.
 */
export const localeScript = `(function(){try{var l=localStorage.getItem('${STORAGE_KEY}');if(!l){l=(navigator.language||'en').slice(0,2);}if(['${LOCALES.join("','")}'].indexOf(l)<0)l='en';document.documentElement.lang=l;}catch(e){}})();`;

export function LocaleProvider({ children }: { children: ReactNode }) {
  // Always starts at the server-rendered default; the effect below adopts what
  // the inline script already wrote, which keeps hydration consistent.
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    const stored = document.documentElement.lang;
    if (isLocale(stored)) setLocaleState(stored);
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    document.documentElement.lang = next;
    document.documentElement.dir = RTL_LOCALES.includes(next) ? 'rtl' : 'ltr';
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private mode */
    }
  }, []);

  const value = useMemo<LocaleValue>(
    () => ({ locale, setLocale, t: (key: TranslationKey) => translate(locale, key) }),
    [locale, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

/** Compact language picker. Sits beside the theme toggle wherever that appears. */
export function LocaleSwitcher({ className = '' }: { className?: string }) {
  const { locale, setLocale, t } = useLocale();

  return (
    <label className={`relative inline-flex items-center ${className}`}>
      <span className="sr-only">{t('common.language')}</span>
      <select
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
        className="h-9 cursor-pointer rounded-lg border-0 bg-transparent px-2 text-[12px] font-medium text-current focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      >
        {LOCALES.map((code) => (
          <option key={code} value={code} className="text-[var(--text)]">
            {LOCALE_NAMES[code]}
          </option>
        ))}
      </select>
    </label>
  );
}
