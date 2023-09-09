<script lang="ts">
	import Logo from '../components/SimpleCMS_Logo.svelte';

	// typesafe-i18n
	import LL from '@src/i18n/i18n-svelte';
</script>

<div class="absolute inset-0 flex items-center justify-center shadow-2xl">
	<div
		class="relative h-[150px] w-[150px] rounded-full border-[7px] border-error-500 border-x-transparent"
		id="loader"
	/>
	<div
		class="absolute h-[170px] w-[170px] rounded-full border-[6px] border-success-400 border-x-transparent"
		id="loader2"
	/>
	<div
		class="absolute h-[190px] w-[190px] rounded-full border-[5px] border-tertiary-400 border-x-transparent"
		id="loader3"
	/>
	<div
		class="absolute h-[210px] w-[210px] rounded-full border-[4px] border-surface-400 border-x-transparent"
		id="loader4"
	/>
	<div
		class="absolute flex flex-col items-center justify-center rounded-full bg-transparent p-6 uppercase text-black dark:text-white"
	>
		<div>{$LL.LOADING_Wait()}</div>
		<div><Logo className="w-10 p-1" fill="red" /></div>
		<div>{$LL.LOADING_Loading()}</div>
	</div>
</div>

<style lang="postcss">
	#loader {
		animation: rotate 3s cubic-bezier(0.26, 1.36, 0.74, -0.29) infinite;
	}
	#loader2 {
		animation: rotate2 2s cubic-bezier(0.26, 1.36, 0.74, -0.29) infinite;
	}
	#loader3 {
		animation: rotate 3s cubic-bezier(0.26, 1.36, 0.74, -0.29) infinite;
	}
	#loader4 {
		animation: rotate2 3s cubic-bezier(0.26, 1.36, 0.74, -0.29) infinite;
	}
	@keyframes rotate {
		0% {
			transform: rotateZ(-360deg);
		}
		100% {
			transform: rotateZ(0deg);
		}
	}
	@keyframes rotate2 {
		0% {
			transform: rotateZ(360deg);
		}
		100% {
			transform: rotateZ(0deg);
		}
	}
	/*#text {*/
	/*	color: white;*/
	/*	font-family: Arial;*/
	/*	font-size: 20px;*/
	/*	position: relative;*/
	/*	top: -857px;*/
	/*}*/
</style>
