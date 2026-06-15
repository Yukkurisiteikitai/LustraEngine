---
title: /log/new の音声入力テスト中に書き込み内容がリセットされる
category: bug
status: active
date: 2026-06-15
tags: [log-new, voice-input, speech-recognition, state-reset, LogNewClient, DiaryInputStep]
related: [../llm/2026-06-15_llm1-structured-diary.md]
---

# /log/new 音声入力でリセットされる 引き継ぎ資料

> 作成: 2026-06-15 / 報告者: ユーザが音声入力テスト中に発覚

---

## 症状

`/log/new` の日記入力欄（DiaryInputStep）で音声入力を試したところ、**全ての書き込みがリセットされる**。

ユーザの言葉: 「音声入力テストでなぜか全ての書き込みがリセットされる仕様だったのでそれが嫌だった」

## 未調査事項

本セッションでは Extract 段階のバグ対応を優先し、このバグの根本原因は未調査。

### 仮説

1. **Web Speech API の `onresult` が `textarea` の `onChange` と競合して state を上書き**
   - `DiaryInputStep` の `onChange` は `setDiaryText`。音声認識の中間結果 (`isFinal=false`) が届くたびに state が書き換わり、既存の手入力が消える可能性。
   - `SpeechRecognition.continuous = true` の場合は特に問題が起きやすい。

2. **音声入力開始時に `textarea` をクリアするコードが入っている**
   - `DiaryInputStep` または `LogNewClient` の `handleExtract` / 音声開始ハンドラに初期化処理が混入しているかもしれない。

3. **ステージ遷移が意図せず発生**
   - 音声入力の何らかのイベントが `setStage('diary')` などのリセット処理を呼ぶ。

## 調査手順（次セッション）

1. `components/log/DiaryInputStep.tsx` を Read して音声入力の実装を確認
2. `SpeechRecognition` の `onresult` / `onend` ハンドラを確認
3. `LogNewClient.tsx` の `useEffect` で `diaryText` が書き換わるケースがないか確認

## 関連ファイル

- `components/log/DiaryInputStep.tsx` — 音声入力ボタンと `onChange` が同居
- `app/log/new/LogNewClient.tsx` — `diaryText` state の管理
