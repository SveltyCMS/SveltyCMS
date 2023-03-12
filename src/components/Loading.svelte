<script lang="ts">
	import Logo from '../components/icons/SimpleCMS_Logo.svelte';
</script>

<div class="absolute inset-0 flex justify-center items-center">
	<div
		class="relative border-4 border-error-500 rounded-full border-x-transparent h-[160px] w-[160px] "
		id="loader"
	/>
	<div
		class="absolute top[-216px] border-4 border-tertiary-500 rounded-full border-x-transparent h-[180px] w-[180px] "
		id="loader2"
	/>
	<div
		class="absolute top[-452px] border-4 border-warning-500 rounded-full border-x-transparent h-[200px] w-[200px] "
		id="loader3"
	/>
	<div
		class="absolute top[-708px] border-4 border-primary-500 rounded-full border-x-transparent h-[220px] w-[220px] "
		id="loader4"
	/>
	<div
		class="dark:text-black text-white bg-surface-500 dark:bg-white p-6 rounded-full absolute top[-583px] flex flex-col justify-center items-center uppercase"
	>
		<div>Please Wait</div>
		<div><Logo className="w-10 p-1" fill="red" /></div>
		<div>Loading...</div>
	</div>
</div>

<style>
	#loader {
		animation: rotate 2s cubic-bezier(0.26, 1.36, 0.74, -0.29) infinite;
	}
	#loader2 {
		animation: rotate2 2s cubic-bezier(0.26, 1.36, 0.74, -0.29) infinite;
	}
	#loader3 {
		animation: rotate 2s cubic-bezier(0.26, 1.36, 0.74, -0.29) infinite;
	}
	#loader4 {
		animation: rotate2 2s cubic-bezier(0.26, 1.36, 0.74, -0.29) infinite;
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
