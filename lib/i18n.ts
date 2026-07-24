/**
 * i18n 配置（Phase 5 扩展）。
 *
 * 项目用 Pages Router，未用 next-i18next（已停止维护）。
 * 翻译资源放在 public/locales/{lng}/translation.json，此处通过相对路径 import 打包进 bundle，
 * 避免 SSR 时 fetch public 资源的问题；public 目录同时保留原文件供未来按需 fetch 或外部工具编辑。
 *
 * 语言持久化：用户选择的语言保存在 localStorage 的 `i18nLng` 键中。
 * 首次访问时检测浏览器语言（zh 开头用中文，否则英文）。
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../public/locales/en/translation.json';
import zh from '../public/locales/zh/translation.json';

export type Language = 'en' | 'zh';
export const LANGUAGES: Language[] = ['en', 'zh'];
export const LANGUAGE_LABELS: Record<Language, string> = {
    en: 'English',
    zh: '中文',
};

const STORAGE_KEY = 'i18nLng';

function detectInitialLanguage(): Language {
    if (typeof window === 'undefined') return 'en';
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'zh') return stored;
    const nav = window.navigator.language?.toLowerCase() ?? '';
    return nav.startsWith('zh') ? 'zh' : 'en';
}

i18n.use(initReactI18next).init({
    resources: {
        en: { translation: en },
        zh: { translation: zh },
    },
    lng: detectInitialLanguage(),
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    returnEmptyString: false,
});

/**
 * 切换语言并持久化到 localStorage。
 * 在客户端调用；SSR 期间 i18n 使用 detectInitialLanguage 的默认值（'en'）。
 */
export function changeLanguage(lng: Language): void {
    i18n.changeLanguage(lng);
    if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, lng);
    }
}

/**
 * 获取当前语言（客户端读取 i18n.language，SSR 返回 'en'）。
 */
export function getCurrentLanguage(): Language {
    const lng = i18n.language;
    return lng === 'zh' ? 'zh' : 'en';
}

export default i18n;
