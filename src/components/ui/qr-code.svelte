<!--
@file src/components/ui/qr-code.svelte
@component
**Native QR Code Generator — Privacy-Safe & No External Requests**

Renders a standard compliant QR Code directly in the browser via clean SVG paths,
avoiding third-party API exposure for sensitive URLs (like 2FA secrets).

### Props
- `value` (string): Text or URL payload to encode (required).
- `size` (number): Width/Height of the container in pixels (default: 200).
- `ecc` ('L' | 'M' | 'Q' | 'H'): Error correction level (default: 'M').
- `margin` (number): Quiet zone margin in modules (default: 1).
- `color` (string): Color of dark modules (default: 'currentColor').
- `backgroundColor` (string): Color of light background (default: 'transparent').
- `class` (string): Additional CSS classes.
-->

<script lang="ts">
  import { encode } from 'uqr';
  import { cn } from '@utils/cn';

  interface Props {
    value: string;
    size?: number;
    ecc?: 'L' | 'M' | 'Q' | 'H';
    margin?: number;
    color?: string;
    backgroundColor?: string;
    class?: string;
  }

  let {
    value,
    size = 200,
    ecc = 'M',
    margin = 1,
    color = 'currentColor',
    backgroundColor = 'transparent',
    class: className,
    ...rest
  }: Props = $props();

  // Generate QR matrix reactively using Svelte 5 runes
  const qrResult = $derived.by(() => {
    if (!value) return null;
    try {
      return encode(value, { ecc, border: margin });
    } catch (e) {
      console.error('QR Code generation failed:', e);
      return null;
    }
  });

  // Calculate SVG path for the dark modules to optimize DOM rendering
  const svgPath = $derived.by(() => {
    if (!qrResult) return '';
    const matrix = qrResult.data;
    const len = matrix.length;
    let path = '';

    for (let row = 0; row < len; row++) {
      let startCol = -1;
      for (let col = 0; col < len; col++) {
        if (matrix[row][col]) {
          if (startCol === -1) {
            startCol = col;
          }
        } else {
          if (startCol !== -1) {
            const width = col - startCol;
            path += `M${startCol},${row}h${width}v1h-${width}z `;
            startCol = -1;
          }
        }
      }
      if (startCol !== -1) {
        const width = len - startCol;
        path += `M${startCol},${row}h${width}v1h-${width}z `;
      }
    }
    return path;
  });

  const matrixSize = $derived(qrResult ? qrResult.data.length : 0);
</script>

{#if qrResult}
  <svg
    class={cn('qr-code select-none print:bg-white', className)}
    width={size}
    height={size}
    viewBox="0 0 {matrixSize} {matrixSize}"
    shape-rendering="crispEdges"
    style="background-color: {backgroundColor}; color: {color};"
    role="img"
    aria-label="QR Code"
    {...rest}
  >
    <path d={svgPath} fill="currentColor" />
  </svg>
{/if}
