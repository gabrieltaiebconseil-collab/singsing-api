import AsyncStorage from "@react-native-async-storage/async-storage";

export type AppLang = "fr" | "en" | "es" | "it" | "tr" | "ar" | "pt" | "de" | "mix";

export interface LangOption {
  code: AppLang;
  flag: string;
  label: string;
}

export const LANGUAGES: LangOption[] = [
  { code: "fr", flag: "\u{1F1EB}\u{1F1F7}", label: "Fran\u00e7ais" },
  { code: "en", flag: "\u{1F1EC}\u{1F1E7}", label: "English" },
  { code: "es", flag: "\u{1F1EA}\u{1F1F8}", label: "Espa\u00f1ol" },
  { code: "it", flag: "\u{1F1EE}\u{1F1F9}", label: "Italiano" },
  { code: "tr", flag: "\u{1F1F9}\u{1F1F7}", label: "T\u00fcrk\u00e7e" },
  { code: "ar", flag: "\u{1F1F2}\u{1F1E6}", label: "\u0627\u0644\u0639\u0631\u0628\u064a\u0629" },
  { code: "pt", flag: "\u{1F1E7}\u{1F1F7}", label: "Portugu\u00eas" },
  { code: "de", flag: "\u{1F1E9}\u{1F1EA}", label: "Deutsch" },
  { code: "mix", flag: "\u{1F30D}", label: "Mix mondial" },
];

const STORAGE_KEY = "singsing_lang";
const ONBOARDING_KEY = "singsing_lang_onboarding_done";

let cachedLang: AppLang | null = null;

export async function getLanguage(): Promise<AppLang> {
  if (cachedLang) return cachedLang;
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored && LANGUAGES.some(l => l.code === stored)) {
      cachedLang = stored as AppLang;
      return cachedLang;
    }
  } catch {}
  cachedLang = "fr";
  return cachedLang;
}

export async function setLanguage(lang: AppLang): Promise<void> {
  cachedLang = lang;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, lang);
  } catch {}
}

export async function isOnboardingDone(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ONBOARDING_KEY)) === "true";
  } catch {
    return false;
  }
}

export async function markOnboardingDone(): Promise<void> {
  try {
    await AsyncStorage.setItem(ONBOARDING_KEY, "true");
  } catch {}
}

export function getFlagForLang(lang: AppLang): string {
  return LANGUAGES.find(l => l.code === lang)?.flag || "\u{1F1EB}\u{1F1F7}";
}
