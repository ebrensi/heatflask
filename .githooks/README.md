## custom Git Hooks for development

Git hooks are stored in `.git/hooks/` by default, but that folder is not part of the repository so we store them here. `heatflask-setup` (from `nix develop`) points git at this directory with `git config core.hooksPath .githooks`.

The [`pre-commit`](./pre-commit) hook auto-formats staged files with Prettier or Black, and stages the result. It stages the whole file, so a file you staged only part of gets committed whole.

Note that these scripts must be set as executable in order to work!
