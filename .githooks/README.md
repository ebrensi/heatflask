## custom Git Hooks for development

Git hooks are stored in `.git/hooks/` by default, but that folder is not part of the repository so we store them here.

The [`pre-commit`](.githooks/pre-commit) hook auto-formats files with Prettier or Black.

`pre-merge` and `pre-rewrite` hooks are linked to [`update-dependencies-hook`](.githooks/update-dependecies-hook), which automatically `pip install`s or `npm install`s on pull, merge, or rebase if it involves updates to the dependencies.

Note that these scripts must be set as executable in order to work!
