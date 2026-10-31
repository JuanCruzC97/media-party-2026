---
name: git-worktrees
description: Create and safely manage Git worktrees for parallel development in uv-based Python repositories, including isolated environments and optional local-file seeding. Use when the user explicitly asks for a worktree, when work genuinely cannot share the current checkout (parallel sessions, a long-running process, or uncommitted work that must stay put), or when listing, inspecting, repairing, renaming, or removing worktrees. Ordinary feature or fix work belongs on a branch in the current checkout — do not reach for a worktree by default.
---

# Git Worktrees

A worktree is not the default way to start a task. Most work — a feature, a fix,
a refactor — belongs on a branch in the current checkout. Read step 2 before
creating anything; the inspection and management commands below are always safe
to run.

Use the bundled command instead of calling mutating `git worktree` commands directly:

```bash
ROOT="$(git rev-parse --show-toplevel)"
WT="$ROOT/.agents/skills/git-worktrees/scripts/wt.sh"
```

The canonical `.agents/skills/` path works across clients and from any directory
inside the repository. Host-specific skill directories may symlink to it for
discovery, but commands must use the canonical path.

The command stores new worktrees under `<main-checkout>/.worktrees/<name>/` and
operates on the repository containing the current working directory.

## Commands

```bash
"$WT" list
"$WT" new <name> [--branch <branch>] [--from <ref>] [--no-seed] [--sync]
"$WT" new <name> --branch <local-branch> --existing
"$WT" path <name>
"$WT" seed <name> [--dry-run]
"$WT" doctor [<name>]
"$WT" rename <old> <new> [--branch <new-branch> | --no-branch]
"$WT" rm <name> [--force] [--delete-branch]
"$WT" scan
"$WT" unlock <name>
```

Run `"$WT" help` for complete flags and behavior.

`list` reports every linked worktree, including any a host client created
outside `.worktrees/` (Claude Code uses `.claude/worktrees/`). Those rows are
flagged `outside .worktrees/`. They are live checkouts belonging to that client,
not stale directories. Expect them to be `unseeded`, and — while idle —
`disposable`. Neither flag means abandoned here: this tool did not seed them, and
a clean checkout is what a host worktree looks like before its session commits
anything. Never remove one on those grounds.

## Workflow

### 1. Detect Existing Isolation

Before creating anything, determine whether the current checkout is already a
linked worktree:

```bash
GIT_DIR=$(git rev-parse --path-format=absolute --git-dir)
GIT_COMMON=$(git rev-parse --path-format=absolute --git-common-dir)
SUPERPROJECT=$(git rev-parse --show-superproject-working-tree 2>/dev/null)
```

If `GIT_DIR` differs from `GIT_COMMON` and `SUPERPROJECT` is empty, report the
current path and branch and reuse this worktree. Create another only when the
user explicitly requests additional isolation. A submodule is not itself proof
that the current checkout is a linked worktree.

When reusing an existing worktree, skip creation but still perform uv setup,
doctor, clean-status, and baseline-test checks below.

### 2. Decide Between A Branch And A Worktree

A worktree costs a directory, its own `.venv`, seeding, and a teardown that has
to preserve work. A branch costs one command. Pay the higher cost only when the
work genuinely cannot share the current checkout.

Create a worktree when at least one of these holds:

- The user asked for a worktree, or for parallel/isolated work, by name.
- The current checkout is busy and must stay as it is: a long build, test run,
  server, or another agent session is using it.
- Uncommitted work is in the way and the user does not want it stashed,
  committed, or discarded.
- Two branches must exist on disk at once — comparing them, running one against
  the other, or reviewing while continuing to develop.
- The user is running several tasks concurrently and each needs its own checkout.

Use a plain branch — and stop using this skill — when the request is a single simple
feature or fix to work on now, the checkout is clean or trivially
stashable, and nothing else is running in it:

```bash
git switch -c <branch>
```

Do not create a worktree on speculation that parallel work might appear later.
"This might become a big change" is not a reason; a second concurrent task is.

If neither side is clear, ask one short question and wait for the answer before
creating a directory or a branch:

```text
Branch here, or a separate worktree?
- branch: <branch> in the current checkout (<path>)
- worktree: <path>/.worktrees/<name>, own .venv, isolated from this checkout
```

Ask once, not per feature. If the user answers "branch" — or already told you
how they work — carry that choice through the rest of the session instead of
re-asking on the next task.

Read-only commands such as `list`, `path`, `doctor`, and `scan` never require
this gate or confirmation. Removal, rename, and repair follow the user's
request; they are not covered by the decision above.

### 3. Inspect Status And Choose The Base

```bash
"$WT" list
git status --short --branch
git rev-parse --verify "<base>^{commit}"
```

Only committed changes reachable from the base appear in the new worktree.
Select the base deliberately and pass `--from`; do not rely on the default in an
agent workflow. If prerequisite work is uncommitted, stop and ask how the user
wants to preserve it.

Before the first `"$WT" new` in a repository, check whether either seed manifest
exists at the repository root:

```bash
test -f "$ROOT/.worktreeinclude" || test -f "$ROOT/.worktreelink"
```

When neither file exists, ask and wait for the user's answer before creating the
worktree. Recommend adding `.env` to `.worktreeinclude` when it exists, and
adding existing data directories to `.worktreelink` only when they are shared,
branch-independent, and read-mostly:

```text
This repository has no .worktreeinclude or .worktreelink. Do you want to add
them before creating the worktree? I recommend copying .env with
.worktreeinclude and linking eligible data directories with .worktreelink.
Changes or deletions to linked existing files also change the main checkout;
new files created under a linked directory stay only in this worktree.
```

If the user agrees, inspect candidates with `"$WT" scan` and the repository
root, then add only suitable existing paths. Do not link mutable outputs or data
that needs branch isolation. Tell the user that reads and writes of generated or
mutable data should use the main checkout deliberately, rather than a linked
directory, so new data survives worktree removal. If they decline, continue
without manifests and report that the worktree will be unseeded. This gate
applies only to new worktrees; it does not block read-only commands or worktree
management.

Omitting `--from` resolves the base to `$WT_BASE` when that is exported, and
only then to the main worktree's current HEAD — so a base can be inherited from
the environment without ever being chosen. Passing `--from` removes the
question; the resolved base is printed before anything is created.

Choose a path-safe `<name>` containing only letters, numbers, `.`, `_`, or `-`.
Use `--branch` when the branch name contains `/`.

### 4. Verify The Worktree Directory Is Ignored

`wt.sh new` refuses to create `.worktrees/` unless Git confirms it is ignored.
If it fails this check, ask the user to add `/.worktrees/` to `.gitignore`. Do not
edit, commit, or bypass the check without approval.

### 5. Create, Seed, And Sync

For a new branch:

```bash
"$WT" new issue-123 --branch fix/123-<slug> --from <base> --sync
```

For an existing local branch:

```bash
"$WT" new issue-123 --branch fix/123-<slug> --existing --sync
```

Name the worktree `issue-<n>` and the branch with the issue convention
(`fix/123-<slug>` or `feat/<area>/123-<slug>`) when the work belongs to an
issue; the status report maps them back by that pattern. Use the repository's
default branch as `<base>`.

`--existing` attaches the branch as-is; `--from` does not apply. If only a
remote-tracking branch exists, create the local branch first.

Resolve the path immediately and use it as the working directory for every
later command, tool call, or subagent:

```bash
WORKTREE=$("$WT" path <name>)
```

If the worktree belongs to a GitHub issue, this skill does not mark it. After
creation, use the `github-issues` skill to add `in progress` and comment the
branch and worktree; that skill owns the issue state. If the issue was marked
`blocked`, swap it back to `in progress`.

`--sync` runs plain `uv sync`. Read the repository instructions and run another
`uv sync --project "$WORKTREE"` with any documented `--group` or `--extra`
options when needed. Never share `.venv` between worktrees.

If `.worktreeinclude` or `.worktreelink` exists, creation seeds it automatically.
A failed seed fails the command; fix the reported entries and rerun
`wt.sh seed <name>`. `--no-seed` is for worktrees you intend to seed yourself, not
a way past a seeding error.

Copied files may diverge; linked files are shared mutable state. New files beside
linked files remain local, so a linked directory is not a shared output store.
Read [references/manifests.md](references/manifests.md) before changing either
manifest.

### 6. Run Doctor

```bash
"$WT" doctor <name>
```

Resolve every failure before implementation. After a rename, run doctor again
and rebuild `.venv` if it contains paths to the previous location.

### 7. Verify Clean Status

```bash
git -C "$WORKTREE" status --short --branch
"$WT" list
```

Require `DIRTY=0` in the worktree's `list` row. Manifest-seeded paths may appear
in raw Git status and are expected setup state; every other change needs an
explanation. In particular, do not silently accept a generated or modified
`uv.lock`.

### 8. Run Baseline Tests

Use the test command documented by the repository's agent guide, contributor
guide, README, Makefile, or `pyproject.toml`. If no command is documented but
pytest is configured, run `uv run --project "$WORKTREE" pytest`.

If baseline tests fail, report the failing command and summary and ask whether
to investigate or proceed. Do not attribute a baseline failure to later work.
If no test command can be identified, report that the baseline was not run.

### 9. Report Readiness And Work There

Report the absolute path, branch, base commit, uv sync result, doctor result,
clean-status result, and baseline-test result. Then ensure every subsequent tool
and subagent uses `WORKTREE`; do not continue editing the main checkout.

```text
Worktree ready: <absolute-path>
Branch/base: <branch> from <base-sha>
Setup: uv sync passed; doctor passed; status clean
Baseline: <command and result>
```

### 10. Preserve Work Before Removal

Inspect status, run final verification, and integrate, publish, or otherwise
preserve commits and generated outputs before removal:

```bash
"$WT" rm <name>
```

Removal refuses visible uncommitted work, commits present on no other local
branch, and unseeded ignored artifacts. It keeps the branch unless
`--delete-branch` is supplied.

Do not use `--force` or `--delete-branch` unless the user explicitly approves
the exact data and branch that will be discarded. Never move a worktree with
`mv`; use `"$WT" rename` so Git's internal pointers are updated.
