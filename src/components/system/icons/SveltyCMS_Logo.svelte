<!-- 
@files src/components/system/icons/SveltyCMS_Logo.svelte
@component
**Dynamic SveltyCMS_Logo component**

Features:
- Dynamic fill color
- Dynamic class
-->

<script lang="ts">
	// Props
	interface Props {
		fill?: string;
		className?: string;
		size?: number;
	}

	const {
		fill = 'currentColor', // Better default - respects text color
		className = '',
		size = 72
	}: Props = $props();
</script>

<svg
	width={size}
	height={size}
	xmlns="http://www.w3.org/2000/svg"
	xml:space="preserve"
	class={className}
	viewBox="0 0 72 58"
	preserveAspectRatio="xMidYMid meet"
>
	<defs>
		<clipPath id="clippath">
			<rect stroke-width="0px" fill="none" height="16.07" width="62.04" x="9.96" />
		</clipPath>
		<clipPath id="clippath-1">
			<rect stroke-width="0px" fill="none" height="15.6" width="63.3" y="41.4" />
		</clipPath>
	</defs>
	<g>
		<g clip-path="url(#clippath)">
			<path {fill} fill-rule="evenodd" stroke-width="0px" d="m21.76,0l50.28,0l-11.73,15.88l-50.28,0l11.73,-15.88z" />
		</g>
		<path
			fill-rule="evenodd"
			{fill}
			style="filter: brightness(0.6);"
			stroke-width="0px"
			d="m10.03,15.88l25.14,0l-12.72,17.14l-11.05,-15.24l-1.37,-1.9z"
		/>
		<g clip-path="url(#clippath-1)">
			<path {fill} fill-rule="evenodd" stroke-width="0px" d="m50.31,57.47l-50.28,0l11.76,-15.88l50.28,0l-11.76,15.88z" />
		</g>
		<path
			fill-rule="evenodd"
			{fill}
			style="filter: brightness(0.6);"
			stroke-width="0px"
			d="m62.06,41.59l-25.14,0l12.70,-17.14l11.07,15.24l1.37,1.9z"
		/>
	</g>
</svg>
