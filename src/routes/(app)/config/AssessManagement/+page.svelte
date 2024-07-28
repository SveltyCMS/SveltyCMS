<script lang="ts">
	import PageTitle from '@components/PageTitle.svelte';
	import { Tabs, Tab } from 'skeleton-dev/tabs';
	import Roles from './Roles.svelte';
	import Permissions from './Permissions.svelte';
</script>

<div class="my-2 flex items-center justify-between">
	<PageTitle name="Access Management" icon="mdi:account-key" />
</div>

<div class="mb-6 text-center sm:text-left">
	<p class="text-tertiary-500 dark:text-primary-500">
		Here you can create and manage user roles and permissions. Each role defines a set of permissions that determine what actions users with that role can perform in the system.
	</p>
</div>

<Tabs>
	<Tab name="Roles">
		<Roles />
	</Tab>
	<Tab name="Permissions">
		<Permissions />
	</Tab>
</Tabs>