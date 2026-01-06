# MariaDB Adapter for SveltyCMS

This directory contains the Drizzle ORM-based MariaDB adapter implementation.

## Structure

- `schema/` - Drizzle table definitions
- `methods/` - Modular method implementations (auth, content, media, system, crud)
- `migrations/` - Drizzle migrations (auto-generated)
- `mariadbAdapter.ts` - Main adapter class implementing IDBAdapter
- `utils.ts` - Helper functions (ID generation, date conversion, etc.)
- `seed.ts` - Database seeding functions

## Implementation Status

The adapter follows the same patterns as the MongoDB adapter but uses Drizzle ORM with mysql2 driver.

Key differences from MongoDB:
- Relational tables instead of document collections
- Drizzle ORM instead of Mongoose
- mysql2 connection pool instead of MongoDB driver
- SQL queries instead of MongoDB aggregation pipelines

All date fields are converted to/from ISODateString format at adapter boundaries to maintain type compatibility with the IDBAdapter interface.
