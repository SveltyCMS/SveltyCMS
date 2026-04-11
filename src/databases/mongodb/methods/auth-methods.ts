/**
 * @file src/databases/mongodb/methods/auth-methods.ts
 * @description Authentication model registration for the MongoDB adapter.
 * This class is responsible for idempotently registering auth-related Mongoose models.
 */

import { logger } from "@utils/logger";
import type Mongoose from "mongoose";
import { SessionSchema } from "../models/auth-session";
import { TokenSchema } from "../models/auth-token";
import { UserSchema } from "../models/auth-user";
import { createDatabaseError } from "./mongodb-utils";

/**
 * A dedicated class for registering authentication models with a Mongoose instance.
 * It uses Dependency Injection to allow for a testable, modular setup.
 */
export class MongoAuthModelRegistrar {
  private readonly connection: any;

  /**
   * Constructs the model registrar.
   * @param {any} connection - The Mongoose connection or instance to register models with.
   */
  constructor(connection: any) {
    this.connection = connection;
    logger.info("MongoAuthModelRegistrar initialized.");
  }

  /**
   * Registers authentication models (User, Token, Session).
   */
  async setupAuthModels(connection?: any): Promise<void> {
    const conn = connection || this.connection;
    try {
      this.registerModel(conn, "auth_users", UserSchema);
      this.registerModel(conn, "auth_sessions", SessionSchema);
      this.registerModel(conn, "auth_tokens", TokenSchema);

      // Run non-critical session UUID migration after registration
      this.migrateSessions(conn).catch((err) => {
        logger.debug("Session migration check completed", {
          error: err instanceof Error ? err.message : String(err),
        });
      });

      logger.info("Authentication models registered successfully.");
    } catch (error) {
      throw createDatabaseError(
        error,
        "AUTH_MODEL_SETUP_FAILED",
        "Failed to set up authentication models",
      );
    }
  }

  /**
   * A private helper that checks for a model's existence before registering it.
   */
  private registerModel(conn: any, name: string, schema: Mongoose.Schema): void {
    if (conn.models[name]) {
      logger.debug(`Model '${name}' already exists and was not re-registered`);
    } else {
      conn.model(name, schema);
      logger.debug(`Model '${name}' was registered`);
    }
  }

  /**
   * Migration: Remove old ObjectId-based sessions (from before the UUID migration).
   */
  private async migrateSessions(conn: any): Promise<void> {
    const SessionModel = conn.model("auth_sessions");
    const result = await SessionModel.deleteMany({
      $or: [
        { _id: { $type: "objectId" } }, // MongoDB ObjectId type
        { _id: { $regex: /^[0-9a-f]{24}$/ } }, // 24-char hex string (ObjectId format)
      ],
    });

    if (result.deletedCount && result.deletedCount > 0) {
      logger.info(
        `🔄 Migrated sessions: Removed ${result.deletedCount} old ObjectId-based sessions`,
      );
    }
  }
}
