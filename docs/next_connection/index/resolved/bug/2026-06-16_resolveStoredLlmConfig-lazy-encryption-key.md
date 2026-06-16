---
title: resolveStoredLlmConfig — 暗号化キー無条件呼び出しバグ & テスト不足
category: bug
status: resolved
date: 2026-06-16
resolved_date: 2026-06-16
tags: [resolveStoredLlmConfig, llmSettingsCrypto, LLM_SETTINGS_ENCRYPTION_KEY, lm-studio, encryptedApiKey, jest, resetAllMocks, ValidationError, copilot-review]
related:
  - ../../resolved/infra/2026-06-16_cloudflare-llm-settings-blocked.md
---

# resolveStoredLlmConfig — 暗号化キー無条件呼び出しバグ & テスト不足

> 作成: 2026-06-16 / 解決: 2026-06-16
> ブランチ: `fix/Yukkurisiteikitai/UnchangeSettings`

Copilot のコードレビューで発見。テストはすべて green で完了。

---

## バグ 1（High）: `resolveLlmSettingsEncryptionKey()` の無条件呼び出し

### 症状

`resolveStoredLlmConfig` は LM Studio のように `encryptedApiKey` が null の設定でも
`resolveLlmSettingsEncryptionKey()` を呼んでいた。
本番（`APP_ENV=production`）で `LLM_SETTINGS_ENCRYPTION_KEY` が未設定だと throw し、
API キー不要のプロバイダーを使うユーザーが記録できなくなる。

### 根本原因

```ts
// 修正前 — encryptedApiKey の有無に関わらず常に呼ばれていた
const resolvedEncryptionKey = encryptionKey ?? resolveLlmSettingsEncryptionKey();
const storedApiKey = activeSetting.encryptedApiKey
  ? await decryptApiKey(activeSetting.encryptedApiKey, resolvedEncryptionKey)
  : '';
```

### 修正内容（`src/infrastructure/llm/resolveStoredLlmConfig.ts`）

```ts
// 修正後 — encryptedApiKey が存在する場合だけキーを解決
const storedApiKey = activeSetting.encryptedApiKey
  ? await decryptApiKey(activeSetting.encryptedApiKey, encryptionKey ?? resolveLlmSettingsEncryptionKey())
  : '';
```

---

## バグ 2（Medium）: テストカバレッジ不足

### 不足していたケース

1. アクティブ設定なし + `config` も null → `ValidationError` を throw するパスが未テスト
2. `encryptedApiKey=null` 時に `resolveLlmSettingsEncryptionKey` が呼ばれないことの検証がなかった
3. 既存の LM Studio テストが `resolveLlmSettingsEncryptionKey` の not-called を検証していなかった

### テストの実装問題（テスト間 mock 汚染）

新規テストで `mockImplementation(() => { throw ... })` を設定すると、
`jest.clearAllMocks()` はコール履歴しかリセットしないため実装が後続テストに残留し
2 件が fail した。

### 修正内容（`__tests__/resolveStoredLlmConfig.test.ts`）

- `beforeEach` を `jest.clearAllMocks()` → `jest.resetAllMocks()` に変更
- `beforeEach` で `mockResolveLlmSettingsEncryptionKey.mockReturnValue('fallback-secret')` を追加
- 既存 LM Studio テストに `expect(mockResolveLlmSettingsEncryptionKey).not.toHaveBeenCalled()` を追加
- 新規テスト追加:
  - 「`encryptedApiKey=null` の場合、本番でも暗号化キーを解決しない」
  - 「アクティブ設定なし・config なし → ValidationError を throw する」

---

## 最終テスト結果

```
PASS __tests__/resolveStoredLlmConfig.test.ts
  ✓ falls back to provided config when hasApiKey=false (LM Studio)
  ✓ does not resolve encryption key when encryptedApiKey is null (production)
  ✓ throws ValidationError when no active setting exists and no config is provided
  ✓ throws when hasApiKey=true but storedApiKey is empty (decryption failure)
  ✓ falls back to a local secret when no encryption key is configured in development
Tests: 5 passed, 5 total
```

---

## 次のセッションへの注意点

- `jest.clearAllMocks()` は `mockImplementation` をリセットしない。
  実装をオーバーライドするテストがあるスイートでは `jest.resetAllMocks()` ＋ `beforeEach` での再設定が必要。
- `resolveLlmSettingsEncryptionKey` は今後も「`encryptedApiKey` が存在する場合だけ呼ぶ」という
  lazy パターンを維持すること。
