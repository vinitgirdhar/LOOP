import assert from 'node:assert/strict';
import { DICTIONARIES, LOCALES, LOCALE_NAMES, isLocale, translate } from './dictionaries';

/*
  TypeScript already forces every locale to be complete — `Dictionary` is
  `Record<TranslationKey, string>`, so a missing key fails the build. What it
  cannot catch is a key that was translated by pasting the English in, or an
  empty string that renders as a blank button. That is what this covers.
*/

const english = DICTIONARIES.en;
const keys = Object.keys(english) as (keyof typeof english)[];

// ── completeness ──────────────────────────────────────────────────────────
for (const locale of LOCALES) {
  const dictionary = DICTIONARIES[locale];
  assert.equal(Object.keys(dictionary).length, keys.length, `${locale} has exactly the English key set`);

  for (const key of keys) {
    const value = dictionary[key];
    assert.equal(typeof value, 'string', `${locale}.${key} is a string`);
    assert.ok(value.trim().length > 0, `${locale}.${key} is not blank`);
  }

  assert.ok(LOCALE_NAMES[locale]?.length > 0, `${locale} has a display name in its own script`);
}

// ── untranslated leakage ──────────────────────────────────────────────────
{
  // Product nouns are meant to stay identical across locales; everything else
  // matching English exactly is almost certainly a paste that was never done.
  const intentional = new Set(['nav.blog', 'app.sprints', 'app.autopilot', 'app.chat']);

  for (const locale of LOCALES.filter((code) => code !== 'en')) {
    const copied = keys.filter((key) => !intentional.has(key) && DICTIONARIES[locale][key] === english[key]);
    assert.deepEqual(copied, [], `${locale} has no untranslated strings left as English`);
  }
}

// ── lookup behaviour ──────────────────────────────────────────────────────
{
  assert.equal(translate('es', 'nav.pricing'), 'Precios');
  assert.equal(translate('en', 'nav.pricing'), 'Pricing');

  // A locale that does not exist must fall back rather than render undefined.
  assert.equal(translate('de' as never, 'nav.pricing'), 'Pricing', 'an unknown locale falls back to English');

  assert.equal(isLocale('hi'), true);
  assert.equal(isLocale('de'), false);
  assert.equal(isLocale(null), false);
}

console.log('i18n: all checks passed');
