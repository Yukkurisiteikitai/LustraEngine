'use client';

import { useState, useEffect, useRef, FormEvent, KeyboardEvent, useCallback } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import TraitBar from '@/components/TraitBar';
import { usePersona, useChatMutation } from '@/lib/mockQueryClient';
import { loadLMConfig } from '@/lib/lmConfig';
import type { ChatMessage, TraitName } from '@/types';
import styles from './page.module.css';

const TRAIT_LABELS: Record<TraitName, string> = {
  introversion: '内向性',
  discipline: '自律性',
  curiosity: '好奇心',
  risk_tolerance: 'リスク許容度',
  self_criticism: '自己批判',
  social_anxiety: '社会不安',
};

const CLUSTER_LABELS: Record<string, string> = {
  procrastination: '先延ばし傾向',
  social_avoidance: '社会的回避',
  authority_anxiety: '権威不安',
  perfectionism: '完璧主義',
};

const TRAIT_ORDER: TraitName[] = [
  'introversion',
  'discipline',
  'curiosity',
  'risk_tolerance',
  'self_criticism',
  'social_anxiety',
];

interface ThreadSummary {
  id: string;
  title: string;
  createdAt: string;
}

interface PersistedMessage {
  id: string;
  role: 'user' | 'assistant';
  contexts: string[];
  contextIdSet: number;
  createdAt: string;
}

function persistedToChat(msg: PersistedMessage): ChatMessage {
  return {
    role: msg.role,
    content: msg.contexts[msg.contextIdSet] ?? '',
  };
}

export default function ChatPage() {
  const { data: snapshot, isLoading: personaLoading } = usePersona();
  const chatMutation = useChatMutation();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [hasConfig, setHasConfig] = useState(false);
  const [currentThreadId, setCurrentThreadId] = useState<string | undefined>(undefined);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHasConfig(loadLMConfig() !== null);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, chatMutation.isPending]);

  const fetchThreads = useCallback(async () => {
    setThreadsLoading(true);
    try {
      const res = await fetch('/api/chat/threads');
      if (res.ok) {
        const json = (await res.json()) as { threads: ThreadSummary[] };
        setThreads(json.threads);
      }
    } finally {
      setThreadsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchThreads();
  }, [fetchThreads]);

  async function selectThread(threadId: string) {
    setCurrentThreadId(threadId);
    const res = await fetch(`/api/chat/threads/${threadId}`);
    if (res.ok) {
      const json = (await res.json()) as { messages: PersistedMessage[] };
      setMessages(json.messages.map(persistedToChat));
    }
  }

  function startNewThread() {
    setCurrentThreadId(undefined);
    setMessages([]);
  }

  const hasPersona = !personaLoading && !!snapshot?.personaJson;
  const canSend = hasConfig && hasPersona && !chatMutation.isPending && input.trim() !== '';

  async function handleSend() {
    const message = input.trim();
    if (!message || !canSend) return;

    const newHistory: ChatMessage[] = [...messages, { role: 'user', content: message }];
    setMessages(newHistory);
    setInput('');

    try {
      const result = await chatMutation.mutateAsync({ message, history: messages, threadId: currentThreadId });
      setMessages([...newHistory, { role: 'assistant', content: result.response }]);

      if (result.threadId && result.threadId !== currentThreadId) {
        setCurrentThreadId(result.threadId);
        void fetchThreads();
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'エラーが発生しました';
      setMessages([...newHistory, { role: 'assistant', content: `⚠️ ${errMsg}` }]);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void handleSend();
  }

  const traitMap = snapshot?.personaJson?.traits ?? null;

  return (
    <>
      <Header />
      <main className={styles.main}>
        <div className={styles.layout}>
          {/* Left sidebar: persona info */}
          <aside className={styles.sidebar}>
            <h2 className={styles.sidebarTitle}>ペルソナ</h2>

            {personaLoading && <p className={styles.loading}>読み込み中...</p>}

            {!personaLoading && !hasPersona && (
              <div className={styles.warningBox}>
                <p>
                  ペルソナスナップショットがありません。
                  <Link href="/persona" className={styles.link}>
                    ペルソナページ
                  </Link>
                  でトレイト推論を実行してください。
                </p>
              </div>
            )}

            {traitMap && (
              <>
                <div className={styles.traitList}>
                  {TRAIT_ORDER.map((name) => (
                    <TraitBar
                      key={name}
                      name={name}
                      label={TRAIT_LABELS[name]}
                      score={traitMap[name] ?? 0.5}
                    />
                  ))}
                </div>

                {snapshot?.personaJson.dominantClusters && snapshot.personaJson.dominantClusters.length > 0 && (
                  <div className={styles.clusters}>
                    <h3 className={styles.clusterTitle}>主要パターン</h3>
                    <ul className={styles.clusterList}>
                      {snapshot.personaJson.dominantClusters.map((c) => (
                        <li key={c.type} className={styles.clusterItem}>
                          <span>{CLUSTER_LABELS[c.type] ?? c.type}</span>
                          <span className={styles.clusterCount}>{c.detectedCount}回</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <p className={styles.snapshotDate}>
                  {new Date(snapshot!.createdAt).toLocaleString('ja-JP')}
                </p>
              </>
            )}

            {!hasConfig && (
              <div className={styles.warningBox}>
                <p>
                  AI設定がありません。
                  <Link href="/settings" className={styles.link}>
                    設定ページ
                  </Link>
                  で設定してください。
                </p>
              </div>
            )}

            {/* Thread history */}
            <div className={styles.threadSection}>
              <div className={styles.threadHeader}>
                <h3 className={styles.clusterTitle}>チャット履歴</h3>
                <button className={styles.newThreadBtn} onClick={startNewThread}>
                  新規
                </button>
              </div>
              {threadsLoading && <p className={styles.loading}>読み込み中...</p>}
              {!threadsLoading && threads.length === 0 && (
                <p className={styles.loading}>履歴なし</p>
              )}
              <ul className={styles.threadList}>
                {threads.map((t) => (
                  <li key={t.id}>
                    <button
                      className={`${styles.threadItem} ${t.id === currentThreadId ? styles.threadItemActive : ''}`}
                      onClick={() => void selectThread(t.id)}
                    >
                      <span className={styles.threadTitle}>{t.title}</span>
                      <span className={styles.threadDate}>
                        {new Date(t.createdAt).toLocaleDateString('ja-JP')}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </aside>

          {/* Chat */}
          <div className={styles.chatColumn}>
            <div className={styles.chatWindow}>
              {messages.length === 0 && (
                <p className={styles.empty}>
                  {hasPersona && hasConfig
                    ? 'メッセージを送信して対話を始めましょう。'
                    : hasPersona
                    ? 'AI設定を行うとチャットを開始できます。'
                    : 'ペルソナ推論を先に実行してください。'}
                </p>
              )}

              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={msg.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant}
                >
                  {msg.content}
                </div>
              ))}

              {chatMutation.isPending && (
                <div className={styles.bubbleAssistant}>
                  <span className={styles.thinking}>考え中...</span>
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            <form className={styles.inputArea} onSubmit={handleSubmit}>
              <textarea
                className={styles.textarea}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  !hasConfig
                    ? 'AI設定が必要です'
                    : !hasPersona
                    ? 'ペルソナ推論を先に実行してください'
                    : 'メッセージを入力（Enter で送信、Shift+Enter で改行）'
                }
                disabled={!hasConfig || !hasPersona || chatMutation.isPending}
                rows={3}
              />
              <button
                type="submit"
                className={styles.sendBtn}
                disabled={!canSend}
              >
                送信
              </button>
            </form>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
