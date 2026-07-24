import { Text } from '@/components/ui/Text';
import { useTranslation } from 'react-i18next';
import styles from './app.module.css';

export default function NotFound() {
    const { t } = useTranslation();
    return <div className={styles.notFound}>
        <Text size={20}>{t('notFound.title')}</Text>
        <div className={styles.notFoundDiv}></div>
        <Text size={16}>{t('notFound.message')}</Text>
    </div>;
}
