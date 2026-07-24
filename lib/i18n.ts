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

/**
 * 检测用户偏好语言（存储值优先，否则浏览器语言）。
 * 仅供客户端在 mount 后调用（见 `syncLanguageAfterMount`），不能用于 i18n 初始化——
 * 初始化时若在浏览器端立即读取 localStorage/navigator.language，会导致客户端首次渲染
 * （hydration 阶段）与服务端渲染的语言不一致，触发 React hydration mismatch。
 */
function detectPreferredLanguage(): Language {
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
    // 服务端与客户端首次渲染必须使用相同的初始语言，否则会 hydration mismatch；
    // 真实语言偏好在 mount 后由 `syncLanguageAfterMount` 应用。
    lng: 'en',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    returnEmptyString: false,
});

/**
 * 在客户端 mount 后（hydration 完成后）同步真实语言偏好。
 * 应在 useEffect 中调用一次；此时切换语言只是普通的 React 更新，不会与 SSR 树比对。
 *
 * 同时设置 document.documentElement.lang，使 CSS :lang() 选择器生效
 * （用于中文环境下微调字距/字号，平衡中英文字形视觉差异）。
 */
export function syncLanguageAfterMount(): void {
    const preferred = detectPreferredLanguage();
    if (preferred !== i18n.language) {
        i18n.changeLanguage(preferred);
    }
    if (typeof document !== 'undefined') {
        document.documentElement.lang = preferred;
    }
}

/**
 * 切换语言并持久化到 localStorage。
 * 在客户端调用；SSR 期间 i18n 固定使用初始语言（'en'）。
 */
export function changeLanguage(lng: Language): void {
    i18n.changeLanguage(lng);
    if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, lng);
        document.documentElement.lang = lng;
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
