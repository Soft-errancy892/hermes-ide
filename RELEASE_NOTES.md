# v0.5.19

## New

- **Telegram channel support for Claude sessions** — Connect a Telegram channel when launching a Claude session so you can interact with your AI assistant directly from Telegram

## Improved

- **Branch isolation is more reliable** — Closing a session no longer risks breaking other sessions sharing the same branch, and failed cleanup is retried on next launch
- **Clearer prompts when closing with unsaved changes** — The confirmation dialog now explains what will happen, shows a breakdown of changed files, and suggests how to recover stashed work
- **Polished branch isolation UI** — Buttons and labels use friendlier language, internal paths are no longer exposed, and all actions remain visible on short screens
- **Worktree directories no longer appear as projects** — Internal working directories are filtered out of the project list
