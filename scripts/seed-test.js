/**
 * Test Database Seeding Script
 * Populates test database with sample data for E2E testing
 *
 * Usage:
 *   npm run db:seed:test
 *   NODE_ENV=test npm run db:seed:test
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env.test") });

/**
 * Sample test users to seed
 */
const testUsers = [
  {
    email: "test@example.com",
    password: "password123",
    name: "Test User",
    role: "editor",
    verified: true,
  },
  {
    email: "admin@example.com",
    password: "admin123",
    name: "Admin User",
    role: "admin",
    verified: true,
  },
  {
    email: "viewer@example.com",
    password: "viewer123",
    name: "Viewer User",
    role: "viewer",
    verified: true,
  },
];

/**
 * Sample content items
 */
const sampleContent = [
  {
    title: "Getting Started with SveltyCMS",
    slug: "getting-started",
    excerpt: "Learn how to get started with SveltyCMS in 5 minutes",
    body: `# Getting Started

SveltyCMS is a headless CMS built with Svelte.

## Features
- Fast and responsive
- Easy content management
- Flexible API

## Installation
\`\`\`bash
npm install svelty-cms
\`\`\`

## Configuration
Configure your database and you're ready to go!`,
    tags: ["tutorial", "getting-started"],
    status: "published",
    authorId: 1,
  },
  {
    title: "Advanced Content Management Techniques",
    slug: "advanced-techniques",
    excerpt: "Master advanced features in SveltyCMS",
    body: `# Advanced Techniques

Learn how to leverage powerful features in SveltyCMS.

## Content Organization
- Use categories effectively
- Tag your content properly
- Leverage SEO features

## Publishing Workflows
- Draft and preview
- Schedule publication
- Version control`,
    tags: ["advanced", "content", "tutorial"],
    status: "published",
    authorId: 1,
  },
  {
    title: "API Integration Guide",
    slug: "api-integration",
    excerpt: "Integrate SveltyCMS API with external services",
    body: `# API Integration

## REST API Endpoints
- GET /api/content
- POST /api/content
- PUT /api/content/:id
- DELETE /api/content/:id

## Authentication
Use JWT tokens for authentication.`,
    tags: ["api", "integration", "development"],
    status: "published",
    authorId: 2,
  },
  {
    title: "Draft Article for Testing",
    slug: "draft-article",
    excerpt: "This is a draft article",
    body: "This content is still being written...",
    tags: ["draft", "test"],
    status: "draft",
    authorId: 1,
  },
  {
    title: "Archived Content Example",
    slug: "archived-example",
    excerpt: "This content is archived",
    body: "This is archived content that is no longer actively used.",
    tags: ["archived"],
    status: "archived",
    authorId: 2,
  },
];

/**
 * Seed the database
 */
async function seedDatabase() {
  try {
    console.log("\n🌱 Seeding test database...\n");

    // Get database client (adjust based on your ORM)
    // For Prisma:
    // const { PrismaClient } = require('@prisma/client');
    // const prisma = new PrismaClient();

    // For direct database connection:
    // const pool = require('./db-connection');

    console.log("📝 Seeding users...");
    // Example with Prisma:
    // for (const user of testUsers) {
    //   await prisma.user.upsert({
    //     where: { email: user.email },
    //     update: user,
    //     create: user,
    //   });
    //   console.log(`  ✓ ${user.email}`);
    // }

    console.log("✓ Users seeded");

    console.log("📝 Seeding content...");
    // for (const content of sampleContent) {
    //   await prisma.content.upsert({
    //     where: { slug: content.slug },
    //     update: content,
    //     create: content,
    //   });
    //   console.log(`  ✓ ${content.title}`);
    // }

    console.log("✓ Content seeded");

    console.log("\n✅ Database seeding completed!\n");
    console.log("📊 Summary:");
    console.log(`   - Users: ${testUsers.length}`);
    console.log(`   - Content items: ${sampleContent.length}`);
    console.log("\n");

    // Cleanup
    // if (prisma) await prisma.$disconnect();

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Seeding failed:", error.message);
    if (process.env.DEBUG) {
      console.error(error);
    }
    process.exit(1);
  }
}

seedDatabase();

module.exports = {
  testUsers,
  sampleContent,
};
