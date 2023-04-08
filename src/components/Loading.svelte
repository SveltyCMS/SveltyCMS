<script lang="ts">
	import Logo from '../components/icons/SimpleCMS_Logo.svelte';
	// typesafe-i18n
	import LL from '$i18n/i18n-svelte';
</script>

<div class="absolute inset-0 flex justify-center items-center shadow-2xl">
	<div
		class="relative border-[7px] border-error-500 rounded-full border-x-transparent h-[150px] w-[150px]"
		id="loader"
	/>
	<div
		class="absolute border-[6px] border-success-400 rounded-full border-x-transparent h-[170px] w-[170px]"
		id="loader2"
	/>
	<div
		class="absolute border-[5px] border-tertiary-400 rounded-full border-x-transparent h-[190px] w-[190px]"
		id="loader3"
	/>
	<div
		class="absolute border-[4px] border-surface-400 rounded-full border-x-transparent h-[210px] w-[210px]"
		id="loader4"
	/>
	<div
		class="dark:text-white text-black bg-transparent p-6 rounded-full absolute flex flex-col justify-center items-center uppercase"
	>
		<div>{$LL.LOADING_Wait()}</div>
		<div><Logo className="w-10 p-1" fill="red" /></div>
		<div>{$LL.LOADING_Loading()}</div>
	</div>
</div>

<style>
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
	#text {
		color: white;
		font-family: Arial;
		font-size: 20px;
		position: relative;
		top: -857px;
	}
</style>
