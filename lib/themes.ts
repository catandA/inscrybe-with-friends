/**
 * Phase 3.3 主题系统：预设主题定义。
 *
 * 主题是一组 CSS 变量的键值对，运行时通过 `document.documentElement.style.setProperty` 应用到 :root。
 * 用户可在 Settings 中选择预设或自定义。选中后存入 DB 的 `User.theme`（Json?）。
 *
 * 设计原则：
 * - 只覆盖 UI 框架级变量（--ui-*, --flow-*），不改游戏内卡牌颜色（--sapphire/--emerald/--ruby 等）。
 * - 预设主题是完整覆盖；用户自定义在此基础上再覆盖。
 * - null theme 表示用默认主题（globals.css 中的 :root）。
 */

/** 主题 CSS 变量键值对。键必须以 `--` 开头。 */
export type Theme = Record<string, string>;

/** 主题预设 id。 */
export type PresetThemeId = keyof typeof PRESET_THEMES;

/**
 * 预设主题。id → 名称 + CSS 变量覆盖。
 * 变量名对齐 styles/globals.css 的 :root 定义。
 */
export const PRESET_THEMES = {
    default: {
        name: 'Default',
        vars: {} as Theme,
    },
    light: {
        name: 'Light',
        vars: {
            '--ui-rgb': '64, 64, 64',
            '--ui': 'rgb(64, 64, 64)',
            '--ui-dark': '#999',
            '--ui-darker': '#aaa',
            '--flow-light': '#e8e8e8',
            '--flow': '#d0d0d0',
            '--flow-dark': '#bbb',
        } as Theme,
    },
    sepia: {
        name: 'Sepia',
        vars: {
            '--ui-rgb': '90, 70, 40',
            '--ui': 'rgb(90, 70, 40)',
            '--ui-dark': '#8a7050',
            '--ui-darker': '#7a6040',
            '--flow-light': '#3a2a18',
            '--flow': '#241a0e',
            '--flow-dark': '#1a1208',
        } as Theme,
    },
    midnight: {
        name: 'Midnight Blue',
        vars: {
            '--ui-rgb': '180, 200, 230',
            '--ui': 'rgb(180, 200, 230)',
            '--ui-dark': '#5a6a8a',
            '--ui-darker': '#4a5a7a',
            '--flow-light': '#0a1428',
            '--flow': '#050a14',
            '--flow-dark': '#020508',
        } as Theme,
    },
    forest: {
        name: 'Forest',
        vars: {
            '--ui-rgb': '180, 220, 160',
            '--ui': 'rgb(180, 220, 160)',
            '--ui-dark': '#5a7a4a',
            '--ui-darker': '#4a6a3a',
            '--flow-light': '#0a1f0e',
            '--flow': '#051008',
            '--flow-dark': '#020805',
        } as Theme,
    },
} as const;

/**
 * 将主题应用到 document root。
 * 先清除所有预设变量，再应用新主题，确保切换主题时旧变量不残留。
 */
export function applyTheme(theme: Theme | null): void {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;

    // 清除所有预设主题中定义的变量（避免残留）
    for (const preset of Object.values(PRESET_THEMES)) {
        for (const key of Object.keys(preset.vars)) {
            root.style.removeProperty(key);
        }
    }

    // 应用新主题
    if (theme) {
        for (const [key, value] of Object.entries(theme)) {
            if (key.startsWith('--')) {
                root.style.setProperty(key, value);
            }
        }
    }
}
