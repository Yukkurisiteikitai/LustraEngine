# GitHub プロフィール・技術力分析ワークフロー

このドキュメントでは、ハッカソン参加者の GitHub プロフィールおよびリポジトリを自動解析して「得意技術の強み一覧」を生成するワークフローを説明します。

---

## 概要

`scripts/analyze-github-profiles.py` は、`scripts/participants.json` に記載された参加者の GitHub アカウントを対象に以下を収集・集計します：

- 公開リポジトリの言語バイト数（フォーク除く）
- スキルタグ（例: `TypeScript (55%) [Frontend / Fullstack]`）
- 上位リポジトリ一覧（スター順）
- フォロワー数・公開リポジトリ数

結果はマークダウン形式のレポートとして出力されます。

---

## 前提条件

- Python 3.11 以上（標準ライブラリのみ使用）
- GitHub Personal Access Token（レートリミット緩和のため推奨）

---

## セットアップ

### 1. GitHub Personal Access Token の取得（推奨）

未認証リクエストは 60回/時間 に制限されます。30名分の分析には少なくとも数百リクエストが必要なため、トークンの設定を推奨します。

1. [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens) にアクセス
2. **Fine-grained tokens** または **Classic tokens** で新規作成
3. スコープは `public_repo` 読み取りのみで十分です（プライベートリポジトリは不要）

### 2. 参加者リストの確認・編集

`scripts/participants.json` を開き、参加者の GitHub ユーザー名を確認してください。

```json
{
  "event": "イベント名",
  "participants": [
    { "displayName": "表示名", "github": "GitHubユーザー名" }
  ]
}
```

> **注意:** `github` フィールドは GitHub の実際のユーザー名（URL の `github.com/` の後の部分）を使用してください。

---

## 実行方法

### 基本的な実行（トークンなし）

```bash
python scripts/analyze-github-profiles.py
```

> ⚠️ 未認証では 60回/時間 のレートリミットがあるため、参加者数が多い場合は認証を推奨します。

### GitHub Token を環境変数で渡す（推奨）

```bash
GITHUB_TOKEN=ghp_xxxxxxxxxxxx python scripts/analyze-github-profiles.py
```

### コマンドラインオプション

```
python scripts/analyze-github-profiles.py [options]

オプション:
  --participants PATH   参加者JSONファイルのパス
                        (デフォルト: scripts/participants.json)
  --token TOKEN         GitHub Personal Access Token
                        (または環境変数 GITHUB_TOKEN を設定)
  --output PATH         出力マークダウンファイルのパス
                        (デフォルト: docs/participant-report.md)
  --top-repos N         各ユーザーの上位リポジトリ調査数
                        (デフォルト: 10)
```

### 出力先を変更する例

```bash
GITHUB_TOKEN=ghp_xxx python scripts/analyze-github-profiles.py \
  --output /tmp/hackathon-report.md \
  --top-repos 15
```

---

## 出力レポートの構成

生成されるレポート（デフォルト: `docs/participant-report.md`）には以下が含まれます：

### 1. 参加者サマリーテーブル

| # | 表示名 | GitHub | 公開Repo | 主要言語 TOP3 |
|---|--------|--------|----------|---------------|
| 1 | 山田太郎 | [username](https://github.com/username) | 12 | TypeScript, Python, Go |

### 2. 個人別プロフィール

各参加者について：

- **スキルタグ**: 言語バイト比率と技術ドメイン（例: `TypeScript (55%) [Frontend / Fullstack]`）
- **主要リポジトリ**: スター順で上位5件

### 3. 技術スタック全体分布

全参加者の言語バイト数を合算したランキングと、その言語を使用している参加者数。

---

## スキルタグの意味

| 言語 | ドメインタグ |
|------|-------------|
| TypeScript / JavaScript | Frontend / Fullstack |
| Python | Backend / Data / AI |
| Jupyter Notebook | Data / AI |
| Go | Backend / Infra |
| Rust | Backend / Infra / Systems |
| C / C++ | Systems / Embedded |
| Shell / Dockerfile / HCL | Infra / DevOps |
| Kotlin / Swift / Dart | Mobile |

---

## チーム編成の参考例

生成されたレポートの「スキルタグ」を参考に、以下のようなバランスでチームを組むことができます：

| ロール | 推奨スキルタグ |
|--------|---------------|
| フロントエンド | TypeScript / JavaScript / Vue / Svelte |
| バックエンド | Python / Go / Rust / Java / Ruby |
| インフラ / クラウド | Shell / Dockerfile / HCL (Terraform) |
| データ / AI | Python / Jupyter Notebook / R |
| モバイル | Kotlin / Swift / Dart |

---

## トラブルシューティング

### `(user not found)` と表示される

GitHub ユーザー名が正確でないか、アカウントが削除・改名されている可能性があります。  
`participants.json` のユーザー名を直接 `https://github.com/<ユーザー名>` でアクセスして確認してください。

### レートリミットエラーが発生する

- `GITHUB_TOKEN` を設定するとリミットが 5,000回/時間 に増加します
- トークンなしの場合はスクリプトが自動的にスリープして再試行します

### 言語が正しく検出されない

- フォークしたリポジトリは集計から除外されます
- `--top-repos` の値を増やすと、より多くのリポジトリを調査します

---

*このワークフローは `Yukkurisiteikitai/LustraEngine` リポジトリの一部です。*
