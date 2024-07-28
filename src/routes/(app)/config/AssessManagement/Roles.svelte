<script lang="ts">
  import { onMount } from 'svelte';
  import { writable } from 'svelte/store';
  import { authInterface } from '../../auth/authInterface';
  import type { Role, RoleTemplate } from '../../auth/types';

  let roles = writable<Role[]>([]);
  let selectedRoles = writable<Set<string>>(new Set());
  let roleName = '';
  let rolePermissions = writable({ create: false, read: false, write: false, delete: false });
  let roleHierarchy = writable<{ [key: string]: string[] }>({});
  let roleTemplates: RoleTemplate[] = [
    { name: 'Admin', permissions: ['create', 'read', 'write', 'delete'] },
    { name: 'Editor', permissions: ['read', 'write'] },
    { name: 'Viewer', permissions: ['read'] },
  ];
  let selectedTemplate = '';

  onMount(loadRoles);

  // Load roles using authInterface
  const loadRoles = async () => {
    try {
      const rolesData = await authInterface.getAllRoles();
      roles.set(rolesData);
    } catch (error) {
      console.error('Failed to load roles:', error);
    }
  };

  // Add a new role
  const addRole = async () => {
    if (!roleName) return;

    const roleData = {
      name: roleName,
      permissions: Object.keys($rolePermissions).filter(key => $rolePermissions[key]),
    };

    try {
      await authInterface.createRole(roleData);
      roleName = '';
      rolePermissions.set({ create: false, read: false, write: false, delete: false });
      loadRoles();
    } catch (error) {
      console.error('Failed to add role:', error);
    }
  };

  // Delete selected roles
  const deleteSelectedRoles = async () => {
    try {
      await authInterface.bulkDeleteRoles(Array.from($selectedRoles));
      selectedRoles.set(new Set());
      loadRoles();
    } catch (error) {
      console.error('Failed to delete roles:', error);
    }
  };

  // Apply role template
  const applyTemplate = (templateName: string) => {
    const template = roleTemplates.find(t => t.name === templateName);
    if (template) {
      rolePermissions.set(
        template.permissions.reduce((acc, permission) => {
          acc[permission] = true;
          return acc;
        }, { create: false, read: false, write: false, delete: false })
      );
    }
  };

  // Toggle role selection
  const toggleRoleSelection = (roleId: string) => {
    selectedRoles.update(selected => {
      if (selected.has(roleId)) {
        selected.delete(roleId);
      } else {
        selected.add(roleId);
      }
      return selected;
    });
  };
</script>

<div class="my-4">
  <h3 class="text-lg font-semibold">Roles Management</h3>
  <div class="mb-4">
    <input type="text" bind:value={roleName} placeholder="Role Name" class="border rounded p-2 w-full mb-2" />
    <div class="flex flex-wrap gap-2">
      {#each Object.keys($rolePermissions) as permission}
        <label class="flex items-center">
          <input type="checkbox" bind:checked={$rolePermissions[permission]} class="mr-2" />
          <span>{permission}</span>
        </label>
      {/each}
    </div>
    <div class="mt-2">
      <select bind:value={selectedTemplate} on:change={() => applyTemplate(selectedTemplate)} class="border rounded p-2">
        <option value="">Select Template</option>
        {#each roleTemplates as template}
          <option value={template.name}>{template.name}</option>
        {/each}
      </select>
    </div>
    <button on:click={addRole} class="bg-blue-500 text-white py-2 px-4 rounded mt-2">Add Role</button>
    <button on:click={deleteSelectedRoles} class="bg-red-500 text-white py-2 px-4 rounded mt-2 ml-2">Delete Selected Roles</button>
  </div>

  <div class="mt-4">
    <h4 class="mb-2">Existing Roles</h4>
    {#if $roles.length === 0}
      <p>No roles defined yet.</p>
    {:else}
      <ul class="list-disc pl-5">
        {#each $roles as role (role.id)}
          <li class="flex items-center">
            <input type="checkbox" on:change={() => toggleRoleSelection(role.id)} class="mr-2" />
            {role.name} - {role.permissions.join(', ')}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>