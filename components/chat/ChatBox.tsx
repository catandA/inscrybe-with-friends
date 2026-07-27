import styles from './ChatBox.module.css';
import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import classNames from 'classnames';
import { useTranslation } from 'react-i18next';
import type { ChatMessagePayload } from '@/server/socket';

export interface ChatBoxProps {
    /** 已加载的消息列表（按时间正序，旧的在前） */
    messages: ChatMessagePayload[];
    /** 发送消息回调。返回 Promise 让按钮显示 loading 态。 */
    onSend: (content: string) => Promise<void> | void;
    /** 折叠态标题（如「大厅聊天」/「对局聊天」） */
    title: string;
    className?: string;
    /** 初始是否折叠。默认 false（展开）。 */
    defaultCollapsed?: boolean;
}

/**
 * 通用聊天框组件。用于大厅页面与对局页面。
 *
 * - 接收外部传入的 messages 数组（由调用方通过 tRPC history + Socket 订阅维护）
 * - 提供 input + send 按钮，调用 onSend mutation
 * - 自动滚动到最新消息（仅当用户已滚动到底部时，避免回看历史被打断）
 * - 支持折叠（游戏内聊天默认折叠，点击标题栏展开）
 */
export function ChatBox({
    messages,
    onSend,
    title,
    className,
    defaultCollapsed = false,
}: ChatBoxProps) {
    const { t } = useTranslation();
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [collapsed, setCollapsed] = useState(defaultCollapsed);
    const messagesRef = useRef<HTMLDivElement>(null);
    const stickToBottomRef = useRef(true);

    // 监听滚动位置，记录是否「应贴底」
    const onMessagesScroll = () => {
        const el = messagesRef.current;
        if (!el) return;
        // 留 16em 容差避免像素精度问题导致不贴底
        stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 16;
    };

    // 新消息到来时若贴底则自动滚到底
    useEffect(() => {
        if (!stickToBottomRef.current) return;
        const el = messagesRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
    }, [messages]);

    const onSubmit = async () => {
        const content = input.trim();
        if (!content || sending) return;
        setSending(true);
        try {
            await onSend(content);
            setInput('');
            // 发送后强制贴底，让自己发的消息可见
            stickToBottomRef.current = true;
        } finally {
            setSending(false);
        }
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        // Enter 发送，Shift+Enter 让输入换行（但 input 是单行，Shift+Enter 会被忽略，符合预期）
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void onSubmit();
        }
    };

    return <div className={classNames(styles.chatBox, className, {
        [styles.collapsed]: collapsed,
    })}>
        <div className={styles.header} onClick={() => setCollapsed(c => !c)}>
            <span className={styles.title}>{title}</span>
            <button className={styles.toggleBtn} type="button">
                {collapsed ? '▸' : '▾'}
            </button>
        </div>
        <div ref={messagesRef} className={styles.messages} onScroll={onMessagesScroll}>
            {messages.length === 0
                ? <div className={styles.empty}>{t('chat.empty')}</div>
                : messages.map(m => (
                    <div key={m.id} className={styles.message}>
                        <Image
                            alt={m.name}
                            src={m.image}
                            width={24}
                            height={24}
                            className={styles.avatar}
                        />
                        <div className={styles.body}>
                            <div className={styles.meta}>
                                <span className={styles.name}>{m.name}</span>
                                <span className={styles.time}>
                                    {new Date(m.createdAt).toLocaleTimeString()}
                                </span>
                            </div>
                            <div className={styles.content}>{m.content}</div>
                        </div>
                    </div>
                ))}
        </div>
        <div className={styles.inputRow}>
            <input
                className={styles.input}
                type="text"
                maxLength={500}
                placeholder={t('chat.inputPlaceholder')}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                disabled={sending}
            />
            <button
                className={styles.sendBtn}
                type="button"
                onClick={onSubmit}
                disabled={sending || !input.trim()}
            >{t('chat.send')}</button>
        </div>
    </div>;
}
