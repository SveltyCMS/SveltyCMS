/**
 * @vitest-environment node
 * @file tests/unit/plugins/smart-importer.test.ts
 * @description Smart Importer v2.1 tests — 30+ parser, AI, and plugin tests.
 */
import { describe, it, expect } from "vitest";

describe("WordPress WXR Parser", () => {
  it("parses WXR with posts, categories, tags, media", async () => {
    const { parseWordPressWXR } = await import("@plugins/smart-importer/parsers/wordpress");
    const wxr =
      '<?xml version="1.0"?><rss version="2.0" xmlns:wp="http://wordpress.org/export/1.2/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/"><channel><wp:category><wp:cat_name>Tech</wp:cat_name><wp:category_nicename>tech</wp:category_nicename></wp:category><wp:tag><wp:tag_slug>news</wp:tag_slug><wp:tag_name>News</wp:tag_name></wp:tag><item><title>Hello World</title><wp:post_id>1</wp:post_id><wp:post_name>hello-world</wp:post_name><wp:status>publish</wp:status><wp:post_type>post</wp:post_type><wp:post_date>2024-01-01 00:00:00</wp:post_date><content:encoded><![CDATA[<p>Content here</p>]]></content:encoded><excerpt:encoded><![CDATA[Excerpt here]]></excerpt:encoded><dc:creator>admin</dc:creator><category domain="category" nicename="tech">Tech</category><category domain="post_tag" nicename="news">News</category><wp:postmeta><wp:meta_key>custom_field</wp:meta_key><wp:meta_value>custom value</wp:meta_value></wp:postmeta></item></channel></rss>';
    const e = parseWordPressWXR(wxr, "t1");
    expect(e!.entries[0].title).toBe("Hello World");
    expect(e!.entries[0].taxonomies.terms.categories).toContain("Tech");
    expect(e!.entries[0].taxonomies.terms.tags).toContain("News");
  });
  it("maps page hierarchy", async () => {
    const { parseWordPressWXR } = await import("@plugins/smart-importer/parsers/wordpress");
    const wxr =
      '<?xml version="1.0"?><rss version="2.0" xmlns:wp="http://wordpress.org/export/1.2/"><channel><item><title>C</title><wp:post_id>2</wp:post_id><wp:post_type>page</wp:post_type><wp:post_parent>1</wp:post_parent><wp:menu_order>3</wp:menu_order><wp:status>publish</wp:status></item></channel></rss>';
    expect(parseWordPressWXR(wxr, "t2")!.entries[0].parentExternalId).toBe("1");
  });
  it("extracts comments", async () => {
    const { parseWordPressWXR } = await import("@plugins/smart-importer/parsers/wordpress");
    const wxr =
      '<?xml version="1.0"?><rss version="2.0" xmlns:wp="http://wordpress.org/export/1.2/"><channel><item><title>P</title><wp:post_id>1</wp:post_id><wp:post_type>post</wp:post_type><wp:status>publish</wp:status><wp:comment><wp:comment_id>1</wp:comment_id><wp:comment_author>Jane</wp:comment_author><wp:comment_content>Nice</wp:comment_content><wp:comment_approved>1</wp:comment_approved></wp:comment></item></channel></rss>';
    const comments = parseWordPressWXR(wxr, "t3")!.entries[0].rawCustomFields._comments as any[];
    expect(comments[0].author).toBe("Jane");
  });
});

describe("Drupal JSON:API Parser", () => {
  it("parses with taxonomy resolution", async () => {
    const { parseDrupalJSONAPI } = await import("@plugins/smart-importer/parsers/drupal");
    const json = JSON.stringify({
      data: [
        {
          type: "node--article",
          id: "u1",
          attributes: {
            title: "Drupal",
            status: true,
            body: { value: "<p>B</p>" },
            langcode: "en",
            created: "2024-01-01T00:00:00Z",
            changed: "2024-06-01T00:00:00Z",
          },
          relationships: {
            field_tags: { data: [{ type: "taxonomy_term--tags", id: "t1" }] },
            field_image: { data: { type: "media--image", id: "i1" } },
          },
        },
      ],
      included: [
        { type: "taxonomy_term--tags", id: "t1", attributes: { name: "Tech" } },
        {
          type: "file--file",
          id: "i1",
          attributes: { uri: { url: "https://x.com/i.jpg" }, alt: "T" },
        },
      ],
    });
    const e = parseDrupalJSONAPI(json, "t1")!;
    expect(e.entries[0].title).toBe("Drupal");
    expect(e.entries[0].taxonomies.terms.tags).toContain("Tech");
    expect(e.entries[0].assetsToMirror[0].externalUrl).toBe("https://x.com/i.jpg");
  });
});

describe("Headless CMS Parsers", () => {
  it("Contentful", async () => {
    const { parseContentfulExport } = await import("@plugins/smart-importer/parsers/headless");
    const j = JSON.stringify({
      entries: [
        {
          sys: { id: "a", publishedAt: "2024-01-01" },
          fields: { title: { "en-US": "CF" } },
        },
      ],
      assets: [],
    });
    expect(parseContentfulExport(j, "t")!.entries[0].title).toBe("CF");
  });
  it("Sanity", async () => {
    const { parseSanityExport } = await import("@plugins/smart-importer/parsers/headless");
    expect(
      parseSanityExport(JSON.stringify({ _id: "d1", _type: "post", title: "S" }) + "\n", "t")!
        .entries[0].title,
    ).toBe("S");
  });
  it("Strapi", async () => {
    const { parseStrapiExport } = await import("@plugins/smart-importer/parsers/headless");
    const j = JSON.stringify({
      data: [{ id: 1, attributes: { title: "SP", publishedAt: "2024-01-01" } }],
    });
    expect(parseStrapiExport(j, "t")!.entries[0].status).toBe("published");
  });
  it("Directus", async () => {
    const { parseDirectusExport } = await import("@plugins/smart-importer/parsers/headless");
    expect(
      parseDirectusExport(
        JSON.stringify({
          data: [{ id: "d", title: "DI", status: "published" }],
        }),
        "t",
      )!.entries[0].title,
    ).toBe("DI");
  });
  it("Payload", async () => {
    const { parsePayloadExport } = await import("@plugins/smart-importer/parsers/headless");
    expect(
      parsePayloadExport(JSON.stringify({ docs: [{ id: "p", title: "PD", slug: "pd" }] }), "t")!
        .entries[0].title,
    ).toBe("PD");
  });
  it("Storyblok", async () => {
    const { parseStoryblokExport } = await import("@plugins/smart-importer/parsers/headless");
    const j = JSON.stringify({
      stories: [
        {
          uuid: "s",
          name: "Home",
          full_slug: "home",
          published: true,
          content: {},
        },
      ],
    });
    expect(parseStoryblokExport(j, "t")!.entries[0].title).toBe("Home");
  });
  it("Prismic", async () => {
    const { parsePrismicExport } = await import("@plugins/smart-importer/parsers/headless");
    const j = JSON.stringify({
      results: [
        {
          id: "p",
          uid: "my",
          lang: "en-us",
          data: { title: [{ type: "h1", text: "PR" }] },
        },
      ],
    });
    expect(parsePrismicExport(j, "t")!.entries[0].languageCode).toBe("en-us");
  });
});

describe("E-Commerce Parsers", () => {
  it("Shopify", async () => {
    const { parseShopifyExport } = await import("@plugins/smart-importer/parsers/ecommerce");
    const j = JSON.stringify({
      products: [
        {
          id: 1,
          title: "Shirt",
          handle: "shirt",
          variants: [{ sku: "S1", price: "29.99", inventory_quantity: "10" }],
        },
      ],
    });
    expect(parseShopifyExport(j, "t")!.entries[0].ecommerce?.price).toBe(29.99);
  });
  it("Magento", async () => {
    const { parseMagentoExport } = await import("@plugins/smart-importer/parsers/ecommerce");
    expect(
      parseMagentoExport(JSON.stringify([{ sku: "M1", name: "MP", price: "49.99" }]), "t")!
        .entries[0].ecommerce?.sku,
    ).toBe("M1");
  });
  it("PrestaShop", async () => {
    const { parsePrestaShopExport } = await import("@plugins/smart-importer/parsers/ecommerce");
    const csv = "Product ID;Name;Reference;Price;Active\n1;Product A;REF-1;19.99;1";
    const e = parsePrestaShopExport(csv, "t")!;
    expect(e.entries[0].title).toBeTruthy();
  });
});

describe("SaaS Platform Parsers", () => {
  it("Ghost", async () => {
    const { parseGhostExport } = await import("@plugins/smart-importer/parsers/saas");
    const j = JSON.stringify({
      db: [
        {
          data: {
            posts: [{ id: "1", title: "GP", slug: "gp", status: "published" }],
            tags: [],
            users: [],
          },
        },
      ],
    });
    expect(parseGhostExport(j, "t")!.entries[0].title).toBe("GP");
  });
  it("Webflow", async () => {
    const { parseWebflowExport } = await import("@plugins/smart-importer/parsers/saas");
    expect(
      parseWebflowExport("_id,Name,Slug,_archived,_draft\nabc,TP,tp,false,false", "t")!.entries[0]
        .title,
    ).toBe("TP");
  });
  it("HubSpot", async () => {
    const { parseHubSpotExport } = await import("@plugins/smart-importer/parsers/saas");
    expect(
      parseHubSpotExport(
        JSON.stringify({ results: [{ id: "1", properties: { name: "HP" } }] }),
        "t",
      )!.entries[0].title,
    ).toBe("HP");
  });
});

describe("PHP CMS Parsers", () => {
  it("Joomla", async () => {
    const { parseJoomlaExport } = await import("@plugins/smart-importer/parsers/php-cms");
    expect(
      parseJoomlaExport(
        JSON.stringify({
          articles: [{ id: "1", title: "JA", state: "1", introtext: "I", fulltext: "F" }],
        }),
        "t",
      )!.entries[0].title,
    ).toBe("JA");
  });
  it("TYPO3", async () => {
    const { parseTypo3Export } = await import("@plugins/smart-importer/parsers/php-cms");
    expect(
      parseTypo3Export(JSON.stringify([{ uid: 1, title: "TP", bodytext: "C" }]), "t")!.entries[0]
        .title,
    ).toBe("TP");
  });
  it("Craft CMS", async () => {
    const { parseCraftExport } = await import("@plugins/smart-importer/parsers/php-cms");
    const j = JSON.stringify({
      entries: [
        {
          id: 1,
          title: "CE",
          slug: "ce",
          status: "enabled",
          fields: { body: "CB" },
        },
      ],
    });
    expect(parseCraftExport(j, "t")!.entries[0].title).toBe("CE");
  });
});

describe("Universal Parsers", () => {
  it("CSV", async () => {
    const { parseSpreadsheet } = await import("@plugins/smart-importer/parsers/universal");
    expect(parseSpreadsheet("title,content\nA,B", "t")!.entries).toHaveLength(1);
  });
  it("TSV", async () => {
    const { parseSpreadsheet } = await import("@plugins/smart-importer/parsers/universal");
    expect(parseSpreadsheet("name\tdesc\nI1\tD1", "t")!.entries).toHaveLength(1);
  });
  it("Markdown+YAML", async () => {
    const { parseMarkdownFiles } = await import("@plugins/smart-importer/parsers/universal");
    const e = parseMarkdownFiles(
      [
        {
          path: "p.md",
          content: "---\ntitle: MP\ntags:\n  - tech\n---\n# Hello",
        },
      ],
      "t",
    )!;
    expect(e.entries[0].title).toBe("MP");
    expect(e.entries[0].taxonomies.terms.tags).toContain("tech");
  });
  it("SQL", async () => {
    const { parseSQLDump } = await import("@plugins/smart-importer/parsers/universal");
    expect(
      parseSQLDump(
        'CREATE TABLE posts (id INT, title TEXT);\nINSERT INTO posts (id, title) VALUES (1, "FP");',
        "t",
      )!.entries[0].title,
    ).toBe("FP");
  });
  it("Airtable", async () => {
    const { parseJSONDatabase } = await import("@plugins/smart-importer/parsers/universal");
    const j = JSON.stringify({
      records: [{ id: "r1", fields: { Name: "R1" }, createdTime: "2024-01-01" }],
    });
    expect(parseJSONDatabase(j, "t", "airtable")!.entries).toHaveLength(1);
  });
});

describe("Master Dispatcher", () => {
  it("routes WordPress", async () => {
    const { parseFileToSNC } = await import("@plugins/smart-importer/parsers/index");
    const r = await parseFileToSNC(
      '<?xml version="1.0"?><rss version="2.0" xmlns:wp="http://wordpress.org/export/1.2/"><channel><item><title>W</title><wp:post_id>1</wp:post_id><wp:post_type>post</wp:post_type><wp:status>publish</wp:status></item></channel></rss>',
      "wordpress",
      "t",
    );
    expect(r!.sourcePlatform).toBe("wordpress");
  });
  it("routes Drupal", async () => {
    const { parseFileToSNC } = await import("@plugins/smart-importer/parsers/index");
    const r = await parseFileToSNC(
      JSON.stringify({
        data: [{ type: "node--article", id: "1", attributes: { title: "D" } }],
      }),
      "drupal",
      "t",
    );
    expect(r!.sourcePlatform).toBe("drupal");
  });
  it("routes Strapi", async () => {
    const { parseFileToSNC } = await import("@plugins/smart-importer/parsers/index");
    const r = await parseFileToSNC(
      JSON.stringify({ data: [{ id: 1, attributes: { title: "S" } }] }),
      "strapi",
      "t",
    );
    expect(r!.sourcePlatform).toBe("strapi");
  });
  it("routes Shopify", async () => {
    const { parseFileToSNC } = await import("@plugins/smart-importer/parsers/index");
    const r = await parseFileToSNC(
      JSON.stringify({ products: [{ id: 1, title: "P" }] }),
      "shopify",
      "t",
    );
    expect(r!.sourcePlatform).toBe("shopify");
  });
  it("routes CSV", async () => {
    const { parseFileToSNC } = await import("@plugins/smart-importer/parsers/index");
    const r = await parseFileToSNC("title,content\nA,B", "csv", "t");
    expect(r!.sourcePlatform).toBe("csv");
  });
});

describe("AI Co-Pilot", () => {
  it("health score calculates", async () => {
    const { calculateMigrationHealth } = await import("@plugins/smart-importer/ai-co-pilot");
    const entries = [
      {
        externalId: "1",
        title: "T",
        slug: "t",
        status: "draft" as const,
        taxonomies: { vocabularies: [], terms: {} },
        rawCustomFields: {},
        assetsToMirror: [],
      },
    ];
    const mappings = [
      {
        sourceField: "title",
        targetField: "title",
        widgetType: "text",
        confidence: "high" as const,
        action: "map" as const,
      },
    ];
    const report = calculateMigrationHealth(entries, mappings, "posts", {});
    expect(report.status).toBeDefined();
    expect(report.checks.total).toBeGreaterThan(0);
  });
  it("detects no-mappings critical", async () => {
    const { calculateMigrationHealth } = await import("@plugins/smart-importer/ai-co-pilot");
    const entries = [
      {
        externalId: "1",
        title: "T",
        slug: "t",
        status: "draft" as const,
        taxonomies: { vocabularies: [], terms: {} },
        rawCustomFields: {},
        assetsToMirror: [],
      },
    ];
    const report = calculateMigrationHealth(entries, [], "", {});
    expect(report.checks.failed).toBeGreaterThan(0);
  });
  it("smart defaults", async () => {
    const { generateSmartDefaults } = await import("@plugins/smart-importer/ai-co-pilot");
    const e = [
      {
        externalId: "1",
        title: "P1",
        slug: "p1",
        status: "published" as const,
        content: "B1",
        taxonomies: { vocabularies: [], terms: {} },
        rawCustomFields: { type: "post" },
        assetsToMirror: [],
      },
    ];
    const d = generateSmartDefaults(e, "wordpress");
    expect(d.suggestedMappings.length).toBeGreaterThan(0);
    expect(d.conflictStrategy).toBe("skip");
  });
  it("platform guidance", async () => {
    const { getPlatformGuidance } = await import("@plugins/smart-importer/ai-co-pilot");
    expect(getPlatformGuidance("wordpress", "post").length).toBeGreaterThan(0);
    expect(
      getPlatformGuidance("drupal", "article").some((t: string) => t.includes("taxonomy")),
    ).toBe(true);
    expect(getPlatformGuidance("csv", "data").some((t: string) => t.includes("headers"))).toBe(
      true,
    );
  });
});

describe("Performance Engine", () => {
  it("adaptiveBatchSize exists", async () => {
    const { adaptiveBatchSize } = await import("@plugins/smart-importer/performance");
    expect(typeof adaptiveBatchSize).toBe("function");
  });
  it("concurrentMultiStreamImport exists", async () => {
    const { concurrentMultiStreamImport } = await import("@plugins/smart-importer/performance");
    expect(typeof concurrentMultiStreamImport).toBe("function");
  });
});

describe("Plugin Registration", () => {
  it("exports valid plugin v2.1 with freemium tiers", async () => {
    const mod = await import("@plugins/smart-importer/index");
    const plugin = mod.default || mod.smartImporterPlugin;
    expect(plugin.metadata.id).toBe("smart-importer");
    expect(plugin.metadata.version).toBe("2.1.0");
    const supportedFormats = plugin.config?.public?.supportedFormats as
      | { free: string[]; pro: string[] }
      | undefined;
    expect(supportedFormats?.free).toHaveLength(5);
    expect(supportedFormats?.pro.length).toBeGreaterThan(30);
  });
});
