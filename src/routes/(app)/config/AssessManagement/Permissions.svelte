<script lang="ts">
  import { onMount } from 'svelte';
  import { writable } from 'svelte/store';
  import { authInterface } from '../../auth/authInterface';
  import type { Permission, Role } from '../../auth/types';

  let permissionsList = writable<Permission[]>([]);
  let modifiedPermissions = writable<Set<string>>(new Set());
  let searchTerm = '';
  let selectedPermissions = writable<Set<string>>(new Set());
  let advancedConditions = writable<{ [key: string]: any }>({});

  $: filteredPermissions = $permissionsList.filter((permission) =>
    permission.contextId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  onMount(loadPermissions);

  // Load permissions using authInterface
  const loadPermissions = async () => {
    try {
      const permissions = await authInterface.getAllPermissions();
      permissionsList.set(permissions);
    } catch (error) {
      console.error('Failed to load permissions:', error);
    }
  };

  // Toggle role for a given permission
  const toggleRole = (permission: Permission, role: string) => {
    permissionsList.update(list => {
      const perm = list.find(p => p.permission_id === permission.permission_id);
      if (perm) {
        const currentRoles = perm.requiredRole.split(',').map(r => r.trim());
        if (currentRoles.includes(role)) {
          perm.requiredRole = currentRoles.filter(r => r !== role).join(',');
        } else {
          perm.requiredRole = [...currentRoles, role].join(',');
        }
        modifiedPermissions.update(set => {
          set.add(permission.permission_id);
          return set;
        });
      }
      return list;
    });
  };

  // Save changes to modified permissions
  const saveChanges = async () => {
    const modified = Array.from($modifiedPermissions);
    try {
      for (const permissionId of modified) {
        const permission = $permissionsList.find(p => p.permission_id === permissionId);
        if (permission) {
          await authInterface.updatePermission(permission);
        }
      }
      modifiedPermissions.set(new Set());
      loadPermissions();
    } catch (error) {
      console.error('Failed to save changes:', error);
    }
  };

  // Bulk delete selected permissions
  const bulkDeletePermissions = async () => {
    try {
      await authInterface.bulkDeletePermissions(Array.from($selectedPermissions));
      selectedPermissions.set(new Set());
      loadPermissions();
    } catch (error) {
      console.error('Failed to delete permissions:', error);
    }
  };

  // Toggle permission selection
  const togglePermissionSelection = (permissionId: string) => {
    selectedPermissions.update(selected => {
      if (selected.has(permissionId)) {
        selected.delete(permissionId);
      } else {
        selected.add(permissionId);
      }
      return selected;
    });
  };
</script>

<div class="card mt-8 p-4">
  <h3 class="mb-4 text-lg font-semibold">Existing Permissions</h3>
  <div class="mb-4">
    <input
      type="text"
      bind:value={searchTerm}
      placeholder="Search permissions..."
      class="border border-gray-300 rounded p-2 w-full"
      aria-label="Search permissions"
    />
  </div>
  {#if filteredPermissions.length === 0}
    <p class="text-tertiary-500 dark:text-primary-500">
      {searchTerm ? 'No permissions match your search.' : 'No permissions defined yet.'}
    </p>
  {:else}
    <table class="compact table-auto w-full border-collapse border border-gray-200">
      <thead class="bg-gray-50">
        <tr class="divide-x">
          <th class="px-4 py-2">Permission ID</th>
          <th class="px-4 py-2">Action</th>
          <th class="px-4 py-2">Type</th>
         {#each $roles as role}
  <th class="px-4 py-2">{role}</th>
{/each}
<th class="px-4 py-2">Advanced Conditions</th>
<th class="px-4 py-2">Select</th>
</tr>
</thead>
<tbody>
{#each filteredPermissions as permission}
  <tr class="divide-x">
    <td class="px-4 py-2">{permission.contextId}</td>
    <td class="px-4 py-2">{permission.action}</td>
    <td class="px-4 py-2">{permission.contextType}</td>
    {#each $roles as role}
      <td class="text-center px-4 py-2">
        <input
          type="checkbox"
          checked={permission.requiredRole.split(',').map(r => r.trim()).includes(role)}
          on:change={() => toggleRole(permission, role)}
          class="form-checkbox"
        />
      </td>
    {/each}
    <td class="text-center px-4 py-2">
      <!-- Placeholder for advanced conditions -->
      <input
        type="text"
        placeholder="Conditions"
        bind:value={$advancedConditions[permission.permission_id]}
        class="border border-gray-300 rounded p-1"
      />
    </td>
    <td class="text-center px-4 py-2">
      <input
        type="checkbox"
        on:change={() => togglePermissionSelection(permission.permission_id)}
        class="form-checkbox"
      />
    </td>
  </tr>
{/each}
</tbody>
</table>
{/if}

{#if $modifiedPermissions.size > 0}
<div class="mt-4 text-right">
  <button on:click={saveChanges} class="bg-blue-500 text-white py-2 px-4 rounded">
    Save Changes ({$modifiedPermissions.size})
  </button>
</div>
{/if}

<div class="mt-4 text-right">
  <button on:click={bulkDeletePermissions} class="bg-red-500 text-white py-2 px-4 rounded">
    Delete Selected Permissions
  </button>
</div>
</div>