/**
 * i18n 骨架（Phase 1 第三批）。
 *
 * 项目用 Pages Router，未用 next-i18next（已停止维护）。
 * 翻译资源放在 public/locales/{lng}/translation.json，此处通过相对路径 import 打包进 bundle，
 * 避免 SSR 时 fetch public 资源的问题；public 目录同时保留原文件供未来按需 fetch 或外部工具编辑。
 *
 * 当前仅抽取首页/404 等少量字符串作为骨架。卡牌/符文描述的汉化是独立大项，本批不做。
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../public/locales/en/translation.json';
import zh from '../public/locales/zh/translation.json';

i18n.use(initReactI18next).init({
    resources: {
        en: { translation: en },
        zh: { translation: zh },
    },
    lng: 'en',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
});

export default i18n;
