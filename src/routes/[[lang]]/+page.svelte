<script lang="ts">
	import { getUser } from '@lucia-auth/sveltekit/client';
	import LL from '$i18n/i18n-svelte';

	const user = getUser();
</script>

<div class="">
	<h1 class="">
		{$LL.LOGIN_SignUp()}
	</h1>
</div>

<p>This page is protected and can only be accessed by authenticated users.</p>

<pre class="code">
{JSON.stringify($user, null, 2)}
</pre>
