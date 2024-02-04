<script lang="ts">
	import { PUBLIC_SEASONS, PUBLIC_SITENAME } from '$env/static/public';
	import { Confetti } from 'svelte-confetti';
	import Logo from '@src/components/SveltyCMS_Logo.svelte';

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Seasons
	let date = new Date();
	export let isDecember = date.getMonth() === 11;
	export let isHalloween = date.getMonth() === 9 && date.getDate() === 31;
	export let isNewYear = date.getMonth() === 0 && date.getDate() === 1;
</script>

<!-- CSS Logo -->
<a
	href="https://github.com/Rar9/SveltyCMS"
	target="_blank"
	rel="noopener"
	class="absolute left-1/2 top-1/3 flex -translate-x-1/2 -translate-y-1/2 transform items-center justify-center border"
>
	<!--White Inner Background -->
	<div class="absolute top-[-150px] h-[170px] w-[170px] justify-center rounded-full bg-white">
		<!-- Seasons -->
		{#if PUBLIC_SEASONS === 'true'}
			<!-- TODO: Fix broken avif Edge image -->
			{#if isDecember && !isNewYear}
				<img src="/seasons/SantaHat.avif" alt="Santa hat" class="absolute -right-5 -top-5 h-20 w-20" />
			{/if}

			{#if isHalloween}
				<img src="/seasons/Halloween.avif" alt="Spider" class="absolute -bottom-[170px] left-0" />
			{/if}

			{#if isNewYear && !isDecember}
				<div class="absolute left-1/2 top-[-50px] justify-center">
					<Confetti noGravity x={[-1, 1]} y={[-1, 1]} delay={[0, 50]} colorRange={[0, 120]} />
					<Confetti noGravity x={[-1, 1]} y={[-1, 1]} delay={[550, 550]} colorRange={[120, 240]} />
					<Confetti noGravity x={[-1, 1]} y={[-1, 1]} delay={[1000, 1050]} colorRange={[240, 360]} />
				</div>
				<p class="absolute left-[-40px] top-[-50px] justify-center whitespace-nowrap text-2xl font-bold text-error-500">
					{m.login_new_year()}
					{new Date().getFullYear()}
				</p>
			{/if}
		{/if}

		<!-- red circle -->
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
		<!-- black circle -->
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
			<!-- Logo -->
			<Logo fill="black" className="w-8 h-8" />
			<!-- PUBLIC SITENAME -->
			<div class="text-3xl font-bold text-error-500">
				{PUBLIC_SITENAME}
			</div>
			<!-- Slogan -->
			<div class="-mt-[1px] text-[12px] font-bold text-black">
				{m.logo_slogan()}
			</div>
		</div>
	</div>
</a>
