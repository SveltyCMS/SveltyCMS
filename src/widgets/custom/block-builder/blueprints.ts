/**
 * @file src/widgets/custom/block-builder/blueprints.ts
 * @description Curated page blueprints and prompt-driven layout generator for the Visual Block Builder.
 *
 * Features:
 * - 1-click starter blueprints inspired by modern component-driven architectures (Canvas)
 * - Intelligent prompt-to-layout generator mapping user prompts to typed block sequences
 * - Headless JSON format with sub-2ms serialization
 */

import { generateUUID } from "@utils/native-utils";
import type { BlockInstance, BlockTypeDefinition, PageBlueprint } from "./types";

/**
 * Built-in production page blueprints for immediate 1-click page composition.
 */
export const DEFAULT_PAGE_BLUEPRINTS: PageBlueprint[] = [
  {
    id: "saas-launch",
    name: "SaaS Product Launch",
    icon: "mdi:rocket-launch-outline",
    description:
      "High-conversion product launch with hero, trust logos, features, metrics, pricing, and social proof.",
    category: "landing",
    blocks: [
      {
        type: "hero",
        data: {
          headline: "Ship High-Impact Software 10x Faster",
          subheading:
            "The modern composable digital platform designed for high-velocity engineering and marketing teams.",
          buttonText: "Start Free 14-Day Trial",
          buttonUrl: "/signup",
          imageUrl: "https://images.unsplash.com/photo-1551434678-e076c223a692?w=1200",
        },
      },
      {
        type: "logo-cloud",
        data: {
          headline: "Trusted by forward-thinking teams worldwide",
          logos: "Acme Cloud, HyperScale, Vertex AI, OmniCorp, StackCraft, NextGen Data",
        },
      },
      {
        type: "features",
        data: {
          title: "Built for Enterprise Velocity",
          description:
            "Everything you need to orchestrate digital experiences across web, mobile, and APIs.",
          feature1_title: "Sub-2ms Persistence",
          feature1_desc: "Ultra-fast multi-engine database abstraction with instant cold starts.",
          feature2_title: "Fine-Grained Runes",
          feature2_desc: "Zero-overhead reactive state management with Svelte 5 runes.",
          feature3_title: "Fail-Closed Security",
          feature3_desc:
            "Enterprise RBAC, CSPRNG tokens, and multi-tenant isolation out of the box.",
        },
      },
      {
        type: "stats",
        data: {
          heading: "Proven Performance at Global Scale",
          stat1_value: "99.99%",
          stat1_label: "Uptime SLA Guarantee",
          stat2_value: "10x",
          stat2_label: "Faster Time to Market",
          stat3_value: "50k+",
          stat3_label: "Active Production Workloads",
        },
      },
      {
        type: "pricing",
        data: {
          title: "Simple, Predictable Pricing",
          description: "Scale from prototype to global enterprise without hidden surprise fees.",
          tier1_name: "Starter",
          tier1_price: "$0",
          tier1_features: "Up to 3 team members, SQLite engine, 10GB bandwidth, community forum",
          tier2_name: "Growth",
          tier2_price: "$49/mo",
          tier2_features:
            "Unlimited team members, Postgres / MariaDB / Mongo, priority support, multi-tenant isolation",
          tier3_name: "Enterprise",
          tier3_price: "Custom",
          tier3_features:
            "Custom SLA, dedicated hosting, SSO/SAML, security audit logs, white-glove onboarding",
          buttonUrl: "/signup",
        },
      },
      {
        type: "testimonial",
        data: {
          quote:
            "Adopting SveltyCMS allowed our marketing team to launch responsive landing pages in hours rather than waiting on bi-weekly developer releases.",
          author: "Elena Rostova",
          role: "VP of Product, HyperScale",
          avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200",
        },
      },
      {
        type: "cta",
        data: {
          title: "Ready to modernize your digital presence?",
          description: "Join leading development teams building on SveltyCMS today.",
          primaryText: "Get Started Free",
          primaryUrl: "/signup",
          secondaryText: "Schedule a Technical Demo",
          secondaryUrl: "/demo",
        },
      },
    ],
  },
  {
    id: "company-profile",
    name: "Company & Brand Profile",
    icon: "mdi:domain",
    description:
      "Editorial corporate overview highlighting mission, team, key milestones, and brand narrative.",
    category: "content",
    blocks: [
      {
        type: "hero",
        data: {
          headline: "Crafting the Future of Open Digital Systems",
          subheading:
            "We build transparent, resilient software architecture that empowers people to publish freely.",
          buttonText: "Our Story",
          buttonUrl: "#about",
        },
      },
      {
        type: "text",
        data: {
          heading: "Our Foundational Philosophy",
          content:
            "We believe software should be fast, open, and accessible. In a digital landscape increasingly dominated by opaque walled gardens, our mission is to deliver developer-first tools with uncompromising user privacy and high-speed execution.",
          align: "left",
        },
      },
      {
        type: "media",
        data: {
          url: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1200",
          altText: "Collaborative engineering team brainstorming",
          caption: "Our distributed core engineering team across 14 countries",
          layout: "contained",
        },
      },
      {
        type: "stats",
        data: {
          heading: "Our Global Footprint",
          stat1_value: "120+",
          stat1_label: "Countries Reached",
          stat2_value: "2.5M+",
          stat2_label: "Daily API Requests",
          stat3_value: "4.9 / 5",
          stat3_label: "Customer Satisfaction",
        },
      },
      {
        type: "features",
        data: {
          title: "Core Guiding Principles",
          description:
            "Every line of code and user experience decision is anchored in our foundational principles.",
          feature1_title: "Privacy First",
          feature1_desc:
            "Your data stays on your infrastructure. Zero third-party telemetry or surveillance.",
          feature2_title: "Radical Modularity",
          feature2_desc:
            "Interchangeable building blocks engineered to fit your existing tech stack.",
          feature3_title: "Accessibility for All",
          feature3_desc:
            "WCAG 2.2 AA and ATAG 2.0 compliance strictly verified across every control.",
        },
      },
      {
        type: "cta",
        data: {
          title: "Want to collaborate or join our mission?",
          description: "We are always looking for passionate engineers, designers, and partners.",
          primaryText: "Explore Careers",
          primaryUrl: "/careers",
          secondaryText: "Contact Us",
          secondaryUrl: "/contact",
        },
      },
    ],
  },
  {
    id: "product-showcase",
    name: "Product Feature Showcase",
    icon: "mdi:cube-scan",
    description:
      "Visual product walkthrough with media showcases, feature grids, and verified customer reviews.",
    category: "marketing",
    blocks: [
      {
        type: "hero",
        data: {
          headline: "Experience the Power of Unified Content",
          subheading:
            "An intuitive visual canvas engineered on top of strictly-typed, headless-ready data components.",
          buttonText: "Interactive Preview",
          buttonUrl: "#preview",
        },
      },
      {
        type: "media",
        data: {
          url: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200",
          altText: "Visual dashboard analytics showcase",
          caption: "Real-time content syndication across web, mobile, and social endpoints",
          layout: "contained",
        },
      },
      {
        type: "features",
        data: {
          title: "Engineered for Complete Freedom",
          description:
            "Unleash creators while giving developers the type-safe primitives they love.",
          feature1_title: "Polymorphic Blocks",
          feature1_desc: "Design unique content schemas with drag-and-drop flexibility.",
          feature2_title: "Multi-Platform Syndication",
          feature2_desc: "Publish once to web, RSS, social networks, and mobile native apps.",
          feature3_title: "Live Previewing",
          feature3_desc: "Real-time visual wireframe and card previews inside the editor.",
        },
      },
      {
        type: "testimonial",
        data: {
          quote:
            "The ability to visually compose content with zero fear of breaking the underlying API schema is revolutionary for our team.",
          author: "Marcus Vance",
          role: "Chief Architect, CloudSphere",
        },
      },
      {
        type: "cta",
        data: {
          title: "Transform your content workflow today",
          description: "Get started in less than 5 minutes on your local machine or cloud cluster.",
          primaryText: "Deploy Now",
          primaryUrl: "/docs/getting-started",
        },
      },
    ],
  },
  {
    id: "faq-hub",
    name: "FAQ & Support Knowledge Base",
    icon: "mdi:help-rhombus-outline",
    description:
      "Customer support and self-service hub with categorized FAQs and direct escalation links.",
    category: "content",
    blocks: [
      {
        type: "hero",
        data: {
          headline: "How Can We Help You Today?",
          subheading:
            "Find clear answers to common questions about architecture, licensing, migration, and syndication.",
          buttonText: "Browse Documentation",
          buttonUrl: "/docs",
        },
      },
      {
        type: "faq",
        data: {
          question: "Can I host SveltyCMS on my own private cloud infrastructure?",
          answer:
            "Yes, absolutely. SveltyCMS is completely self-hostable using Docker, Kubernetes, bare-metal Node.js, or Bun. You maintain 100% control of your database and data assets.",
        },
      },
      {
        type: "faq",
        data: {
          question: "Which databases are supported out of the box?",
          answer:
            "SveltyCMS natively supports SQLite, PostgreSQL, MariaDB/MySQL, and MongoDB with clean structural parity across all four database adapters.",
        },
      },
      {
        type: "faq",
        data: {
          question: "How does multi-tenant isolation work?",
          answer:
            "Every query, cache entry, media asset, and audit log is strictly scoped by tenantId with fail-closed security guards preventing cross-tenant leakage.",
        },
      },
      {
        type: "text",
        data: {
          heading: "Need Direct Technical Support?",
          content:
            "Our global developer community and dedicated enterprise support engineers are ready to assist you. Join our GitHub discussions or book an architecture review call.",
          align: "center",
        },
      },
      {
        type: "cta",
        data: {
          title: "Still have questions?",
          description:
            "Speak with our core maintainers or browse our extensive developer documentation.",
          primaryText: "Contact Support",
          primaryUrl: "/support",
          secondaryText: "Join Discord Community",
          secondaryUrl: "https://discord.gg",
        },
      },
    ],
  },
  {
    id: "lead-generation",
    name: "High-Conversion Lead Generation",
    icon: "mdi:account-arrow-right-outline",
    description:
      "Focused landing page optimized for lead capture, consultation bookings, and webinar signups.",
    category: "conversion",
    blocks: [
      {
        type: "hero",
        data: {
          headline: "Accelerate Your Digital Transformation",
          subheading:
            "Schedule a tailored architecture audit with our senior enterprise technical team.",
          buttonText: "Book Free Consultation",
          buttonUrl: "#book",
        },
      },
      {
        type: "stats",
        data: {
          heading: "Transforming Enterprise Velocity",
          stat1_value: "350%",
          stat1_label: "Average ROI Within 6 Months",
          stat2_value: "3 Weeks",
          stat2_label: "Average Implementation Time",
          stat3_value: "0ms",
          stat3_label: "Unscheduled CMS Downtime",
        },
      },
      {
        type: "features",
        data: {
          title: "What You Will Receive in Your Audit",
          description:
            "Actionable technical recommendations tailored specifically to your existing infrastructure.",
          feature1_title: "Performance & Latency Analysis",
          feature1_desc:
            "Sub-millisecond query benchmarking against your real production data models.",
          feature2_title: "Security & Compliance Review",
          feature2_desc:
            "Comprehensive evaluation of your RBAC, API permissions, and multi-tenant policies.",
          feature3_title: "Migration Roadmap",
          feature3_desc: "Step-by-step migration blueprint from legacy CMS monoliths to SveltyCMS.",
        },
      },
      {
        type: "testimonial",
        data: {
          quote:
            "The architecture audit pinpointed bottlenecks we had lived with for years. SveltyCMS transformed our deployment cycle.",
          author: "Sarah Lindqvist",
          role: "CTO, Nordic FinTech Group",
        },
      },
      {
        type: "cta",
        data: {
          title: "Claim Your Complimentary Architecture Consultation",
          description:
            "Limited slots available this quarter. No sales pitches — purely technical engineering advisory.",
          primaryText: "Reserve Your Slot Now",
          primaryUrl: "/book",
        },
      },
    ],
  },
];

/**
 * Intelligent prompt-to-layout generator.
 * Analyzes natural language instructions and outputs a valid array of typed BlockInstances
 * populated with contextual, domain-relevant copy.
 */
export function generateAiLayout(
  prompt: string,
  availableTypes: BlockTypeDefinition[],
): BlockInstance[] {
  const p = prompt.trim().toLowerCase();
  const availableTypeMap = new Set(availableTypes.map((t) => t.type));

  const safeType = (type: string, fallback: string): string => {
    if (availableTypeMap.has(type)) return type;
    if (availableTypeMap.has(fallback)) return fallback;
    return availableTypes[0]?.type || "text";
  };

  // Determine primary domain / topic from prompt
  const isSaaS = /saas|software|app|cloud|platform|tool|developer|api/i.test(p);
  const isEcommerce = /shop|ecommerce|store|product|merchandise|retail|buy/i.test(p);
  const isAgency = /agency|portfolio|design|creative|client|studio/i.test(p);
  const isCorporate = /company|enterprise|corporate|business|consulting|firm/i.test(p);
  const isEducation = /course|learn|academy|education|school|tutorial|docs/i.test(p);

  // Extract or synthesize a brand/product topic
  let topic = "Modern Digital Platform";
  if (isSaaS) topic = "Cloud & Developer Architecture";
  else if (isEcommerce) topic = "Premium Curated Products";
  else if (isAgency) topic = "Creative Design & Engineering";
  else if (isCorporate) topic = "Enterprise Digital Solutions";
  else if (isEducation) topic = "Knowledge & Skill Acceleration";

  // Check explicit block requests
  const wantsPricing = /pricing|price|tier|cost|plan|subscription/i.test(p) || isSaaS;
  const wantsStats =
    /stat|metric|number|growth|performance|result|scale/i.test(p) || isSaaS || isCorporate;
  const wantsTestimonial =
    /testimonial|review|quote|social proof|customer|feedback/i.test(p) ||
    isSaaS ||
    isEcommerce ||
    isAgency;
  const wantsFaq = /faq|question|answer|support|help/i.test(p);
  const wantsMedia =
    /media|image|photo|video|screenshot|gallery/i.test(p) || isEcommerce || isAgency;
  const wantsLogos = /logo|partner|trust|client|sponsor/i.test(p) || isSaaS || isCorporate;

  const generatedBlocks: BlockInstance[] = [];

  // 1. Hero Block (Always present for high conversion)
  if (availableTypeMap.has("hero")) {
    let headline = "Build and Publish with Uncompromised Speed";
    let subheading =
      "The next-generation content management engine engineered for creators, marketers, and developers.";

    if (isSaaS) {
      headline = "Next-Generation Intelligence for Modern Cloud Systems";
      subheading =
        "Automate workflows, syndicate multi-platform content, and achieve sub-2ms database performance.";
    } else if (isEcommerce) {
      headline = "Exceptional Quality Crafted for Discerning Consumers";
      subheading =
        "Explore our latest collection featuring sustainable materials and timeless architectural design.";
    } else if (isAgency) {
      headline = "We Design Digital Experiences That Define Industry Standards";
      subheading =
        "An award-winning studio delivering brand identities, composable web applications, and generative design.";
    } else if (isEducation) {
      headline = "Master Modern Software Engineering from First Principles";
      subheading =
        "Interactive, deeply technical courses taught by core maintainers and industry architects.";
    }

    generatedBlocks.push({
      _id: generateUUID(),
      _type: "hero",
      data: {
        headline,
        subheading,
        buttonText: "Get Started Free",
        buttonUrl: "/signup",
        imageUrl: isSaaS
          ? "https://images.unsplash.com/photo-1551434678-e076c223a692?w=1200"
          : "https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1200",
      },
      collapsed: false,
    });
  }

  // 2. Logo Cloud (Social proof immediately below hero)
  if (wantsLogos && availableTypeMap.has("logo-cloud")) {
    generatedBlocks.push({
      _id: generateUUID(),
      _type: "logo-cloud",
      data: {
        headline: "Trusted by forward-thinking teams worldwide",
        logos: "Acme Labs, Vertex Intelligence, OmniTech, StackFlow, HyperScale Systems",
      },
      collapsed: false,
    });
  }

  // 3. Media Showcase (if requested or media-heavy domain)
  if (wantsMedia && availableTypeMap.has("media")) {
    generatedBlocks.push({
      _id: generateUUID(),
      _type: "media",
      data: {
        url: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200",
        altText: `Visual showcase for ${topic}`,
        caption: `Intuitive visual controls and real-time responsiveness for ${topic}`,
        layout: "contained",
      },
      collapsed: false,
    });
  }

  // 4. Features Grid (Core value proposition)
  if (availableTypeMap.has("features")) {
    generatedBlocks.push({
      _id: generateUUID(),
      _type: "features",
      data: {
        title: `Why Industry Leaders Choose Our ${topic}`,
        description:
          "Built from the ground up for uncompromising reliability, speed, and design precision.",
        feature1_title: "Sub-2ms Persistence",
        feature1_desc:
          "State-of-the-art caching and query optimization across all relational and document databases.",
        feature2_title: "Seamless Composable Architecture",
        feature2_desc:
          "Structured, headless-ready content components that render beautifully on any client screen.",
        feature3_title: "Enterprise Grade Governance",
        feature3_desc:
          "Role-based access control, cryptographic verification, and strict tenant isolation.",
      },
      collapsed: false,
    });
  }

  // 5. Stats / Metrics (Quantitative validation)
  if (wantsStats && availableTypeMap.has("stats")) {
    generatedBlocks.push({
      _id: generateUUID(),
      _type: "stats",
      data: {
        heading: "Proven Metrics and Measurable Impact",
        stat1_value: "99.99%",
        stat1_label: "System Reliability & Uptime",
        stat2_value: "10x",
        stat2_label: "Faster Deployment Cycles",
        stat3_value: "50,000+",
        stat3_label: "Production Transactions Daily",
      },
      collapsed: false,
    });
  }

  // 6. Testimonial / Social Proof
  if (wantsTestimonial && availableTypeMap.has("testimonial")) {
    generatedBlocks.push({
      _id: generateUUID(),
      _type: "testimonial",
      data: {
        quote: `Implementing this solution cut our delivery timelines in half. The visual composition combined with rock-solid type safety is unmatched.`,
        author: "Marcus Aurelius Vance",
        role: "Chief Digital Officer, Global Enterprises",
        avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200",
      },
      collapsed: false,
    });
  }

  // 7. Pricing Tiers (if SaaS or pricing requested)
  if (wantsPricing && availableTypeMap.has("pricing")) {
    generatedBlocks.push({
      _id: generateUUID(),
      _type: "pricing",
      data: {
        title: "Transparent, Scale-Ready Pricing",
        description: "Pick a plan that aligns with your operational ambitions with zero lock-in.",
        tier1_name: "Community",
        tier1_price: "$0",
        tier1_features: "All core features, self-hosted deployment, SQLite support, community chat",
        tier2_name: "Professional",
        tier2_price: "$49/mo",
        tier2_features:
          "Multi-tenant isolation, automated backups, PostgreSQL & MongoDB, priority SLA",
        tier3_name: "Enterprise",
        tier3_price: "Contact Us",
        tier3_features:
          "Dedicated account manager, customized integration, 24/7 on-call engineering",
        buttonUrl: "/signup",
      },
      collapsed: false,
    });
  }

  // 8. FAQ Section (if requested or support domain)
  if (wantsFaq && availableTypeMap.has("faq")) {
    generatedBlocks.push({
      _id: generateUUID(),
      _type: "faq",
      data: {
        question: "How straightforward is onboarding?",
        answer:
          "You can be fully operational in less than 5 minutes using our single-command installation or pre-built Docker containers.",
      },
      collapsed: false,
    });
    generatedBlocks.push({
      _id: generateUUID(),
      _type: "faq",
      data: {
        question: "Can I customize the visual components and fields?",
        answer:
          "Yes, every component adheres to a typed JSON schema and can be freely adapted, extended, or restyled.",
      },
      collapsed: false,
    });
  }

  // 9. Call to Action (High-impact close)
  if (availableTypeMap.has("cta")) {
    generatedBlocks.push({
      _id: generateUUID(),
      _type: "cta",
      data: {
        title: "Start Building Something Extraordinary Today",
        description: "Join thousands of forward-thinking teams creating better web experiences.",
        primaryText: "Get Started Free",
        primaryUrl: "/signup",
        secondaryText: "Talk to an Architect",
        secondaryUrl: "/contact",
      },
      collapsed: false,
    });
  }

  // Fallback: If no blocks were added (e.g. strict custom types), generate a basic text block
  if (generatedBlocks.length === 0) {
    const fallbackType = safeType("text", availableTypes[0]?.type || "text");
    generatedBlocks.push({
      _id: generateUUID(),
      _type: fallbackType,
      data: {
        heading: "Generated Section",
        content: `Layout generated for: "${prompt}". You can add and configure modular blocks using the toolbar above.`,
      },
      collapsed: false,
    });
  }

  return generatedBlocks;
}
