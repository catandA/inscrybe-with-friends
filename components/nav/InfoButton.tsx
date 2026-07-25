import styles from './InfoButton.module.css';
import { useState } from 'react';
import { Box } from '../ui/Box';
import { Text } from '../ui/Text';
import { Button } from '../inputs/Button';
import { HoverBorder } from '../ui/HoverBorder';
import { DiscordIcon } from '../ui/Icons';
import { useTranslation } from 'react-i18next';
import { Trans } from 'react-i18next';

const DISCORD_LINK = 'https://discord.gg/me2Me5ztMz';

/**
 * 主页面左下角的「i」信息按钮。
 *
 * 替代之前放在 Settings 里的 Discord 入口——Discord 不属于设置项，
 * 放在主页面更容易看到。点击弹出项目信息 + 加入 Discord 按钮。
 *
 * 项目信息：fan game 说明、技术栈、Discord 链接。
 */
export function InfoButton() {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);

    return <>
        <div
            className={styles.button}
            data-hover-target
            data-hover-blip
            onClick={() => setOpen(true)}
            aria-label={t('info.title')}
        >
            <span className={styles.letter}>i</span>
            <HoverBorder color="--ui-dark" inset={-2} />
        </div>
        {open && <div className={styles.backdrop} onClick={() => setOpen(false)}>
            <Box className={styles.modal} onClick={event => event.stopPropagation()}>
                <Button className={styles.closeBtn} onClick={() => setOpen(false)}>
                    <Text>{t('common.close')}</Text>
                </Button>

                <div className={styles.section}>
                    <Text size={20}>{t('info.title')}</Text>
                    <Text size={10}>
                        <Trans i18nKey="info.about" />
                    </Text>
                </div>

                <div className={styles.section}>
                    <Text size={14}>{t('info.discordTitle')}</Text>
                    <Text size={10}>{t('info.discordBody')}</Text>
                    <a className={styles.discordBtn} href={DISCORD_LINK} target="_blank" rel="noreferrer">
                        <DiscordIcon className={styles.discordIcon} />
                        <Text>{t('info.joinDiscord')}</Text>
                    </a>
                </div>

                <div className={styles.section}>
                    <Text size={14}>{t('info.techTitle')}</Text>
                    <Text size={10}>
                        <Trans i18nKey="info.tech" />
                    </Text>
                </div>
            </Box>
        </div>}
    </>;
}
