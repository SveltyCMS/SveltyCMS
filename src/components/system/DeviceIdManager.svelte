<!-- DeviceIdManager.svelte -->
<script lang="ts">
	import { device_id } from '@stores/store';
	console.log($device_id);
	import { onMount } from 'svelte';

	onMount(() => {
		let existingDeviceId: string | null = localStorage.getItem('device_id');

		if (existingDeviceId) {
			const storedDeviceId = $device_id;

			if (storedDeviceId !== existingDeviceId) {
				device_id.set(existingDeviceId);
				console.log('Updated device_id store:', existingDeviceId);
			}
		} else {
			existingDeviceId = crypto.randomUUID();
			localStorage.setItem('device_id', existingDeviceId);
			device_id.set(existingDeviceId);
			console.log('Generated device_id:', existingDeviceId);
		}
	});
</script>

<!-- No need for HTML or CSS markup in this component -->
