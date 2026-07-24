import styles from './index.module.css';
import { useState } from 'react';
import { useRouter } from 'next/router';
import { trpc } from '@/lib/trpc';
import { rulesets } from '@/lib/defs/prints';
import { entries } from '@/lib/utils';
import { Box } from '@/components/ui/Box';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/inputs/Button';
import { Select } from '@/components/inputs/Select';
import { useTranslation } from 'react-i18next';

/**
 * Phase 3.2：用户自定义规则集列表页。
 *
 * 功能：
 * - 列出当前用户的所有 rulesets（DB 元数据）
 * - 创建新 ruleset（fork 自内置 base ruleset，初始 data 为空）
 * - 复制 ruleset（内置或自己的）
 * - 删除 ruleset
 * - 点击进入编辑页
 */
export default function RulesetsList() {
    const { t } = useTranslation();
    const router = useRouter();
    const [newName, setNewName] = useState('');
    const [newBase, setNewBase] = useState(Object.keys(rulesets)[0]);

    const rulesetList = trpc.rulesets.list.useQuery(void 0, {
        refetchOnMount: true,
        refetchOnWindowFocus: false,
    });

    const createRuleset = trpc.rulesets.create.useMutation({
        onSuccess: (ruleset) => {
            rulesetList.refetch();
            router.push(`/play/rulesets/${ruleset.id}`);
        },
    });
    const duplicateRuleset = trpc.rulesets.duplicate.useMutation({
        onSuccess: () => rulesetList.refetch(),
    });
    const deleteRuleset = trpc.rulesets.delete.useMutation({
        onSuccess: () => rulesetList.refetch(),
    });

    const onCreate = () => {
        const name = newName.trim();
        if (!name) return;
        createRuleset.mutate({ name, baseRuleset: newBase });
    };

    const onDuplicate = (sourceId: string) => {
        // 找一个不冲突的新名字
        const existing = rulesetList.data ?? [];
        const baseName = 'Copy';
        let n = 1;
        let candidate = baseName;
        const taken = new Set(existing.map(r => r.name));
        while (taken.has(candidate)) {
            candidate = `${baseName} (${n})`;
            n++;
        }
        duplicateRuleset.mutate({ sourceId, newName: candidate });
    };

    const onDelete = (id: string) => {
        deleteRuleset.mutate({ id });
    };

    const onOpen = (id: string) => {
        router.push(`/play/rulesets/${id}`);
    };

    const baseOptions = entries(rulesets).map(([id, r]) => [id, r.name] as [string, string]);

    return <div className={styles.list}>
        <Box className={styles.header}>
            <Text size={16}>{t('rulesets.title', { defaultValue: 'Custom Rulesets' })}</Text>
            <div className={styles.createRow}>
                <Select
                    className={styles.nameInput}
                    options={[]}
                    editable
                    placeholder={t('rulesets.namePlaceholder', { defaultValue: 'New ruleset name' })}
                    content={newName}
                    onEdit={setNewName}
                />
                <Select
                    options={baseOptions}
                    value={newBase}
                    onSelect={setNewBase}
                />
                <Button
                    disabled={!newName.trim() || createRuleset.isPending}
                    onClick={onCreate}
                >
                    <Text>{t('rulesets.create', { defaultValue: 'Create' })}</Text>
                </Button>
            </div>
            {createRuleset.error && <Text size={12} className={styles.error}>{createRuleset.error.message}</Text>}
        </Box>

        <Box className={styles.rulesetList}>
            {rulesetList.isLoading && <Text>{t('common.loading')}</Text>}
            {rulesetList.data?.length === 0 && (
                <div className={styles.empty}>
                    <Text size={14}>{t('rulesets.empty', { defaultValue: 'No custom rulesets yet. Create one above.' })}</Text>
                </div>
            )}
            {(rulesetList.data ?? []).map(ruleset => {
                const baseName = rulesets[ruleset.baseRuleset]?.name ?? ruleset.baseRuleset;
                return <div key={ruleset.id} className={styles.rulesetRow}>
                    <div className={styles.rulesetInfo}>
                        <Text size={14}>{ruleset.name}</Text>
                        <Text size={12}>Base: {baseName}</Text>
                    </div>
                    <div className={styles.rulesetActions}>
                        <Button onClick={() => onOpen(ruleset.id)}>
                            <Text size={12}>{t('rulesets.edit', { defaultValue: 'Edit' })}</Text>
                        </Button>
                        <Button
                            disabled={duplicateRuleset.isPending}
                            onClick={() => onDuplicate(ruleset.id)}
                        >
                            <Text size={12}>{t('rulesets.duplicate', { defaultValue: 'Duplicate' })}</Text>
                        </Button>
                        <Button
                            disabled={deleteRuleset.isPending}
                            onClick={() => onDelete(ruleset.id)}
                        >
                            <Text size={12}>{t('rulesets.delete', { defaultValue: 'Delete' })}</Text>
                        </Button>
                    </div>
                </div>;
            })}
        </Box>

        {/* 内置 ruleset fork 区（允许用户从内置 ruleset fork） */}
        <Box className={styles.rulesetList}>
            <Text size={14}>{t('rulesets.builtin', { defaultValue: 'Built-in Rulesets (fork to customize)' })}</Text>
            {baseOptions.map(([id, name]) => (
                <div key={id} className={styles.rulesetRow}>
                    <div className={styles.rulesetInfo}>
                        <Text size={14}>{name}</Text>
                        <Text size={12}>id: {id}</Text>
                    </div>
                    <div className={styles.rulesetActions}>
                        <Button
                            disabled={duplicateRuleset.isPending}
                            onClick={() => onDuplicate(id)}
                        >
                            <Text size={12}>{t('rulesets.fork', { defaultValue: 'Fork' })}</Text>
                        </Button>
                    </div>
                </div>
            ))}
        </Box>
    </div>;
}
