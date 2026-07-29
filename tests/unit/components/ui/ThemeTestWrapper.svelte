<!-- 
@file tests/unit/components/ui/ThemeTestWrapper.svelte
@component
Test wrapper to inject AdminTheme context and render Svelte primitives.
-->
<script lang="ts">
  import { untrack } from "svelte";
  import { setThemeContext } from "@src/components/ui/theme-context.svelte";
  import { initIdGenerator } from "@utils/id-generator";
  import Button from "@src/components/ui/button.svelte";
  import Card from "@src/components/ui/card.svelte";
  import Input from "@src/components/ui/input.svelte";
  import Badge from "@src/components/ui/badge.svelte";

  interface Props {
    density?: "compact" | "cozy" | "spacious";
    role?: "editor" | "reviewer" | "translator" | "admin" | "manager";
  }

  let props: Props = $props();

  // Request-scoped ID map for SSR render() — matches production +layout contract.
  initIdGenerator();
  setThemeContext(untrack(() => ({
    density: props.density || "cozy",
    role: props.role || "editor"
  })));
</script>

<div class="theme-test-wrapper">
  <Button size="md">Test Button</Button>
  <Card>Test Card</Card>
  <Input value="" />
  <Badge rounded={false}>Test Badge</Badge>
</div>
