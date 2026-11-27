#!/usr/bin/env python3
"""
TapTap Maker (UrhoX + Lua) Read-Only Pre-Release Static Audit Scanner.

Scans a TapTap Maker project directory without modifying any project files and outputs
a structured JSON pre-audit report covering:
  1. Project profile, binding & config integrity (.project/project.json, settings.json, .maker-mcp)
  2. JSON & UI.json syntax integrity
  3. UrhoX .meta coverage, syntax validity, duplicate UUIDs, and orphan .meta files
  4. Cross-file asset reference existence & strict case-sensitivity check (Windows -> Linux 404 trap)
  5. Lua high-risk static patterns (debug/GM residue, Update print spam, event/tween cleanup imbalance,
     dt clamp hints, 0-based indexing / table.remove in ipairs-pairs smells, and ad/save hotspots)
  6. Package hygiene (non-runtime source files & oversized assets)
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any

IGNORED_DIRS = {
    ".git",
    ".svn",
    ".hg",
    "node_modules",
    "__pycache__",
    ".qa-reports",
    ".sop",
    "engine-docs",
    ".vscode",
    ".idea",
    "dist",
    "build",
    "Library",
    "Temp",
    "Logs",
    "tmp",
    ".cache",
    ".maker-cache",
    "debug_feedbacks",
    "feedbacks",
}

ASSET_EXTS_FOR_META = {
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".bmp",
    ".tga",
    ".dds",
    ".mp3",
    ".wav",
    ".ogg",
    ".flac",
    ".ttf",
    ".otf",
    ".fnt",
    ".mdl",
    ".ani",
    ".prefab",
    ".scene",
    ".mat",
    ".fbx",
    ".glb",
    ".gltf",
    ".glsl",
    ".hlsl",
    ".shader",
}

REFERENCED_ASSET_EXTS = ASSET_EXTS_FOR_META | {
    ".json",
    ".xml",
    ".lua",
    ".svg",
    ".txt",
    ".csv",
}

NON_RUNTIME_SOURCE_EXTS = {
    ".psd",
    ".psb",
    ".ai",
    ".xd",
    ".sketch",
    ".blend",
    ".blend1",
    ".max",
    ".maya",
    ".c4d",
    ".zip",
    ".rar",
    ".7z",
    ".tar",
    ".gz",
    ".bak",
    ".orig",
    ".tmp",
}

OVERSIZED_THRESHOLD_BYTES = 5 * 1024 * 1024  # 5 MB
OVERSIZED_MEDIA_BYTES = 4 * 1024 * 1024      # 4 MB for images/audio

UUID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)
UUID_SEARCH_RE = re.compile(
    r'(?:"?(?:uuid|guid)"?\s*[:=]\s*"?([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})"?)|'
    r'(?:uuid\s*=\s*"([0-9a-fA-F-]{16,})")',
    re.IGNORECASE,
)

QUOTED_STRING_RE = re.compile(r'(["\'])((?:\\.|(?!\1)[^\\\r\n]){2,260})\1')

DEBUG_PATTERNS: list[tuple[str, str, re.Pattern[str]]] = [
    ("debug_flag_true", "P1", re.compile(r"\b(?:DEBUG|IS_DEBUG|DEV_MODE|ENABLE_DEBUG|ENABLE_GM|GM_MODE|CHEAT_MODE)\s*=\s*true\b", re.IGNORECASE)),
    ("cheat_keyword", "P1", re.compile(r"\b(?:unlockAll|addDebugGold|infiniteGold|godMode|cheatSkip|gmAddMoney|openGmPanel|toggleDebugMenu)\b", re.IGNORECASE)),
    ("hardcoded_local_path", "P1", re.compile(r"(?:[A-Za-z]:\\|127\.0\.0\.1|localhost:\d+)")),
    ("todo_marker", "P3", re.compile(r"\b(?:TODO|FIXME|HACK|XXX)\b")),
]

AD_ANCHOR_RE = re.compile(
    r"\b(?:ShowRewardVideoAd|ShowInterstitialAd|ShowBannerAd|CreateRewardVideoAd|LoadRewardVideoAd|adConfig|rewardVideo)\b",
    re.IGNORECASE,
)
SAVE_ANCHOR_RE = re.compile(
    r"\b(?:SaveGame|LoadGame|SaveData|LoadData|CloudSave|SetUserData|GetUserData|PlayerPrefs|SaveToFile|ReadFile|WriteFile|json\.decode|cjson\.decode)\b",
    re.IGNORECASE,
)
SAVE_VERSION_RE = re.compile(
    r"\b(?:saveVersion|SAVE_VERSION|save_version|schemaVersion|SCHEMA_VERSION|dataVersion|DATA_VERSION|archiveVersion|ARCHIVE_VERSION)\b"
)
SAVE_MIGRATE_RE = re.compile(
    r"\b(?:migrate\w*|upgradeSave\w*|compatSave\w*|patchSave\w*|fixOldSave\w*|ensureDefaults\w*|mergeDefaults\w*|normalizeSave\w*)\b",
    re.IGNORECASE,
)
SUBSCRIBE_RE = re.compile(r"\bSubscribeToEvent\s*\(")
UNSUBSCRIBE_RE = re.compile(r"\b(?:UnsubscribeFromEvent|UnsubscribeFromAllEvents)\s*\(")
TWEEN_CREATE_RE = re.compile(r"\b(?:LuaTween\s*[\.:]\s*(?:to|from|create|new|Create)|Tween\s*[\.:]\s*(?:to|from|create|new))\s*\(", re.IGNORECASE)
TWEEN_CLEANUP_RE = re.compile(r"\b(?:\w+\s*[\.:]\s*(?:kill|stop|cancel|clear|Destroy|Remove|KillAll|StopAll))\s*\(", re.IGNORECASE)
UPDATE_FUNC_START_RE = re.compile(
    r"^\s*(?:local\s+)?function\s+[\w\.:]*(?:Update|FixedUpdate|HandleUpdate|OnUpdate|Tick)\s*\(([^)]*)\)",
    re.IGNORECASE,
)
FUNC_START_RE = re.compile(r"^\s*(?:local\s+)?function\b")
PRINT_CALL_RE = re.compile(r"\bprint\s*\(")
ZERO_INDEX_LOOP_RE = re.compile(r"\bfor\s+\w+\s*=\s*0\s*,")
PAIRS_LOOP_RE = re.compile(r"\bfor\s+.+\s+in\s+(?:i?pairs)\s*\(\s*([\w\.\[\]]+)\s*\)")
TABLE_REMOVE_RE = re.compile(r"\btable\.remove\s*\(\s*([\w\.\[\]]+)")
DT_CLAMP_RE = re.compile(r"\bmath\.min\s*\(|if\s+\w+\s*>\s*0?\.\d+", re.IGNORECASE)


def to_posix(rel_path: Path | str) -> str:
    return str(rel_path).replace("\\", "/")


def safe_read_text(path: Path) -> str | None:
    for enc in ("utf-8-sig", "utf-8", "gbk", "latin-1"):
        try:
            return path.read_text(encoding=enc)
        except Exception:
            continue
    return None


def iter_project_files(project_root: Path) -> list[Path]:
    files: list[Path] = []
    for root, dirs, filenames in os.walk(project_root):
        dirs[:] = [
            d for d in dirs
            if d not in IGNORED_DIRS and not (d.startswith(".") and d not in {".project", ".maker-mcp"})
        ]
        root_path = Path(root)
        for name in filenames:
            files.append(root_path / name)
    return files


def strip_lua_comments_keep_lines(text: str) -> list[tuple[int, str, str]]:
    """
    Return list of (1-based line_no, code_without_comments, raw_line).
    Handles --[[ ... ]] multi-line block comments and -- single-line comments while
    respecting quoted strings.
    """
    results: list[tuple[int, str, str]] = []
    in_block = False
    block_eq = 0

    for idx, raw_line in enumerate(text.splitlines(), start=1):
        out_chars: list[str] = []
        i = 0
        n = len(raw_line)
        in_quote: str | None = None

        while i < n:
            if in_block:
                close_seq = "]" + ("=" * block_eq) + "]"
                pos = raw_line.find(close_seq, i)
                if pos == -1:
                    break
                in_block = False
                i = pos + len(close_seq)
                continue

            ch = raw_line[i]
            if in_quote:
                out_chars.append(ch)
                if ch == "\\" and i + 1 < n:
                    out_chars.append(raw_line[i + 1])
                    i += 2
                    continue
                if ch == in_quote:
                    in_quote = None
                i += 1
                continue

            if ch in ("'", '"'):
                in_quote = ch
                out_chars.append(ch)
                i += 1
                continue

            if ch == "-" and i + 1 < n and raw_line[i + 1] == "-":
                # Check for block comment --[=*[
                m = re.match(r"--\[(=*)\[", raw_line[i:])
                if m:
                    block_eq = len(m.group(1))
                    in_block = True
                    i += len(m.group(0))
                    continue
                break

            out_chars.append(ch)
            i += 1

        results.append((idx, "".join(out_chars), raw_line))
    return results


def parse_config_json(path: Path) -> tuple[dict[str, Any] | None, str | None]:
    text = safe_read_text(path)
    if text is None:
        return None, "无法读取文件编码"
    try:
        data = json.loads(text)
        if not isinstance(data, dict):
            return None, "JSON 根节点不是对象"
        return data, None
    except json.JSONDecodeError as exc:
        return None, f"JSON 语法错误 (line {exc.lineno}, col {exc.colno}): {exc.msg}"


def extract_uuid_from_meta(path: Path) -> tuple[str | None, str | None]:
    """Return (uuid_or_none, error_or_none)."""
    text = safe_read_text(path)
    if text is None:
        return None, "无法读取 .meta 文件"
    stripped = text.strip()
    if not stripped:
        return None, ".meta 文件为空"

    # Try JSON first (common in UrhoX/Maker)
    if stripped.startswith("{"):
        try:
            obj = json.loads(stripped)
            if isinstance(obj, dict):
                for key in ("uuid", "UUID", "guid", "GUID", "id"):
                    val = obj.get(key)
                    if isinstance(val, str) and val.strip():
                        return val.strip(), None
                # Search nested dicts shallowly
                for val in obj.values():
                    if isinstance(val, dict):
                        for key in ("uuid", "UUID", "guid", "GUID"):
                            nested = val.get(key)
                            if isinstance(nested, str) and nested.strip():
                                return nested.strip(), None
                return None, None
            return None, ".meta JSON 根节点不是对象"
        except json.JSONDecodeError as exc:
            return None, f".meta JSON 语法错误 (line {exc.lineno}, col {exc.colno}): {exc.msg}"

    # XML / YAML / key-value fallback
    match = UUID_SEARCH_RE.search(stripped)
    if match:
        return (match.group(1) or match.group(2)), None
    if stripped.startswith("<") and not stripped.endswith(">"):
        return None, ".meta XML 结构疑似截断"
    return None, None


def looks_like_asset_path(candidate: str) -> bool:
    if not candidate or len(candidate) < 4:
        return False
    lower = candidate.lower().strip()
    if lower.startswith(("http://", "https://", "file://", "maker://", "data:")):
        return False
    if any(ch in candidate for ch in ("%", "{", "}", "*", "?", "<", ">", "|", "\t", " ")):
        # Allow spaces only if it clearly starts with assets/ or Data/
        if " " in candidate and not lower.startswith(("assets/", "data/", "resources/")):
            return False
        if any(ch in candidate for ch in ("%", "{", "}", "*", "?", "<", ">", "|", "\t")):
            return False
    ext = Path(lower).suffix
    if ext not in REFERENCED_ASSET_EXTS:
        return False
    # Avoid bare filenames like ".png" or "config.json" without path unless inside known patterns
    stem = Path(lower).stem
    if not stem:
        return False
    if "/" not in candidate and "\\" not in candidate:
        return False
    return True


def normalize_ref_path(raw: str) -> str:
    cleaned = raw.strip().replace("\\", "/")
    while cleaned.startswith("./"):
        cleaned = cleaned[2:]
    if cleaned.startswith("/"):
        cleaned = cleaned[1:]
    return cleaned


def build_disk_case_index(project_root: Path, all_files: list[Path]) -> tuple[dict[str, str], dict[str, set[str]]]:
    """
    Build exact on-disk path indexes for strict case-sensitivity verification on Windows.
    Returns:
      - exact_by_lower: lowercase_posix_rel -> exact_posix_rel
      - subpath_by_lower: lowercase path relative to common asset roots -> set of exact_posix_rel
    """
    exact_by_lower: dict[str, str] = {}
    subpath_by_lower: dict[str, set[str]] = defaultdict(set)
    common_prefixes = ("assets/", "data/", "resources/", "client/", "server/", "scripts/")

    for f in all_files:
        rel = to_posix(f.relative_to(project_root))
        rel_low = rel.lower()
        exact_by_lower[rel_low] = rel
        for pref in common_prefixes:
            if rel_low.startswith(pref):
                sub = rel[len(pref):]
                subpath_by_lower[sub.lower()].add(rel)
    return exact_by_lower, subpath_by_lower


def check_reference_path(
    raw_ref: str,
    exact_by_lower: dict[str, str],
    subpath_by_lower: dict[str, set[str]],
) -> tuple[str, str | None]:
    """
    Check a referenced path against disk index.
    Returns:
      ("ok", matched_exact)
      ("case_mismatch", actual_exact)
      ("missing", None)
    """
    norm = normalize_ref_path(raw_ref)
    norm_low = norm.lower()

    # 1. Match full project-relative path
    if norm_low in exact_by_lower:
        actual = exact_by_lower[norm_low]
        if actual == norm:
            return "ok", actual
        return "case_mismatch", actual

    # 2. Match relative to common UrhoX resource roots (assets/, Data/, Resources/, etc.)
    if norm_low in subpath_by_lower:
        candidates = sorted(subpath_by_lower[norm_low])
        for actual in candidates:
            # Compare trailing suffix case-sensitively
            if actual.endswith("/" + norm) or actual == norm:
                return "ok", actual
        return "case_mismatch", candidates[0]

    return "missing", None


def scan_lua_file(
    rel_posix: str,
    full_path: Path,
    exact_by_lower: dict[str, str],
    subpath_by_lower: dict[str, set[str]],
) -> dict[str, Any]:
    text = safe_read_text(full_path)
    if text is None:
        return {"read_error": "无法读取 Lua 文件"}

    lines = strip_lua_comments_keep_lines(text)
    findings: list[dict[str, Any]] = []
    anchors: dict[str, list[dict[str, Any]]] = {
        "ads": [],
        "save": [],
        "save_version": [],
        "save_migrate": [],
    }
    print_lines: list[int] = []
    update_print_lines: list[int] = []
    subscribe_count = 0
    unsubscribe_count = 0
    tween_create_count = 0
    tween_cleanup_count = 0
    update_blocks_without_dt_clamp: list[dict[str, Any]] = []

    in_update = False
    update_start_line = 0
    update_dt_param = ""
    update_has_clamp = False
    update_depth = 0

    in_pairs_var: str | None = None
    pairs_start_line = 0

    for line_no, code, raw in lines:
        # 1. Debug / cheat / hardcoded path patterns
        for kind, severity, pattern in DEBUG_PATTERNS:
            target = raw if kind == "todo_marker" else code
            if pattern.search(target):
                findings.append({
                    "kind": kind,
                    "severity": severity,
                    "file": rel_posix,
                    "line": line_no,
                    "snippet": raw.strip()[:160],
                })

        # 2. Anchors for AI deep review
        if AD_ANCHOR_RE.search(code):
            anchors["ads"].append({"file": rel_posix, "line": line_no, "snippet": code.strip()[:160]})
        if SAVE_ANCHOR_RE.search(code):
            anchors["save"].append({"file": rel_posix, "line": line_no, "snippet": code.strip()[:160]})
        if SAVE_VERSION_RE.search(code):
            anchors["save_version"].append({"file": rel_posix, "line": line_no, "snippet": code.strip()[:160]})
        if SAVE_MIGRATE_RE.search(code):
            anchors["save_migrate"].append({"file": rel_posix, "line": line_no, "snippet": code.strip()[:160]})

        # 3. Lifecycle balance counters
        subscribe_count += len(SUBSCRIBE_RE.findall(code))
        unsubscribe_count += len(UNSUBSCRIBE_RE.findall(code))
        tween_create_count += len(TWEEN_CREATE_RE.findall(code))
        tween_cleanup_count += len(TWEEN_CLEANUP_RE.findall(code))

        # 4. Track Update function blocks (lightweight heuristic)
        m_upd = UPDATE_FUNC_START_RE.match(code)
        if m_upd and not in_update:
            in_update = True
            update_start_line = line_no
            update_dt_param = m_upd.group(1).strip()
            update_has_clamp = False
            update_depth = 1
        elif in_update:
            # Count block openers and closers loosely
            openers = len(re.findall(r"\b(?:function|if|for|while|repeat)\b", code))
            closers = len(re.findall(r"\b(?:end|until)\b", code))
            update_depth += openers - closers
            if DT_CLAMP_RE.search(code):
                update_has_clamp = True
            if PRINT_CALL_RE.search(code):
                update_print_lines.append(line_no)
            if update_depth <= 0:
                if update_dt_param and not update_has_clamp:
                    update_blocks_without_dt_clamp.append({
                        "file": rel_posix,
                        "line": update_start_line,
                        "params": update_dt_param,
                    })
                in_update = False

        # 5. print() tracking
        if PRINT_CALL_RE.search(code):
            print_lines.append(line_no)

        # 6. 0-based loop smell
        if ZERO_INDEX_LOOP_RE.search(code):
            findings.append({
                "kind": "lua_zero_index_loop",
                "severity": "P2",
                "file": rel_posix,
                "line": line_no,
                "snippet": code.strip()[:160],
            })

        # 7. table.remove inside forward pairs/ipairs loop smell
        m_pairs = PAIRS_LOOP_RE.search(code)
        if m_pairs:
            in_pairs_var = m_pairs.group(1)
            pairs_start_line = line_no
        elif in_pairs_var:
            m_rem = TABLE_REMOVE_RE.search(code)
            if m_rem and m_rem.group(1) == in_pairs_var:
                findings.append({
                    "kind": "lua_table_remove_in_iteration",
                    "severity": "P1",
                    "file": rel_posix,
                    "line": line_no,
                    "snippet": f"(loop @{pairs_start_line}) {code.strip()[:140]}",
                })
            if re.match(r"^\s*end\b", code):
                in_pairs_var = None

        # 8. Asset path references inside Lua string literals
        for match in QUOTED_STRING_RE.finditer(code):
            lit = match.group(2)
            if not looks_like_asset_path(lit):
                continue
            status, actual = check_reference_path(lit, exact_by_lower, subpath_by_lower)
            if status == "case_mismatch":
                findings.append({
                    "kind": "path_case_mismatch",
                    "severity": "P0",
                    "file": rel_posix,
                    "line": line_no,
                    "referenced": lit,
                    "actual_disk_path": actual,
                })
            elif status == "missing":
                # Skip .lua require paths that might use engine virtual search paths unless explicitly containing assets/
                if lit.lower().endswith(".lua") and not lit.lower().startswith(("assets/", "data/", "scripts/", "client/", "server/")):
                    continue
                findings.append({
                    "kind": "missing_asset_ref",
                    "severity": "P1",
                    "file": rel_posix,
                    "line": line_no,
                    "referenced": lit,
                })

    if in_update and update_dt_param and not update_has_clamp:
        update_blocks_without_dt_clamp.append({
            "file": rel_posix,
            "line": update_start_line,
            "params": update_dt_param,
        })

    if update_print_lines:
        findings.append({
            "kind": "update_loop_print_spam",
            "severity": "P1",
            "file": rel_posix,
            "line": update_print_lines[0],
            "count": len(update_print_lines),
            "lines": update_print_lines[:10],
        })
    elif len(print_lines) >= 8:
        findings.append({
            "kind": "high_print_density",
            "severity": "P2",
            "file": rel_posix,
            "line": print_lines[0],
            "count": len(print_lines),
        })

    if subscribe_count > 0 and unsubscribe_count == 0:
        findings.append({
            "kind": "event_subscribe_without_unsubscribe",
            "severity": "P1",
            "file": rel_posix,
            "subscribe_count": subscribe_count,
            "unsubscribe_count": unsubscribe_count,
        })

    if tween_create_count > 0 and tween_cleanup_count == 0:
        findings.append({
            "kind": "tween_without_cleanup",
            "severity": "P2",
            "file": rel_posix,
            "tween_create_count": tween_create_count,
            "tween_cleanup_count": tween_cleanup_count,
        })

    return {
        "findings": findings,
        "anchors": anchors,
        "print_count": len(print_lines),
        "update_without_dt_clamp": update_blocks_without_dt_clamp,
    }


def extract_json_string_refs(
    obj: Any,
    rel_posix: str,
    exact_by_lower: dict[str, str],
    subpath_by_lower: dict[str, set[str]],
    findings: list[dict[str, Any]],
    key_path: str = "",
) -> None:
    if isinstance(obj, dict):
        for k, v in obj.items():
            sub_key = f"{key_path}.{k}" if key_path else str(k)
            extract_json_string_refs(v, rel_posix, exact_by_lower, subpath_by_lower, findings, sub_key)
    elif isinstance(obj, list):
        for idx, item in enumerate(obj):
            extract_json_string_refs(item, rel_posix, exact_by_lower, subpath_by_lower, findings, f"{key_path}[{idx}]")
    elif isinstance(obj, str):
        if looks_like_asset_path(obj):
            status, actual = check_reference_path(obj, exact_by_lower, subpath_by_lower)
            if status == "case_mismatch":
                findings.append({
                    "kind": "path_case_mismatch",
                    "severity": "P0",
                    "file": rel_posix,
                    "json_key": key_path,
                    "referenced": obj,
                    "actual_disk_path": actual,
                })
            elif status == "missing":
                findings.append({
                    "kind": "missing_asset_ref",
                    "severity": "P1",
                    "file": rel_posix,
                    "json_key": key_path,
                    "referenced": obj,
                })


def run_audit(project_root: Path) -> dict[str, Any]:
    all_files = iter_project_files(project_root)
    exact_by_lower, subpath_by_lower = build_disk_case_index(project_root, all_files)

    lua_files: list[Path] = []
    json_files: list[Path] = []
    ui_json_files: list[Path] = []
    meta_files: list[Path] = []
    asset_files: list[Path] = []

    package_hygiene_findings: list[dict[str, Any]] = []
    json_errors: list[dict[str, Any]] = []
    meta_findings: list[dict[str, Any]] = []
    path_findings: list[dict[str, Any]] = []
    lua_findings: list[dict[str, Any]] = []
    dt_clamp_hotspots: list[dict[str, Any]] = []
    anchors: dict[str, list[dict[str, Any]]] = {
        "ads": [],
        "save": [],
        "save_version": [],
        "save_migrate": [],
    }

    server_mode_hints: list[str] = []

    for f in all_files:
        rel_posix = to_posix(f.relative_to(project_root))
        rel_low = rel_posix.lower()
        ext = f.suffix.lower()

        # Package hygiene: non-runtime files & oversized assets
        try:
            size_bytes = f.stat().st_size
        except OSError:
            size_bytes = 0

        if ext in NON_RUNTIME_SOURCE_EXTS:
            package_hygiene_findings.append({
                "kind": "non_runtime_source_file",
                "severity": "P2",
                "file": rel_posix,
                "size_mb": round(size_bytes / (1024 * 1024), 2),
            })
        elif size_bytes >= OVERSIZED_THRESHOLD_BYTES and ext in {".ttf", ".otf"}:
            package_hygiene_findings.append({
                "kind": "oversized_font_asset",
                "severity": "P2",
                "file": rel_posix,
                "size_mb": round(size_bytes / (1024 * 1024), 2),
                "note": "疑似未裁剪完整字体包，建议子集化以缩小包体",
            })
        elif size_bytes >= OVERSIZED_MEDIA_BYTES and ext in {".png", ".jpg", ".jpeg", ".wav", ".mp3", ".ogg"}:
            package_hygiene_findings.append({
                "kind": "oversized_media_asset",
                "severity": "P3",
                "file": rel_posix,
                "size_mb": round(size_bytes / (1024 * 1024), 2),
            })

        if rel_low.startswith(("server/", "assets/server/", "scripts/server/")):
            if rel_posix not in server_mode_hints:
                server_mode_hints.append(rel_posix)

        if f.name.lower().endswith(".meta"):
            meta_files.append(f)
        elif ext == ".lua":
            lua_files.append(f)
        elif ext == ".json":
            json_files.append(f)
            if f.name.lower() == "ui.json" or f.name.lower().endswith(".ui.json") or "/ui/" in f"/{rel_low}":
                ui_json_files.append(f)
        if ext in ASSET_EXTS_FOR_META:
            asset_files.append(f)

    # 1. Project profile & primary configs
    config_status: dict[str, Any] = {}
    project_name = project_root.name
    runtime_ad: Any = None
    app_id: Any = None
    developer_id: Any = None

    for cfg_rel in (".project/project.json", ".project/settings.json", ".maker-mcp/config.json"):
        cfg_path = project_root / cfg_rel
        if not cfg_path.exists():
            config_status[cfg_rel] = {"exists": False, "valid": False}
            continue
        parsed, err = parse_config_json(cfg_path)
        if err:
            config_status[cfg_rel] = {"exists": True, "valid": False, "error": err}
            json_errors.append({"kind": "invalid_json", "severity": "P0", "file": cfg_rel, "error": err})
        else:
            config_status[cfg_rel] = {"exists": True, "valid": True}
            assert parsed is not None
            if cfg_rel == ".project/project.json":
                project_name = str(parsed.get("name") or parsed.get("project_name") or project_name)
                app_id = parsed.get("app_id") or parsed.get("id") or parsed.get("project_id")
                developer_id = parsed.get("developer_id") or (parsed.get("author") or {}).get("id")
            elif cfg_rel == ".project/settings.json":
                runtime_block = parsed.get("@runtime") or parsed.get("runtime") or {}
                if isinstance(runtime_block, dict) and "ad" in runtime_block:
                    runtime_ad = runtime_block["ad"]

    # 2. JSON & UI.json integrity + asset references
    for jf in json_files:
        rel_posix = to_posix(jf.relative_to(project_root))
        if rel_posix in (".project/project.json", ".project/settings.json", ".maker-mcp/config.json"):
            continue
        text = safe_read_text(jf)
        if text is None:
            json_errors.append({"kind": "json_read_error", "severity": "P0", "file": rel_posix, "error": "无法读取文件"})
            continue
        try:
            data = json.loads(text)
        except json.JSONDecodeError as exc:
            json_errors.append({
                "kind": "invalid_json",
                "severity": "P0",
                "file": rel_posix,
                "line": exc.lineno,
                "col": exc.colno,
                "error": exc.msg,
            })
            continue
        extract_json_string_refs(data, rel_posix, exact_by_lower, subpath_by_lower, path_findings)

    # 3. .meta & UUID integrity
    uuid_map: dict[str, list[str]] = defaultdict(list)
    meta_dirs: set[Path] = set()
    existing_meta_targets: set[str] = set()

    for mf in meta_files:
        rel_posix = to_posix(mf.relative_to(project_root))
        meta_dirs.add(mf.parent)
        base_name = mf.name[:-5]  # strip ".meta"
        base_path = mf.parent / base_name
        existing_meta_targets.add(to_posix(base_path.relative_to(project_root)).lower())

        if not base_path.exists():
            meta_findings.append({
                "kind": "orphan_meta",
                "severity": "P3",
                "file": rel_posix,
                "expected_target": to_posix(base_path.relative_to(project_root)),
            })

        uuid_val, meta_err = extract_uuid_from_meta(mf)
        if meta_err:
            meta_findings.append({
                "kind": "corrupt_meta",
                "severity": "P0",
                "file": rel_posix,
                "error": meta_err,
            })
        elif uuid_val:
            uuid_map[uuid_val.lower()].append(rel_posix)

    for uuid_val, holders in uuid_map.items():
        if len(holders) > 1:
            meta_findings.append({
                "kind": "duplicate_uuid",
                "severity": "P0",
                "uuid": uuid_val,
                "files": sorted(holders),
            })

    project_uses_meta = len(meta_files) > 0 or config_status.get(".project/project.json", {}).get("exists", False)
    for af in asset_files:
        rel_posix = to_posix(af.relative_to(project_root))
        rel_low = rel_posix.lower()
        in_asset_scope = (
            rel_low.startswith(("assets/", "data/", "resources/"))
            or af.parent in meta_dirs
        )
        if not in_asset_scope:
            continue
        if rel_low not in existing_meta_targets:
            meta_findings.append({
                "kind": "missing_meta",
                "severity": "P0" if project_uses_meta else "P1",
                "file": rel_posix,
                "expected_meta": f"{rel_posix}.meta",
                "hint": "请调用官方 generate_resource_meta 生成，严禁手写 UUID",
            })

    # 4. Lua deep pattern scan
    total_prints = 0
    for lf in lua_files:
        rel_posix = to_posix(lf.relative_to(project_root))
        res = scan_lua_file(rel_posix, lf, exact_by_lower, subpath_by_lower)
        if "read_error" in res:
            lua_findings.append({"kind": "lua_read_error", "severity": "P0", "file": rel_posix, "error": res["read_error"]})
            continue
        total_prints += res["print_count"]
        for item in res["findings"]:
            if item["kind"] in ("path_case_mismatch", "missing_asset_ref"):
                path_findings.append(item)
            else:
                lua_findings.append(item)
        anchors["ads"].extend(res["anchors"]["ads"])
        anchors["save"].extend(res["anchors"]["save"])
        anchors["save_version"].extend(res["anchors"]["save_version"])
        anchors["save_migrate"].extend(res["anchors"]["save_migrate"])
        dt_clamp_hotspots.extend(res["update_without_dt_clamp"])

    # 4b. Old-save direct upgrade compatibility heuristic
    save_files_unique = sorted({item["file"] for item in anchors["save"]})
    if anchors["save"] and not anchors["save_version"] and not anchors["save_migrate"]:
        first_save = anchors["save"][0]
        lua_findings.append({
            "kind": "missing_save_version_migration",
            "severity": "P1",
            "file": first_save["file"],
            "line": first_save["line"],
            "save_files": save_files_unique[:10],
            "note": "检测到存档读写逻辑，但未发现 saveVersion 版本号或老存档迁移/默认值补全函数，老版本存档直升新版本时存在 nil 崩溃或丢档风险",
        })

    save_git_history: list[str] = []
    if save_files_unique and (project_root / ".git").exists():
        try:
            proc = subprocess.run(
                ["git", "log", "-n", "5", "--oneline", "--", *save_files_unique[:8]],
                cwd=str(project_root),
                capture_output=True,
                text=True,
                timeout=3,
                check=False,
            )
            if proc.returncode == 0 and proc.stdout.strip():
                save_git_history = [line.strip() for line in proc.stdout.splitlines() if line.strip()]
        except Exception:
            save_git_history = []

    # Aggregate severity counts
    all_findings = json_errors + meta_findings + path_findings + lua_findings + package_hygiene_findings
    severity_counts = {"P0": 0, "P1": 0, "P2": 0, "P3": 0}
    for item in all_findings:
        sev = item.get("severity", "P3")
        if sev in severity_counts:
            severity_counts[sev] += 1

    mode = "联机/服务端 Lua" if server_mode_hints else "单机 Lua"

    return {
        "schema_version": "1.0",
        "scanned_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "project": {
            "name": project_name,
            "root": to_posix(project_root.resolve()),
            "mode": mode,
            "server_hints": server_mode_hints[:10],
            "app_id": app_id,
            "developer_id": developer_id,
            "configs": config_status,
            "runtime_ad_snapshot": runtime_ad,
            "stats": {
                "total_files": len(all_files),
                "lua_files": len(lua_files),
                "json_files": len(json_files),
                "ui_json_files": len(ui_json_files),
                "meta_files": len(meta_files),
                "asset_files": len(asset_files),
                "total_lua_prints": total_prints,
            },
        },
        "summary": {
            "total_findings": len(all_findings),
            "by_severity": severity_counts,
            "by_category": {
                "json_errors": len(json_errors),
                "meta_uuid_issues": len(meta_findings),
                "asset_path_issues": len(path_findings),
                "lua_static_issues": len(lua_findings),
                "package_hygiene": len(package_hygiene_findings),
            },
        },
        "findings": {
            "json_errors": json_errors,
            "meta_uuid_issues": meta_findings,
            "asset_path_issues": path_findings,
            "lua_static_issues": lua_findings,
            "package_hygiene": package_hygiene_findings,
        },
        "hotspots_for_ai_review": {
            "update_without_dt_clamp": dt_clamp_hotspots[:30],
            "ad_call_sites": anchors["ads"][:50],
            "save_call_sites": anchors["save"][:50],
            "save_upgrade_signals": {
                "has_save_logic": bool(anchors["save"]),
                "has_save_version": bool(anchors["save_version"]),
                "has_save_migration": bool(anchors["save_migrate"]),
                "save_files": save_files_unique[:20],
                "version_sites": anchors["save_version"][:20],
                "migration_sites": anchors["save_migrate"][:20],
                "recent_git_commits_touching_save": save_git_history,
            },
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="TapTap Maker read-only static QA scanner")
    parser.add_argument("--project", required=True, help="Absolute path to TapTap Maker game project root")
    parser.add_argument("--out", help="Optional output JSON path (recommended outside game directory)")
    args = parser.parse_args()

    project_root = Path(args.project).resolve()
    if not project_root.exists() or not project_root.is_dir():
        print(json.dumps({"error": f"项目目录不存在: {project_root}"}, ensure_ascii=False), file=sys.stderr)
        return 2

    report = run_audit(project_root)

    if args.out:
        out_path = Path(args.out).resolve()
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    # Compact headline summary to stdout
    headline = {
        "project": report["project"]["name"],
        "mode": report["project"]["mode"],
        "stats": report["project"]["stats"],
        "summary": report["summary"],
        "out": str(Path(args.out).resolve()) if args.out else None,
    }
    print(json.dumps(headline, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
