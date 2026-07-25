import styles from './index.module.css';
import { useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { trpc } from '@/lib/trpc';
import { rulesets } from '@/lib/defs/prints';
import { entries } from '@/lib/utils';
import { importRulesetFromGodotJSON, type ImportResult } from '@/lib/defs/importRuleset';
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
 * - 从 Godot JSON 文件导入 ruleset
 * - 删除 ruleset
 * - 点击进入编辑页
 */
export default function RulesetsList() {
    const { t } = useTranslation();
    const router = useRouter();
    const [newName, setNewName] = useState('');
    const [newBase, setNewBase] = useState(Object.keys(rulesets)[0]);

    // 导入相关状态
    const [importName, setImportName] = useState('');
    const [importBase, setImportBase] = useState(Object.keys(rulesets)[0]);
    const [importFileName, setImportFileName] = useState('');
    const [importResult, setImportResult] = useState<ImportResult | null>(null);
    const [importError, setImportError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

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
    const updateRuleset = trpc.rulesets.update.useMutation();
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
        const baseName = t('rulesets.copyName');
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

    const onFileSelected = (file: File) => {
        setImportFileName(file.name);
        setImportResult(null);
        setImportError(null);
        const reader = new FileReader();
        reader.onload = () => {
            const text = typeof reader.result === 'string' ? reader.result : '';
            const result = importRulesetFromGodotJSON(text, importBase);
            setImportResult(result);
        };
        reader.onerror = () => {
            setImportError(reader.error?.message ?? 'FileReader error');
        };
        reader.readAsText(file);
    };

    const onImport = async () => {
        const name = importName.trim();
        if (!name || !importResult || importResult.errors.length > 0) return;
        try {
            const created = await createRuleset.mutateAsync({ name, baseRuleset: importBase });
            if (Object.keys(importResult.data).length > 0) {
                await updateRuleset.mutateAsync({ id: created.id, data: importResult.data });
            }
            router.push(`/play/rulesets/${created.id}`);
        } catch (err) {
            setImportError(err instanceof Error ? err.message : String(err));
        }
    };

    const baseOptions = entries(rulesets).map(([id, r]) => [id, r.name] as [string, string]);

    const importPrintCount = importResult?.data.prints ? Object.keys(importResult.data.prints).length : 0;
    const importSideCount = importResult?.data.sideDecks ? Object.keys(importResult.data.sideDecks).length : 0;
    const canImport = importName.trim() !== '' && importResult !== null && importResult.errors.length === 0;

    return <div className={styles.list}>
        <Box className={styles.header}>
            <Text size={16}>{t('rulesets.title')}</Text>
            <div className={styles.createRow}>
                <Select
                    className={styles.nameInput}
                    options={[]}
                    editable
                    placeholder={t('rulesets.namePlaceholder')}
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
                    <Text>{t('rulesets.create')}</Text>
                </Button>
            </div>
            {createRuleset.error && <Text size={12} className={styles.error}>{createRuleset.error.message}</Text>}
        </Box>

        {/* 从 Godot JSON 文件导入 */}
        <Box className={styles.header}>
            <Text size={16}>{t('rulesets.importJson')}</Text>
            <div className={styles.createRow}>
                <Select
                    className={styles.nameInput}
                    options={[]}
                    editable
                    placeholder={t('rulesets.importNamePlaceholder')}
                    content={importName}
                    onEdit={setImportName}
                />
                <Select
                    options={baseOptions}
                    value={importBase}
                    onSelect={setImportBase}
                />
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,application/json"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) onFileSelected(file);
                        e.target.value = '';
                    }}
                />
                <Button onClick={() => fileInputRef.current?.click()}>
                    <Text>{t('rulesets.importSelectFile')}</Text>
                </Button>
                <Button
                    disabled={!canImport || createRuleset.isPending || updateRuleset.isPending}
                    onClick={onImport}
                >
                    <Text>{t('rulesets.import')}</Text>
                </Button>
            </div>
            <Text size={12}>
                {importFileName || t('rulesets.importNoFile')}
            </Text>
            {importError && <Text size={12} className={styles.error}>{importError}</Text>}
            {importResult && importResult.errors.length > 0 && (
                <div className={styles.importMessages}>
                    <Text size={12} className={styles.error}>
                        {t('rulesets.importErrors', { count: importResult.errors.length })}
                    </Text>
                    {importResult.errors.map((err, i) => (
                        <Text key={i} size={11} className={styles.error}>{err}</Text>
                    ))}
                </div>
            )}
            {importResult && importResult.errors.length === 0 && (
                <div className={styles.importMessages}>
                    <Text size={12}>
                        {t('rulesets.importSuccess', { count: importPrintCount, sideCount: importSideCount })}
                    </Text>
                    {importResult.warnings.length > 0 && (
                        <>
                            <Text size={12} className={styles.warning}>
                                {t('rulesets.importWarnings', { count: importResult.warnings.length })}
                            </Text>
                            <div className={styles.warningList}>
                                {importResult.warnings.map((w, i) => (
                                    <Text key={i} size={11} className={styles.warning}>{w}</Text>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            )}
        </Box>

        <Box className={styles.rulesetList}>
            {rulesetList.isLoading && <Text>{t('common.loading')}</Text>}
            {rulesetList.data?.length === 0 && (
                <div className={styles.empty}>
                    <Text size={14}>{t('rulesets.empty')}</Text>
                </div>
            )}
            {(rulesetList.data ?? []).map(ruleset => {
                const baseName = rulesets[ruleset.baseRuleset]?.name ?? ruleset.baseRuleset;
                return <div key={ruleset.id} className={styles.rulesetRow}>
                    <div className={styles.rulesetInfo}>
                        <Text size={14}>{ruleset.name}</Text>
                        <Text size={12}>{t('rulesets.baseLabel')}{baseName}</Text>
                    </div>
                    <div className={styles.rulesetActions}>
                        <Button onClick={() => onOpen(ruleset.id)}>
                            <Text size={12}>{t('rulesets.edit')}</Text>
                        </Button>
                        <Button
                            disabled={duplicateRuleset.isPending}
                            onClick={() => onDuplicate(ruleset.id)}
                        >
                            <Text size={12}>{t('rulesets.duplicate')}</Text>
                        </Button>
                        <Button
                            disabled={deleteRuleset.isPending}
                            onClick={() => onDelete(ruleset.id)}
                        >
                            <Text size={12}>{t('rulesets.delete')}</Text>
                        </Button>
                    </div>
                </div>;
            })}
        </Box>

        {/* 内置 ruleset fork 区（允许用户从内置 ruleset fork） */}
        <Box className={styles.rulesetList}>
            <Text size={14}>{t('rulesets.builtin')}</Text>
            {baseOptions.map(([id, name]) => (
                <div key={id} className={styles.rulesetRow}>
                    <div className={styles.rulesetInfo}>
                        <Text size={14}>{name}</Text>
                        <Text size={12}>{t('rulesets.idLabel')}{id}</Text>
                    </div>
                    <div className={styles.rulesetActions}>
                        <Button
                            disabled={duplicateRuleset.isPending}
                            onClick={() => onDuplicate(id)}
                        >
                            <Text size={12}>{t('rulesets.fork')}</Text>
                        </Button>
                    </div>
                </div>
            ))}
        </Box>
    </div>;
}
