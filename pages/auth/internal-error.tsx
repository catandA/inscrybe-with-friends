import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';

/**
 * NextAuth 内部错误页（OAuth provider 抛错时跳转）。
 *
 * Hydration 注意：SSR 阶段没有 window，必须返回与 client 首次渲染一致的占位节点。
 * 旧版用 `if (!isClient) return null` + 直接调用 `window.opener` / `window.close()`，
 * 导致 SSR 渲染空 / client 渲染 `<p>`，触发 hydration mismatch。
 * 现在所有 window 副作用移到 useEffect，render 阶段保持 SSR/client 一致。
 */
export default function AuthError() {
    const { t } = useTranslation();
    const router = useRouter();
    const [message, setMessage] = useState<string | null>(null);

    const errorCode = typeof router.query.error === 'string' ? router.query.error : null;

    useEffect(() => {
        // 弹窗场景：把错误传回主窗口并关闭自己
        if (window.opener) {
            window.opener.postMessage({ type: 'signinResult', internalError: errorCode }, window.location.origin);
            window.close();
            return;
        }
        // 非弹窗场景：显示错误信息
        const detail = errorCode ?? t('auth.unknownError');
        setMessage(t('auth.internalError', { detail }));
    }, [errorCode, t]);

    // render 阶段 SSR 和 client 首次渲染都返回同一个占位（避免 hydration mismatch）
    return <p>{message}</p>;
}
