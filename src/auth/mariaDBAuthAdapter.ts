// Import the necessary types and crypto
import type { AuthDBAdapter } from './authDBAdapter';
import type { User, Session, Token } from './types';
import crypto from 'crypto';

// Import schemas from types.ts
import { UserSchema, SessionSchema, TokenSchema } from './types';

// Define a function to load Sequelize and the MariaDB connection
const loadSequelize = async () => {
	const { Sequelize, DataTypes, Model } = await import('sequelize');

	// Initialize Sequelize with your database connection
	const sequelize = new Sequelize('mariadb://user:pass@host:port/dbname');

	// Define the User model
	class UserModel extends Model<User, Optional<User, 'id'>> implements User {
		public id!: string;
		public email!: string;
		public password?: string;
		public role!: string;
		public username?: string;
		public avatar?: string;
		public lastAuthMethod?: 'password' | 'token';
		public lastActiveAt?: Date;
		public expiresAt?: Date;
		public is_registered?: boolean;
		public blocked?: boolean;
		public resetRequestedAt?: Date;
		public resetToken?: string;
	}

	UserModel.init(
		{
			...UserSchema,
			id: { type: DataTypes.STRING, primaryKey: true }
		},
		{
			sequelize,
			tableName: 'users',
			timestamps: true,
			modelName: 'User'
		}
	);

	// Define the Session model
	class SessionModel extends Model<Session, Optional<Session, 'id'>> implements Session {
		public id!: string;
		public user_id!: string;
		public expires!: Date;
	}

	SessionModel.init(
		{
			...SessionSchema,
			id: { type: DataTypes.STRING, primaryKey: true }
		},
		{
			sequelize,
			tableName: 'sessions',
			timestamps: false,
			modelName: 'Session'
		}
	);

	// Define the Token model
	class TokenModel extends Model<Token, Optional<Token, 'id'>> implements Token {
		public id!: string;
		public user_id!: string;
		public token!: string;
		public email?: string;
		public expires!: Date;
	}

	TokenModel.init(
		{
			...TokenSchema,
			id: { type: DataTypes.STRING, primaryKey: true }
		},
		{
			sequelize,
			tableName: 'tokens',
			timestamps: true,
			modelName: 'Token'
		}
	);

	return { sequelize, UserModel, SessionModel, TokenModel };
};

export class MariaDBAuthAdapter implements AuthDBAdapter {
	private sequelize: Sequelize;
	private UserModel: typeof Model;
	private SessionModel: typeof Model;
	private TokenModel: typeof Model;

	constructor() {
		if (process.env.DB_TYPE === 'mariadb') {
			(async () => {
				const { sequelize, UserModel, SessionModel, TokenModel } = await loadSequelize();
				this.sequelize = sequelize;
				this.UserModel = UserModel;
				this.SessionModel = SessionModel;
				this.TokenModel = TokenModel;
			})();
		}
	}

	async createUser(userData: Partial<User>): Promise<User> {
		const user = await this.UserModel.create(userData);
		return user.toJSON() as User;
	}

	async updateUserAttributes(user: User, attributes: Partial<User>): Promise<void> {
		await this.UserModel.update(attributes, { where: { id: user.id } });
	}

	async deleteUser(id: string): Promise<void> {
		await this.UserModel.destroy({ where: { id } });
	}

	async getUserById(id: string): Promise<User | null> {
		const user = await this.UserModel.findByPk(id);
		return user ? (user.toJSON() as User) : null;
	}

	async getUserByEmail(email: string): Promise<User | null> {
		const user = await this.UserModel.findOne({ where: { email } });
		return user ? (user.toJSON() as User) : null;
	}

	async getAllUsers(): Promise<User[]> {
		const users = await this.UserModel.findAll();
		return users.map((user) => user.toJSON() as User);
	}

	async getUserCount(): Promise<number> {
		return await this.UserModel.count();
	}

	async createSession(data: { user_id: string; expires: number }): Promise<Session> {
		const session = await this.SessionModel.create({
			user_id: data.user_id,
			expires: new Date(Date.now() + data.expires)
		});
		return session.toJSON() as Session;
	}

	async destroySession(session_id: string): Promise<void> {
		await this.SessionModel.destroy({ where: { id: session_id } });
	}

	async validateSession(session_id: string): Promise<User | null> {
		const session = await this.SessionModel.findByPk(session_id, { include: [this.UserModel] });
		if (session && session.expires > new Date()) {
			return session.user_id as any as User;
		}
		return null;
	}

	async invalidateAllUserSessions(user_id: string): Promise<void> {
		await this.SessionModel.destroy({ where: { user_id } });
	}

	async createToken(user_id: string, email: string, expires: number): Promise<string> {
		const tokenString = crypto.randomBytes(16).toString('hex');
		await this.TokenModel.create({
			user_id,
			token: tokenString,
			email,
			expires: new Date(Date.now() + expires)
		});
		return tokenString;
	}

	async validateToken(token: string, user_id: string): Promise<{ success: boolean; message: string }> {
		const tokenDoc = await this.TokenModel.findOne({ where: { token, user_id } });
		if (tokenDoc) {
			if (tokenDoc.expires > new Date()) {
				return { success: true, message: 'Token is valid' };
			} else {
				return { success: false, message: 'Token is expired' };
			}
		} else {
			return { success: false, message: 'Token does not exist' };
		}
	}

	async consumeToken(token: string, user_id: string): Promise<{ status: boolean; message: string }> {
		const tokenDoc = await this.TokenModel.findOne({ where: { token, user_id } });
		if (tokenDoc) {
			await tokenDoc.destroy();
			if (tokenDoc.expires > new Date()) {
				return { status: true, message: 'Token is valid' };
			} else {
				return { status: false, message: 'Token is expired' };
			}
		} else {
			return { status: false, message: 'Token does not exist' };
		}
	}

	async getAllTokens(): Promise<Token[]> {
		const tokens = await this.TokenModel.findAll();
		return tokens.map((token) => token.toJSON() as Token);
	}
}
