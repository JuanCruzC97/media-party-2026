# Worktree Seed Manifests

Repositories may define two optional files at their root to seed local-only
content after creating a worktree:

- `.worktreeinclude` copies files.
- `.worktreelink` symlinks ignored files.

The manifests normally belong in version control, but the files they name do
not have to be tracked.

## Format

Write one literal repository-relative path per line. Blank lines are ignored.
`#` starts a comment at the beginning of a line or after whitespace.

These are paths, not `.gitignore` patterns. Globs are not expanded.

```text
# .worktreeinclude
.env
config/local.toml

# .worktreelink
datasets/reference
```

## Copies

Use `.worktreeinclude` for small local configuration that each worktree may need
to change independently.

When copying a text file smaller than 1 MiB, the seeder rewrites absolute paths
under the main checkout to the new worktree. It reports line numbers but never
prints file contents. Other absolute paths are left unchanged and reported for
manual review.

Seeding refreshes a copied path from the main checkout. Review worktree-local
changes before reseeding because the source copy is authoritative.

Seeded copies are setup state, not protected work: removal checks exclude them.
Preserve any intentional changes elsewhere before reseeding or removing the
worktree.

## Links

Use `.worktreelink` only for large, branch-independent, read-mostly files.
Writing through a seeded symlink modifies the source file in the main checkout.

For a directory entry, the seeder recreates real directories and links the
ignored files currently present beneath it. This preserves tracked files such
as `.gitkeep` and avoids permanent `git status` noise.

This is not directory-level synchronization:

- Files that exist when seeding runs are linked.
- New files created in a worktree stay in that worktree.
- Reseeding discovers newly available source files.

Do not use `.worktreelink` for mutable output stores or anything requiring
per-branch isolation.

## Denied Paths

The seeder refuses common Python dependency, cache, build, and Git state
directories, including `.venv`, `venv`, `env`, `__pycache__`, test and type
checker caches, `dist`, `build`, and `.git`.

It also refuses `.worktrees`, `.claude/worktrees` — where Claude Code's own
worktree feature places checkouts — and paths that contain or sit inside any
registered worktree. `scan` excludes the same paths so it never recommends
linking worktrees into one another.

A worktree under a host client's directory is that client's live checkout, not
an abandoned one. Leave it alone unless its owner says otherwise.

Each Python worktree must initialize its own environment with `uv sync`, plus any
groups or extras required by the repository's setup instructions.

## Inspect And Apply

Set the command path as described in the skill:

```bash
ROOT="$(git rev-parse --show-toplevel)"
WT="$ROOT/.agents/skills/git-worktrees/scripts/wt.sh"
"$WT" scan
"$WT" seed <name> --dry-run
"$WT" seed <name>
"$WT" doctor <name>
```

`scan` is read-only. It proposes ignored or untracked candidates and never
modifies a manifest.

The seeding ledger lives in Git's private worktree state, outside the working
tree. Reseeding rewrites the ledger, but removing a path from a manifest does not
delete the previously copied or linked path; inspect and remove stale paths
explicitly.
