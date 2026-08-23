<!--
@file src/components/docs/source-reference.svelte
@component
**Source Reference badge linking documentation directly to active codebase files**

### Props
- `path` (string): Relative path within the repository (e.g., 'src/routes/api/[...path]/handlers/collections.ts').
- `moduleName` (string): Human-readable module name.
- `githubBranch` (string): Target GitHub branch (default: 'next').

### Features:
- Svelte 5 runes ($props)
- Clean clickable badge with repository path
- Seamless integration into MDX documentation files
-->

<script lang="ts">
  interface SourceRefProps {
    path: string;
    moduleName?: string;
    githubBranch?: string;
  }

  let {
    path,
    moduleName = "Source Code",
    githubBranch = "next",
  }: SourceRefProps = $props();

  const githubUrl = $derived(`https://github.com/SveltyCMS/SveltyCMS/blob/${githubBranch}/${path}`);
</script>

<div class="my-4 inline-flex items-center gap-2 rounded-lg border border-surface-500/30 bg-surface-500/10 px-3.5 py-2 text-xs text-surface-600 transition-all hover:border-primary-500/30 hover:bg-primary-500/50 dark:border-surface-500/40 dark:bg-surface-900/60 dark:text-surface-400 dark:hover:border-primary-500/40 dark:hover:bg-primary-900/20">
  <span class="inline-flex h-2 w-2 rounded-full bg-success-500"></span>
  <span class="font-semibold text-surface-900 dark:text-white">{moduleName}:</span>
  <a
    href={githubUrl}
    target="_blank"
    rel="noopener noreferrer"
    class="font-mono text-primary-600 hover:underline dark:text-primary-400"
  >
    {path}
  </a>
</div>
