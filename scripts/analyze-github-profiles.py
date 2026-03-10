#!/usr/bin/env python3
"""
analyze-github-profiles.py

GitHub参加者プロフィール・技術力分析スクリプト
Hackathon Participant GitHub Profile & Skill Analyzer

使い方 / Usage:
    python scripts/analyze-github-profiles.py [options]

Options:
    --participants  Path to participants JSON file (default: scripts/participants.json)
    --token         GitHub Personal Access Token (or set GITHUB_TOKEN env var)
    --output        Output markdown file path (default: docs/participant-report.md)
    --top-repos     Number of top repositories to inspect per user (default: 10)

Examples:
    python scripts/analyze-github-profiles.py
    python scripts/analyze-github-profiles.py --token ghp_xxx --output /tmp/report.md
    GITHUB_TOKEN=ghp_xxx python scripts/analyze-github-profiles.py
"""

import argparse
import json
import os
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path
from typing import Any


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

GITHUB_API = "https://api.github.com"

# Map raw GitHub language names → human-readable domain tags
LANGUAGE_DOMAIN: dict[str, str] = {
    "TypeScript":   "Frontend / Fullstack",
    "JavaScript":   "Frontend / Fullstack",
    "TSX":          "Frontend / Fullstack",
    "JSX":          "Frontend / Fullstack",
    "HTML":         "Frontend",
    "CSS":          "Frontend",
    "SCSS":         "Frontend",
    "Vue":          "Frontend",
    "Svelte":       "Frontend",
    "Python":       "Backend / Data / AI",
    "Jupyter Notebook": "Data / AI",
    "R":            "Data / AI",
    "Go":           "Backend / Infra",
    "Rust":         "Backend / Infra / Systems",
    "C":            "Systems / Embedded",
    "C++":          "Systems / Embedded",
    "C#":           "Backend / Game",
    "Java":         "Backend",
    "Kotlin":       "Android / Backend",
    "Swift":        "iOS",
    "Dart":         "Mobile (Flutter)",
    "Ruby":         "Backend",
    "PHP":          "Backend",
    "Shell":        "Infra / DevOps",
    "Dockerfile":   "Infra / DevOps",
    "HCL":          "Infra / DevOps (Terraform)",
    "Makefile":     "DevOps",
}


# ---------------------------------------------------------------------------
# GitHub API helpers
# ---------------------------------------------------------------------------

def _make_headers(token: str | None) -> dict[str, str]:
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "LustraEngine-Participant-Analyzer/1.0",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _get(url: str, token: str | None) -> Any:
    """Perform a GET request to the GitHub API and return parsed JSON."""
    req = urllib.request.Request(url, headers=_make_headers(token))
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            remaining = resp.headers.get("X-RateLimit-Remaining", "?")
            if remaining != "?" and int(remaining) < 5:
                reset = int(resp.headers.get("X-RateLimit-Reset", 0))
                wait = max(reset - int(time.time()), 0) + 2
                print(f"  [rate limit] sleeping {wait}s …", flush=True)
                time.sleep(wait)
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return None
        if exc.code == 403:
            body = exc.read().decode()
            if "rate limit" in body.lower():
                print("  [rate limit] 60s back-off …", flush=True)
                time.sleep(60)
                return _get(url, token)
        print(f"  [warn] HTTP {exc.code} for {url}", flush=True)
        return None
    except urllib.error.URLError as exc:
        print(f"  [warn] network error ({exc.reason}) for {url}", flush=True)
        return None
    except TimeoutError as exc:
        print(f"  [warn] request timed out for {url}: {exc}", flush=True)
        return None
    except (OSError, ValueError) as exc:
        print(f"  [warn] request failed ({exc}) for {url}", flush=True)
        return None


def fetch_user(username: str, token: str | None) -> dict | None:
    return _get(f"{GITHUB_API}/users/{username}", token)


def fetch_repos(username: str, token: str | None, per_page: int = 100) -> list[dict]:
    url = f"{GITHUB_API}/users/{username}/repos?type=owner&sort=pushed&per_page={per_page}"
    data = _get(url, token)
    return data if isinstance(data, list) else []


def fetch_languages(username: str, repo: str, token: str | None) -> dict[str, int]:
    data = _get(f"{GITHUB_API}/repos/{username}/{repo}/languages", token)
    return data if isinstance(data, dict) else {}


# ---------------------------------------------------------------------------
# Analysis
# ---------------------------------------------------------------------------

def aggregate_languages(
    username: str,
    repos: list[dict],
    token: str | None,
    top_repos: int,
) -> dict[str, int]:
    """Return {language: total_bytes} across the top N repos."""
    totals: dict[str, int] = {}
    # Sort by stars desc, then by push date to pick the most relevant repos
    sorted_repos = sorted(repos, key=lambda r: r.get("stargazers_count", 0), reverse=True)
    for repo in sorted_repos[:top_repos]:
        if repo.get("fork"):
            continue  # skip forked repos
        langs = fetch_languages(username, repo["name"], token)
        for lang, nbytes in langs.items():
            totals[lang] = totals.get(lang, 0) + nbytes
        time.sleep(0.1)  # gentle rate limiting
    return totals


def skill_tags(lang_bytes: dict[str, int]) -> list[str]:
    """Derive human-readable skill tags from language byte counts."""
    if not lang_bytes:
        return ["(no public repositories)"]
    total = sum(lang_bytes.values())
    tags: list[str] = []
    for lang, nbytes in sorted(lang_bytes.items(), key=lambda x: -x[1]):
        pct = nbytes / total * 100
        if pct < 2:
            break
        domain = LANGUAGE_DOMAIN.get(lang, lang)
        tags.append(f"{lang} ({pct:.0f}%) [{domain}]")
    return tags


def analyze_participant(
    display_name: str,
    github_username: str,
    token: str | None,
    top_repos: int,
) -> dict:
    print(f"  Analyzing @{github_username} …", flush=True)

    user = fetch_user(github_username, token)
    if user is None:
        return {
            "displayName": display_name,
            "github": github_username,
            "exists": False,
            "bio": "",
            "public_repos": 0,
            "top_languages": {},
            "tags": ["(user not found)"],
            "top_repos_inspected": [],
        }

    repos = fetch_repos(github_username, token)
    lang_bytes = aggregate_languages(github_username, repos, token, top_repos)

    # Collect top repos info (non-fork, sorted by stars)
    top_repo_list = [
        f"{r['name']} ⭐{r['stargazers_count']}"
        for r in sorted(repos, key=lambda r: r.get("stargazers_count", 0), reverse=True)
        if not r.get("fork")
    ][:5]

    return {
        "displayName": display_name,
        "github": github_username,
        "exists": True,
        "bio": user.get("bio") or "",
        "public_repos": user.get("public_repos", 0),
        "followers": user.get("followers", 0),
        "top_languages": lang_bytes,
        "tags": skill_tags(lang_bytes),
        "top_repos_inspected": top_repo_list,
    }


# ---------------------------------------------------------------------------
# Report rendering
# ---------------------------------------------------------------------------

def render_markdown(results: list[dict], event: str) -> str:
    lines: list[str] = []
    lines.append(f"# GitHub プロフィール・技術力分析レポート — {event}")
    lines.append(f"")
    lines.append(f"**対象イベント:** {event}  ")
    lines.append(f"**参加者数:** {len(results)}名")
    lines.append(f"")

    # ------ Summary table ------
    lines.append("## 参加者サマリー")
    lines.append("")
    lines.append("| # | 表示名 | GitHub | 公開Repo | 主要言語 TOP3 |")
    lines.append("|---|--------|--------|----------|---------------|")
    for i, r in enumerate(results, 1):
        if not r["exists"]:
            lines.append(f"| {i} | {r['displayName']} | [{r['github']}](https://github.com/{r['github']}) | — | ⚠️ アカウント未確認 |")
            continue
        top3 = ", ".join(
            lang for lang in sorted(r["top_languages"], key=lambda l: -r["top_languages"][l])[:3]
        ) or "—"
        lines.append(
            f"| {i} | {r['displayName']} | [{r['github']}](https://github.com/{r['github']}) "
            f"| {r['public_repos']} | {top3} |"
        )
    lines.append("")

    # ------ Individual profiles ------
    lines.append("---")
    lines.append("")
    lines.append("## 個人別プロフィール")
    lines.append("")
    for r in results:
        lines.append(f"### {r['displayName']}  [@{r['github']}](https://github.com/{r['github']})")
        if not r["exists"]:
            lines.append("")
            lines.append("> ⚠️ このGitHubアカウントが見つかりませんでした。ユーザー名を確認してください。")
            lines.append("")
            continue
        if r["bio"]:
            lines.append(f"> {r['bio']}")
        lines.append("")
        lines.append(f"- **公開リポジトリ数:** {r['public_repos']}")
        lines.append(f"- **フォロワー数:** {r['followers']}")
        lines.append("")
        lines.append("**スキルタグ:**")
        for tag in r["tags"]:
            lines.append(f"- {tag}")
        lines.append("")
        if r["top_repos_inspected"]:
            lines.append("**主要リポジトリ（スター順）:**")
            for repo in r["top_repos_inspected"]:
                lines.append(f"- {repo}")
            lines.append("")
        lines.append("---")
        lines.append("")

    # ------ Tech stack distribution ------
    lines.append("## 技術スタック全体分布")
    lines.append("")
    all_langs: dict[str, int] = {}
    for r in results:
        for lang, nb in r.get("top_languages", {}).items():
            all_langs[lang] = all_langs.get(lang, 0) + nb
    total_bytes = sum(all_langs.values()) or 1
    lines.append("| 言語 | バイト比率 | 参加者人数 |")
    lines.append("|------|-----------|-----------|")
    lang_user_count: dict[str, int] = {}
    for r in results:
        for lang in r.get("top_languages", {}):
            lang_user_count[lang] = lang_user_count.get(lang, 0) + 1
    for lang, nb in sorted(all_langs.items(), key=lambda x: -x[1])[:20]:
        pct = nb / total_bytes * 100
        count = lang_user_count.get(lang, 0)
        lines.append(f"| {lang} | {pct:.1f}% | {count}名 |")
    lines.append("")

    lines.append("---")
    lines.append("*このレポートは `scripts/analyze-github-profiles.py` によって自動生成されました。*")
    lines.append("")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="GitHub参加者プロフィール・技術力分析スクリプト",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--participants",
        default="scripts/participants.json",
        help="参加者JSONファイルのパス (default: scripts/participants.json)",
    )
    parser.add_argument(
        "--token",
        default=os.environ.get("GITHUB_TOKEN"),
        help="GitHub Personal Access Token (or set GITHUB_TOKEN env var)",
    )
    parser.add_argument(
        "--output",
        default="docs/participant-report.md",
        help="出力マークダウンファイルのパス (default: docs/participant-report.md)",
    )
    parser.add_argument(
        "--top-repos",
        type=int,
        default=10,
        help="各ユーザーの上位リポジトリ調査数 (default: 10)",
    )
    args = parser.parse_args()

    # Load participants
    participants_path = Path(args.participants)
    if not participants_path.exists():
        print(f"Error: participants file not found: {participants_path}", file=sys.stderr)
        sys.exit(1)
    with participants_path.open(encoding="utf-8") as f:
        data = json.load(f)

    event = data.get("event", "Hackathon")
    participants = data.get("participants", [])
    if not participants:
        print("No participants found in JSON.", file=sys.stderr)
        sys.exit(1)

    if not args.token:
        print(
            "Warning: GITHUB_TOKEN not set. Unauthenticated requests are limited to 60/hour.\n"
            "         Set GITHUB_TOKEN or pass --token to increase limits.",
            file=sys.stderr,
        )

    print(f"Analyzing {len(participants)} participants for: {event}", flush=True)
    print(f"GitHub API rate limit: {'authenticated' if args.token else 'unauthenticated (60/hr)'}\n", flush=True)

    results = []
    for p in participants:
        result = analyze_participant(
            display_name=p.get("displayName", p.get("github", "")),
            github_username=p["github"],
            token=args.token,
            top_repos=args.top_repos,
        )
        results.append(result)

    report = render_markdown(results, event)

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(report, encoding="utf-8")
    print(f"\nReport written to: {output_path}", flush=True)


if __name__ == "__main__":
    main()
