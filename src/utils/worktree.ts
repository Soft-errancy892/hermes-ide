/**
 * Checks if a path is inside the Hermes worktrees directory
 * (hermes-worktrees/), indicating it's a linked worktree rather
 * than the main checkout.
 */
export function isHermesWorktreePath(path: string): boolean {
  return path.includes('hermes-worktrees/');
}
