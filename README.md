# @mizchi/skillize

**ドキュメントサイトを Claude Agent Skill に変換するツール**

[laiso/site2skill](https://github.com/laiso/site2skill) の Deno 移植版です。
[agentskills.io](https://agentskills.io/specification) 仕様に準拠しています。

## 必要条件

- Deno 2.0+
- wget (サイトのダウンロードに使用)
- zip (パッケージングに使用)

## 使い方

```bash
# 基本的な使い方 (プロジェクトローカルにインストール)
deno run -A main.ts <URL> <SKILL_NAME>

# ユーザー全体にインストール (~/.claude/skills/)
deno run -A main.ts <URL> <SKILL_NAME> --user

# 特定のディレクトリのみ取得
deno run -A main.ts <URL> <SKILL_NAME> -I /guides/ -I /api/

# 前回のダウンロードを再利用
deno run -A main.ts <URL> <SKILL_NAME> --skip-fetch
```

## オプション

```
--local            プロジェクトの .claude/skills にインストール (デフォルト)
--user             ~/.claude/skills にインストール (ユーザー全体)
--output, -o       カスタム出力ディレクトリ (--local/--user を上書き)
--include, -I      指定ディレクトリのみ取得 (複数指定可)
--exclude, -X      指定ディレクトリを除外 (複数指定可)
--skill-output     .skill ファイルの出力ディレクトリ (デフォルト: dist)
--temp-dir         処理用の一時ディレクトリ (デフォルト: build)
--skip-fetch       ダウンロードをスキップ
--clean            完了後に一時ディレクトリを削除
--help, -h         ヘルプを表示
```

## 仕組み

1. **Fetch**: `wget` でドキュメントサイトを再帰的にダウンロード
2. **Convert**: HTML から本文を抽出し Markdown に変換 (@mizchi/readability)
3. **Normalize**: リンクを絶対 URL に正規化
4. **Generate**: agentskills.io 仕様のスキル構造を生成
5. **Validate**: スキル構造と名前規則をチェック
6. **Package**: .skill ファイルにパッケージ

## 出力構造 (agentskills.io 仕様)

```
<skill-name>/
├── SKILL.md           # スキル定義 (name, description 必須)
├── references/        # Markdown ドキュメント
│   └── *.md
└── scripts/
    └── cli.ts         # 検索 CLI (Deno)
```

## スキル CLI

生成されたスキルには検索 CLI が含まれます:

```bash
deno run -A scripts/cli.ts search "<query>"
deno run -A scripts/cli.ts search "<query>" --json
deno run -A scripts/cli.ts help
```

## ライセンス

MIT
