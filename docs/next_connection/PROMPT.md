# 引き継ぎ資料 参照プロンプト

毎セッション、作業を開始する前に必ずこの手順を踏むこと。
このファイルは CLAUDE.md からリンクされており、Claude が必ず通る経路となっている。

---

## STEP 1 — 目次を開く

```
Read docs/next_connection/目次.md
```

これから触る領域に関連するキーワード（ファイル名・機能名・エラーメッセージ・カテゴリ）を
索引から拾う。

## STEP 2 — キーワードで検索

特に確実に当てたい場合は grep:

```bash
grep -rni "<keyword>" docs/next_connection/index/active/
```

例:
- LLM/チャット関連の作業 → `grep -rni "lm-studio\|llm\|chat" docs/next_connection/index/active/`
- デプロイ作業 → `grep -rni "deploy\|cloudflare\|wrangler" docs/next_connection/index/active/`
- バグ調査 → `grep -rni "<エラーメッセージ抜粋>" docs/next_connection/index/`

## STEP 3 — 該当ファイルを精読

優先順:
1. `index/active/` — **未解決問題を含むため最優先**
2. `index/resolved/` — 過去の解決済み事例（似た問題に当たるかもしれない）
3. `index/archive/` — 履歴参照用

特にフロントマターの `status: active` のファイルは、書かれている未解決問題と
回避策を頭に入れてから作業に入る。

## STEP 4 — 作業開始

ここまでで把握した制約・既知の問題を踏まえて作業に入る。

## STEP 5 — 作業終了時の更新

新たに以下が発生したら必ず `docs/next_connection/` に記録:
- 未解決問題・次セッションへの申し送り → `index/active/<category>/` に新規 or 追記
- 解決した既存 active 項目 → ファイル末尾に「解決日・解決方法」を追記して `index/resolved/` へ `git mv`、`目次.md` 更新

詳細な追加手順は `README.md` を参照。
