#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR=$(cd -P "$(dirname "${BASH_SOURCE[0]}")" && pwd)
WT_SH="$SCRIPT_DIR/../scripts/wt.sh"
TMP_ROOT=$(mktemp -d)

cleanup() {
    chmod -R u+w "$TMP_ROOT" 2>/dev/null || true
    rm -rf "$TMP_ROOT"
}
trap cleanup EXIT

fail() {
    printf 'FAIL: %s\n' "$1" >&2
    exit 1
}

assert_contains() {
    local text=$1 expected=$2
    [[ $text == *"$expected"* ]] || fail "expected output to contain: $expected"
}

assert_not_contains() {
    local text=$1 unexpected=$2
    [[ $text != *"$unexpected"* ]] || fail "expected output not to contain: $unexpected"
}

init_repo() {
    local name=$1 ignores=${2:-.worktrees/}
    local repo="$TMP_ROOT/$name"
    mkdir -p "$repo"
    git -C "$repo" init -q
    git -C "$repo" config user.name "wt.sh tests"
    git -C "$repo" config user.email "wt-tests@example.invalid"
    printf '%s\n' "$ignores" > "$repo/.gitignore"
    printf '# test repository\n' > "$repo/README.md"
    git -C "$repo" add .gitignore README.md
    git -C "$repo" commit -qm "test: initialize repository"
    git -C "$repo" branch -M main
    printf '%s' "$repo"
}

run_wt() {
    local repo=$1
    shift
    (cd "$repo" && "$WT_SH" "$@")
}

ledger_for() {
    local worktree=$1
    printf '%s/worktree-seed.list' "$(git -C "$worktree" rev-parse --absolute-git-dir)"
}

failing_command_dir() {
    local command=$1 dir="$TMP_ROOT/fail-$1"
    mkdir -p "$dir"
    printf '#!/bin/sh\nexit 1\n' > "$dir/$command"
    chmod +x "$dir/$command"
    printf '%s' "$dir"
}

test_nested_git_directory_link() {
    local repo worktree ledger output
    repo=$(init_repo nested-link $'.worktrees/\ndata/')
    mkdir -p "$repo/data"
    git -C "$repo/data" init -q
    git -C "$repo/data" config user.name "nested repo"
    git -C "$repo/data" config user.email "nested@example.invalid"
    printf 'payload\n' > "$repo/data/payload.txt"
    git -C "$repo/data" add payload.txt
    git -C "$repo/data" commit -qm "test: add payload"
    printf 'data\n' > "$repo/.worktreelink"

    output=$(run_wt "$repo" new nested --branch test/nested --from main 2>&1)
    worktree="$repo/.worktrees/nested"
    ledger=$(ledger_for "$worktree")

    [ -L "$worktree/data" ] || fail "nested Git directory was not linked"
    grep -qF $'link\tdata' "$ledger" || fail "successful nested directory link missing from ledger"
    assert_contains "$output" "seeded ok"
    run_wt "$repo" rm nested --delete-branch >/dev/null
}

test_ignored_directory_links_non_ascii_filename() {
    local repo worktree ledger output
    repo=$(init_repo accented-link $'.worktrees/\ndata/')
    git -C "$repo" config core.quotePath true
    mkdir -p "$repo/data"
    printf 'payload\n' > "$repo/data/año.xlsx"
    printf 'data\n' > "$repo/.worktreelink"

    run_wt "$repo" new accented --branch test/accented --from main >/dev/null
    worktree="$repo/.worktrees/accented"
    ledger=$(ledger_for "$worktree")

    [ -L "$worktree/data/año.xlsx" ] || fail "non-ASCII ignored file was not linked"
    [ "$(readlink "$worktree/data/año.xlsx")" = "$repo/data/año.xlsx" ] ||
        fail "non-ASCII ignored file links to the wrong source"
    [ -f "$worktree/data/año.xlsx" ] || fail "non-ASCII ignored file link is dangling"
    grep -qF $'link\tdata/año.xlsx' "$ledger" || fail "non-ASCII link missing from ledger"
    output=$(run_wt "$repo" doctor accented)
    assert_contains "$output" "all good"
    run_wt "$repo" rm accented --delete-branch >/dev/null
}

test_failed_link_is_not_recorded() {
    local repo worktree ledger output fail_bin
    repo=$(init_repo failed-link $'.worktrees/\nassets/')
    mkdir -p "$repo/assets"
    printf 'payload\n' > "$repo/assets/file.bin"
    printf 'assets/file.bin\n' > "$repo/.worktreelink"
    run_wt "$repo" new link-failure --branch test/link-failure --from main --no-seed >/dev/null
    worktree="$repo/.worktrees/link-failure"
    fail_bin=$(failing_command_dir ln)

    if output=$(PATH="$fail_bin:$PATH" run_wt "$repo" seed link-failure 2>&1); then
        fail "seed succeeded after ln failure"
    fi
    ledger=$(ledger_for "$worktree")

    assert_contains "$output" "link: failed to create 'assets/file.bin'"
    ! grep -qF $'link\tassets/file.bin' "$ledger" || fail "failed link was recorded"
    [ ! -e "$worktree/assets/file.bin" ] || fail "failed link unexpectedly exists"
    run_wt "$repo" rm link-failure --delete-branch >/dev/null
}

test_failed_copy_is_not_recorded() {
    local repo worktree ledger output fail_bin
    repo=$(init_repo failed-copy)
    mkdir -p "$repo/config"
    printf 'local = true\n' > "$repo/config/local.toml"
    printf 'config/local.toml\n' > "$repo/.worktreeinclude"
    run_wt "$repo" new copy-failure --branch test/copy-failure --from main --no-seed >/dev/null
    worktree="$repo/.worktrees/copy-failure"
    fail_bin=$(failing_command_dir cp)

    if output=$(PATH="$fail_bin:$PATH" run_wt "$repo" seed copy-failure 2>&1); then
        fail "seed succeeded after cp failure"
    fi
    ledger=$(ledger_for "$worktree")

    assert_contains "$output" "copy: failed to copy 'config/local.toml'"
    ! grep -qF $'copy\tconfig/local.toml' "$ledger" || fail "failed copy was recorded"
    [ ! -e "$worktree/config/local.toml" ] || fail "failed copy unexpectedly exists"
    run_wt "$repo" rm copy-failure --delete-branch >/dev/null
}

test_new_propagates_seed_failure() {
    local repo output
    repo=$(init_repo seed-failure)
    printf 'missing.env\n' > "$repo/.worktreeinclude"

    if output=$(run_wt "$repo" new seed-failure --branch test/seed-failure --from main 2>&1); then
        fail "new succeeded after seed failure"
    fi

    [ -d "$repo/.worktrees/seed-failure" ] || fail "failed seed should leave worktree for diagnosis"
    assert_contains "$output" "worktree created, but seeding failed"
    run_wt "$repo" rm seed-failure --delete-branch >/dev/null
}

test_rename_propagates_seed_failure() {
    local repo output branch
    repo=$(init_repo rename-failure)
    printf 'local = true\n' > "$repo/local.toml"
    printf 'local.toml\n' > "$repo/.worktreeinclude"
    run_wt "$repo" new rename-before --branch test/rename-before --from main >/dev/null
    printf 'missing.env\n' > "$repo/.worktreeinclude"

    if output=$(run_wt "$repo" rename rename-before rename-after --branch test/rename-after 2>&1); then
        fail "rename succeeded after reseed failure"
    fi

    [ -d "$repo/.worktrees/rename-after" ] || fail "renamed worktree path is missing"
    branch=$(git -C "$repo/.worktrees/rename-after" branch --show-current)
    [ "$branch" = test/rename-after ] || fail "branch rename did not complete before reseeding"
    assert_contains "$output" "worktree rename completed, but reseeding failed"
    run_wt "$repo" rm rename-after --force --delete-branch >/dev/null
}

test_scan_and_seed_reject_worktree_paths() {
    local repo output ledger
    repo=$(init_repo scan $'.worktrees/\n.claude/worktrees/\nsandbox/')
    run_wt "$repo" new canonical --branch test/canonical --from main --no-seed >/dev/null
    mkdir -p "$repo/.claude/worktrees" "$repo/sandbox"
    git -C "$repo" worktree add -q -b test/hosted "$repo/.claude/worktrees/hosted" main
    git -C "$repo" worktree add -q -b test/custom "$repo/sandbox/custom" main

    output=$(run_wt "$repo" scan)
    assert_not_contains "$output" $'\t.worktrees'
    assert_not_contains "$output" $'\t.claude/worktrees'
    assert_not_contains "$output" $'\tsandbox'

    printf '.worktrees\n' > "$repo/.worktreelink"
    if output=$(run_wt "$repo" seed canonical 2>&1); then
        fail "seed accepted the canonical worktree directory"
    fi
    ledger=$(ledger_for "$repo/.worktrees/canonical")
    assert_contains "$output" "link: refusing worktree path: .worktrees"
    ! grep -qF $'link\t.worktrees' "$ledger" || fail "worktree path was recorded"

    run_wt "$repo" rm hosted --delete-branch >/dev/null
    run_wt "$repo" rm custom --delete-branch >/dev/null
    run_wt "$repo" rm canonical --delete-branch >/dev/null
}

run_test() {
    local name=$1
    "$name"
    printf 'ok - %s\n' "$name"
}

run_test test_nested_git_directory_link
run_test test_ignored_directory_links_non_ascii_filename
run_test test_failed_link_is_not_recorded
run_test test_failed_copy_is_not_recorded
run_test test_new_propagates_seed_failure
run_test test_rename_propagates_seed_failure
run_test test_scan_and_seed_reject_worktree_paths

printf 'all git-worktrees tests passed\n'
