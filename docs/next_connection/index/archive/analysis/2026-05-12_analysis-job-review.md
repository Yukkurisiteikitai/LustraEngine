---
title: Analysis Job Pipeline 実行可能性レビュー
category: analysis
status: archived
date: 2026-05-12
tags: [analysis-job, pipeline, e2e, blocker, review]
related: [../bug/2026-06-08_blocker-fix-complete.md, ../bug/2026-06-08_blocker-fix-report.md]
---

# Analysis Job Pipeline 実行可能性レビューレポート

## 確認日: 2026-05-12
## ステータス: **🔴 E2E阻害要因あり**

---

## 1. 動作する箇所 ✅

### 1.1 Log保存処理
- ✅ POST /api/logs: save-only 責務（fire-and-forget削除）
- ✅ processed_at: NULL で保存
- ✅ UI: 「記録しました」メッセージ表示
- ✅ Migration 028: processed_at column追加
- ✅ Migration 029: analysis_jobs table + RLS + 制約

### 1.2 手動分析ジョブ作成
- ✅ /api/analysis/jobs: POST エンドポイント
- ✅ CreateAnalysisJobUseCase: mode validate + idempotency check
- ✅ SupabaseAnalysisJobRepository: createOrGetActive() CAS実装
- ✅ UI ボタン: PatternDetectButton / TraitInferButton → mode選択
- ✅ CloudflareAnalysisQueueProducer: Queue.send() 実装

### 1.3 Cloudflare周辺
- ✅ wrangler.jsonc: Queue binding 追加
- ✅ cloudflare-env.d.ts: AnalysisQueueMessage型定義
- ✅ worker.ts: fetch/queue/scheduled export構造

### 1.4 Context構築
- ✅ AnalysisContextService: mode別context構築
  - recent 1week: ✅
  - unprocessed logs: ✅
  - 3month summary: ✅
  - previous traits/patterns: ✅

---

## 2. Stub/Placeholder（実装未完）🟡

### 2.1 Worker Queue Handler (BLOCKER)
**ファイル:** worker.ts:36-47
```typescript
async function handleQueue(...): Promise<void> {
  for (const message of batch.messages) {
    try {
      // TODO: Implement actual analysis job consumer in Phase 10
      // This will invoke AnalysisJobConsumer with message.body
      message.ack();
    }
  }
}
```
**問題:** 
- AnalysisJobConsumer を呼び出していない
- message.body を処理していない
- 実装なし → Queue message は ack されるだけで何もされない

**影響:** Queue に入ったジョブが処理されない

---

### 2.2 Worker Scheduled Handler (BLOCKER)
**ファイル:** worker.ts:56-65
```typescript
async function handleScheduled(...): Promise<void> {
  console.log('[Scheduled] Daily analysis batch triggered');
  try {
    // TODO: Implement daily scheduler in Phase 12
  }
}
```
**問題:**
- DailyAnalysisScheduler を呼び出していない
- 処理なし → daily batch が実行されない

**影響:** Daily batch による自動分析が動作しない

---

### 2.3 AnalysisJobConsumer (BLOCKER)
**ファイル:** src/infrastructure/jobs/AnalysisJobConsumer.ts:63-89
```typescript
// Step 3: Run detect patterns
logger.info(`[AnalysisJobConsumer] Running DetectPatterns for job ${jobId}`);
const detectUseCase = new DetectPatternsUseCase(...);
// Note: detectUseCase expects full experiences list; pass context.recentLogs as alternative
// This is a simplified implementation; actual usage may need adjustment

// Step 4: Run infer traits (if not quick mode)
if (mode !== 'quick') {
  const inferUseCase = new InferTraitsUseCase(...);
  // Run inference
  // Note: This is placeholder; actual implementation needs to use context
}
```
**問題:**
- DetectPatterns/InferTraits useCase を作成したが、execute() を呼んでいない
- コメント「This is a simplified implementation; actual usage may need adjustment」

**影響:** ジョブが running になっても、分析ロジックが実行されない

---

### 2.4 DetectPatterns/InferTraits シグネチャ不適合 (BLOCKER)
**ファイル:** 
- src/application/usecases/DetectPatternsUseCase.ts:24
- src/application/usecases/InferTraitsUseCase.ts:32

```typescript
// Current
async execute(userId: string): Promise<{ classified: number }> {
  const targets = await this.expRepo.findUnclassified(userId);
  // ...
}

// Expected by AnalysisContextService
async execute(
  userId: string, 
  context: AnalysisContext
): Promise<...> {
  // use context.recentLogs, context.unprocessedLogs
}
```
**問題:**
- UseCase のシグネチャが仕様（context パラメータ）と異なる
- AnalysisJobConsumer が context を構築しているのに、useCase が受け取らない
- findUnclassified() で「全未分類」を取得 → quick/full_3months/daily の区別がない

**影響:** mode別 context が活用されない

---

## 3. E2E阻害ブロッカー 🔴

| # | カテゴリ | 現象 | 影響度 |
|---|---------|------|--------|
| 1 | worker.ts queue handler | Queue message を ack するだけ | **CRITICAL** |
| 2 | worker.ts scheduled handler | 処理なし | **CRITICAL** |
| 3 | AnalysisJobConsumer | useCase.execute() を呼んでいない | **CRITICAL** |
| 4 | DetectPatterns/InferTraits | context パラメータ未対応 | **CRITICAL** |
| 5 | quick mode | traits/persona 本体を更新していないか確認 | MEDIUM |
| 6 | quick mode | processed_at を更新していないか確認 | MEDIUM |

---

## 4. 確認観点別 検査結果

### ✅ 1. /api/analysis/jobs で作成されたjobがQueue enqueueされるか
**状態:** 🟢 動作  
- POST /api/analysis/jobs は job を作成 → queue enqueue (wait_until)  
- CloudflareAnalysisQueueProducer.enqueue() は queue.send() を呼ぶ  
- ✅ ここまで正常

### ❌ 2. queue handlerがAnalysisJobConsumerへ接続されているか
**状態:** 🔴 未実装  
- worker.ts:handleQueue() が TODO のままで、AnalysisJobConsumer を呼んでない
- **ブロッカー**

### ❌ 3. scheduled handlerがDailyAnalysisSchedulerへ接続されているか
**状態:** 🔴 未実装  
- worker.ts:handleScheduled() が TODO のままで、DailyAnalysisScheduler を呼んでない
- **ブロッカー**

### ❌ 4. AnalysisJobConsumerがpending→running→completed/failedまで更新するか
**状態:** 🟡 部分実装  
- pending → running: ✅ CAS で実装
- running → completed: ✅実装
- running → failed: ✅ 実装
- ただし **analyze を実行していない** → failed にならず、completed になる

### ✅ 5. CAS updateが正しく実装されているか
**状態:** 🟢 正しい  
```sql
UPDATE analysis_jobs
SET status = 'running', started_at = now()
WHERE id = :jobId
  AND status = 'pending'
  AND user_id = :userId
RETURNING *;
```

### ❓ 6. quick modeでtraits/persona/patterns本体を更新していないか
**状態:** 🟡 確認が必要  
- AnalysisJobConsumer で inferTraits.execute() を呼んでいないため、実装されていない
- → 問題なし（呼ばないので更新されない）
- ただし **現在コードが実行されていない**

### ❓ 7. quick modeでprocessed_atを更新していないか
**状態:** 🟢 正しい  
```typescript
if (mode !== 'quick') {
  // Update processed_at only for daily/full_3months
}
```

### ❌ 8. full_3months/dailyで未処理logだけprocessed_at更新しているか
**状態:** 🟡 部分実装  
```typescript
const unprocessedIds = context.unprocessedLogs.map((log) => log.id);
if (unprocessedIds.length > 0) {
  await this.supabase.from('experiences')
    .update({ processed_at: new Date().toISOString() })
    .in('id', unprocessedIds);
}
```
- ✅ ロジックは正しいが、analyze を実行していないため実効性がない

### ❓ 9. workerでservice role clientを使っているか
**状態:** 🟡 確認が必要  
- worker.ts で Supabase client を初期化していない
- AnalysisJobConsumer に service role client が渡されていない
- **具体的な実装が不明**

### ❌ 10. workerでauth.uid()依存RPCを呼んでいないか
**状態:** 🟡 確認が必要  
- 現在実装されていないため、呼んでいない
- ただし DetectPatterns/InferTraits が auth.uid() RPC を使うかどうか不明

### ❌ 11. DetectPatterns/InferTraitsがAnalysisContextServiceの入力に対応しているか
**状態:** 🔴 未対応  
- DetectPatterns: userId のみ受け取る → findUnclassified() で全件取得
- InferTraits: userId のみ受け取る → findByUser(), findRecent() で独自取得
- AnalysisContextService との連携がない
- **ブロッカー**

### ❌ 12. analysis_jobs.resultにquick結果が保存されるか
**状態:** 🟡 部分実装  
```typescript
result: {
  mode,
  trigger,
  processedCount: context.unprocessedLogs.length,
}
```
- ✅ job completion 時に result を保存するロジックあり
- ❌ 実際の分析結果（detect/infer output）を格納していない
- 🟡 analyze を実行していないため moot

### ✅ 13. failed時にerrorが保存されるか
**状態:** 🟢 実装  
```typescript
error: error instanceof Error ? error.message : JSON.stringify(error),
```

### ✅ 14. UIから/api/patterns/detectや/api/traits/inferを直接呼んでいないか
**状態:** 🟢 正しい  
- ✅ PatternDetectButton: /api/analysis/jobs を呼ぶ
- ✅ TraitInferButton: /api/analysis/jobs を呼ぶ
- ✅ UI から直接 detect/infer endpoint を呼ばない

---

## 5. 修正対象ファイル一覧

### Priority 1: CRITICAL (E2E を阻害)

1. **worker.ts** (lines 36-47, 56-65)
   - AnalysisJobConsumer を new して message.body を process
   - DailyAnalysisScheduler を new して run() 呼び出し

2. **AnalysisJobConsumer.ts** (lines 63-89)
   - detectUseCase.execute() を await
   - inferUseCase.execute() を await
   - quick mode の logic を実装

3. **DetectPatternsUseCase.ts** (line 24)
   - シグネチャを AnalysisContext を受け取るように変更
   - findUnclassified() ではなく context.recentLogs, context.unprocessedLogs を使用

4. **InferTraitsUseCase.ts** (line 32)
   - シグネチャを AnalysisContext を受け取るように変更
   - findByUser() / findRecent() ではなく context を使用

### Priority 2: IMPORTANT (環境構築)

5. **worker.ts** (top of file)
   - Supabase admin client 初期化
   - AnalysisJobConsumer に service role client を渡す
   - DailyAnalysisScheduler に service role client を渡す

6. **wrangler.jsonc** (scheduled)
   - `cron` schedule 追加 (e.g., "0 0 * * *" for daily at 00:00 UTC)

---

## 6. 修正順序

```
1. worker.ts を修正
   ├─ Supabase admin client 初期化
   ├─ AnalysisJobConsumer インスタンス化
   └─ DailyAnalysisScheduler インスタンス化

2. DetectPatternsUseCase.ts を修正
   ├─ execute() シグネチャを context パラメータ対応
   └─ findUnclassified() → context.recentLogs/unprocessedLogs 使用

3. InferTraitsUseCase.ts を修正
   ├─ execute() シグネチャを context パラメータ対応
   └─ findByUser/findRecent() → context 使用

4. AnalysisJobConsumer.ts を修正
   ├─ detectUseCase.execute(userId, context) 呼び出し
   ├─ inferUseCase.execute(userId, context) 呼び出し
   └─ quick mode で analyze をスキップ

5. wrangler.jsonc に cron schedule 追加

6. migrations 適用（supabase db push）
```

---

## 7. テスト観点

### E2E シナリオ: Manual Analysis (quick)

```
1. UI: パターン分析 → "クイック分析"を選択
2. POST /api/analysis/jobs { mode: "quick" }
3. Job created: status='pending'
4. Queue enqueue: AnalysisQueueMessage送信
5. worker.queue 受信 → AnalysisJobConsumer.process()
6. CAS: pending → running
7. context 構築（1week recent）
8. detectUseCase.execute(userId, context) → パターン検出（ただしDB更新しない）
9. inferUseCase は **呼ばない** (quick mode)
10. processed_at: 更新しない
11. Job: completed (result に軽い概要)
12. ✅ UI は completion event で "分析が完了しました" 表示
```

### E2E シナリオ: Daily Batch

```
1. 毎日0時 → worker.scheduled 呼び出し
2. DailyAnalysisScheduler.run()
3. processed_at IS NULL の user抽出
4. 各 user に対し analysis_jobs 作成 (mode='daily', trigger='daily')
5. Queue enqueue
6. worker.queue 受信 → AnalysisJobConsumer.process()
7. context 構築（1week + 3month summary + unprocessed logs）
8. detectUseCase.execute(userId, context) → パターン検出 + DB更新
9. inferUseCase.execute(userId, context) → traits/persona 更新
10. unprocessed log に processed_at = now()
11. Job: completed
```

---

## 8. 残存リスク

| リスク | 対策 |
|--------|------|
| Supabase service role client が未初期化 | worker.ts で初期化, LLM adapter も確認 |
| DetectPatterns/InferTraits が context 対応でない | 上記 Priority 1-3 で対応 |
| Queue message 処理が ack only | worker.ts queue handler 実装 |
| scheduled handler が空 | worker.ts scheduled handler 実装 + cron schedule |
| quick mode result の内容が薄い | 分析実行後、概要を result.summary に格納 |

---

## 9. 結論

**現状:** 
- ✅ 基本的な API 設計と DB 構造は正しい
- ✅ UI から job 作成までのパス は動作する
- ❌ Worker 側の Queue/Scheduled handler が TODO
- ❌ 分析 UseCase のシグネチャが context 非対応
- ❌ AnalysisJobConsumer が analyze を実行していない

**次ステップ:** Priority 1 の 4 ファイルを修正してテスト → E2E パスが確立される
