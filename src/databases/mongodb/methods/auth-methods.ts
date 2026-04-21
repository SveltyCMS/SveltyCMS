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
    logger.debug("MongoAuthModelRegistrar initialized.");
  }

  // Registers authentication models (User, Token, Session).
  async setupAuthModels(connection?: any): Promise<void> {
    const conn = connection || this.connection;
    try {
      this.registerModel(conn, "auth_users", UserSchema);
      this.registerModel(conn, "auth_sessions", SessionSchema);
      this.registerModel(conn, "auth_tokens", TokenSchema);
    } catch (error) {
      throw createDatabaseError(
        error,
        "AUTH_MODEL_SETUP_FAILED",
        "Failed to set up authentication models",
      );
    }
  }

  // A private helper that checks for a model's existence before registering it.
  private registerModel(conn: any, name: string, schema: Mongoose.Schema): void {
    if (!conn.models[name]) {
      conn.model(name, schema);
    }
  }
}
