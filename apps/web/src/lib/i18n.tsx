import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * Lightweight typed i18n (AR/EN/DE) with RTL handling. Interim layer that keeps
 * the screen port moving — message keys mirror the mobile app and are portable
 * to paraglide later. Arabic is the default, RTL.
 */
export type Locale = "ar" | "en" | "de";
export const LOCALES: Locale[] = ["ar", "en", "de"];
export const LOCALE_LABEL: Record<Locale, string> = {
	ar: "العربية",
	en: "English",
	de: "Deutsch",
};

type Dict = Record<string, string>;

const messages: Record<Locale, Dict> = {
	ar: {
		appName: "رفيق القرآن",
		"common.loading": "جارٍ التحميل…",
		"common.retry": "إعادة المحاولة",
		"common.noData": "لا توجد بيانات",
		"common.save": "حفظ",
		"common.cancel": "إلغاء",
		"nav.home": "الرئيسية",
		"nav.leaderboard": "المتصدرون",
		"nav.progress": "التقدم",
		"nav.notifications": "الإشعارات",
		"nav.settings": "الإعدادات",
		"nav.requests": "الطلبات",
		"nav.students": "الطلاب",
		"home.greeting": "أهلاً، {name}",
		"home.points": "النقاط",
		"home.completed": "المكتملة",
		"home.onTime": "في الوقت",
		"home.streak": "التتابع",
		"home.timeRemaining": "الوقت المتبقي",
		"home.myCircles": "حلقاتي",
		"home.noCircle": "لا توجد حلقة",
		"home.findCircle": "ابحث عن حلقة بإدخال الرمز",
		"home.enterCode": "أدخل رمز الحلقة",
		"home.join": "انضمام",
		"home.activeReview": "المراجعة الحالية",
		"home.noActiveReview": "لا توجد مراجعة حالية",
		"home.submit": "تسليم المراجعة",
		"home.pendingReviews": "مراجعات متأخرة",
		"home.leave": "مغادرة",
		"leaderboard.title": "المتصدرون",
		"leaderboard.weekly": "أسبوعي",
		"leaderboard.monthly": "شهري",
		"leaderboard.overall": "الإجمالي",
		"settings.title": "الإعدادات",
		"settings.language": "اللغة",
		"settings.timezone": "المنطقة الزمنية",
		"settings.changePassword": "تغيير كلمة المرور",
		"settings.logout": "تسجيل الخروج",
		"settings.version": "إصدار التطبيق",
		"notifications.title": "الإشعارات",
		"notifications.markAllRead": "تعليم الكل كمقروء",
		"notifications.empty": "لا توجد إشعارات",
		"auth.login": "تسجيل الدخول",
		"auth.email": "البريد الإلكتروني",
		"auth.password": "كلمة المرور",
		"auth.register": "إنشاء حساب",
		"auth.name": "الاسم",
		"auth.role": "اختر الدور",
		"auth.teacher": "معلم",
		"auth.student": "طالب",
		"auth.noAccount": "ليس لديك حساب؟",
		"auth.haveAccount": "لديك حساب بالفعل؟",
		"auth.forgot": "نسيت كلمة المرور؟",
		"requests.title": "طلبات الانضمام",
		"requests.approve": "قبول",
		"requests.reject": "رفض",
		"requests.empty": "لا توجد طلبات",
		"teacher.greeting": "أهلاً، {name}",
		"teacher.myCircles": "حلقاتي",
		"teacher.members": "الأعضاء",
		"teacher.code": "الرمز",
	},
	en: {
		appName: "Quran Companion",
		"common.loading": "Loading…",
		"common.retry": "Retry",
		"common.noData": "No data",
		"common.save": "Save",
		"common.cancel": "Cancel",
		"nav.home": "Home",
		"nav.leaderboard": "Leaderboard",
		"nav.progress": "Progress",
		"nav.notifications": "Notifications",
		"nav.settings": "Settings",
		"nav.requests": "Requests",
		"nav.students": "Students",
		"home.greeting": "Hello, {name}",
		"home.points": "Points",
		"home.completed": "Completed",
		"home.onTime": "On-time",
		"home.streak": "Streak",
		"home.timeRemaining": "Time remaining",
		"home.myCircles": "My Circles",
		"home.noCircle": "No Learning Circle",
		"home.findCircle": "Find a circle by entering its code",
		"home.enterCode": "Enter circle code",
		"home.join": "Join",
		"home.activeReview": "Active Review",
		"home.noActiveReview": "No active review",
		"home.submit": "Submit Review",
		"home.pendingReviews": "Pending Reviews",
		"home.leave": "Leave",
		"leaderboard.title": "Leaderboard",
		"leaderboard.weekly": "Weekly",
		"leaderboard.monthly": "Monthly",
		"leaderboard.overall": "Overall",
		"settings.title": "Settings",
		"settings.language": "Language",
		"settings.timezone": "Timezone",
		"settings.changePassword": "Change Password",
		"settings.logout": "Log out",
		"settings.version": "App Version",
		"notifications.title": "Notifications",
		"notifications.markAllRead": "Mark all read",
		"notifications.empty": "No notifications",
		"auth.login": "Log in",
		"auth.email": "Email",
		"auth.password": "Password",
		"auth.register": "Register",
		"auth.name": "Name",
		"auth.role": "Select role",
		"auth.teacher": "Teacher",
		"auth.student": "Student",
		"auth.noAccount": "Don't have an account?",
		"auth.haveAccount": "Already have an account?",
		"auth.forgot": "Forgot password?",
		"requests.title": "Join Requests",
		"requests.approve": "Approve",
		"requests.reject": "Reject",
		"requests.empty": "No requests",
		"teacher.greeting": "Hello, {name}",
		"teacher.myCircles": "My Circles",
		"teacher.members": "Members",
		"teacher.code": "Code",
	},
	de: {
		appName: "Quran-Begleiter",
		"common.loading": "Lädt…",
		"common.retry": "Wiederholen",
		"common.noData": "Keine Daten",
		"common.save": "Speichern",
		"common.cancel": "Abbrechen",
		"nav.home": "Start",
		"nav.leaderboard": "Rangliste",
		"nav.progress": "Fortschritt",
		"nav.notifications": "Mitteilungen",
		"nav.settings": "Einstellungen",
		"nav.requests": "Anfragen",
		"nav.students": "Schüler",
		"home.greeting": "Hallo, {name}",
		"home.points": "Punkte",
		"home.completed": "Erledigt",
		"home.onTime": "Pünktlich",
		"home.streak": "Serie",
		"home.timeRemaining": "Verbleibende Zeit",
		"home.myCircles": "Meine Kreise",
		"home.noCircle": "Kein Lernkreis",
		"home.findCircle": "Kreis über Code finden",
		"home.enterCode": "Kreis-Code eingeben",
		"home.join": "Beitreten",
		"home.activeReview": "Aktuelle Wiederholung",
		"home.noActiveReview": "Keine aktuelle Wiederholung",
		"home.submit": "Wiederholung abgeben",
		"home.pendingReviews": "Ausstehende Wiederholungen",
		"home.leave": "Verlassen",
		"leaderboard.title": "Rangliste",
		"leaderboard.weekly": "Wöchentlich",
		"leaderboard.monthly": "Monatlich",
		"leaderboard.overall": "Gesamt",
		"settings.title": "Einstellungen",
		"settings.language": "Sprache",
		"settings.timezone": "Zeitzone",
		"settings.changePassword": "Passwort ändern",
		"settings.logout": "Abmelden",
		"settings.version": "App-Version",
		"notifications.title": "Mitteilungen",
		"notifications.markAllRead": "Alle gelesen",
		"notifications.empty": "Keine Mitteilungen",
		"auth.login": "Anmelden",
		"auth.email": "E-Mail",
		"auth.password": "Passwort",
		"auth.register": "Registrieren",
		"auth.name": "Name",
		"auth.role": "Rolle wählen",
		"auth.teacher": "Lehrer",
		"auth.student": "Schüler",
		"auth.noAccount": "Noch kein Konto?",
		"auth.haveAccount": "Bereits ein Konto?",
		"auth.forgot": "Passwort vergessen?",
		"requests.title": "Beitrittsanfragen",
		"requests.approve": "Annehmen",
		"requests.reject": "Ablehnen",
		"requests.empty": "Keine Anfragen",
		"teacher.greeting": "Hallo, {name}",
		"teacher.myCircles": "Meine Kreise",
		"teacher.members": "Mitglieder",
		"teacher.code": "Code",
	},
};

export function isRtl(locale: Locale): boolean {
	return locale === "ar";
}

type I18nCtx = {
	locale: Locale;
	rtl: boolean;
	setLocale: (l: Locale) => void;
	t: (key: string, vars?: Record<string, string | number>) => string;
};

const Ctx = createContext<I18nCtx | null>(null);

export function I18nProvider({
	initialLocale = "ar",
	children,
}: {
	initialLocale?: Locale;
	children: ReactNode;
}) {
	const [locale, setLocale] = useState<Locale>(initialLocale);
	const t = (key: string, vars?: Record<string, string | number>) => {
		let s = messages[locale][key] ?? messages.en[key] ?? key;
		if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
		return s;
	};
	return (
		<Ctx.Provider value={{ locale, rtl: isRtl(locale), setLocale, t }}>{children}</Ctx.Provider>
	);
}

export function useI18n(): I18nCtx {
	const ctx = useContext(Ctx);
	if (!ctx) throw new Error("useI18n must be used within I18nProvider");
	return ctx;
}
