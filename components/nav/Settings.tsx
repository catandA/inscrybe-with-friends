import styles from './Settings.module.css';
import { useState } from 'react';
import { VolumeType, useSettingsStore } from '@/hooks/useSettings';
import { triggerSound } from '@/hooks/useAudio';
import { Asset } from '../sprites/Asset';
import { HoverBorder } from '../ui/HoverBorder';
import { Box } from '../ui/Box';
import { Text } from '../ui/Text';
import { Range } from '../inputs/Range';
import { useShallow } from 'zustand/shallow';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { PRESET_THEMES, applyTheme, type Theme } from '@/lib/themes';
import { changeLanguage, getCurrentLanguage, LANGUAGES, LANGUAGE_LABELS, type Language } from '@/lib/i18n';
import { entries } from '@/lib/utils';

export function Settings() {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);

    return <>
        <div
            className={styles.modalButton}
            data-hover-target
            data-hover-blip
            onClick={() => setOpen(open => !open)}
        >
            <Asset path="/assets/settings.png" />
            <HoverBorder color="--ui-dark" inset={-2} />
        </div>
        {open && <div className={styles.backdrop} onClick={() => setOpen(false)}>
            <Box className={styles.modal} onClick={event => event.stopPropagation()}>
                <div className={styles.columns}>
                    <div className={styles.column}>
                        <VolumeSetting type="all" />
                        <VolumeSetting type="music" />
                        <VolumeSetting type="sfx" />
                    </div>
                    <div className={styles.column}>
                        <ThemeSetting />
                        <LanguageSetting />
                    </div>
                </div>
            </Box>
        </div>}
    </>;
}

const volumeLabelKey: Record<VolumeType, string> = {
    all: 'settings.masterVolume',
    music: 'settings.musicVolume',
    sfx: 'settings.sfxVolume',
};
function VolumeSetting({ type }: { type: VolumeType }) {
    const { t } = useTranslation();
    const [volume, setVolume] = useSettingsStore(useShallow((state) => [state.volume[type], state.setVolume]));

    const onChange = (vol: number) => {
        setVolume(type, vol);
        triggerSound('select');
    };

    return <div className={styles.group}>
        <Text size={16}>{t(volumeLabelKey[type])}</Text>
        <Range min={0} max={1} steps={10} value={volume} onChange={onChange} type="sound" />
    </div>;
}

/**
 * Phase 3.3 主题选择器。
 * 列出预设主题，点击立即预览 + 保存到 DB。
 */
function ThemeSetting() {
    const { t } = useTranslation();
    const user = trpc.user.getUser.useQuery(void 0, {
        refetchOnWindowFocus: false,
    });
    const setTheme = trpc.user.setTheme.useMutation();

    // 当前激活的预设 id：从 user.theme 反查匹配哪个预设
    const currentPresetId = (() => {
        const userTheme = user.data?.theme as Theme | null | undefined;
        if (!userTheme || Object.keys(userTheme).length === 0) return 'default';
        // 反查：找到 vars 完全匹配的预设
        for (const [id, preset] of entries(PRESET_THEMES)) {
            if (id === 'default') continue;
            const presetVars = preset.vars;
            const presetKeys = Object.keys(presetVars);
            if (presetKeys.length === Object.keys(userTheme).length &&
                presetKeys.every(k => userTheme[k] === presetVars[k])) {
                return id;
            }
        }
        return null; // 自定义主题（不匹配任何预设）
    })();

    const onPickPreset = (id: keyof typeof PRESET_THEMES) => {
        const vars = PRESET_THEMES[id].vars;
        const theme = id === 'default' ? null : { ...vars };
        applyTheme(theme as Theme | null);
        setTheme.mutate({ theme });
    };

    return <div className={styles.group}>
        <Text size={16}>{t('settings.theme')}</Text>
        <div className={styles.themeRow}>
            {entries(PRESET_THEMES).map(([id, preset]) => (
                <div
                    key={id}
                    className={`${styles.themeBtn} ${currentPresetId === id ? styles.active : ''}`}
                    onClick={() => onPickPreset(id)}
                >
                    <Text size={12}>{t(`settings.themePreset.${id}`, { defaultValue: preset.name })}</Text>
                </div>
            ))}
        </div>
        {setTheme.error && <Text size={10} className={styles.error}>{setTheme.error.message}</Text>}
    </div>;
}

/**
 * Phase 5 语言选择器。
 * 点击立即切换语言并持久化到 localStorage。
 */
function LanguageSetting() {
    const { t } = useTranslation();
    // 不用 useState 缓存：useTranslation 已在语言切换时触发重渲染，
    // 直接读取可避免与外部触发的语言变化（如 syncLanguageAfterMount）不同步。
    const current = getCurrentLanguage();

    const onPick = (lng: Language) => {
        changeLanguage(lng);
    };

    return <div className={styles.group}>
        <Text size={16}>{t('settings.language')}</Text>
        <div className={styles.themeRow}>
            {LANGUAGES.map(lng => (
                <div
                    key={lng}
                    className={`${styles.themeBtn} ${current === lng ? styles.active : ''}`}
                    onClick={() => onPick(lng)}
                >
                    <Text size={12}>{LANGUAGE_LABELS[lng]}</Text>
                </div>
            ))}
        </div>
    </div>;
}
