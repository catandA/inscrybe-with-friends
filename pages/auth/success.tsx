import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * 登录成功后的过渡页（OAuth callbackUrl 指向这里）。
 *
 * Hydration 注意：SSR 阶段没有 window，必须返回与 client 首次渲染一致的占位节点。
 * 旧版用 `if (!isClient) return;` 在 SSR 返回 undefined，client 返回 React 节点，
 * 触发 hydration mismatch。现在所有 window 副作用移到 useEffect，render 阶段保持一致。
 */
export default function AuthSuccess() {
    const { t } = useTranslation();
    const router = useRouter();
    const [showSuccess, setShowSuccess] = useState(false);

    useEffect(() => {
        // 弹窗场景：把成功消息传回主窗口并关闭自己
        if (window.opener) {
            window.opener.postMessage({ type: 'signinResult', success: true }, window.location.origin);
            window.close();
            return;
        }
        // 非弹窗场景：显示成功信息后跳到 /play
        setShowSuccess(true);
        router.replace('/play');
    }, [router]);

    if (!showSuccess) return null;

    return <div style={{
        fontSize: '2rem',
        padding: '1rem',
    }}>
        <p>{t('auth.successfullySignedIn')}</p>
        <p>{t('auth.closeWindow')}</p>
    </div>;
}
