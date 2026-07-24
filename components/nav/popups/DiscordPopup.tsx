import styles from './DiscordPopup.module.css';
import { Button } from '@/components/inputs/Button';
import { Box } from '@/components/ui/Box';
import { Text } from '@/components/ui/Text';
import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

const DISCORD_LINK = 'https://discord.gg/me2Me5ztMz';

export function DiscordPopup() {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (localStorage.getItem('discordPopupSeed')) return;
        setOpen(true);
    }, []);

    function close() {
        setOpen(false);
        localStorage.setItem('discordPopupSeed', 'true');
    }

    if (!open) return null;
    return <div className={styles.backdrop}>
        <Box className={styles.modal} onClick={event => event.stopPropagation()}>
            <Text size={24}>{t('discord.title')}</Text>
            <Text size={12}>
                <Trans
                    i18nKey="discord.body"
                    components={[<a key="discord" className={styles.discordLink} href={DISCORD_LINK} target="_blank" />]}
                />
            </Text>
            <Button onClick={() => close()}><Text>{t('discord.joined')}</Text></Button>
            <Button onClick={() => close()}><Text>{t('discord.joinLater')}</Text></Button>
        </Box>
    </div>;
}
