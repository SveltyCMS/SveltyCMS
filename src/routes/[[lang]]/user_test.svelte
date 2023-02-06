<script lang="ts">
	import { getUser } from '@lucia-auth/sveltekit/client';

	import LL from '$i18n/i18n-svelte';

	// import { sendMail } from '$src/lib/utils/send-email';

	// let email = '';
	// let resetToken = '';

	// const handleSubmit = async (event) => {
	// 	event.preventDefault();
	// 	await sendMail(email, resetToken);
	// };

	const user = getUser();

	// show/hide Left Sidebar
	export let toggleLeftSideBar = false;
</script>

<div class="">
	<!-- mobile hamburger -->
	<button
		class="btn btn-sm -ml-2 text-white "
		on:click={() => (toggleLeftSideBar = !toggleLeftSideBar)}
	>
		<span>
			<svg viewBox="0 0 100 80" class="fill-token h-4 w-4">
				<rect width="100" height="20" />
				<rect y="30" width="100" height="20" />
				<rect y="60" width="100" height="20" />
			</svg>
		</span>
	</button>

	<h1 class="">
		{$LL.LOGIN_SignUp()}
	</h1>
</div>

<p>This page is protected and can only be accessed by authenticated users.</p>

<pre class="code">
{JSON.stringify($user, null, 2)}
</pre>

<!-- <form on:submit={handleSubmit}>
	<div>
		<label for="email">Receiving Email:</label>
		<input type="email" id="email" bind:value={email} />
	</div>
	<div>
		<label for="resetToken">Reset Token:</label>
		<input type="text" id="resetToken" bind:value={resetToken} />
	</div>
	<button type="submit" class="btn btn-base">Send</button>
</form> -->
