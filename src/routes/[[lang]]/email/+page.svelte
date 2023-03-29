<script lang="ts">
	async function handleHelloClick() {
		await fetch('/api/sendMail', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				email: 'recipient@example.com',
				subject: 'Email Subject',
				message: 'Email message',
				templateName: 'Hello',
				props: {
					name: 'Svelte',
					sitename: 'SimpleCMS'
				}
			})
		});
	}

	async function handleWelcomeClick() {
		await fetch('/api/sendMail', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				email: 'recipient@example.com',
				subject: 'Email Subject',
				message: 'Email message',
				templateName: 'Welcome',
				props: {
					name: 'Svelte',
					username: 'svelteuser',
					email: 'svelte@example.com',
					token: '12345',
					role: 'admin'
				}
			})
		});
	}
</script>

<button class="btn variant-filled-secondary" on:click={handleHelloClick}> Send Hello Email </button>

<button class="btn variant-filled-primary" on:click={handleWelcomeClick}>
	Send Welcome Email
</button>
