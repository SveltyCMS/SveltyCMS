#!/usr/bin/env node

/**
 * SSR-Safe Svelte 5 Migration Script
 * 
 * This script migrates custom store() usage to Svelte 5 runes while maintaining SSR compatibility.
 * It handles the $ prefix error by using appropriate approaches for different file types.
 */

const fs = require('fs');
const path = require('path');

// Configuration
const STORE_FILES = [
    'src/stores/collectionStore.svelte.ts',
    'src/stores/UIStore.svelte.ts', 
    'src/stores/themeStore.svelte.ts',
    'src/stores/screenSizeStore.svelte.ts',
    'src/stores/imageEditorStore.svelte.ts',
    'src/stores/store.svelte.ts',
    'src/widgets/index.ts'
];

// Migration patterns for SSR-safe approach
const MIGRATION_PATTERNS = {
    // Remove Svelte 5 runes from .ts files (SSR incompatible)
    removeRunesFromTs: [
        {
            pattern: /import\s*{\s*\$state,\s*\$derived[^}]*}\s*from\s*['"]svelte['"];?\s*/g,
            replacement: '// Svelte 5 runes removed for SSR compatibility\n'
        },
        {
            pattern: /\$state<([^>]+)>\(([^)]+)\)/g,
            replacement: '$2'
        },
        {
            pattern: /\$derived\(([^)]+)\)/g,
            replacement: '$1'
        },
        {
            pattern: /\$effect\(([^)]+)\)/g,
            replacement: '// $effect removed for SSR compatibility'
        }
    ],
    
    // Create client-side wrappers
    createClientWrapper: [
        {
            pattern: /export const (\w+) = \$state<([^>]+)>\(([^)]+)\);/g,
            replacement: 'export const $1: $2 = $3;'
        },
        {
            pattern: /export const (\w+) = \$derived\(([^)]+)\);/g,
            replacement: 'export const $1 = $2;'
        }
    ]
};

function isServerSideFile(filePath) {
    // Files that run on server-side (SSR context)
    const serverPatterns = [
        /\.ts$/,           // TypeScript files
        /\.js$/,           // JavaScript files
        /server\.ts$/,     // Server files
        /\+layout\.server\.ts$/, // Layout server files
        /\+page\.server\.ts$/    // Page server files
    ];
    
    return serverPatterns.some(pattern => pattern.test(filePath));
}

function isClientSideFile(filePath) {
    // Files that run on client-side only
    const clientPatterns = [
        /\.svelte$/,       // Svelte components
        /client\.ts$/,     // Client-specific files
        /browser\.ts$/     // Browser-specific files
    ];
    
    return clientPatterns.some(pattern => pattern.test(filePath));
}

function shouldUseRunes(filePath) {
    // Only use Svelte 5 runes in client-side files
    return isClientSideFile(filePath);
}

function migrateFile(filePath) {
    if (!fs.existsSync(filePath)) {
        console.log(`⚠️  File not found: ${filePath}`);
        return false;
    }

    console.log(`\n🔄 Migrating: ${filePath}`);
    
    let content = fs.readFileSync(filePath, 'utf8');
    let originalContent = content;
    let changes = [];

    // Check if file uses custom store
    if (!content.includes('store(') && !content.includes('$state') && !content.includes('$derived')) {
        console.log(`   ⏭️  No store usage found, skipping`);
        return false;
    }

    const isServerSide = isServerSideFile(filePath);
    const isClientSide = isClientSideFile(filePath);

    console.log(`   📍 File type: ${isServerSide ? 'Server-side' : isClientSide ? 'Client-side' : 'Unknown'}`);

    if (isServerSide) {
        // Server-side migration: Remove runes, use regular variables
        console.log(`   🔧 Applying SSR-safe migration (removing runes)`);
        
        MIGRATION_PATTERNS.removeRunesFromTs.forEach(({ pattern, replacement }) => {
            if (pattern.test(content)) {
                content = content.replace(pattern, replacement);
                changes.push(`Removed Svelte 5 runes for SSR compatibility`);
            }
        });

        MIGRATION_PATTERNS.createClientWrapper.forEach(({ pattern, replacement }) => {
            if (pattern.test(content)) {
                content = content.replace(pattern, replacement);
                changes.push(`Converted to regular variables for SSR`);
            }
        });

        // Add SSR compatibility comment
        if (changes.length > 0) {
            content = `// SSR compatible - Svelte 5 runes removed for server-side compatibility\n${content}`;
        }

    } else if (isClientSide) {
        // Client-side migration: Use Svelte 5 runes
        console.log(`   🔧 Applying client-side migration (using runes)`);
        
        // Replace custom store with $state
        content = content.replace(
            /const\s+(\w+)\s*=\s*store<([^>]+)>\(([^)]+)\)/g,
            'const $1 = $state<$2>($3)'
        );

        // Replace store updates
        content = content.replace(
            /(\w+)\.set\(([^)]+)\)/g,
            '$1 = $2'
        );

        content = content.replace(
            /(\w+)\.update\(([^)]+)\)/g,
            '$1 = $2($1)'
        );

        // Replace store access
        content = content.replace(
            /(\w+)\.get\(\)/g,
            '$1'
        );

        // Add Svelte 5 imports if needed
        if (content.includes('$state') || content.includes('$derived') || content.includes('$effect')) {
            if (!content.includes("import { $state")) {
                content = content.replace(
                    /import\s+([^;]+);/,
                    `import { $state, $derived, $effect } from 'svelte';\nimport $1;`
                );
            }
        }

        changes.push(`Migrated to Svelte 5 runes for client-side reactivity`);
    }

    // Check if changes were made
    if (content !== originalContent) {
        // Create backup
        const backupPath = `${filePath}.backup`;
        fs.writeFileSync(backupPath, originalContent);
        console.log(`   💾 Backup created: ${backupPath}`);

        // Write migrated content
        fs.writeFileSync(filePath, content);
        console.log(`   ✅ Migration completed`);
        changes.forEach(change => console.log(`      - ${change}`));
        return true;
    } else {
        console.log(`   ⏭️  No changes needed`);
        return false;
    }
}

function createClientWrapper(filePath) {
    const fileName = path.basename(filePath, path.extname(filePath));
    const clientWrapperPath = filePath.replace('.ts', 'Client.svelte.ts');
    
    if (fs.existsSync(clientWrapperPath)) {
        console.log(`   ⏭️  Client wrapper already exists: ${clientWrapperPath}`);
        return;
    }

    console.log(`   📝 Creating client wrapper: ${clientWrapperPath}`);
    
    const wrapperContent = `/**
 * @file ${clientWrapperPath}
 * @description Client-side wrapper for ${fileName} using Svelte 5 runes
 * 
 * This file provides reactive state management for the client side.
 * It wraps the server-side data with Svelte 5 runes for reactivity.
 */

import { $state, $derived, $effect } from 'svelte';

// Import types from server-side file
import type { /* Add your types here */ } from './${fileName}';

// Client-side reactive stores
export const clientState = $state({
    // Add your reactive state here
});

// Reactive calculations
export const derivedValue = $derived(/* Add your derived logic here */);

// Effects for side effects
$effect(() => {
    // Add your effects here
    console.log('Client state changed:', clientState);
});

// Initialize function to sync with server data
export function initializeClientStores(serverData: any) {
    // Copy server data to client stores
    Object.assign(clientState, serverData);
}
`;

    fs.writeFileSync(clientWrapperPath, wrapperContent);
    console.log(`   ✅ Client wrapper created`);
}

function main() {
    console.log('🚀 Starting SSR-Safe Svelte 5 Migration...\n');
    
    let migratedCount = 0;
    let totalFiles = STORE_FILES.length;

    STORE_FILES.forEach(filePath => {
        const migrated = migrateFile(filePath);
        if (migrated) {
            migratedCount++;
            
            // Create client wrapper for server-side files
            if (isServerSideFile(filePath)) {
                createClientWrapper(filePath);
            }
        }
    });

    console.log(`\n📊 Migration Summary:`);
    console.log(`   Total files processed: ${totalFiles}`);
    console.log(`   Files migrated: ${migratedCount}`);
    console.log(`   Files skipped: ${totalFiles - migratedCount}`);

    if (migratedCount > 0) {
        console.log(`\n✅ Migration completed successfully!`);
        console.log(`\n📋 Next steps:`);
        console.log(`   1. Test your application for SSR compatibility`);
        console.log(`   2. Check for any remaining $ prefix errors`);
        console.log(`   3. Verify client-side reactivity works correctly`);
        console.log(`   4. Review generated client wrapper files`);
        console.log(`   5. Update imports in your components if needed`);
    } else {
        console.log(`\n⚠️  No files were migrated. Check if the files exist and contain store usage.`);
    }
}

// Run migration
if (require.main === module) {
    main();
}

module.exports = { migrateFile, createClientWrapper }; 