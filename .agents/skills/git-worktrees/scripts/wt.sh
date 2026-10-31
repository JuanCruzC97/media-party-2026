#!/usr/bin/env bash
# wt.sh — safely manage git worktrees under .worktrees/
#
# Wraps the git-worktree operations that are easy to get wrong (moving without
# stranding the gitdir pointer, keeping branch and directory names in step,
# refusing to destroy work that exists nowhere else) and seeds a new worktree
# with the local-only files git will not carry across — see .worktreeinclude
# and .worktreelink at the repo root.
#
# Bundled with the git-worktrees skill. Plain bash, with no agent dependency.
#
# Usage: wt.sh <command> [args]   (run `wt.sh help` for details)

set -euo pipefail

# --------------------------------------------------------------------------
# shared helpers
# --------------------------------------------------------------------------

# Path of the main worktree, even when invoked from a linked one.
main_root() {
    git worktree list --porcelain | awk '/^worktree /{print substr($0, 10); exit}'
}

ROOT="$(main_root)"
WT_DIR="$ROOT/.worktrees"
INCLUDE_FILE="$ROOT/.worktreeinclude"
LINK_FILE="$ROOT/.worktreelink"
DENY_NAMES=".venv venv env node_modules __pycache__ .pytest_cache .ruff_cache .mypy_cache htmlcov dist build target .git"
DRY=0

die() {
    printf 'wt.sh: %s\n' "$1" >&2
    exit 1
}

warn() {
    printf 'wt.sh: %s\n' "$1" >&2
}

validate_name() {
    case $1 in
        "" | "." | ".." | *[!A-Za-z0-9._-]*)
            die "worktree name '$1' must be one path-safe segment (letters, numbers, '.', '_' or '-')"
            ;;
    esac
}

run() {
    if [ "$DRY" -eq 1 ]; then
        printf '    [dry-run] %s\n' "$*"
    else
        "$@"
    fi
}

is_denied() {
    local path=$1 comp
    local IFS=/
    for comp in $path; do
        case " $DENY_NAMES " in
            *" $comp "*) return 0 ;;
        esac
        case $comp in
            *.egg-info) return 0 ;;
        esac
    done
    return 1
}

linked_worktrees() {
    git worktree list --porcelain | awk '/^worktree /{print substr($0, 10)}' | tail -n +2
}

# Refuse the canonical worktree directory, the directory a host client uses for
# its own worktrees (Claude Code: .claude/worktrees), and any path that contains
# or sits inside a registered worktree.
is_worktree_path() {
    local rel=${1%/} path wt_rel
    case $rel in
        "" | "." | .worktrees | .worktrees/* | .claude/worktrees | .claude/worktrees/*)
            return 0
            ;;
    esac

    while IFS= read -r path; do
        case $path in
            "$ROOT"/*)
                wt_rel=${path#"$ROOT/"}
                case $rel in
                    "$wt_rel" | "$wt_rel"/*) return 0 ;;
                esac
                case $wt_rel in
                    "$rel"/*) return 0 ;;
                esac
                ;;
        esac
    done < <(linked_worktrees)
    return 1
}

resolve_wt() {
    local q=$1 p
    [ -n "$q" ] || return 1
    while IFS= read -r p; do
        [ "$p" = "$q" ] && { printf '%s' "$p"; return 0; }
        [ "$(basename "$p")" = "$q" ] && { printf '%s' "$p"; return 0; }
    done < <(linked_worktrees)
    if [ -d "$q" ] && [ -e "$q/.git" ]; then
        p=$(git -C "$q" rev-parse --show-toplevel 2>/dev/null) && {
            printf '%s' "$p"
            return 0
        }
    fi
    return 1
}

require_wt() {
    local p
    p=$(resolve_wt "$1") || die "no worktree named '$1' (see 'wt.sh list')"
    printf '%s' "$p"
}

branch_of() {
    git -C "$1" rev-parse --abbrev-ref HEAD
}

# Count uncommitted work except paths created by seeding.
dirty_count() {
    local wt=$1 list
    list=$(seed_list_path "$wt" 2>/dev/null) || list=""
    if [ -z "$list" ] || [ ! -s "$list" ]; then
        git -C "$wt" status --porcelain | wc -l | tr -d ' '
        return
    fi
    git -C "$wt" status --porcelain | {
        local line p n=0
        while IFS= read -r line; do
            p=${line:3}
            grep -qF "	$p" "$list" && continue
            n=$((n + 1))
        done
        printf '%s' "$n"
    }
}

internal_id() {
    local gitdir
    gitdir=$(sed -n 's/^gitdir: //p' "$1/.git" 2>/dev/null) || return 1
    [ -n "$gitdir" ] || return 1
    basename "$gitdir"
}

wt_gitdir() {
    git -C "$1" rev-parse --absolute-git-dir
}

seed_list_path() {
    printf '%s/worktree-seed.list' "$(wt_gitdir "$1")"
}

meta_path() {
    printf '%s/worktree-meta' "$(wt_gitdir "$1")"
}

lock_file() {
    local id
    id=$(internal_id "$1") || return 1
    printf '%s/.git/worktrees/%s/locked' "$ROOT" "$id"
}

lock_reason() {
    local lf
    lf=$(lock_file "$1") || return 0
    [ -f "$lf" ] && cat "$lf" || true
}

# Count commits reachable from this branch but no other local branch.
unique_commits() {
    local branch=$1
    local -a others=()
    while IFS= read -r ref; do
        [ "$ref" = "refs/heads/$branch" ] || others+=("$ref")
    done < <(git for-each-ref --format='%(refname)' refs/heads/)

    if [ ${#others[@]} -eq 0 ]; then
        git rev-list --count "$branch"
    else
        git rev-list --count "$branch" --not "${others[@]}"
    fi
}

read_manifest() {
    local file=$1 line
    [ -f "$file" ] || return 0
    while IFS= read -r line || [ -n "$line" ]; do
        line=${line%$'\r'}
        line="${line#"${line%%[![:space:]]*}"}"
        case $line in '#'*) continue ;; esac
        line=${line%%[[:space:]]#*}
        line="${line%"${line##*[![:space:]]}"}"
        [ -n "$line" ] || continue
        printf '%s\n' "$line"
    done < "$file"
}

record_seed() {
    local wt=$1 kind=$2 rel=$3
    [ "$DRY" -eq 1 ] && return 0
    printf '%s\t%s\n' "$kind" "$rel" >> "$(seed_list_path "$wt")"
}

# Rebase main-checkout paths in copied text files without printing contents.
rebase_file() {
    local dst=$1 wt=$2 tmp
    tmp="$dst.wt-tmp.$$"

    if ! awk -v MAIN="$ROOT" -v WT="$wt" '
        function isword(c) { return (c ~ /^[A-Za-z0-9._-]$/) }

        function norm(s,    pfx, out, i, rest, j) {
            pfx = MAIN "/.worktrees/"
            out = ""
            while ((i = index(s, pfx)) > 0) {
                out = out substr(s, 1, i - 1)
                rest = substr(s, i + length(pfx))
                j = index(rest, "/")
                if (j > 0) { out = out MAIN "/"; s = substr(rest, j + 1) }
                else       { out = out MAIN;     s = "" }
            }
            return out s
        }

        function rebase(s,    out, i, nxt, cut) {
            out = ""
            while ((i = index(s, MAIN)) > 0) {
                cut = i + length(MAIN)
                nxt = substr(s, cut, 1)
                if (nxt == "" || !isword(nxt)) out = out substr(s, 1, i - 1) WT
                else                           out = out substr(s, 1, cut - 1)
                s = substr(s, cut)
            }
            return out s
        }

        {
            orig = $0
            line = rebase(norm($0))
            if (line != orig) {
                n++
                printf("    rebased line %d\n", NR) > "/dev/stderr"
            }
            print line
        }
        END { if (n > 0) printf("    %d line(s) rebased\n", n) > "/dev/stderr" }
    ' "$dst" > "$tmp"; then
        rm -f "$tmp"
        return 3
    fi

    chmod --reference="$dst" "$tmp" 2>/dev/null || true
    if ! mv "$tmp" "$dst"; then
        rm -f "$tmp"
        return 3
    fi

    local residual
    residual=$(grep -nE '(/home/|~/)' "$dst" | grep -vF "$wt" | cut -d: -f1 || true)
    if [ -n "$residual" ]; then
        printf '    absolute paths left as-is on line(s): %s\n' \
            "$(printf '%s\n' "$residual" | paste -sd, -)" >&2
    fi
}

copy_entry() {
    local entry=${1%/} wt=$2 no_rebase=$3
    local src="$ROOT/$entry" dst="$wt/$entry"

    if is_worktree_path "$entry"; then
        warn "copy: refusing worktree path: $entry"
        return 3
    fi
    if is_denied "$entry"; then
        warn "copy: refusing '$entry' (denylist — never share venv or build state)"
        return 3
    fi
    if [ ! -e "$src" ] && [ ! -L "$src" ]; then
        warn "copy: not in main checkout, skipped: $entry"
        return 3
    fi

    printf '  copy  %s\n' "$entry"
    if ! run mkdir -p "$(dirname "$dst")"; then
        warn "copy: failed to create parent for '$entry'"
        return 3
    fi
    if ! run cp -a "$src" "$dst"; then
        warn "copy: failed to copy '$entry'"
        return 3
    fi
    if [ "$no_rebase" -eq 0 ] && [ "$DRY" -eq 0 ] &&
       [ -f "$dst" ] && [ ! -L "$dst" ] &&
       [ "$(stat -c %s "$dst")" -le 1048576 ] && grep -Iq . "$dst" 2>/dev/null; then
        if ! rebase_file "$dst" "$wt"; then
            warn "copy: failed to rebase '$entry'"
            return 3
        fi
    fi
    if ! record_seed "$wt" copy "$entry"; then
        warn "copy: failed to record '$entry' in the seed ledger"
        return 3
    fi
}

ensure_real_parent() {
    local wt=$1 rel=$2
    local head=${rel%/*} cur="" comp
    [ "$head" = "$rel" ] && return 0

    local oldifs=$IFS
    IFS=/
    for comp in $head; do
        IFS=$oldifs
        cur="${cur:+$cur/}$comp"
        if [ -L "$wt/$cur" ]; then
            if ! run rm -f "$wt/$cur"; then
                IFS=$oldifs
                warn "link: failed to remove symlinked parent '$cur'"
                return 3
            fi
        fi
        if [ ! -d "$wt/$cur" ] && ! run mkdir -p "$wt/$cur"; then
            IFS=$oldifs
            warn "link: failed to create parent '$cur'"
            return 3
        fi
        IFS=/
    done
    IFS=$oldifs
}

link_one() {
    local rel=${1%/} wt=$2
    if [ -z "$rel" ]; then
        warn "link: refusing an empty path"
        return 3
    fi
    if is_worktree_path "$rel"; then
        warn "link: refusing worktree path: $rel"
        return 3
    fi
    local src="$ROOT/$rel" dst="$wt/$rel"

    if is_denied "$rel"; then
        warn "link: refusing '$rel' (denylist — never share venv or build state)"
        return 3
    fi

    if ! ensure_real_parent "$wt" "$rel"; then
        return 3
    fi
    if [ -L "$dst" ]; then
        if ! run rm -f "$dst"; then
            warn "link: failed to remove existing symlink '$rel'"
            return 3
        fi
    elif [ -d "$dst" ]; then
        rmdir "$dst" 2>/dev/null || {
            warn "link: '$rel' exists as a non-empty directory in the worktree, skipped"
            return 3
        }
    elif [ -e "$dst" ]; then
        warn "link: '$rel' exists as a real file in the worktree, skipped"
        return 3
    fi

    if ! run ln -sfn "$src" "$dst"; then
        warn "link: failed to create '$rel'"
        return 3
    fi
    if ! record_seed "$wt" link "$rel"; then
        warn "link: failed to record '$rel' in the seed ledger"
        return 3
    fi
}

# Directory entries become real directories containing symlinked ignored files.
link_entry() {
    local entry=${1%/} wt=$2
    local src="$ROOT/$entry"
    local rc=0 rel n=0

    if is_worktree_path "$entry"; then
        warn "link: refusing worktree path: $entry"
        return 3
    fi
    if [ ! -e "$src" ]; then
        warn "link: not in main checkout, skipped: $entry"
        return 3
    fi

    if [ ! -d "$src" ] || [ -L "$src" ]; then
        printf '  link  %s\n' "$entry"
        link_one "$entry" "$wt" || rc=3
        return $rc
    fi

    while IFS= read -r rel; do
        [ -n "$rel" ] || continue
        link_one "$rel" "$wt" || { rc=3; continue; }
        n=$((n + 1))
    done < <(git -C "$ROOT" -c core.quotePath=false ls-files --others --ignored --exclude-standard -- "$entry")

    printf '  link  %s/  (%d ignored file%s; tracked files left intact)\n' \
        "$entry" "$n" "$([ "$n" = 1 ] && echo '' || echo s)"
    return $rc
}

# Find ignored output created inside a worktree, excluding seeded and disposable state.
own_artifacts() {
    local wt=$1 list
    list=$(seed_list_path "$wt" 2>/dev/null) || list=""

    {
        local rel abs
        while IFS= read -r rel; do
            [ -n "$rel" ] || continue
            rel=${rel%/}
            is_denied "$rel" && continue
            abs="$wt/$rel"
            [ -L "$abs" ] && continue
            if [ -d "$abs" ]; then
                find "$abs" -type f -not -type l -print 2>/dev/null
            elif [ -f "$abs" ]; then
                printf '%s\n' "$abs"
            fi
        done < <(git -C "$wt" ls-files --others --ignored --exclude-standard \
                     --directory --no-empty-directory)
    } | {
        if [ -n "$list" ] && [ -s "$list" ]; then
            local abs rel
            while IFS= read -r abs; do
                rel=${abs#"$wt/"}
                grep -qF "	$rel" "$list" && continue
                printf '%s\n' "$abs"
            done
        else
            cat
        fi
    }
}

# --------------------------------------------------------------------------
# commands
# --------------------------------------------------------------------------

cmd_seed() {
    local name=${1:-} no_rebase=0
    [ -n "$name" ] || die "usage: wt.sh seed <name|path> [--no-rebase] [--dry-run]"
    shift
    while [ $# -gt 0 ]; do
        case $1 in
            --no-rebase) no_rebase=1; shift ;;
            --dry-run) DRY=1; shift ;;
            *) die "unknown flag: $1" ;;
        esac
    done

    local wt rc=0
    wt=$(require_wt "$name")
    [ "$wt" = "$ROOT" ] && die "refusing to seed the main worktree"

    if [ ! -f "$INCLUDE_FILE" ] && [ ! -f "$LINK_FILE" ]; then
        printf 'no .worktreeinclude or .worktreelink; nothing to seed\n'
        return 0
    fi

    printf 'seeding %s\n' "$wt"
    [ "$DRY" -eq 1 ] && printf '  (dry run — nothing will be written)\n'

    # Rewrite the ledger from scratch so re-seeding never accumulates stale rows.
    if [ "$DRY" -eq 0 ] && ! : > "$(seed_list_path "$wt")"; then
        warn "failed to initialize the seed ledger"
        return 3
    fi

    local entry
    while IFS= read -r entry; do
        copy_entry "$entry" "$wt" "$no_rebase" || rc=3
    done < <(read_manifest "$INCLUDE_FILE")

    while IFS= read -r entry; do
        link_entry "$entry" "$wt" || rc=3
    done < <(read_manifest "$LINK_FILE")

    if [ "$DRY" -eq 0 ]; then
        local meta
        meta=$(meta_path "$wt")
        if ! {
            grep -v '^seeded_at=' "$meta" 2>/dev/null || true
            printf 'seeded_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
        } > "$meta.tmp"; then
            rm -f "$meta.tmp"
            warn "failed to write worktree seed metadata"
            rc=3
        elif ! mv "$meta.tmp" "$meta"; then
            rm -f "$meta.tmp"
            warn "failed to update worktree seed metadata"
            rc=3
        fi
    fi

    [ "$rc" -eq 0 ] && printf 'seeded ok\n' || printf 'seeded with skipped entries (see warnings)\n'
    return $rc
}

cmd_list() {
    printf '%-38s %-42s %6s %5s  %s\n' DIRECTORY BRANCH DIRTY OWN NOTES
    local path name branch dirty own notes id reason
    while IFS= read -r path; do
        [ -d "$path" ] || continue
        name=$(basename "$path")
        branch=$(branch_of "$path")
        dirty=$(dirty_count "$path")
        own=$(unique_commits "$branch")

        notes=""
        case $path in
            "$WT_DIR"/*) ;;
            *) notes="outside .worktrees/" ;;
        esac

        reason=$(lock_reason "$path")
        [ -n "$reason" ] && notes="${notes:+$notes, }locked"

        # Surface the cosmetic id drift left behind by `git worktree move`.
        if id=$(internal_id "$path") && [ "$id" != "$name" ]; then
            notes="${notes:+$notes, }id=$id"
        fi

        [ -s "$(seed_list_path "$path")" ] || notes="${notes:+$notes, }unseeded"
        [ "$dirty" = 0 ] && [ "$own" = 0 ] && notes="${notes:+$notes, }disposable"

        printf '%-38s %-42s %6s %5s  %s\n' "$name" "$branch" "$dirty" "$own" "$notes"
    done < <(linked_worktrees)

    echo
    echo "DIRTY = uncommitted files.  OWN = commits on no other local branch."
}

cmd_path() {
    local name=${1:-}
    [ -n "$name" ] || die "usage: wt.sh path <name>"
    require_wt "$name"
    echo
}

cmd_new() {
    local name=${1:-} branch="" from="" seed=1 sync=0 use_existing=0
    [ -n "$name" ] ||
        die "usage: wt.sh new <name> [--branch <b>] [--from <ref>] [--existing] [--no-seed] [--sync]"
    validate_name "$name"
    shift
    while [ $# -gt 0 ]; do
        case $1 in
            --branch) branch=${2:-}; shift 2 ;;
            --from) from=${2:-}; shift 2 ;;
            --existing) use_existing=1; shift ;;
            --no-seed) seed=0; shift ;;
            --sync) sync=1; shift ;;
            *) die "unknown flag: $1" ;;
        esac
    done
    branch=${branch:-$name}

    # Base resolution: --from, then $WT_BASE, then the main worktree's current
    # HEAD. Agents pass --from explicitly; the fallback keeps the CLI convenient.
    [ -n "$from" ] || from=${WT_BASE:-}
    [ -n "$from" ] || from=$(git -C "$ROOT" rev-parse --abbrev-ref HEAD)

    if [ -n "$(git -C "$ROOT" status --porcelain)" ]; then
        warn "the main worktree has uncommitted changes; they are not included in the new worktree"
    fi

    local path
    path="$WT_DIR/$name"

    # Re-entrancy: already registered is fine and idempotent; a stray directory
    # git does not know about is not something to guess about.
    if resolve_wt "$name" >/dev/null 2>&1 && [ -d "$path" ]; then
        printf "worktree '%s' already exists at %s\n" "$name" "$path"
        printf "run 'wt.sh seed %s' to refresh its local-only files\n" "$name"
        return 0
    fi
    [ -e "$path" ] &&
        die "'$path' exists but is not a registered worktree — remove it or run 'git worktree prune'"

    if ! git -C "$ROOT" check-ignore -q -- ".worktrees/"; then
        die "'$WT_DIR' is not ignored — add '/.worktrees/' to $ROOT/.gitignore before creating worktrees"
    fi

    mkdir -p "$WT_DIR"
    local base_sha
    if git show-ref --verify --quiet "refs/heads/$branch"; then
        [ "$use_existing" -eq 1 ] ||
            die "branch '$branch' already exists — pass --existing to attach it, or --branch for a new name"
        base_sha=$(git -C "$ROOT" rev-parse --short "$branch")
        from=$branch
        printf 'existing branch: %s (%s) %s\n' "$branch" "$base_sha" \
            "$(git -C "$ROOT" log -1 --format=%s "$branch")"
        git worktree add "$path" "$branch"
    else
        [ "$use_existing" -eq 0 ] || die "branch '$branch' does not exist locally"
        base_sha=$(git -C "$ROOT" rev-parse --short "$from") || die "cannot resolve base ref '$from'"
        printf 'base: %s (%s) %s\n' "$from" "$base_sha" \
            "$(git -C "$ROOT" log -1 --format=%s "$from")"
        git worktree add -b "$branch" "$path" "$from"
    fi
    printf 'created %s on branch %s\n' "$path" "$branch"

    printf 'base_ref=%s\nbase_sha=%s\ncreated=%s\n' \
        "$from" "$base_sha" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$(meta_path "$path")"

    if [ "$seed" -eq 1 ] && ! cmd_seed "$path"; then
        die "worktree created, but seeding failed — fix the reported entries and run 'wt.sh seed $name'"
    fi

    if [ "$sync" -eq 1 ]; then
        command -v uv >/dev/null 2>&1 || die "uv is not on PATH; worktree created but not synced"
        printf 'running uv sync in %s\n' "$path"
        (cd "$path" && uv sync)
    else
        printf 'next: cd %s && uv sync\n' "$path"
    fi
}

cmd_rename() {
    local old=${1:-} new=${2:-} newbranch="" rename_branch=1
    [ -n "$old" ] && [ -n "$new" ] ||
        die "usage: wt.sh rename <old> <new> [--branch <newbranch> | --no-branch]"
    shift 2
    while [ $# -gt 0 ]; do
        case $1 in
            --branch) newbranch=${2:-}; rename_branch=1; shift 2 ;;
            --no-branch) rename_branch=0; shift ;;
            *) die "unknown flag: $1" ;;
        esac
    done

    validate_name "$new"
    local oldpath newpath
    oldpath=$(require_wt "$old")
    newpath="$WT_DIR/$new"
    [ -e "$newpath" ] && die "'$new' already exists"

    local reason
    reason=$(lock_reason "$oldpath")
    if [ -n "$reason" ]; then
        die "'$old' is locked — run 'wt.sh unlock $old' first. Reason: $reason"
    fi

    local branch
    branch=$(branch_of "$oldpath")

    # Default: substitute the old directory name inside the branch name, which
    # preserves prefixes like feat/ or worktree-.
    if [ "$rename_branch" -eq 1 ] && [ -z "$newbranch" ]; then
        case $branch in
            *"$old"*) newbranch=${branch//$old/$new} ;;
            *)
                warn "branch '$branch' does not contain '$old'; leaving it alone (use --branch)"
                rename_branch=0
                ;;
        esac
    fi

    [ "$newbranch" = "$branch" ] && rename_branch=0
    [ "$rename_branch" -eq 1 ] && git show-ref --verify --quiet "refs/heads/$newbranch" &&
        die "branch '$newbranch' already exists"

    # Never plain `mv`: it strands the worktree's .git pointer and the repo's
    # gitdir file. `git worktree move` rewrites both.
    mkdir -p "$WT_DIR"
    git worktree move "$oldpath" "$newpath"
    printf 'moved %s -> %s\n' "$oldpath" "$newpath"

    if [ "$rename_branch" -eq 1 ]; then
        git branch -m "$branch" "$newbranch"
        printf 'renamed branch %s -> %s\n' "$branch" "$newbranch"
        if git rev-parse --abbrev-ref "$newbranch@{upstream}" >/dev/null 2>&1; then
            warn "'$newbranch' tracks a remote branch — the remote name is unchanged."
        fi
    else
        printf 'branch left as %s\n' "$branch"
    fi

    # Seeded symlinks are absolute and remain valid. Copied files may contain
    # paths to the old location, so refresh them after completing the rename.
    if [ -s "$(seed_list_path "$newpath")" ]; then
        printf 'reseeding after move\n'
        if ! cmd_seed "$newpath"; then
            die "worktree rename completed, but reseeding failed — fix the reported entries and run 'wt.sh seed $new'"
        fi
    fi
}

cmd_rm() {
    local name=${1:-} force=0 del_branch=0
    [ -n "$name" ] || die "usage: wt.sh rm <name> [--force] [--delete-branch]"
    shift
    while [ $# -gt 0 ]; do
        case $1 in
            --force) force=1; shift ;;
            --delete-branch) del_branch=1; shift ;;
            *) die "unknown flag: $1" ;;
        esac
    done

    local path branch dirty own
    path=$(require_wt "$name")
    [ "$path" = "$ROOT" ] && die "refusing to remove the main worktree"
    branch=$(branch_of "$path")
    dirty=$(dirty_count "$path")
    own=$(unique_commits "$branch")

    if [ "$force" -eq 0 ]; then
        [ "$dirty" != 0 ] &&
            die "'$name' has $dirty uncommitted file(s); commit them or pass --force"
        [ "$own" != 0 ] &&
            die "'$branch' has $own commit(s) on no other branch; merge them or pass --force"

        local artifacts count
        artifacts=$(own_artifacts "$path" || true)
        if [ -n "$artifacts" ]; then
            count=$(printf '%s\n' "$artifacts" | wc -l | tr -d ' ')
            warn "'$name' holds $count ignored file(s) produced inside it:"
            printf '%s\n' "$artifacts" | xargs -r du -h 2>/dev/null |
                sort -rh | head -10 | sed 's/^/      /' >&2
            die "these are invisible to git status and would be deleted; pass --force to proceed"
        fi
    fi

    # Unlink seeded symlinks BEFORE removing the worktree. Cheap insurance
    # against ever deleting the main checkout's data through a link.
    local list kind rel
    list=$(seed_list_path "$path")
    if [ -f "$list" ]; then
        while IFS=$'\t' read -r kind rel; do
            [ "$kind" = link ] || continue
            [ -L "$path/$rel" ] && rm -f "$path/$rel"
        done < "$list"
        printf 'unlinked seeded symlinks\n'
    fi

    local -a rmargs=()
    [ "$force" -eq 1 ] && rmargs+=(--force)
    git worktree remove "${rmargs[@]+"${rmargs[@]}"}" "$path"
    git worktree prune
    printf 'removed worktree %s\n' "$name"

    if [ "$del_branch" -eq 1 ]; then
        git branch -D "$branch"
        printf 'deleted branch %s\n' "$branch"
    else
        printf 'branch %s kept\n' "$branch"
    fi
}

cmd_unlock() {
    local name=${1:-}
    [ -n "$name" ] || die "usage: wt.sh unlock <name>"

    local path reason pid
    path=$(require_wt "$name")
    reason=$(lock_reason "$path")
    [ -n "$reason" ] || { printf "'%s' is not locked\n" "$name"; return 0; }

    printf 'lock reason: %s\n' "$reason"
    pid=$(printf '%s' "$reason" | sed -n 's/.*pid \([0-9][0-9]*\).*/\1/p')

    if [ -n "$pid" ] && ps -p "$pid" >/dev/null 2>&1; then
        warn "pid $pid is still running:"
        ps -p "$pid" -o pid=,etime=,args= | cut -c1-110 >&2
        warn "unlocking will not stop it. Close that session, or kill $pid yourself"
        warn "after confirming it is not the session you are typing in right now."
        die "refusing to unlock while pid $pid is alive"
    fi

    [ -n "$pid" ] && printf 'pid %s is gone (stale lock)\n' "$pid"
    # Pass the path, not the name: after a rename the internal id no longer
    # matches the directory basename.
    git worktree unlock "$path"
    printf 'unlocked %s\n' "$name"
}

cmd_doctor() {
    local targets=() path issues=0
    if [ $# -gt 0 ]; then
        targets+=("$(require_wt "$1")")
    else
        while IFS= read -r path; do targets+=("$path"); done < <(linked_worktrees)
    fi
    [ ${#targets[@]} -gt 0 ] || { printf 'no linked worktrees\n'; return 0; }

    for path in "${targets[@]}"; do
        printf '\n%s\n' "$path"
        local n

        # 1. dangling symlinks — the main-side file was deleted or renamed
        n=$(find "$path" -xtype l -not -path '*/.venv/*' 2>/dev/null | wc -l | tr -d ' ')
        if [ "$n" != 0 ]; then
            printf '  FAIL  %s dangling symlink(s)\n' "$n"
            find "$path" -xtype l -not -path '*/.venv/*' 2>/dev/null | head -5 | sed 's/^/          /'
            issues=$((issues + 1))
        else
            printf '  ok    no dangling symlinks\n'
        fi

        # 2. a copied file still pointing at the main checkout (the .env trap)
        local list kind rel bad=0
        list=$(seed_list_path "$path")
        if [ -f "$list" ]; then
            while IFS=$'\t' read -r kind rel; do
                [ "$kind" = copy ] || continue
                [ -f "$path/$rel" ] && [ ! -L "$path/$rel" ] || continue
                # .worktrees/ sits inside the repo root, so a correctly rebased
                # path still starts with $ROOT/. Only a line mentioning the main
                # root WITHOUT this worktree's path is genuinely stale.
                if grep -F "$ROOT/" "$path/$rel" 2>/dev/null | grep -qvF "$path/"; then
                    printf '  FAIL  %s still points into the main checkout\n' "$rel"
                    bad=1
                fi
            done < "$list"
        fi
        if [ "$bad" -eq 0 ]; then
            printf '  ok    copied files point at this worktree\n'
        else
            printf '        run: wt.sh seed %s\n' "$(basename "$path")"
            issues=$((issues + 1))
        fi

        # 3. stale Python environment — editable installs may retain paths to a
        # previous worktree location after a move.
        local pth stale=0 target file
        while IFS= read -r pth; do
            [ -n "$pth" ] || continue
            target=$(head -1 "$pth" 2>/dev/null) || continue
            case $target in
                "$path"/*) ;;
                "$ROOT/.worktrees/"*) stale=1; break ;;
            esac
        done < <(find "$path/.venv" -maxdepth 4 -name '*.pth' 2>/dev/null | head -20)

        if [ "$stale" -eq 0 ] && [ -d "$path/.venv" ]; then
            while IFS= read -r file; do
                [ -n "$file" ] || continue
                if grep -F "$ROOT/.worktrees/" "$file" 2>/dev/null | grep -qvF "$path/"; then
                    stale=1
                    break
                fi
            done < <(grep -RIlF "$ROOT/.worktrees/" "$path/.venv/bin" \
                "$path/.venv/pyvenv.cfg" 2>/dev/null | head -20)
        fi
        if [ ! -f "$path/pyproject.toml" ]; then
            printf '  ok    no Python project at worktree root\n'
        elif [ ! -d "$path/.venv" ]; then
            printf '  warn  no .venv — run: cd %s && uv sync\n' "$path"
        elif [ "$stale" -eq 1 ]; then
            printf '  FAIL  .venv points at another worktree path\n'
            printf '        rebuild it: uv venv --clear %s/.venv && uv sync --project %s\n' \
                "$path" "$path"
            issues=$((issues + 1))
        else
            printf '  ok    .venv resolves into this worktree\n'
        fi

        # 4. a tracked file clobbered by a link (the .gitkeep trap)
        n=$(git -C "$path" status --porcelain | grep -c '^ D' || true)
        if [ "$n" != 0 ]; then
            printf '  FAIL  %s tracked file(s) deleted — a link may have replaced a tracked dir\n' "$n"
            git -C "$path" status --porcelain | grep '^ D' | head -5 | sed 's/^/          /'
            issues=$((issues + 1))
        else
            printf '  ok    no tracked files clobbered\n'
        fi
    done

    echo
    [ "$issues" -eq 0 ] && printf 'all good\n' || { printf '%s issue(s) found\n' "$issues"; return 2; }
}

# Read-only. Prints suggestions; never writes the manifests. Sharing local data
# across branches is a decision someone should review first.
cmd_scan() {
    printf '# candidates for .worktreelink (ignored, bulky, branch-invariant)\n'
    git -C "$ROOT" ls-files --others --ignored --exclude-standard --directory \
        --no-empty-directory 2>/dev/null |
        while IFS= read -r rel; do
            rel=${rel%/}
            is_denied "$rel" && continue
            is_worktree_path "$rel" && continue
            [ -e "$ROOT/$rel" ] || continue
            printf '%s\t%s\n' "$(du -sh "$ROOT/$rel" 2>/dev/null | cut -f1)" "$rel"
        done | sort -rh | head -25

    printf '\n# candidates for .worktreeinclude (untracked, not ignored local configuration)\n'
    git -C "$ROOT" ls-files --others --exclude-standard 2>/dev/null |
        while IFS= read -r rel; do
            is_denied "$rel" && continue
            is_worktree_path "$rel" && continue
            printf '%s\n' "$rel"
        done | head -25

    printf '\n# gitignored env files (absolute paths inside them are rebased on copy)\n'
    find "$ROOT" -maxdepth 3 -name '.env' -not -path '*/.worktrees/*' \
        -not -path '*/.venv/*' 2>/dev/null |
        sed "s|^$ROOT/||"

    printf '\nNothing was written. Copy what you want into .worktreeinclude / .worktreelink.\n'
}

cmd_help() {
    cat <<'EOF'
wt.sh — manage Python project worktrees under .worktrees/

  wt.sh list
      Every linked worktree: branch, uncommitted files, commits held by no
      other local branch, and lock / staleness / seeding notes.

  wt.sh new <name> [--branch <b>] [--from <ref>] [--existing] [--no-seed] [--sync]
      Create a worktree, then seed it. Branch defaults to <name>. Base defaults
      to $WT_BASE, else the MAIN worktree's current HEAD -- not the remote
      default -- so a branch cut from a feature branch keeps its prerequisites.
      Prints the resolved base and its subject before creating anything.
      --sync runs `uv sync` in the new worktree after seeding.

  wt.sh seed <name|path> [--no-rebase] [--dry-run]
      Apply .worktreeinclude (copy) and .worktreelink (symlink). Idempotent:
      run it as often as you like. Absolute paths pointing into the main
      checkout are rewritten to this worktree, and every rewrite is printed.

  wt.sh scan
      Suggest manifest contents from what is actually ignored/untracked here.
      Read-only -- it prints, it never writes.

  wt.sh doctor [<name>]
      Dangling symlinks, copied files still aimed at the main checkout, stale
      .venv paths, tracked files clobbered by a link.

  wt.sh rename <old> <new> [--branch <newbranch> | --no-branch]
      Move the directory AND rename the branch, then re-seed. By default the
      branch name has <old> substituted for <new> (feat/foo -> feat/foo-v0).

  wt.sh rm <name> [--force] [--delete-branch]
      Remove a worktree. Refuses when it holds uncommitted files, commits on no
      other branch, or ignored files produced inside it that `git status` does
      not show. Keeps the branch unless asked.

  wt.sh unlock <name>
      Release a lock, but only after confirming the owning pid is dead.

  wt.sh path <name>
      Print the worktree's absolute path.

Notes
  - Directory name and branch name are independent in git; only `wt.sh rename`
    keeps them in step.
  - Never `mv` a worktree -- it strands the gitdir pointers. Use `wt.sh rename`.
  - .venv and other dependency or build state is never copied or linked.
    Initialize each worktree with `uv sync` and any groups required by the repo.
EOF
}

# --------------------------------------------------------------------------

case ${1:-help} in
    list | ls) shift; cmd_list "$@" ;;
    new | add) shift; cmd_new "$@" ;;
    seed) shift; cmd_seed "$@" ;;
    scan) shift; cmd_scan "$@" ;;
    doctor | check) shift; cmd_doctor "$@" ;;
    rename | mv) shift; cmd_rename "$@" ;;
    rm | remove) shift; cmd_rm "$@" ;;
    unlock) shift; cmd_unlock "$@" ;;
    path) shift; cmd_path "$@" ;;
    help | -h | --help) cmd_help ;;
    *) die "unknown command '${1}' — run 'wt.sh help'" ;;
esac
