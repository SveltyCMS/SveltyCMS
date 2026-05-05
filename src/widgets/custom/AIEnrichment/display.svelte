<script lang="ts">
let { value, contentLanguage } = $props<{
	value: any;
	contentLanguage: string;
}>();

const displayValue = $derived.by(() => {
	if (typeof value === "string") return value;
	if (typeof value === "object" && value !== null)
		return value[contentLanguage] || "";
	return "";
});
</script>

<div class="truncate italic text-surface-500">
	{displayValue || 'No enrichment data'}
</div>
