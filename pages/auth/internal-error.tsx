import { isClient } from '@/lib/utils';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';

export default function AuthError() {
    const { t } = useTranslation();
    const router = useRouter();
    const errorCode = typeof router.query.error === 'string' ? router.query.error : null;

    if (!isClient) return null;

    if (window.opener) {
        window.opener.postMessage({ type: 'signinResult', internalError: errorCode }, window.location.origin);
        window.close();
    }

    const detail = errorCode ?? t('auth.unknownError');
    return <p>{t('auth.internalError', { detail })}</p>;
}
