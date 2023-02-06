<script lang="ts">
	// Props
	/** Exposes parent props to this component. */
	export let parent: any;

	// Stores
	import { modalStore } from '@skeletonlabs/skeleton';

	// Lucia
	import { getUser } from '@lucia-auth/sveltekit/client';
	const user = getUser();

	// Form Data
	const formData = {
		username: $user?.username,
		email: $user?.email,
		password: 'Hashed PW get from seesion',
		confirmPassword: 'Hashed PW get from seesion',
		role: $user?.role
	};

	// zod
	import z from 'zod';
	// const UserSchema = z
	// 	.object({
	// 		username: z
	// 			.string({ required_error: 'Username is required' })
	// 			.regex(/^[a-zA-z\s]*$/, { message: 'Name can only contain letters and spaces.' })
	// 			.min(2, { message: 'Name must be at least 2 charactes' })
	// 			.max(24, { message: 'Name can only be 24 charactes' })
	// 			.trim(),
	// 		email: z
	// 			.string({ required_error: 'Email is required' })
	// 			.email({ message: 'Email must be a valid email' }),
	// 		password: z
	// 			.string({ required_error: 'Password is required' })
	// 			.regex(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/, {
	// 				message:
	// 					'Password must be a minimum of 8 characters & contain at least one letter, one number, and one special character.'
	// 			}),
	// 		confirmPassword: z
	// 			.string({ required_error: 'Confirm Password is required' })
	// 			.regex(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/, {
	// 				message:
	// 					'Confirm Password must be a minimum of 8 characters & contain at least one letter, one number, and one special character.'
	// 			})
	// 	})
	// 	.superRefine(({ confirmPassword, password }, ctx) => {
	// 		if (confirmPassword !== password) {
	// 			ctx.addIssue({
	// 				code: z.ZodIssueCode.custom,
	// 				message: 'Password & Confirm password must match',
	// 				path: ['password']
	// 			});
	// 			ctx.addIssue({
	// 				code: z.ZodIssueCode.custom,
	// 				message: 'Password & Confirm password must match',
	// 				path: ['confirmPassword']
	// 			});
	// 		}
	// 	});
	// }

	// We've created a custom submit function to pass the response and close the modal.
	function onFormSubmit(): void {
		if ($modalStore[0].response) $modalStore[0].response(formData);
		modalStore.close();
	}

	// Base Classes
	const cBase = 'space-y-4';
	const cForm = 'border border-surface-500 p-4 space-y-4 rounded-container-token';
</script>

<!-- @component This example creates a simple form modal. -->

<div class="modal-example-form {cBase}">
	<!-- Enable for debugging: -->
	<!-- <pre>{JSON.stringify(formData, null, 2)}</pre> -->
	<form class="modal-form {cForm}">
		<label class="input-label">
			<span>Username:</span>
			<input type="text" bind:value={formData.username} placeholder="Enter Username" />
		</label>
		<label class="input-label">
			<span>Email:</span>
			<input type="email" bind:value={formData.email} placeholder="Enter email address" />
		</label>
		<label class="input-label">
			<span>Password:</span>
			<input type="text" bind:value={formData.password} placeholder="Change Password" />
		</label>
		<label class="input-label">
			<span>Confirm Password:</span>
			<input type="text" bind:value={formData.confirmPassword} placeholder="Confirm Password" />
		</label>
		<label class="input-label">
			<span>Role:</span>
			<input type="text" bind:value={formData.role} placeholder="Change Role" />
		</label>
	</form>
	<!-- prettier-ignore -->
	<footer class="modal-footer {parent.regionFooter}">
        <button class="btn {parent.buttonNeutral}" on:click={parent.onClose}>{parent.buttonTextCancel}</button>
        <button class="btn {parent.buttonPositive}" on:click={onFormSubmit}>Save</button>
    </footer>
</div>
