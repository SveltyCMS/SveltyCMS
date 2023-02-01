<script lang="ts">
	export let text: string;
	export let position: 'left' | 'right' | 'top' | 'bottom' = 'right';
	export let background_color: string = '#0fba81';
	export let text_color: string = 'white';
    export let active  = true
	
	let show = false;
	function setup(node: HTMLElement) {
		if (!node.parentElement) return;
        node.parentElement.style.overflow = "visible"
		node.parentElement.addEventListener('pointerenter', (e) => {
			node.setPointerCapture(e.pointerId);
			show = true;
		});
		node.parentElement.addEventListener('pointerleave', () => {
			show = false;
		});
	}

</script>

<div use:setup hidden={!show || !active} class={position+ " "+ $$props.class || ""} style = {`--background-color:${background_color};--text-color:${text_color}`}>
	{text}
</div>

<style>
	div {
		position: absolute;
		z-index: 11111111111;
		--background-color: #0fba81;
		--text-color: white;
		background-color: var(--background-color);
		color: var(--text-color);
		padding: 8px 30px;
		border-radius: 6px;
        font-size: 15px;
	}
	.top {
		left: 50%;
		bottom: 100%;
		transform: translate(-50%);
		margin-bottom: 10px;
	}
	.top:before {
        content:"";
		position: absolute;
		left: 50%;
		top: 100%;
		transform: translate(-50%);
		width: 0;
		height: 0;
		border-left: 8px solid transparent;
		border-right: 8px solid transparent;
		border-top: 8px solid var(--background-color);
	}
	.bottom {
		left: 50%;
		top: 100%;
		transform: translate(-50%);
		margin-top: 10px;
	}
	.bottom::before {
		content: '';
		position: absolute;
		left: 50%;
		bottom: 100%;
		transform: translate(-50%);
		width: 0;
		height: 0;
		border-left: 8px solid transparent;
		border-right: 8px solid transparent;
		border-bottom: 8px solid var(--background-color);
	}
	.right {
		left: 100%;
        top:50%;
        transform: translateY(-50%);
		margin-left: 10px;
	}
	.right:before {
		content: '';
		position: absolute;
		right: 100%;
		top: 50%;
		transform: translateY(-50%);
		width: 0;
		height: 0;
		border-top: 8px solid transparent;
		border-bottom: 8px solid transparent;
		border-right: 8px solid var(--background-color);
	}
	.left {
		right: 100%;
		margin-right: 10px;
        top:50%;
        transform: translateY(-50%);
	}
	.left:before {
		content: '';
		position: absolute;
		left: 100%;
		top: 50%;
		transform: translateY(-50%);
		width: 0;
		height: 0;
		border-top: 8px solid transparent;
		border-bottom: 8px solid transparent;
		border-left: 8px solid var(--background-color);
	}
</style>
