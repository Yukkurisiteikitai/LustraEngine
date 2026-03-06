# L2 Data Layer（永続化）

## 目的

**エピソードの保存と構造化**

---

## テーブル

```
users
domains
experiences
```

---

## experiences構造

```
experiences
 ├ id
 ├ user_id
 ├ logged_at
 ├ description
 ├ goal
 ├ action
 ├ emotion
 ├ context
 ├ stress_level
 ├ emotion_level
 ├ domain_id
 ├ action_result
 ├ tags[]
```

---

## インデックス

```
idx_experiences_user_logged
```

用途

```
ユーザー履歴
直近パターン分析
```

---

