<script lang="ts">
	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	import Loading from '@components/Loading.svelte';
	import Logo from '../login/components/icons/Logo.svelte';
	import { PUBLIC_SITENAME } from '$env/static/public';

	import type { PageData } from './$types';

	export let data: PageData;

	let loading = false;
</script>

{#if loading}
	<Loading />
{:else}
	<div class="grid h-full w-full place-items-center bg-[#242728]">
		<form class="card w-modal mt-2 flex flex-col gap-2 rounded border p-6 shadow-2xl" method="post">
			<!-- CSS Logo -->
			<div class="relative flex items-center justify-center">
				<!--White Innere Background -->
				<div class="relative mb-5 h-[170px] w-[170px] justify-center rounded-full bg-white">
					<svg width="160" height="160" class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transform">
						<circle
							cx="80"
							cy="80"
							r="75"
							stroke-width="2"
							stroke-dasharray="191 191"
							stroke-dashoffset="191"
							transform="rotate(51.5, 80, 80)"
							class="fill-none stroke-error-500"
						/>

						<circle
							cx="80"
							cy="80"
							r="75"
							stroke-width="2"
							stroke-dasharray="191 191"
							stroke-dashoffset="191"
							transform="rotate(231.5, 80, 80)"
							class="fill-none stroke-error-500"
						/>
					</svg>

					<svg width="170" height="170" class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transform">
						<circle
							cx="85"
							cy="85"
							r="80"
							stroke-width="2"
							stroke-dasharray="205 205"
							stroke-dashoffset="205"
							transform="rotate(50, 85, 85)"
							class="fill-none stroke-black"
						/>
						<circle
							cx="85"
							cy="85"
							r="80"
							stroke-width="2"
							stroke-dasharray="205 205"
							stroke-dashoffset="205"
							transform="rotate(230, 85, 85)"
							class="fill-none stroke-black"
						/>
					</svg>

					<div class="absolute left-1/2 top-[77px] flex -translate-x-1/2 -translate-y-1/2 transform flex-col items-center justify-center text-center">
						<Logo fill="black" className="w-8 h-8" />
						<div class="text-3xl font-bold text-error-500">{PUBLIC_SITENAME}</div>
						<div class="-mt-[1px] text-[12px] font-bold text-black">{m.logo_slogan()}</div>
					</div>
				</div>
			</div>

			<!-- Input Token -->
			<label>
				<h2 class="mb-2 text-center text-xl font-bold text-primary-500">{m.oauth_entertoken()}</h2>
				<input
					placeholder="Enter  your Received Token {m.oauth_placeholder()}"
					class="input"
					type="text"
					name="token"
					minlength="16"
					maxlength="48"
				/>
			</label>
			<div class="flex justify-between gap-2">
				<!-- Cancel Button -->
				<button class="items center variant-filled my-2 px-4 py-3 uppercase">{m.oauth_cancel()}</button>

				<!-- Submit Button -->
				<button type="submit" class="items center variant-filled my-2 flex flex-1 justify-center gap-2 py-3 uppercase">
					<iconify-icon icon="flat-color-icons:google" color="white" width="20" class="mt-1" />
					<p>{m.oauth_signup()}</p>
				</button>
			</div>
		</form>
	</div>
{/if}
