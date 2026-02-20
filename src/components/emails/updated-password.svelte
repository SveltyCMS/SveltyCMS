<!--
@file src/components/emails/updated-password.svelte
@component
**updatedPassword Email component to reset password**
-->
<script lang="ts">
	import { Section, Text } from '@src/components/emails/components';
	import type { User } from '@src/databases/auth/types';

	interface Props {
		user: User;
	}

	const { user }: Props = $props();
</script>

<Section>
	<Text style="font-size: 18px; font-weight: bold;">Password Updated Successfully</Text>
	<Text style="font-size: 16px;">
		Hello {user.firstName || user.username},
	</Text>
	<Text style="font-size: 16px;">This email is to confirm that the password for your account has been successfully changed.</Text>
</Section>

<Section>
	<Text style="font-size: 16px;">
		<strong>Security Notice:</strong><br />
		If you did not make this change, please contact our support team immediately and secure your account.
	</Text>
</Section>
