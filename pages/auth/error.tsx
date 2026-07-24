import { AuthErrors } from '@/lib/constants';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export default function AuthError() {
    const { t } = useTranslation();
    const router = useRouter();
    const [message, setMessage] = useState<string | null>(null);

    useEffect(() => {
        const errorCode = typeof router.query.error === 'string' ? router.query.error : null;
        if (!errorCode) return setMessage(t('auth.unknownError'));
        if (window.opener) {
            window.opener.postMessage({ type: 'signinResult', error: errorCode }, window.location.origin);
            return window.close();
        }
        const detail = AuthErrors[errorCode] ?? errorCode;
        setMessage(t('auth.internalError', { detail }));
    }, [router.query.error, t]);

    return <p>{message}</p>;
}
