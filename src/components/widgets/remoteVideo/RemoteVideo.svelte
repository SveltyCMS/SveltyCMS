<script lang="ts">
	export let field: any = undefined;
	export let value = '';

	export let widgetValue;
	$: widgetValue = value;

	export let myData: any = null;

	$: myData;
	const handleSubmit = async (event: Event) => {
		const formData = new FormData();
		formData.append('url', value);
		const response = fetch('/api/video', {
			method: 'POST',
			body: formData
		});
		const data = await (await response).json();
		myData = data;
	};
</script>

<input
	required
	placeholder="Paste a Video URL here"
	type="text"
	name="url"
	bind:value
	on:blur={handleSubmit}
	class="input w-full rounded-md"
/>

{#if myData?.videoUrl}
	<div class="rounded border">
		<div class="mb-1  text-lg font-bold">
			Title: <span class="text-tertiary-500">{myData?.videoTitle}</span>
		</div>
		<div class="mb-1  text-lg font-bold">
			User: <span class="text-tertiary-500">{myData?.user_name}</span>
		</div>
		<div class="mb-1  text-lg font-bold">
			Dimention: <span class="text-tertiary-500">{myData?.height} x {myData?.width} </span>(height x
			width)
		</div>
		<div class="mb-1  text-lg font-bold">
			Duration: <span class="text-tertiary-500">{myData?.duration}</span> min
		</div>
		<div class="mb-1 inline-block text-lg font-bold">Video Link:</div>
		<a
			target="_blank"
			href={myData?.videoUrl}
			rel="noreferrer"
			class="text-lg text-tertiary-500 !no-underline">{myData?.videoUrl}</a
		>
		<img width="600" height="400" src={myData?.videoThumbnail} alt={myData?.videoTitle} />
	</div>
{/if}
