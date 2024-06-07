<script lang="ts">
	export let fill = 'white';
	export let className = '';
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	xml:space="preserve"
	{fill}
	class={className}
	style="shape-rendering:geometricPrecision;text-rendering:geometricPrecision;image-rendering:optimizeQuality;fill-rule:evenodd;clip-rule:evenodd"
	viewBox="0 0 200 200"
>
	<g>
		<!-- Upper rectangle -->
		<polygon points="40,30 160,30 140,70 20,70" {fill} />
		<!-- Upper triangle -->
		<polygon points="20,70 50,100 80,70" {fill} style="filter: brightness(0.6);" />

		<!-- Lower rectangle -->
		<polygon points="160,170 40,170 60,130 180,130" {fill} />
		<!-- Lower triangle -->
		<polygon points="180,130 150,100 120,130" {fill} style="filter: brightness(0.6);" />
	</g>
</svg>
