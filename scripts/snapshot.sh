#!/usr/bin/env bash
# 版本快照工具 —— 「改前先备份」，保证任何改动都可回滚
# 位置：<项目根>/scripts/snapshot.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VER_DIR="$ROOT/versions"
STAMP="$(date +%Y%m%d-%H%M%S)"

usage() {
  cat <<'EOF'
用法:
  ./scripts/snapshot.sh file <文件路径...>        改文件之前备份指定文件（最常用）
  ./scripts/snapshot.sh full [标签]               整体快照 src/ docs/ tests/ scripts/ 与配置文件
  ./scripts/snapshot.sh list                      查看所有快照与单文件备份
  ./scripts/snapshot.sh restore <快照名> [文件]    从快照恢复（省略文件=整体恢复）
  ./scripts/snapshot.sh archive <文件...>         把被替代的旧文件移入 versions/archive/（不删除）

约定:
  versions/files/<时间戳>/<原相对路径>      单文件备份
  versions/snapshots/<时间戳-标签>/          整体快照
  versions/archive/<时间戳>/<原相对路径>     归档的废弃实现
EOF
}

die() { echo "错误: $*" >&2; exit 1; }

cmd="${1:-}"
case "$cmd" in
  file)
    shift
    [ $# -gt 0 ] || die "请指定要备份的文件"
    dest="$VER_DIR/files/$STAMP"
    mkdir -p "$dest"
    for f in "$@"; do
      rel="${f#"$ROOT"/}"
      if [ ! -f "$ROOT/$rel" ]; then echo "跳过（不存在）: $rel"; continue; fi
      mkdir -p "$dest/$(dirname "$rel")"
      cp -p "$ROOT/$rel" "$dest/$rel"
      echo "已备份: $rel  ->  versions/files/$STAMP/$rel"
    done
    ;;

  full)
    shift
    label="${1:-}"
    name="$STAMP"
    if [ -n "$label" ]; then name="$STAMP-$label"; fi
    dest="$VER_DIR/snapshots/$name"
    mkdir -p "$dest"
    for p in src docs tests scripts package.json vite.config.ts index.html tsconfig.json README.md AGENTS.md; do
      [ -e "$ROOT/$p" ] && cp -Rp "$ROOT/$p" "$dest/"
    done
    printf -- "- %s  %s\n" "$(date '+%Y-%m-%d %H:%M:%S')" "$name" >> "$VER_DIR/snapshots/INDEX.md"
    echo "整体快照完成: versions/snapshots/$name"
    ;;

  list)
    echo "== 整体快照 =="
    ls -1 "$VER_DIR/snapshots" 2>/dev/null | grep -v '^INDEX.md$' || echo "（暂无）"
    echo "== 单文件备份 =="
    ls -1 "$VER_DIR/files" 2>/dev/null || echo "（暂无）"
    echo "== 归档 =="
    ls -1 "$VER_DIR/archive" 2>/dev/null || echo "（暂无）"
    ;;

  restore)
    name="${2:-}"; [ -n "$name" ] || die "请指定快照名（见 list）"
    file="${3:-}"
    if [ -d "$VER_DIR/snapshots/$name" ]; then src="$VER_DIR/snapshots/$name"
    elif [ -d "$VER_DIR/files/$name" ]; then src="$VER_DIR/files/$name"
    else die "找不到快照: $name"; fi
    if [ -n "$file" ]; then
      [ -f "$src/$file" ] || die "快照中没有该文件: $file"
      mkdir -p "$(dirname "$ROOT/$file")"
      cp -p "$src/$file" "$ROOT/$file"
      echo "已恢复: $file  <-  $name"
    else
      cp -Rp "$src/." "$ROOT/"
      echo "已整体恢复自: $name"
    fi
    ;;

  archive)
    shift
    [ $# -gt 0 ] || die "请指定要归档的文件"
    dest="$VER_DIR/archive/$STAMP"
    mkdir -p "$dest"
    for f in "$@"; do
      rel="${f#"$ROOT"/}"
      [ -f "$ROOT/$rel" ] || { echo "跳过（不存在）: $rel"; continue; }
      mkdir -p "$dest/$(dirname "$rel")"
      mv "$ROOT/$rel" "$dest/$rel"
      echo "已归档: $rel  ->  versions/archive/$STAMP/$rel"
    done
    ;;

  *)
    usage
    ;;
esac
