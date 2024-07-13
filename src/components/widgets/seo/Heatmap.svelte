<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { fade } from 'svelte/transition';
  
  export let content = '';
  export let language = 'en';
  export let keywords = [];
  
  let contentElement;
  let heatmapData = [];
  let keywordDensity = {};
  const dispatch = createEventDispatcher();
  let debounceTimer;

  $: if (content || language || keywords) {
    debounce(generateHeatmap, 300);
  }

  onMount(() => {
    generateHeatmap();
  });

  function debounce(func, delay) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(func, delay);
  }

  function generateHeatmap() {
    if (!content) return;
    
    const words = content.split(/\s+/);
    
    heatmapData = words.map((word, index) => ({
      word,
      heatLevel: calculateHeatLevel(word, index, words.length, language),
      isKeyword: keywords.includes(word.toLowerCase())
    }));

    analyzeKeywordDensity(words);
    applyHeatmap();
    dispatch('heatmapGenerated', { heatmapData, keywordDensity });
  }

  function calculateHeatLevel(word, index, totalWords, lang) {
    let score = 0;

    // Position-based scoring
    const positionFactor = 1 - (index / totalWords);
    score += positionFactor * 2;

    // Word length scoring (adjust for different languages)
    const idealLength = lang === 'en' ? 5 : 6;
    score += Math.max(0, 3 - Math.abs(word.length - idealLength));

    // Keyword bonus
    if (keywords.includes(word.toLowerCase())) {
      score += 2;
    }

    // Normalize score to 1-5 range
    return Math.max(1, Math.min(5, Math.round(score)));
  }

  function analyzeKeywordDensity(words) {
    const totalWords = words.length;
    keywordDensity = keywords.reduce((acc, keyword) => {
      const count = words.filter(word => word.toLowerCase() === keyword.toLowerCase()).length;
      acc[keyword] = (count / totalWords) * 100;
      return acc;
    }, {});
  }

  function applyHeatmap() {
    if (contentElement) {
      contentElement.innerHTML = heatmapData.map(({ word, heatLevel, isKeyword }) => 
        `<span 
          class="heat-${heatLevel} ${isKeyword ? 'keyword' : ''}"
          tabindex="0" 
          role="textbox" 
          aria-label="Heat level ${heatLevel}: ${word}${isKeyword ? ', keyword' : ''}"
          data-tooltip="Heat: ${heatLevel}, ${isKeyword ? 'Keyword' : 'Regular word'}"
        >${word}</span>`
      ).join(' ');
    }
  }
</script>

<div bind:this={contentElement} class="heatmap-content">
  {#each heatmapData as { word, heatLevel, isKeyword }}
    <span 
      class="heat-{heatLevel} {isKeyword ? 'keyword' : ''}"
      tabindex="0" 
      role="textbox" 
      aria-label="Heat level {heatLevel}: {word}{isKeyword ? ', keyword' : ''}"
      data-tooltip="Heat: {heatLevel}, {isKeyword ? 'Keyword' : 'Regular word'}"
      transition:fade={{ duration: 200 }}
    >{word}</span>
  {/each}
</div>

<div class="keyword-density">
  <h4>Keyword Density</h4>
  <ul>
    {#each Object.entries(keywordDensity) as [keyword, density]}
      <li>{keyword}: {density.toFixed(2)}%</li>
    {/each}
  </ul>
</div>

<style>
  .heatmap-content {
    line-height: 1.5;
    word-wrap: break-word;
    font-size: 16px;
  }
  :global(.heat-1) { background-color: rgba(0, 255, 0, 0.2); }
  :global(.heat-2) { background-color: rgba(255, 255, 0, 0.2); }
  :global(.heat-3) { background-color: rgba(255, 165, 0, 0.2); }
  :global(.heat-4) { background-color: rgba(255, 0, 0, 0.2); }
  :global(.heat-5) { background-color: rgba(128, 0, 128, 0.2); }
  :global(.keyword) { border-bottom: 2px solid blue; }

  [data-tooltip] {
    position: relative;
    cursor: help;
  }
  [data-tooltip]:hover::after {
    content: attr(data-tooltip);
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    background-color: #333;
    color: white;
    padding: 5px;
    border-radius: 3px;
    font-size: 12px;
    white-space: nowrap;
  }

  .keyword-density {
    margin-top: 20px;
    font-size: 14px;
  }
  
  @media (max-width: 600px) {
    .heatmap-content {
      font-size: 14px;
      line-height: 1.3;
    }
    .keyword-density {
      font-size: 12px;
    }
  }
</style>