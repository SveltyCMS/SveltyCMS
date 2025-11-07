Token System for SveltyCMS

I plan to implement the new token system as described in issue [#276](https://github.com/SveltyCMS/SveltyCMS/issues/276).
The goal is to create a secure and extensible engine that allows editors to insert dynamic data easily, while keeping everything integrated cleanly with the existing SveltyCMS architecture.

The work will start with building the core `TokenService` in TypeScript, responsible for detecting and replacing `{{...}}` placeholders. It will support nested data access and a modular registry for discovering available tokens from collections, user data, system globals, and configuration. Permissions will be handled at the registry level to ensure tokens are filtered by user roles.

On the frontend, I’ll build a lightweight Svelte component for inserting tokens through a clean UI with search and grouping. Input widgets will gain a simple `token` option that enables the feature. This will make token usage smooth and consistent for content editors.

Next, I’ll extend the engine to support modifiers using the pipe syntax (`|`). Basic modifiers like `upper`, `lower`, `slugify`, `date(format)`, and `default(value)` will be included first. Later, I’ll add advanced options such as relational lookups and image-style transformations. The architecture will remain modular so developers can easily register their own tokens or modifiers in the future.

Caching and small performance optimizations will be added to make the system scale for large sites.
All code will follow existing CMS conventions, include full documentation, and be merged into the `next` branch once tested.

The full implementation is estimated to take around 2–3 weeks.
My fixed price for the complete project, including documentation and integration, is 500-1000$.

I have already starred the repository and will work on a dedicated feature branch before submitting the final pull request.
