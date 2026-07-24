import { isClient } from '@/lib/utils';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export default function AuthSuccess() {
    const { t } = useTranslation();
    const [showSuccess, setShowSuccess] = useState(false);
    const router = useRouter();

    useEffect(() => {
        setShowSuccess(true);
    }, []);

    if (!isClient) return;

    if (window.opener) {
        window.opener.postMessage({ type: 'signinResult', success: true }, window.location.origin);
        return window.close();
    }

    router.replace('/play');

    const success = <div style={{
        fontSize: '2rem',
        padding: '1rem',
    }}>
        <p>{t('auth.successfullySignedIn')}</p>
        <p>{t('auth.closeWindow')}</p>
    </div>;
    if (showSuccess) return success;
}
