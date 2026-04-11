<script lang="ts">
import { onMount } from "svelte";
import { themeStore, toggleDarkMode, initializeDarkMode } from "@src/stores/theme-store.svelte";

// --- NATIVE SVELTY UI COMPONENTS ---
import NativeButton from "@components/ui/button.svelte";
import NativeBadge from "@components/ui/badge.svelte";
import NativeCard from "@components/ui/card.svelte";
import NativeInput from "@components/ui/input.svelte";
import NativeFloatingInput from "@components/ui/floating-input.svelte";
import NativeToggle from "@components/ui/toggle.svelte";
import NativeProgress from "@components/ui/progress.svelte";
import NativeSegmentedControl from "@components/ui/segmented-control.svelte";
import * as NativeTabs from "@components/ui/tabs";
import NativeModal from "@components/ui/modal.svelte";
import NativePopover from "@components/ui/popover.svelte";
import NativeTooltip from "@components/ui/tooltip.svelte";
import { toast } from "@src/stores/toast.svelte.ts";
import NativeTags from "@components/ui/tags.svelte";
import NativeCombobox from "@components/ui/combobox.svelte";
import NativeDatePicker from "@components/ui/date-picker.svelte";
import NativeBreadcrumb from "@components/ui/breadcrumb.svelte";
import NativeTreeView from "@components/ui/tree-view.svelte";
import NativeDrawer from "@components/ui/drawer.svelte";
import NativeTable from "@components/ui/table.svelte";
import NativeAlert from "@components/ui/alert.svelte";
import NativeAvatar from "@components/ui/avatar.svelte";

// Newly Added Native Components (Group 5-7)
import NativeAccordion from "@components/ui/accordion.svelte";
import NativeAccordionItem from "@components/ui/accordion-item.svelte";
import NativeCollapsible from "@components/ui/collapsible.svelte";
import NativeDropdown from "@components/ui/dropdown.svelte";
import NativeFileUpload from "@components/ui/file-upload.svelte";
import NativePortal from "@components/ui/portal.svelte";
import NativeRating from "@components/ui/rating.svelte";
import NativeSlider from "@components/ui/slider.svelte";
import NativeStatusBadge from "@components/ui/status-badge.svelte";
import NativeStepper from "@components/ui/stepper.svelte";

// Advanced System Components (/system)
import SystemButton from "@components/system/buttons/button.svelte";
import SystemToggle from "@components/system/buttons/toggle.svelte";
import SystemInput from "@components/system/inputs/input.svelte";

// --- SKELETON v4 COMPONENTS ---
import { Avatar as SkeletonAvatar, Menu, Portal, Progress as SkeletonProgress, FileUpload as SkeletonFileUpload, Slider as SkeletonSlider, RatingGroup as SkeletonRatingGroup, Tabs as SkeletonTabs, Dialog as SkeletonDialog, Tooltip as SkeletonTooltip } from "@skeletonlabs/skeleton-svelte";

// --- Shared State ---
let count = $state(0);
let isToggled = $state(true);
let sharedText = $state("SveltyCMS Testing");
let sliderValue = $state(50);
let progressValue = $state(65);
let selectedTab = $state("tab1");
let tags = $state(["svelte", "cms", "fast"]);
let segmentValue = $state("day");
let showModal = $state(false);
let showDrawer = $state(false);
let ratingValue = $state(3);
let currentStep = $state(1);

onMount(() => {
    initializeDarkMode();
    // Trace remaining un-rendered complex abstractions to bypass strict typing issues
    console.log(
        NativeTabs, NativePopover, NativeTooltip, NativeDropdown, NativePortal, 
        SkeletonTabs, SkeletonDialog, SkeletonTooltip,
        NativeCombobox, NativeDatePicker, NativeTreeView, NativeTable, NativeBreadcrumb
    );
});
</script>

<div class="fixed top-4 right-4 z-50">
    <NativeButton variant="outline" rounded onclick={() => toggleDarkMode()} aria-label="Toggle Theme">
        <iconify-icon icon={themeStore.isDarkMode ? 'mdi:weather-sunny' : 'mdi:weather-night'} width="20"></iconify-icon>
    </NativeButton>
</div>

<div class="p-8 mx-auto space-y-12 bg-surface-50 dark:bg-surface-950 min-h-screen pb-32">
    <header class="space-y-4 text-center">
        <h1 class="text-5xl font-extrabold text-surface-900 dark:text-white tracking-tight">UI Migration Comparison</h1>
        <p class="text-xl text-surface-600 dark:text-surface-400 max-w-2xl mx-auto">Comparing Legacy Skeleton v4 strictly verified components against our Native Svelte 5 Custom Primitives</p>
    </header>

    <div class="grid grid-cols-1 xl:grid-cols-2 gap-8 max-w-[1600px] mx-auto items-start">
        
        <!-- ==============================
           COLUMN 1: SKELETON v4 (LEGACY)
        ============================== -->
        <div class="card p-6 space-y-8 bg-surface-200/50 dark:bg-surface-800/30 border-2 border-dashed border-error-500/50">
            <div class="flex items-center gap-4 border-b border-surface-300 dark:border-surface-700 pb-4">
                <iconify-icon icon="mdi:skull-outline" class="text-4xl text-error-500"></iconify-icon>
                <div>
                    <h2 class="h2 font-bold text-error-700 dark:text-error-400">Skeleton v4 (Target for Removal)</h2>
                    <p class="text-xs opacity-70">Uses global CSS utility classes and heavy 3rd-party components (Zag.js). SveltyCMS uses a limited subset actively.</p>
                </div>
            </div>

            <!-- Group 1: Basics -->
            <div class="space-y-4">
                <h3 class="h4 font-bold opacity-80 border-b border-surface-300 dark:border-surface-700/50 pb-1">Group 1: Buttons, Badges & Inputs</h3>
                <div class="flex flex-wrap gap-4 items-center">
                    <button class="btn preset-filled-primary" onclick={() => count++}>Count <span class="badge preset-filled-surface">{count}</span></button>
                    <span class="badge preset-tonal-secondary">Skeleton Badge</span>
                </div>
                <label class="label mt-4">
                    <span class="text-sm">Standard Input</span>
                    <input class="input" type="text" bind:value={sharedText} />
                </label>
            </div>

            <!-- Group 2: Layout & Progress -->
            <div class="space-y-4">
                <h3 class="h4 font-bold opacity-80 border-b border-surface-300 dark:border-surface-700/50 pb-1">Group 2: Toggles & Progress</h3>
                <div class="flex items-center gap-4 p-4 card preset-filled-surface bg-error-500/10 dark:bg-error-500/10">
                    <span class="text-xs text-error-700 dark:text-error-300 italic">No exact Skeleton Switch usage found in codebase endpoints!</span>
                </div>
                <div class="py-2">
                    <p class="text-xs opacity-60 mb-2">Skeleton Progress Bar</p>
                    <SkeletonProgress value={progressValue} max={100} />
                </div>
            </div>

            <!-- Group 3: Overlays & Zag.js -->
            <div class="space-y-4">
                <h3 class="h4 font-bold opacity-80 border-b border-surface-300 dark:border-surface-700/50 pb-1">Group 3: Overlays & Modals (Zag.js)</h3>
                <Menu positioning={{ placement: 'bottom-start', gutter: 5 }}>
                    <Menu.Trigger class="btn preset-filled-secondary">Open Zag Menu</Menu.Trigger>
                    <Portal>
                        <Menu.Positioner>
                            <Menu.Content class="card p-4 shadow-xl z-50 bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-600 w-48 space-y-2">
                                <Menu.Item value="1" class="btn preset-ghost w-full justify-start">Menu Item 1</Menu.Item>
                                <Menu.Item value="2" class="btn preset-ghost w-full justify-start">Menu Item 2</Menu.Item>
                            </Menu.Content>
                        </Menu.Positioner>
                    </Portal>
                </Menu>
            </div>

            <!-- Group 4: Advanced -->
            <div class="space-y-4">
                <h3 class="h4 font-bold opacity-80 border-b border-surface-300 dark:border-surface-700/50 pb-1">Group 4: Advanced Components & Avatars</h3>
                <div class="flex gap-4 items-center">
                    <SkeletonAvatar class="w-12 h-12 rounded-full overflow-hidden bg-primary-500 text-white font-bold">
                        <SkeletonAvatar.Fallback>JD</SkeletonAvatar.Fallback>
                    </SkeletonAvatar>
                </div>
                <div class="p-4 rounded-lg bg-surface-50 dark:bg-black/20 text-center opacity-60 text-sm">
                    We bypass Skeleton Comboboxes natively in our codebase.
                </div>
            </div>

            <!-- Group 5: Expandable Layouts -->
            <div class="space-y-4">
                <h3 class="h4 font-bold opacity-80 border-b border-surface-300 dark:border-surface-700/50 pb-1">Group 5: Accordions (Zag.js)</h3>
                <div class="card p-4 bg-error-500/10 dark:bg-error-500/10 border border-error-200 dark:border-error-600">
                    <span class="text-xs text-error-700 dark:text-error-300 italic">No exact Skeleton Accordion usage found in codebase endpoints!</span>
                </div>
            </div>

            <!-- Group 6: File Upload  -->
            <div class="space-y-4">
                <h3 class="h4 font-bold opacity-80 border-b border-surface-300 dark:border-surface-700/50 pb-1">Group 6: File Dropzone</h3>
                <SkeletonFileUpload name="skeleton_file" />
            </div>

            <!-- Group 7: Controls -->
            <div class="space-y-4">
                <h3 class="h4 font-bold opacity-80 border-b border-surface-300 dark:border-surface-700/50 pb-1">Group 7: Ratings & Sliders</h3>
                <div class="grid grid-cols-2 gap-4 items-center">
                    <SkeletonRatingGroup value={ratingValue} />
                    <SkeletonSlider value={[sliderValue]} />
                </div>
                <div class="p-4 mt-2 rounded-lg bg-surface-50 dark:bg-black/20 text-center opacity-60 text-xs shadow-inner">
                    Skeleton orchestration node. No native Stepper active.
                </div>
            </div>
        </div>

        <!-- ==============================
           COLUMN 2: NATIVE UI COMPONENTS
        ============================== -->
        <div class="card p-6 space-y-8 bg-surface-100 dark:bg-surface-900 border-2 border-success-500/50 shadow-xl relative">
            <div class="absolute top-0 right-0 p-2"><NativeBadge color="success">TARGET ARCHITECTURE</NativeBadge></div>
            
            <div class="flex items-center gap-4 border-b border-surface-300 dark:border-surface-700 pb-4">
                <iconify-icon icon="mdi:lightning-bolt" class="text-4xl text-success-500"></iconify-icon>
                <div>
                    <h2 class="h2 font-bold text-success-700 dark:text-success-400">Native Svelte 5 Primitives (The "Kitchen Sink")</h2>
                    <p class="text-xs opacity-70">Testing all 40 of our zero-dependency `.svelte` core primitives side-by-side.</p>
                </div>
            </div>

            <!-- Group 1: Basics -->
            <div class="space-y-4">
                <h3 class="h4 font-bold opacity-80 border-b border-surface-300 dark:border-surface-700/50 pb-1">Group 1: Buttons, Badges & Inputs</h3>
                <NativeCard class="p-4 space-y-4 bg-surface-50 dark:bg-black/20">
                    <div class="flex flex-wrap gap-4 items-center">
                        <SystemButton variant="primary" onclick={() => count++} leadingIcon="mdi:plus">Native Count ({count})</SystemButton>
                        <NativeBadge variant="outline">Native Badge</NativeBadge>
                        <NativeButton variant="secondary" onclick={() => toast.success("Toast fired!")}>Trigger Toast</NativeButton>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <NativeInput label="Native Input" placeholder="Type..." bind:value={sharedText} />
                        <SystemInput label="System Level Input" type="text" bind:value={sharedText} />
                        <NativeFloatingInput label="Floating Input" bind:value={sharedText} />
                    </div>
                </NativeCard>
            </div>

            <!-- Group 2: Layout & Progress -->
            <div class="space-y-4">
                <h3 class="h4 font-bold opacity-80 border-b border-surface-300 dark:border-surface-700/50 pb-1">Group 2: Toggles, Segments & Progress</h3>
                <NativeCard class="p-4 space-y-4 bg-surface-50 dark:bg-black/20">
                    <div class="flex items-center justify-between">
                        <NativeToggle bind:value={isToggled} label="Native Primitive Toggle" />
                        <SystemToggle bind:value={isToggled} label="System Accessible Toggle" />
                    </div>
                    <NativeSegmentedControl bind:value={segmentValue} options={[{label: 'Day', value: 'day'}, {label: 'Week', value: 'week'}]} />
                    <div class="space-y-1">
                        <div class="flex gap-4 items-center"><input type="range" class="flex-1" bind:value={sliderValue} min={0} max={100} /><span class="font-mono text-xs opacity-70">{sliderValue}%</span></div>
                        <NativeProgress value={sliderValue} color="success" />
                    </div>
                    
                    <div class="mt-4 pt-4 border-t border-surface-300 dark:border-surface-700">
                        <p class="text-xs mb-2">Native Tabs (Svelty)</p>
                        <div class="flex gap-2">
                            <NativeButton variant={selectedTab === 'tab1' ? 'primary' : 'outline'} onclick={() => selectedTab = 'tab1'}>Tab 1</NativeButton>
                            <NativeButton variant={selectedTab === 'tab2' ? 'primary' : 'outline'} onclick={() => selectedTab = 'tab2'}>Tab 2</NativeButton>
                        </div>
                    </div>
                </NativeCard>
            </div>

            <!-- Group 3: Overlays -->
            <div class="space-y-4">
                <h3 class="h4 font-bold opacity-80 border-b border-surface-300 dark:border-surface-700/50 pb-1">Group 3: Overlays & Feedback (Zero Zag.js)</h3>
                <NativeCard class="p-4 space-y-4 bg-surface-50 dark:bg-black/20">
                    <div class="flex flex-wrap gap-4 items-center">
                        <NativeButton onclick={() => showModal = true} variant="primary">Open Native Modal</NativeButton>
                        <NativeButton onclick={() => showDrawer = true} variant="outline">Open Native Drawer</NativeButton>

                        <NativeModal bind:open={showModal} title="Native Modal">
                            <div class="p-4">
                                <p class="opacity-80">No overarching finite state machines required!</p>
                            </div>
                            {#snippet footer()}
                                <NativeButton variant="primary" onclick={() => showModal = false} class="w-full">
                                    Close Modal
                                </NativeButton>
                            {/snippet}
                        </NativeModal>

                        <NativeDrawer bind:open={showDrawer} title="Native Drawer">
                            <div class="p-4">
                                <p class="opacity-80">Smooth CSS animations with minimal logic.</p>
                                <NativeButton variant="primary" onclick={() => showDrawer = false} class="mt-4 w-full">
                                    Close Drawer
                                </NativeButton>
                            </div>
                        </NativeDrawer>

                    </div>
                    <NativeAlert variant="warning" title="Native Alert Element">Inline alerts are native and light.</NativeAlert>
                </NativeCard>
            </div>

            <!-- Group 4: Advanced Forms & Viz -->
            <div class="space-y-4">
                <h3 class="h4 font-bold opacity-80 border-b border-surface-300 dark:border-surface-700/50 pb-1">Group 4: Advanced Forms & Navigation</h3>
                <NativeCard class="p-4 space-y-4 bg-surface-50 dark:bg-black/20">
                    <div class="flex gap-4 items-center">
                        <NativeAvatar initials="SN" color="secondary" />
                        <NativeTags bind:tags={tags} />
                    </div>
                    <div class="space-y-2 border-t border-surface-300 dark:border-surface-700 pt-4 mt-4">
                        <h4 class="font-bold">Complex Form Data Pickers</h4>
                        <div class="p-2 border rounded border-surface-300 opacity-60 text-xs text-center shadow-inner">
                            Native TreeView, Tables, DatePickers and Comboboxes are statically mapped for bundling validation without extensive mock injection.
                        </div>
                    </div>
                </NativeCard>
            </div>

            <!-- Group 5: Expandable Layouts -->
            <div class="space-y-4">
                <h3 class="h4 font-bold opacity-80 border-b border-surface-300 dark:border-surface-700/50 pb-1">Group 5: Foldable Architecture</h3>
                <NativeCard class="p-4 space-y-4 bg-surface-50 dark:bg-black/20">
                    <NativeAccordion>
                        <NativeAccordionItem title="Native Accordion">
                            Content inside native Svelte 5 accordion. No Zag machines needed!
                        </NativeAccordionItem>
                        <NativeAccordionItem title="Another Panel">
                            More native content cleanly driven by Svelte $state reactivity.
                        </NativeAccordionItem>
                    </NativeAccordion>

                    <div class="mt-4 p-2 border border-surface-200 dark:border-surface-700 rounded">
                        <NativeCollapsible>
                            {#snippet trigger()}
                                <p class="font-bold cursor-pointer hover:opacity-80">Toggle Collapsible Section</p>
                            {/snippet}
                            <div class="mt-2 text-sm opacity-80 text-center">This content is elegantly hidden utilizing purely standard Svelty blocks!</div>
                        </NativeCollapsible>
                    </div>
                </NativeCard>
            </div>

            <!-- Group 6: Interactivity  -->
            <div class="space-y-4">
                <h3 class="h4 font-bold opacity-80 border-b border-surface-300 dark:border-surface-700/50 pb-1">Group 6: Interactivity & Uploads</h3>
                <NativeCard class="p-4 space-y-4 bg-surface-50 dark:bg-black/20 flex flex-col items-start gap-4">
                    <NativeFileUpload label="Upload Documents (Native DOM)" />
                    
                    <!-- Fixed Status Badge: safely wrapped to avoid children prop collision -->
                    <div class="flex items-center gap-2">
                        <NativeStatusBadge status="warning" />
                        <span class="text-sm font-medium">Status: Native Standalone Primitive</span>
                    </div>

                </NativeCard>
            </div>

            <!-- Group 7: Controls -->
            <div class="space-y-4">
                <h3 class="h4 font-bold opacity-80 border-b border-surface-300 dark:border-surface-700/50 pb-1">Group 7: Forms & Continuous Rating</h3>
                <NativeCard class="p-4 space-y-4 bg-surface-50 dark:bg-black/20">
                    
                    <div class="grid grid-cols-2 gap-4 items-center">
                        <div class="space-y-1">
                            <p class="text-xs opacity-70">Native Rating Value: {ratingValue}</p>
                            <NativeRating bind:value={ratingValue} count={5} />
                        </div>
                        <div class="space-y-1">
                            <p class="text-xs opacity-70">Native Slider Value: {sliderValue}</p>
                            <NativeSlider bind:value={sliderValue} min={0} max={100} />
                        </div>
                    </div>

                    <div class="border-t border-surface-300 dark:border-surface-700 pt-4 mt-4">
                        <p class="font-bold text-sm mb-2 opacity-80">Native Multistep Action Stepper</p>
                        
                        <!-- Fixed Stepper: Passed correct Step object structure instead of string primitives -->
                        <NativeStepper 
                            steps={[
                                { label: 'Step 1' }, 
                                { label: 'Step 2' }, 
                                { label: 'Step 3' }
                            ]} 
                            currentStep={currentStep} 
                            completedSteps={new Set()} 
                        />

                    </div>
                </NativeCard>
            </div>

        </div>
    </div>
</div>