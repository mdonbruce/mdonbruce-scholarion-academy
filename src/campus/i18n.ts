import { cache } from "react";

/**
 * Localization for the campus chrome (parity §13): per-user language (Account → Profile),
 * right-to-left layout for Arabic, and dates shown in the person's own time zone.
 *
 * Scope: navigation, page frame, sign-in and common actions are translated. Course content is
 * shown as its authors wrote it. Missing keys fall back to English.
 */

export const LOCALES = ["en", "es", "fr", "pt", "ar"] as const;
export type Locale = (typeof LOCALES)[number];
export const LOCALE_NAMES: Record<Locale, string> = { en: "English", es: "Español", fr: "Français", pt: "Português", ar: "العربية" };
const RTL = new Set<Locale>(["ar"]);

type Catalog = Record<string, string>;
const en: Catalog = {
  "nav.dashboard": "Dashboard",
  "nav.courses": "Courses",
  "nav.calendar": "Calendar",
  "nav.agent-labs": "Agentic Cloud Labs",
  "nav.hub": "Free Resources & Careers",
  "nav.comms": "Live Sessions & Help",
  "nav.inbox": "Inbox",
  "nav.notifications": "Notifications",
  "nav.search": "Search",
  "nav.account": "Account",
  "nav.cci": "Curriculum Intelligence",
  "nav.main": "Main",
  "skip": "Skip to content",
  "signout": "Sign out",
  "acting.as": "Acting as",
  "acting.recorded": "Everything you do is recorded.",
  "acting.stop": "Stop acting",
  "dismiss": "Dismiss",
  "public.catalog": "Catalog",
  "public.programs": "Programs",
  "public.pricing": "Pricing",
  "public.signin": "Sign in",
  "public.staging": "Staging · demonstration data · sandbox payments only",
  "foot.pricing": "Plans and pricing",
  "foot.aid": "Financial aid",
  "foot.start": "Where should I start?",
  "foot.verify": "Verify a credential",
  "foot.changed": "What changed",
  "foot.terms": "Terms of use",
  "foot.privacy": "Privacy policy",
  "foot.register": "Request an account",
  "unread": "unread",
  "time.utc": "UTC",
};
const es: Catalog = {
  "nav.dashboard": "Panel",
  "nav.courses": "Cursos",
  "nav.calendar": "Calendario",
  "nav.agent-labs": "Laboratorios de agentes en la nube",
  "nav.hub": "Recursos gratuitos y empleo",
  "nav.comms": "Sesiones en vivo y ayuda",
  "nav.inbox": "Bandeja de entrada",
  "nav.notifications": "Notificaciones",
  "nav.search": "Buscar",
  "nav.account": "Cuenta",
  "nav.cci": "Inteligencia curricular",
  "nav.main": "Principal",
  "skip": "Ir al contenido",
  "signout": "Cerrar sesión",
  "acting.as": "Actuando como",
  "acting.recorded": "Todo lo que hagas queda registrado.",
  "acting.stop": "Dejar de actuar",
  "dismiss": "Descartar",
  "public.catalog": "Catálogo",
  "public.programs": "Programas",
  "public.pricing": "Precios",
  "public.signin": "Iniciar sesión",
  "public.staging": "Entorno de pruebas · datos de demostración · solo pagos de prueba",
  "foot.pricing": "Planes y precios",
  "foot.aid": "Ayuda financiera",
  "foot.start": "¿Por dónde empiezo?",
  "foot.verify": "Verificar una credencial",
  "foot.changed": "Novedades",
  "foot.terms": "Términos de uso",
  "foot.privacy": "Política de privacidad",
  "foot.register": "Solicitar una cuenta",
  "unread": "sin leer",
};
const fr: Catalog = {
  "nav.dashboard": "Tableau de bord",
  "nav.courses": "Cours",
  "nav.calendar": "Calendrier",
  "nav.agent-labs": "Laboratoires d’agents dans le cloud",
  "nav.hub": "Ressources gratuites et carrières",
  "nav.comms": "Sessions en direct et aide",
  "nav.inbox": "Boîte de réception",
  "nav.notifications": "Notifications",
  "nav.search": "Rechercher",
  "nav.account": "Compte",
  "nav.cci": "Intelligence des programmes",
  "nav.main": "Principal",
  "skip": "Aller au contenu",
  "signout": "Se déconnecter",
  "acting.as": "Vous agissez en tant que",
  "acting.recorded": "Toutes vos actions sont enregistrées.",
  "acting.stop": "Arrêter",
  "dismiss": "Ignorer",
  "public.catalog": "Catalogue",
  "public.programs": "Programmes",
  "public.pricing": "Tarifs",
  "public.signin": "Se connecter",
  "public.staging": "Préproduction · données de démonstration · paiements fictifs uniquement",
  "foot.pricing": "Formules et tarifs",
  "foot.aid": "Aide financière",
  "foot.start": "Par où commencer ?",
  "foot.verify": "Vérifier une attestation",
  "foot.changed": "Nouveautés",
  "foot.terms": "Conditions d’utilisation",
  "foot.privacy": "Politique de confidentialité",
  "foot.register": "Demander un compte",
  "unread": "non lus",
};
const pt: Catalog = {
  "nav.dashboard": "Painel",
  "nav.courses": "Cursos",
  "nav.calendar": "Calendário",
  "nav.agent-labs": "Laboratórios de agentes na nuvem",
  "nav.hub": "Recursos gratuitos e carreiras",
  "nav.comms": "Sessões ao vivo e ajuda",
  "nav.inbox": "Caixa de entrada",
  "nav.notifications": "Notificações",
  "nav.search": "Pesquisar",
  "nav.account": "Conta",
  "nav.cci": "Inteligência curricular",
  "nav.main": "Principal",
  "skip": "Ir para o conteúdo",
  "signout": "Sair",
  "acting.as": "Agindo como",
  "acting.recorded": "Tudo o que você fizer fica registrado.",
  "acting.stop": "Parar",
  "dismiss": "Dispensar",
  "public.catalog": "Catálogo",
  "public.programs": "Programas",
  "public.pricing": "Preços",
  "public.signin": "Entrar",
  "public.staging": "Ambiente de testes · dados de demonstração · apenas pagamentos de teste",
  "foot.pricing": "Planos e preços",
  "foot.aid": "Ajuda financeira",
  "foot.start": "Por onde começar?",
  "foot.verify": "Verificar uma credencial",
  "foot.changed": "Novidades",
  "foot.terms": "Termos de uso",
  "foot.privacy": "Política de privacidade",
  "foot.register": "Solicitar uma conta",
  "unread": "não lidas",
};
const ar: Catalog = {
  "nav.dashboard": "لوحة المعلومات",
  "nav.courses": "المقررات",
  "nav.calendar": "التقويم",
  "nav.agent-labs": "مختبرات الوكلاء السحابية",
  "nav.hub": "موارد مجانية ووظائف",
  "nav.comms": "الجلسات المباشرة والمساعدة",
  "nav.inbox": "البريد الوارد",
  "nav.notifications": "الإشعارات",
  "nav.search": "بحث",
  "nav.account": "الحساب",
  "nav.cci": "ذكاء المناهج",
  "nav.main": "الرئيسية",
  "skip": "انتقل إلى المحتوى",
  "signout": "تسجيل الخروج",
  "acting.as": "تتصرف بصفة",
  "acting.recorded": "يتم تسجيل كل ما تفعله.",
  "acting.stop": "إيقاف",
  "dismiss": "إغلاق",
  "public.catalog": "الدليل",
  "public.programs": "البرامج",
  "public.pricing": "الأسعار",
  "public.signin": "تسجيل الدخول",
  "public.staging": "بيئة تجريبية · بيانات توضيحية · مدفوعات تجريبية فقط",
  "foot.pricing": "الخطط والأسعار",
  "foot.aid": "المساعدة المالية",
  "foot.start": "من أين أبدأ؟",
  "foot.verify": "التحقق من شهادة",
  "foot.changed": "ما الجديد",
  "foot.terms": "شروط الاستخدام",
  "foot.privacy": "سياسة الخصوصية",
  "foot.register": "طلب حساب",
  "unread": "غير مقروءة",
};
const CATALOGS: Record<Locale, Catalog> = { en, es, fr, pt, ar };

export const asLocale = (l: unknown): Locale => (LOCALES.includes(l as Locale) ? (l as Locale) : "en");
export const dirFor = (l: Locale) => (RTL.has(l) ? "rtl" : "ltr");
export function t(l: Locale, key: string): string {
  return CATALOGS[l][key] ?? en[key] ?? key;
}
/** Every key a non-English catalog lacks (shown on the status page; tests keep it empty). */
export function missingKeys(): Record<Locale, string[]> {
  return Object.fromEntries(LOCALES.map((l) => [l, Object.keys(en).filter((k) => k !== "time.utc" && !(k in CATALOGS[l]))])) as Record<Locale, string[]>;
}

/* ---------------- per-request viewer settings (time zone + language) ---------------- */

type Viewer = { tz: string; locale: Locale };
/** One object per server request (React cache); outside a server render it is a fresh default. */
export const viewer = cache((): Viewer => ({ tz: "UTC", locale: "en" }));

export function validTimeZone(tz: unknown): string | null {
  if (typeof tz !== "string" || !tz) return null;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}

export function setViewer(v: { tz?: unknown; locale?: unknown }) {
  const cur = viewer();
  cur.tz = validTimeZone(v.tz) ?? "UTC";
  cur.locale = asLocale(v.locale);
}

const INTL_LOCALE: Record<Locale, string> = { en: "en-GB", es: "es-ES", fr: "fr-FR", pt: "pt-BR", ar: "ar" };
export function formatDate(iso: unknown, withTime: boolean, v: Viewer = viewer()): string {
  if (!iso) return "—";
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return String(iso);
  const opts: Intl.DateTimeFormatOptions = withTime ? { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: v.tz } : { day: "numeric", month: "short", year: "numeric", timeZone: v.tz };
  const s = d.toLocaleString(INTL_LOCALE[v.locale], opts);
  if (!withTime) return s;
  const zone = v.tz === "UTC" ? "UTC" : (new Intl.DateTimeFormat("en", { timeZone: v.tz, timeZoneName: "short" }).formatToParts(d).find((p) => p.type === "timeZoneName")?.value ?? v.tz);
  return `${s} ${zone}`;
}
