<!-- 
@files src/components/system/icons/SveltyCMS_Logo.svelte
@component
**Dynamic SveltyCMS_Logo component**
-->

<script lang="ts">
	// Props
	interface Props {
		fill?: string;
		className?: string;
	}

	let { fill = 'red', className = '' }: Props = $props();
</script>

<svg width="72" height="57" xmlns="http://www.w3.org/2000/svg" xml:space="preserve" {fill} class={className} viewBox="0 0 72 57">
	<defs>
		<clipPath id="clippath">
			<rect id="svg_1" stroke-width="0px" fill="none" height="16.07" width="62.04" x="9.96" class="cls-2" />
		</clipPath>
		<clipPath id="clippath-1">
			<rect id="svg_2" stroke-width="0px" fill="none" height="15.6" width="63.3" y="41.4" class="cls-2" />
		</clipPath>
	</defs>
	<g data-name="Layer 1" id="Layer_1-2">
		<g id="svg_3">
			<g id="svg_4" clip-path="url(#clippath)" class="cls-1">
				<path id="svg_5" {fill} fill-rule="evenodd" stroke-width="0px" d="m21.76,0l50.28,0l-11.73,15.88l-50.28,0l11.73,-15.88z" class="cls-4" />
			</g>
			<path
				id="svg_6"
				fill-rule="evenodd"
				{fill}
				style="filter: brightness(0.6);"
				stroke-width="0px"
				d="m10.03,15.88l25.14,0l-12.72,17.14l-11.05,-15.24l-1.37,-1.9z"
				class="cls-3"
			/>
			<g id="svg_7" clip-path="url(#clippath-1)" class="cls-5">
				<path id="svg_8" {fill} fill-rule="evenodd" stroke-width="0px" d="m50.31,57.47l-50.28,0l11.76,-15.88l50.28,0l-11.76,15.88z" class="cls-4" />
			</g>
			<path
				id="svg_9"
				fill-rule="evenodd"
				{fill}
				style="filter: brightness(0.6);"
				stroke-width="0px"
				d="m62.06,41.59l-25.14,0l12.7,-17.14l11.07,15.24l1.37,1.9z"
				class="cls-3"
			/>
		</g>
	</g>
</svg>
