<!-- 
@file src/components/system/icons/SveltyCMS_LogoFull.svelte
@component 
**Dynamic SveltyCMS_LogoFull component**
-->

<script lang="ts">
	// Components
	import SiteName from '@components/SiteName.svelte';
	import Logo from '@components/system/icons/SveltyCMS_Logo.svelte';

	//ParaglideJS
	import * as m from '@src/paraglide/messages';
</script>

<!-- CSS Logo -->
<a
	href="https://github.com/SveltyCMS/SveltyCMS"
	target="_blank"
	rel="noopener"
	class="absolute left-1/2 top-1/3 flex -translate-x-1/2 -translate-y-1/2 transform items-center justify-center"
>
	<!--White Inner Background -->
	<div class="relative flex h-[170px] w-[170px] items-center justify-center rounded-full bg-white">
		<!-- Red circle -->
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

		<!-- Black circle -->
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

		<div class="absolute left-1/2 top-[70px] flex -translate-x-1/2 -translate-y-1/2 transform flex-col items-center justify-center text-center">
			<!-- Logo -->
			<Logo fill="red" className="w-14 h-14" />

			<!-- PUBLIC SITENAME -->
			<div class="-mt-2 text-3xl font-bold text-black">
				<SiteName />
			</div>
			<!-- Slogan -->
			<div class="-mt-[1px] text-[12px] font-bold text-secondary-500">
				{m.logo_slogan()}
			</div>
		</div>
	</div>
</a>
