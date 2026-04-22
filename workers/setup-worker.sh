#!/usr/bin/env bash
# workers/setup-worker.sh
#
# .env.local を元に Workers の環境変数を一括セットアップするスクリプト。
#
# やること:
#   1. .env.local → workers/.dev.vars を生成（wrangler dev がローカルで自動読み込み）
#   2. Cloudflare 本番環境に wrangler secret bulk で Secret を一括アップロード
#
# 使い方:
#   cd workers
#   chmod +x setup-worker.sh
#   ./setup-worker.sh          # .dev.vars 生成 + 本番 Secret アップロード
#   ./setup-worker.sh --local  # .dev.vars 生成のみ（本番アップロードをスキップ）

set -euo pipefail

ENV_FILE="../.env.local"
DEV_VARS_FILE=".dev.vars"

# .env.local の存在チェック
if [[ ! -f "$ENV_FILE" ]]; then
  echo "エラー: $ENV_FILE が見つかりません。プロジェクトルートに .env.local を作成してください。" >&2
  exit 1
fi

# .env.local からキーと値を読み取るヘルパー関数
# コメント行・空行・NEXT_PUBLIC_ のリネーム対応
get_env() {
  local key="$1"
  grep -E "^${key}=" "$ENV_FILE" | head -1 | cut -d'=' -f2-
}

echo "──────────────────────────────────────────"
echo " Workers 環境変数セットアップ"
echo "──────────────────────────────────────────"

# ─── Step 1: .dev.vars を生成（ローカル開発用）──────────────────────────────
# wrangler dev はこのファイルを自動で読み込む。
# wrangler.jsonc の [vars] に書いた公開値（SUPABASE_URL, SUPABASE_ANON_KEY）は
# .dev.vars に書かなくてもよいが、上書きしたい場合はここに書ける。
# Secret（SUPABASE_SERVICE_ROLE_KEY）はローカルでも必要なのでここに含める。

SUPABASE_URL=$(get_env "NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_ANON_KEY=$(get_env "NEXT_PUBLIC_SUPABASE_ANON_KEY")
SERVICE_ROLE_KEY=$(get_env "SUPABASE_SERVICE_ROLE_KEY")

if [[ -z "$SERVICE_ROLE_KEY" ]]; then
  echo "警告: .env.local に SUPABASE_SERVICE_ROLE_KEY が見つかりません。" >&2
fi

cat > "$DEV_VARS_FILE" <<EOF
# workers/.dev.vars — wrangler dev が自動で読み込むローカル開発用の環境変数
# このファイルは .gitignore で除外済み。コミットしないこと。
# 生成元: ../.env.local

# wrangler.jsonc の [vars] と同じ値（ローカルで上書きしたい場合に使う）
SUPABASE_URL=${SUPABASE_URL}
SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}

# Secret（本番では wrangler secret bulk で登録。ここではローカル開発用）
SUPABASE_SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}
EOF

echo "✓ .dev.vars を生成しました（wrangler dev で自動読み込みされます）"

# ─── Step 2: 本番 Secret を wrangler secret bulk でアップロード ────────────
if [[ "${1:-}" == "--local" ]]; then
  echo "ℹ --local フラグあり。本番 Secret のアップロードをスキップします。"
  echo "  本番にアップロードする場合: ./setup-worker.sh"
  exit 0
fi

echo ""
echo "Cloudflare 本番環境に Secret をアップロード中..."

# wrangler secret bulk は JSON ファイルを受け取る
# 一時ファイルに JSON を書き出して渡す
TMP_JSON=$(mktemp /tmp/wrangler-secrets-XXXXXX.json)
trap 'rm -f "$TMP_JSON"' EXIT  # スクリプト終了時に一時ファイルを削除

# jq がある場合は jq で安全にエスケープ、なければ手動で構築
if command -v jq &>/dev/null; then
  jq -n \
    --arg key "$SERVICE_ROLE_KEY" \
    '{"SUPABASE_SERVICE_ROLE_KEY": $key}' > "$TMP_JSON"
else
  # jq なし: 値にダブルクォートやバックスラッシュが含まれる場合は jq を使うこと
  printf '{"SUPABASE_SERVICE_ROLE_KEY": "%s"}\n' "$SERVICE_ROLE_KEY" > "$TMP_JSON"
fi

npx wrangler secret bulk "$TMP_JSON"

echo ""
echo "✓ 完了！"
echo ""
echo "次のステップ:"
echo "  1. KVネームスペースを未作成の場合: npx wrangler kv:namespace create \"HTML_CACHE\""
echo "  2. wrangler.jsonc の kv_namespaces の id を上記で取得した値に更新"
echo "  3. ローカル確認: npm run dev"
echo "  4. デプロイ:     npm run deploy"
