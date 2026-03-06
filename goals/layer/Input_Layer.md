# L1 Input Layer（ユーザー入力）

## 目的

**経験エピソードの収集**

---

## 入力構造

```
experience
 ├ goal
 ├ action
 ├ emotion
 ├ context
 ├ stress_level
 ├ action_result
```

---

## UI入力フォーム

| フィールド         | 必須       | 説明                   |
| ------------- | -------- | -------------------- |
| goal          | optional | 何をしようとしていたか          |
| action        | optional | 実際の行動                |
| emotion       | optional | 感情                   |
| context       | optional | 状況                   |
| stress_level  | required | ストレス強度               |
| domain        | optional | 人生領域                 |
| action_result | required | AVOIDED / CONFRONTED |
| description   | required | 自由記述                 |

---

## 例

```
goal: 英語の勉強
action: YouTubeを見た
emotion: 罪悪感
context: 夜、一人
stress: 4
result: AVOIDED
```

---

