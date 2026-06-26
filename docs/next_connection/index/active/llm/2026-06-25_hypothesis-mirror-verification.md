---
name: hypothesis-mirror-verification
description: 「構造の鏡」仮説検証層の実装状況・既知の未解決事項
metadata:
  type: project
  status: active
  date: 2026-06-25
---

# 仮説検証層（構造の鏡）実装記録

## 実装完了内容

`supabase/migrations/041_trait_hypothesis_verification.sql` から始まる一連の変更で、
`/persona` ページに「構造の鏡 — 仮説を確認する」セクションを追加した。

### 変更ファイル

| Path | 種別 |
|---|---|
| `supabase/migrations/041_trait_hypothesis_verification.sql` | 新規 |
| `src/core/domains/trait/TraitHypothesis.ts` | 編集（source/revisedFromId/userCorrection/verifiedAt 追加） |
| `src/core/domains/trait/ITraitHypothesisRepository.ts` | 編集（findLiveByUser/findHistoryByTraitKey/reviseAtomic/confirm/hold 追加） |
| `src/infrastructure/repositories/SupabaseTraitHypothesisRepository.ts` | 編集（上記実装） |
| `src/application/llm/structuralMirrorPrompt.ts` | 新規 |
| `src/application/llm/policies/LLMResponseValidator.ts` | 編集（validateRevisionResponse 追加） |
| `src/application/usecases/VerifyTraitHypothesisUseCase.ts` | 新規 |
| `src/container/createUseCases.ts` | 編集（createVerifyTraitHypothesisUseCase 追加） |
| `app/api/hypotheses/route.ts` | 新規（GET） |
| `app/api/hypotheses/[id]/history/route.ts` | 新規（GET、`id` param = traitKey） |
| `app/api/hypotheses/[id]/verify/route.ts` | 新規（POST、`id` param = hypothesis UUID） |
| `lib/useHypothesisMirror.ts` | 新規 |
| `components/HypothesisMirror.tsx` + `.module.css` | 新規 |
| `app/persona/page.tsx` | 編集（HypothesisMirror マウント 1行） |

## 2026-06-26 セッション更新

- migration 001〜041 を `npx supabase db push` で適用完了
- コード自体にバグなし（findLiveByUser / confirm / hold / reviseAtomic すべて確認済み）
- `/persona` の動作確認（HypothesisMirror の各ボタン）は **未実施**。次セッションで確認すること

## 未解決・次セッションへの注意事項

### 1. spec doc と plan doc の関係

- `docs/hypothesis-verification-claude-code-spec.md`（234行）— Opus が claude.ai 上で書いた
  Claude Code 向け実装指示。git 未追跡（`??`）のままワーキングツリーに存在する。
  §1–§12 形式で実装手順が書かれており、次セッションで参照可能。
- `docs/eval/Attach_Mirrorof_Structure.md` — 今セッションが実際に実装の根拠にしたファイル。
  spec doc との差異（設計意図のすり合わせ・NON-GOALS の明示等）はこちらに記載。

**今回の実装は spec doc を逐語的に追ったのではなく、`Attach_Mirrorof_Structure.md` の
設計意図とコードベースの既存パターンを照合して書いたもの**。
spec doc との細部の差異が気になる場合は両ファイルを読み比べること。

### 2. `[id]` セグメントの二重用途（既知の罠）

Next.js は同一深度に複数の異なる動的セグメント名を許容しないため、
`[traitKey]` と `[id]` を併用しようとして `dev` 起動時にエラーが出た。
現在の構造：

```
app/api/hypotheses/[id]/history/route.ts  → params.id = traitKey（例: "introversion"）
app/api/hypotheses/[id]/verify/route.ts   → params.id = hypothesis UUID
```

セマンティクスが異なるが URL 構造を変えたくなかったためこの形に落ち着いた。
`history/route.ts` 内では `const { id: traitKey } = await params;` として読んでいる。
将来 API を整理する場合は `/api/hypotheses/history/[traitKey]` に移すのが素直。

### 3. フェーズ2（矛盾プローブ）は未実装

矛盾を突く「鏡の問い」生成・`/api/hypotheses/probe/answer` ループは
明示的にフェーズ2とされ、今回は実装していない。ファイルも作っていない。

### 4. `/persona` の数値%表示と新コンポーネントの非数値表示が並存

既存「現在の仮説要約」セクション（confidence/uncertainty を `%` で表示）と
新しい `<HypothesisMirror />` セクション（非数値、高/中/低の質的表示）が
同じページに共存している。将来どちらかに統一する判断が必要。
現状はどちらも残っている。

### 5. `supabase db push` — **解決済み（2026-06-26）**

migration 001〜041 を以下のコマンドで一括適用済み：

```bash
npx supabase login
npx supabase link --project-ref archksbnwonqkmzbbahj
npx supabase db push
```

**注意点（次回以降も有効）：**
- `supabase` コマンドは PATH になく、`npx supabase` で呼ぶ必要がある
- Supabase Studio の SQL エディタに migration を直接貼り付けてはいけない。
  前提となる migration（例: 031 が作る `trait_hypothesis_history` テーブル）が
  未適用だと `42P01 relation does not exist` で失敗する
- `supabase link` 時のプロジェクト ref: `archksbnwonqkmzbbahj`

### 6. テストは未作成

計画（§10）のテストは未実装。
`VerifyTraitHypothesisUseCase` のユニットテストと
`SupabaseTraitHypothesisRepository` の統合テストが必要。

**Why:** 実装の正確性を保証するため、特に `reviseAtomic` の DB 反映と
LLM 再試行ロジックのテストは優先度が高い。

**How to apply:** 次セッションで余裕があればテスト追加を優先すること。
