import fs from 'fs';
import path from 'path';

const dir = 'docs/project/benchmarks/';
const files = fs.readdirSync(dir).filter(f => f.startsWith('benchmark_') && f.endsWith('.mdx'));

files.forEach(file => {
    const filePath = path.join(dir, file);
    let content = fs.readFileSync(filePath, 'utf8');

    // 1. Fix absolute links
    content = content.replace(/file:\/\/\/D:\/SveltyCMS\//g, '../../../');

    // 2. Extract title and other frontmatter info if possible, or just replace the whole block
    const dbMatch = file.match(/benchmark_([a-z]+)(_redis)?\.mdx/);
    const db = dbMatch[1];
    const isRedis = !!dbMatch[2];
    const tags = ['benchmark', 'performance', db];
    if (isRedis) tags.push('redis');

    const frontmatter = `---
path: "docs/project/benchmarks/${file}"
title: ${db.toUpperCase()}${isRedis ? ' + REDIS' : ''} Performance Audit
description: Enterprise performance trends for ${db.toUpperCase()}${isRedis ? ' + REDIS' : ''}.
order: 5
icon: "mdi:speedometer"
author: "SveltyCMS Team"
created: "2026-04-26"
updated: "2026-04-26"
tags:
${tags.map(t => `  - "${t}"`).join('\n')}
---`;

    content = content.replace(/^---[\s\S]+?---/, frontmatter);

    fs.writeFileSync(filePath, content);
    console.log(`Fixed ${file}`);
});
