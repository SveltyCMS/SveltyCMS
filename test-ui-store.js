// Quick test to check UIStore state
import { uiStateManager } from './src/stores/UIStore.svelte.ts';

console.log('UIStore state:', uiStateManager.uiState.value);
console.log('pageheader visible?', uiStateManager.isPageHeaderVisible.value);
console.log('pagefooter visible?', uiStateManager.isPageFooterVisible.value);
