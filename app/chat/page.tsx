'use client';

import { useState, useEffect, useRef, FormEvent, KeyboardEvent, useCallback } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { usePersona, useChatMutation } from '@/lib/mockQueryClient';
import { loadLMConfig } from '@/lib/lmConfig';
import type { ChatMessage } from '@/types';
import { buildEvidenceLoggingFallback, type EvidenceLoggingFallback } from '@/application/llm/evidenceLoggingFallback';
import { saveEvidenceLoggingDraft } from '@/lib/evidenceDraftStorage';
import styles from './page.module.css';

interface ThreadSummary {
  id: string;
  title: string;
  createdAt: string;
}

interface PersistedMessage {
  id: string;
  pairNodeId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

// UI message type — extends ChatMessage with optional pairNodeId for rethink support
interface UIChatMessage {
  role: 'user' | 'assistant';
  content: string;
  pairNodeId?: string;
}

function persistedToUI(msg: PersistedMessage): UIChatMessage {
  return { role: msg.role, content: msg.content, pairNodeId: msg.pairNodeId };
}

export default function ChatPage() {
  const { data: personaPayload, isLoading: personaLoading } = usePersona();
  const chatMutation = useChatMutation();

  const [messages, setMessages] = useState<UIChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [hasConfig, setHasConfig] = useState(false);
  const [currentThreadId, setCurrentThreadId] = useState<string | undefined>(undefined);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [evidenceFallback, setEvidenceFallback] = useState<EvidenceLoggingFallback | null>(null);

  // Rethink state
  const [rethinkActivePairNodeId, setRethinkActivePairNodeId] = useState<string | null>(null);
  const [rethinkInput, setRethinkInput] = useState('');
  const [rethinkingPairNodeId, setRethinkingPairNodeId] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHasConfig(loadLMConfig() !== null);
  }, []);

  useEffect(() => {
    if (typeof bottomRef.current?.scrollIntoView === 'function') {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, chatMutation.isPending, rethinkingPairNodeId]);

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
      setMessages(json.messages.map(persistedToUI));
    }
  }

  function startNewThread() {
    setCurrentThreadId(undefined);
    setMessages([]);
    setRethinkActivePairNodeId(null);
    setRethinkingPairNodeId(null);
  }

  const isBusy = chatMutation.isPending || rethinkingPairNodeId !== null;
  const snapshot = personaPayload?.snapshot ?? null;
  const snapshotGenerationEnabled = personaPayload?.snapshotGenerationEnabled ?? true;
  const hasPersona = !personaLoading && !!snapshot;
  const canSend = hasConfig && hasPersona && !isBusy && input.trim() !== '';
  const activeHypothesisCount = snapshot?.activeHypothesisCount ?? 0;
  const activeEvidenceFallback =
    evidenceFallback ??
    (activeHypothesisCount === 0
      ? buildEvidenceLoggingFallback({
          allowChatFallbackDraft: personaPayload?.allowChatFallbackDraft ?? true,
        })
      : null);

  useEffect(() => {
    if (activeHypothesisCount > 0 && evidenceFallback) {
      setEvidenceFallback(null);
    }
  }, [activeHypothesisCount, evidenceFallback]);

  function handleSaveEvidenceDraft() {
    if (!activeEvidenceFallback) return;
    if (personaPayload?.allowChatFallbackDraft === false) return;
    if (!activeEvidenceFallback.suggestedTemplate) return;
    saveEvidenceLoggingDraft({
      template: activeEvidenceFallback.suggestedTemplate,
      questions: activeEvidenceFallback.questions,
      source: 'chat_fallback',
    });
  }

  async function handleSend() {
    const message = input.trim();
    if (!message || !canSend) return;

    const newHistory: UIChatMessage[] = [...messages, { role: 'user', content: message }];
    setMessages(newHistory);
    setInput('');

    try {
      const result = await chatMutation.mutateAsync({
        message,
        history: messages.slice(-20).map((m): ChatMessage => ({ role: m.role, content: m.content })),
        threadId: currentThreadId,
      });
      if (result.mode === 'evidence_logging') {
        setEvidenceFallback({
          mode: 'evidence_logging',
          reason: 'active_hypotheses_empty',
          questions: result.questions ?? [],
          suggestedTemplate: result.suggestedTemplate ?? '',
        });
        const formatted = [
          '仮説を作るために、次の点を記録してください。',
          ...(result.questions ?? []).map((q) => `- ${q}`),
          ...(result.suggestedTemplate ? [`テンプレート: ${result.suggestedTemplate}`] : []),
        ].join('\n');
        setMessages([...newHistory, { role: 'assistant', content: formatted }]);
      } else {
        setMessages([
          ...newHistory,
          { role: 'assistant', content: result.response ?? '', pairNodeId: result.pairNodeId },
        ]);
      }

      if (result.threadId && result.threadId !== currentThreadId) {
        setCurrentThreadId(result.threadId);
        void fetchThreads();
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'エラーが発生しました';
      setMessages([...newHistory, { role: 'assistant', content: `⚠️ ${errMsg}` }]);
    }
  }

  async function handleRethink(pairNodeId: string) {
    if (!currentThreadId) return;
    const newPrompt = rethinkInput.trim();
    setRethinkActivePairNodeId(null);
    setRethinkInput('');
    setRethinkingPairNodeId(pairNodeId);

    // Clear the current content to show streaming from scratch
    setMessages((prev) =>
      prev.map((msg) =>
        msg.pairNodeId === pairNodeId && msg.role === 'assistant'
          ? { ...msg, content: '' }
          : msg,
      ),
    );

    try {
      const cfg = loadLMConfig();
      if (!cfg) throw new Error('LM設定が見つかりません。設定ページで設定してください。');

      const res = await fetch('/api/chat/rethink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pairNodeId, newPrompt, threadId: currentThreadId, lmConfig: cfg }),
      });

      const contentType = res.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        const json = (await res.json()) as { mode?: string; questions?: string[]; suggestedTemplate?: string; message?: string };
        if (!res.ok) throw new Error(json.message ?? 'やり直しに失敗しました');
        if (json.mode === 'evidence_logging') {
          setEvidenceFallback({
            mode: 'evidence_logging',
            reason: 'active_hypotheses_empty',
            questions: json.questions ?? [],
            suggestedTemplate: json.suggestedTemplate ?? '',
          });
          const formatted = [
            '仮説を作るために、次の点を記録してください。',
            ...(json.questions ?? []).map((q) => `- ${q}`),
            ...(json.suggestedTemplate ? [`テンプレート: ${json.suggestedTemplate}`] : []),
          ].join('\n');
          setMessages((prev) =>
            prev.map((msg) =>
              msg.pairNodeId === pairNodeId && msg.role === 'assistant'
                ? { ...msg, content: formatted }
                : msg,
            ),
          );
          return;
        }
      }

      if (!res.ok) {
        const json = (await res.json()) as { message?: string };
        throw new Error(json.message ?? 'やり直しに失敗しました');
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const json = JSON.parse(line.slice(6)) as {
              chunk?: string;
              done?: boolean;
              error?: string;
            };
            if (json.chunk) {
              accumulated += json.chunk;
              const snapshot = accumulated;
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.pairNodeId === pairNodeId && msg.role === 'assistant'
                    ? { ...msg, content: snapshot }
                    : msg,
                ),
              );
            }
            if (json.error) throw new Error(json.error);
          } catch (parseErr) {
            if (parseErr instanceof SyntaxError) continue; // ignore malformed SSE
            throw parseErr;
          }
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'やり直しに失敗しました';
      setMessages((prev) =>
        prev.map((msg) =>
          msg.pairNodeId === pairNodeId && msg.role === 'assistant'
            ? { ...msg, content: `⚠️ ${errMsg}` }
            : msg,
        ),
      );
    } finally {
      setRethinkingPairNodeId(null);
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

  return (
    <>
      <Header />
      <main className={styles.main}>
        <div className={styles.layout}>
          {/* Left sidebar: model summary */}
          <aside className={styles.sidebar}>
            <h2 className={styles.sidebarTitle}>ユーザーモデル</h2>
            <p className={styles.sidebarLead}>
              ここは現在の仮説要約です。確定プロフィールではなく、Evidence から更新されるメモです。
            </p>

            {personaLoading && <p className={styles.loading}>読み込み中...</p>}

            {!personaLoading && !snapshotGenerationEnabled && (
              <div className={styles.warningBox}>
                <p>
                  モデル要約は無効です。
                  <Link href="/settings" className={styles.link}>
                    設定ページ
                  </Link>
                  で有効化できます。
                </p>
              </div>
            )}

            {!personaLoading && snapshotGenerationEnabled && !hasPersona && (
              <div className={styles.warningBox}>
                <p>
                  モデル要約がありません。
                  <Link href="/persona" className={styles.link}>
                    モデル要約ページ
                  </Link>
                  で仮説を更新してください。
                </p>
              </div>
            )}

            {snapshot && (
              <>
                <p className={styles.loading}>{snapshot.summaryText}</p>
                <div className={styles.traitList}>
                  {snapshot.topHypotheses.map((h) => (
                    <div key={`${h.traitKey}-${h.hypothesisLabel}`} className={styles.clusterItem}>
                      <span>{h.hypothesisText}</span>
                      <span className={styles.clusterCount}>
                        {Math.round(h.confidence * 100)}%
                      </span>
                    </div>
                  ))}
                </div>

                <p className={styles.snapshotDate}>
                  {new Date(snapshot.createdAt).toLocaleString('ja-JP')}
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
                {activeEvidenceFallback
                  ? 'まだ仮説を作る材料が足りません。下の質問に答えるか、記録を追加してください。'
                  : hasPersona && hasConfig
                    ? 'メッセージを送信して対話を始めましょう。'
                    : hasPersona
                      ? 'AI設定を行うとチャットを開始できます。'
                      : '仮説を更新するとチャットを開始できます。'}
              </p>
              )}

              {messages.map((msg, i) => (
                <div key={i} className={styles.bubbleWrapper}>
                  {msg.role === 'user' ? (
                    <div className={styles.bubbleUser}>{msg.content}</div>
                  ) : (
                    <>
                      <div className={styles.bubbleAssistant}>
                        {rethinkingPairNodeId === msg.pairNodeId && msg.content === '' ? (
                          <span className={styles.thinking}>考え中...</span>
                        ) : (
                          msg.content
                        )}
                      </div>

                      {/* Rethink controls — only for persisted assistant messages */}
                      {msg.pairNodeId && currentThreadId && (
                        rethinkActivePairNodeId === msg.pairNodeId ? (
                          <div className={styles.rethinkForm}>
                            <input
                              className={styles.rethinkInput}
                              value={rethinkInput}
                              onChange={(e) => setRethinkInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  void handleRethink(msg.pairNodeId!);
                                }
                                if (e.key === 'Escape') setRethinkActivePairNodeId(null);
                              }}
                              placeholder="新しい指示（空欄で再生成）"
                              autoFocus
                              disabled={isBusy}
                            />
                            <button
                              className={styles.rethinkSubmitBtn}
                              onClick={() => void handleRethink(msg.pairNodeId!)}
                              disabled={isBusy}
                            >
                              実行
                            </button>
                            <button
                              className={styles.rethinkCancelBtn}
                              onClick={() => setRethinkActivePairNodeId(null)}
                              disabled={isBusy}
                            >
                              ×
                            </button>
                          </div>
                        ) : (
                          <button
                            className={styles.rethinkBtn}
                            onClick={() => {
                              setRethinkActivePairNodeId(msg.pairNodeId!);
                              setRethinkInput('');
                            }}
                            disabled={isBusy}
                          >
                            やり直す
                          </button>
                        )
                      )}
                    </>
                  )}
                </div>
              ))}

              {chatMutation.isPending && (
                <div className={styles.bubbleWrapper}>
                  <div className={styles.bubbleAssistant}>
                    <span className={styles.thinking}>考え中...</span>
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            {activeEvidenceFallback && (
              <section className={styles.evidencePanel} aria-label="Evidence Logging">
                <p className={styles.evidenceLabel}>Evidence Logging</p>
                <h3 className={styles.evidenceTitle}>まだ仮説を作る材料が足りません。</h3>
                <p className={styles.evidenceDescription}>
                  次の3問に答えると、判断材料として記録できます。書き終えたら、そのまま仮説更新へ進めます。
                </p>
                <ol className={styles.evidenceQuestionList}>
                  {activeEvidenceFallback.questions.map((question) => (
                    <li key={question} className={styles.evidenceQuestion}>
                      {question}
                    </li>
                  ))}
                </ol>
                {activeEvidenceFallback.suggestedTemplate ? (
                  <div className={styles.evidenceTemplateBox}>
                    <span className={styles.evidenceTemplateLabel}>下書き</span>
                    <p className={styles.evidenceTemplateText}>{activeEvidenceFallback.suggestedTemplate}</p>
                  </div>
                ) : (
                  <div className={styles.evidenceTemplateBox}>
                    <span className={styles.evidenceTemplateLabel}>下書き</span>
                    <p className={styles.evidenceTemplateText}>下書きは無効です。質問だけを参考にしてください。</p>
                  </div>
                )}
                <div className={styles.evidenceActions}>
                  <Link
                    href="/log/new"
                    onClick={handleSaveEvidenceDraft}
                    className={styles.evidencePrimaryBtn}
                    aria-disabled={personaPayload?.allowChatFallbackDraft === false}
                  >
                    記録を追加する
                  </Link>
                  <Link href="/persona" className={styles.evidenceSecondaryBtn}>
                    仮説を更新
                  </Link>
                </div>
              </section>
            )}

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
                    ? 'ユーザーモデルを更新してください'
                    : 'メッセージを入力（Enter で送信、Shift+Enter で改行）'
                }
                disabled={!hasConfig || !hasPersona || isBusy}
                rows={3}
                maxLength={1000}
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
