/**
 * Translations.
 *
 * A flat key/string map rather than an i18n library, because that is all this
 * needs: no plural rules beyond what the copy already avoids, no gendered
 * agreement, no lazy-loaded namespaces. Three small objects and a lookup beat
 * 40 kB of runtime for the same result.
 *
 * `en` is the source of truth and every other locale is typed against it, so a
 * key added here fails the build in any locale that has not translated it —
 * which is the whole reason this is TypeScript and not JSON.
 */

export const LOCALES = ['en', 'hi', 'es'] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  hi: 'हिन्दी',
  es: 'Español',
};

/** Right-to-left locales need `dir` on <html>. None yet, but the hook exists. */
export const RTL_LOCALES: Locale[] = [];

const en = {
  // ── navigation ──────────────────────────────────────────────────────────
  'nav.features': 'Features',
  'nav.pricing': 'Pricing',
  'nav.customers': 'Customers',
  'nav.faq': 'FAQ',
  'nav.blog': 'Blog',
  'nav.contact': 'Contact',
  'nav.signIn': 'Sign in',
  'nav.getStarted': 'Get started',
  'nav.openApp': 'Open app',

  // ── landing hero ────────────────────────────────────────────────────────
  'hero.badge': 'Jira + Notion + Slack + GitHub, in one place',
  'hero.titleLine1': 'The project tool',
  'hero.titleLine2': 'that keeps itself',
  'hero.titleLine3': 'updated',
  'hero.body':
    'Every team already has the tools. The problem is the board is always stale. Loop reads your real activity — commits, chat, task events — and proposes the updates, with evidence you can accept or reject.',
  'hero.createWorkspace': 'Create a workspace',
  'hero.tryDemo': 'Try a demo account',
  'hero.note': 'No card needed · Demo accounts for all five roles',

  // ── auth ────────────────────────────────────────────────────────────────
  'auth.welcomeBack': 'Welcome back.',
  'auth.signInSubtitle': 'Sign in to pick up exactly where your team left off.',
  'auth.email': 'Email',
  'auth.password': 'Password',
  'auth.signIn': 'Sign in',
  'auth.forgotPassword': 'Forgot the password?',
  'auth.orContinueWith': 'or continue with',
  'auth.noAccount': 'Don’t have an account?',
  'auth.signUp': 'Sign up',
  'auth.demoAccounts': 'Demo accounts · password Password123',

  // ── workspace navigation ────────────────────────────────────────────────
  'app.dashboard': 'Dashboard',
  'app.projects': 'Projects',
  'app.myTasks': 'My tasks',
  'app.sprints': 'Sprints',
  'app.autopilot': 'Auto-Pilot',
  'app.chat': 'Chat',
  'app.docs': 'Docs',
  'app.boards': 'Boards',
  'app.files': 'Files',
  'app.calendar': 'Calendar',
  'app.analytics': 'Analytics',
  'app.settings': 'Settings',
  'app.search': 'Search tasks, docs, people…',

  // ── shared actions and states ───────────────────────────────────────────
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.delete': 'Delete',
  'common.create': 'Create',
  'common.retry': 'Try again',
  'common.loading': 'Loading…',
  'common.offline': 'Offline · showing the last data loaded',
  'common.language': 'Language',
} as const;

export type TranslationKey = keyof typeof en;
type Dictionary = Record<TranslationKey, string>;

const hi: Dictionary = {
  'nav.features': 'विशेषताएँ',
  'nav.pricing': 'मूल्य',
  'nav.customers': 'ग्राहक',
  'nav.faq': 'सामान्य प्रश्न',
  'nav.blog': 'ब्लॉग',
  'nav.contact': 'संपर्क',
  'nav.signIn': 'साइन इन',
  'nav.getStarted': 'शुरू करें',
  'nav.openApp': 'ऐप खोलें',

  'hero.badge': 'Jira + Notion + Slack + GitHub, एक ही जगह',
  'hero.titleLine1': 'वह प्रोजेक्ट टूल',
  'hero.titleLine2': 'जो खुद को',
  'hero.titleLine3': 'अपडेट रखता है',
  'hero.body':
    'हर टीम के पास टूल तो हैं। समस्या यह है कि बोर्ड हमेशा पुराना रहता है। Loop आपकी असली गतिविधि पढ़ता है — कमिट, चैट, टास्क इवेंट — और अपडेट सुझाता है, ऐसे सबूत के साथ जिन्हें आप स्वीकार या अस्वीकार कर सकते हैं।',
  'hero.createWorkspace': 'वर्कस्पेस बनाएँ',
  'hero.tryDemo': 'डेमो अकाउंट आज़माएँ',
  'hero.note': 'कार्ड की ज़रूरत नहीं · पाँचों भूमिकाओं के लिए डेमो अकाउंट',

  'auth.welcomeBack': 'वापसी पर स्वागत है।',
  'auth.signInSubtitle': 'साइन इन करें और वहीं से शुरू करें जहाँ आपकी टीम ने छोड़ा था।',
  'auth.email': 'ईमेल',
  'auth.password': 'पासवर्ड',
  'auth.signIn': 'साइन इन',
  'auth.forgotPassword': 'पासवर्ड भूल गए?',
  'auth.orContinueWith': 'या इसके साथ जारी रखें',
  'auth.noAccount': 'खाता नहीं है?',
  'auth.signUp': 'साइन अप',
  'auth.demoAccounts': 'डेमो अकाउंट · पासवर्ड Password123',

  'app.dashboard': 'डैशबोर्ड',
  'app.projects': 'प्रोजेक्ट',
  'app.myTasks': 'मेरे कार्य',
  'app.sprints': 'स्प्रिंट',
  'app.autopilot': 'ऑटो-पायलट',
  'app.chat': 'चैट',
  'app.docs': 'दस्तावेज़',
  'app.boards': 'बोर्ड',
  'app.files': 'फ़ाइलें',
  'app.calendar': 'कैलेंडर',
  'app.analytics': 'विश्लेषण',
  'app.settings': 'सेटिंग्स',
  'app.search': 'कार्य, दस्तावेज़, लोग खोजें…',

  'common.save': 'सहेजें',
  'common.cancel': 'रद्द करें',
  'common.delete': 'हटाएँ',
  'common.create': 'बनाएँ',
  'common.retry': 'पुनः प्रयास करें',
  'common.loading': 'लोड हो रहा है…',
  'common.offline': 'ऑफ़लाइन · अंतिम लोड किया गया डेटा दिख रहा है',
  'common.language': 'भाषा',
};

const es: Dictionary = {
  'nav.features': 'Funciones',
  'nav.pricing': 'Precios',
  'nav.customers': 'Clientes',
  'nav.faq': 'Preguntas',
  'nav.blog': 'Blog',
  'nav.contact': 'Contacto',
  'nav.signIn': 'Iniciar sesión',
  'nav.getStarted': 'Empezar',
  'nav.openApp': 'Abrir la app',

  'hero.badge': 'Jira + Notion + Slack + GitHub, en un solo lugar',
  'hero.titleLine1': 'La herramienta',
  'hero.titleLine2': 'que se mantiene',
  'hero.titleLine3': 'al día sola',
  'hero.body':
    'Todos los equipos ya tienen las herramientas. El problema es que el tablero siempre está desactualizado. Loop lee tu actividad real — commits, chat, eventos de tareas — y propone las actualizaciones, con evidencia que puedes aceptar o rechazar.',
  'hero.createWorkspace': 'Crear un espacio',
  'hero.tryDemo': 'Probar una cuenta demo',
  'hero.note': 'Sin tarjeta · Cuentas demo para los cinco roles',

  'auth.welcomeBack': 'Bienvenido de nuevo.',
  'auth.signInSubtitle': 'Inicia sesión y continúa justo donde lo dejó tu equipo.',
  'auth.email': 'Correo',
  'auth.password': 'Contraseña',
  'auth.signIn': 'Iniciar sesión',
  'auth.forgotPassword': '¿Olvidaste la contraseña?',
  'auth.orContinueWith': 'o continuar con',
  'auth.noAccount': '¿No tienes cuenta?',
  'auth.signUp': 'Regístrate',
  'auth.demoAccounts': 'Cuentas demo · contraseña Password123',

  'app.dashboard': 'Panel',
  'app.projects': 'Proyectos',
  'app.myTasks': 'Mis tareas',
  'app.sprints': 'Sprints',
  'app.autopilot': 'Auto-Pilot',
  'app.chat': 'Chat',
  'app.docs': 'Documentos',
  'app.boards': 'Tableros',
  'app.files': 'Archivos',
  'app.calendar': 'Calendario',
  'app.analytics': 'Analíticas',
  'app.settings': 'Ajustes',
  'app.search': 'Buscar tareas, documentos, personas…',

  'common.save': 'Guardar',
  'common.cancel': 'Cancelar',
  'common.delete': 'Eliminar',
  'common.create': 'Crear',
  'common.retry': 'Reintentar',
  'common.loading': 'Cargando…',
  'common.offline': 'Sin conexión · mostrando los últimos datos cargados',
  'common.language': 'Idioma',
};

export const DICTIONARIES: Record<Locale, Dictionary> = { en, hi, es };

/**
 * Looks up a key, falling back to English and then to the key itself.
 *
 * A missing translation must never render blank: an English word in a Spanish
 * sentence is a bug report, an empty button is a dead end.
 */
export function translate(locale: Locale, key: TranslationKey): string {
  return DICTIONARIES[locale]?.[key] ?? en[key] ?? key;
}

export const isLocale = (value: unknown): value is Locale => LOCALES.includes(value as Locale);
