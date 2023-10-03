<script>

	// typesafe-i18n
	import LL from '@src/i18n/i18n-svelte';

	// The boolean value to display
	export let value;

  </script>
  
  <!-- Display 'Yes' for true and 'No' for false with badges -->
  <span class={value ? 'rounded badge gradient-error' : 'rounded badge gradient-primary'}>
	{value ? $LL.TANSTACK_Yes() : $LL.TANSTACK_No()}

  </span>
  