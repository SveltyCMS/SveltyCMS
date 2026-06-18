<!--
@file src/components/admin/welcome-theme-picker.svelte
@component
**WelcomeThemePicker — First-login workspace preset selector**

Shows 3 Gin-inspired workspace presets on the dashboard for new users.
One-click activation sets the active admin theme. Dismissible via "Skip".

### Presets
- Corporate (cozy, bordered, teal/blue palette)
- Editorial (spacious, elevated, distraction-free)
- Operations (compact, flat, high-density)

### Features
- One-click theme activation via /api/theme/admin-theme
- Dismiss via localStorage (doesn't reappear)
- Uses AdminCard + native Button components
-->

<script lang="ts">
  import AdminCard from '@components/admin-card.svelte';
  import Button from '@components/ui/button.svelte';
  import { fade } from 'svelte/transition';
  import { toast } from '@src/stores/toast.svelte.ts';
  import { page } from '$app/state';

  let dismissed = $state(
    typeof localStorage !== 'undefined' && localStorage.getItem('svelty-welcome-picker-dismissed') === 'true'
  );
  let activating = $state<string | null>(null);

  const presets = [
    {
      id: 'corporate',
      name: 'Corporate',
      icon: 'mdi:office-building',
      description: 'Professional enterprise workspace. Cozy density, bordered cards, warm teal/blue palette.',
      density: 'cozy',
      variant: 'bordered',
      accent: 'bg-teal-600',
      ring: 'ring-teal-500',
    },
    {
      id: 'editorial',
      name: 'Editorial',
      icon: 'mdi:pen',
      description: 'Distraction-free writing environment. Spacious layout, elevated cards, clean typography.',
      density: 'spacious',
      variant: 'elevated',
      accent: 'bg-amber-600',
      ring: 'ring-amber-500',
    },
    {
      id: 'operations',
      name: 'Operations',
      icon: 'mdi:chart-line',
      description: 'High-density data cockpit. Compact layout, flat cards, maximum information density.',
      density: 'compact',
      variant: 'flat',
      accent: 'bg-blue-600',
      ring: 'ring-blue-500',
    },
  ];

  async function activate(presetId: string) {
    activating = presetId;
    try {
      const res = await fetch('/api/theme/admin-theme', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': page.data.csrfToken || '',
        },
        body: JSON.stringify({
          action: 'activate',
          themeId: presetId,
          density: presets.find(p => p.id === presetId)?.density,
          variant: presets.find(p => p.id === presetId)?.variant,
        }),
      });
      if (res.ok) {
        toast.success(`Workspace set to ${presets.find(p => p.id === presetId)?.name}. Reloading...`);
        localStorage.setItem('svelty-welcome-picker-dismissed', 'true');
        setTimeout(() => window.location.reload(), 800);
      } else {
        toast.error('Failed to set workspace. Try Appearance settings instead.');
      }
    } catch {
      toast.error('Failed to set workspace.');
    }
    activating = null;
  }

  function skip() {
    localStorage.setItem('svelty-welcome-picker-dismissed', 'true');
    dismissed = true;
  }
</script>

{#if !dismissed}
  <div transition:fade={{ duration: 200 }}>
    <AdminCard class="p-6 border-2 border-dashed border-tertiary-500/30 dark:border-primary-500/30 bg-tertiary-500/5 dark:bg-primary-500/5">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="text-lg font-bold text-surface-900 dark:text-white">Choose Your Workspace</h2>
          <p class="text-sm text-surface-500 dark:text-surface-400 mt-1">
            Pick a preset that matches your workflow. You can customize everything later in Appearance settings.
          </p>
        </div>
        <Button variant="ghost" size="sm" onclick={skip} aria-label="Skip workspace setup">Skip</Button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        {#each presets as preset (preset.id)}
          <button
            class="group relative flex flex-col items-center gap-3 rounded-lg border-2 border-surface-200 dark:border-surface-700 p-5 text-start transition-all duration-200 hover:border-tertiary-500 dark:hover:border-primary-500 hover:shadow-md hover:-translate-y-0.5 bg-white dark:bg-surface-900/50"
            onclick={() => activate(preset.id)}
            disabled={activating !== null}
            aria-label={`Activate ${preset.name} workspace`}
          >
            <!-- Preset accent dot -->
            <div class="h-3 w-3 rounded-full {preset.accent} ring-2 {preset.ring} ring-offset-2 ring-offset-white dark:ring-offset-surface-900"></div>

            <iconify-icon icon={preset.icon} width="28" class="text-tertiary-500 dark:text-primary-500 group-hover:scale-110 transition-transform"></iconify-icon>

            <div class="text-center">
              <div class="font-bold text-surface-900 dark:text-white">{preset.name}</div>
              <div class="flex items-center justify-center gap-2 mt-1">
                <span class="text-[10px] font-medium uppercase tracking-wider text-surface-400 bg-surface-100 dark:bg-surface-800 px-1.5 py-0.5 rounded">{preset.density}</span>
                <span class="text-[10px] font-medium uppercase tracking-wider text-surface-400 bg-surface-100 dark:bg-surface-800 px-1.5 py-0.5 rounded">{preset.variant}</span>
              </div>
            </div>

            <p class="text-xs text-surface-500 dark:text-surface-400 text-center leading-relaxed">{preset.description}</p>

            <Button
              variant="tertiary"
              size="sm"
              class="dark: mt-1 w-full"
              loading={activating === preset.id}
            >
              {activating === preset.id ? 'Applying...' : `Use ${preset.name}`}
            </Button>
          </button>
        {/each}
      </div>
    </AdminCard>
  </div>
{/if}
