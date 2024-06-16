import type { AuthDBAdapter } from './authDBAdapter';
import type { User, Session, Token } from './types';

import crypto from 'crypto';
import { Sequelize, DataTypes, Model } from 'sequelize';
import { privateEnv } from '@root/config/private';

const sequelize = new Sequelize(
	`mariadb://${privateEnv.DB_USER}:${privateEnv.DB_PASSWORD}@${privateEnv.DB_HOST}:${privateEnv.DB_PORT}/${privateEnv.DB_NAME}`
);

class UserModel extends Model<User> implements User {
	public id!: string;
	public email!: string;
	public password?: string;
	public role!: string;
	public username?: string;
	public avatar?: string;
	public lastAuthMethod?: string;
	public lastActiveAt?: Date;
	public expiresAt?: Date;
	public is_registered?: boolean;
	public blocked?: boolean;
	public resetRequestedAt?: string;
	public resetToken?: string;
}

UserModel.init(
	{
		id: { type: DataTypes.STRING, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
		email: { type: DataTypes.STRING, allowNull: false },
		password: { type: DataTypes.STRING, allowNull: true },
		role: { type: DataTypes.STRING, allowNull: false },
		username: { type: DataTypes.STRING, allowNull: true },
		avatar: { type: DataTypes.STRING, allowNull: true },
		lastAuthMethod: { type: DataTypes.STRING, allowNull: true },
		lastActiveAt: { type: DataTypes.DATE, allowNull: true },
		expiresAt: { type: DataTypes.DATE, allowNull: true },
		is_registered: { type: DataTypes.BOOLEAN, allowNull: true },
		blocked: { type: DataTypes.BOOLEAN, allowNull: true },
		resetRequestedAt: { type: DataTypes.DATE, allowNull: true },
		resetToken: { type: DataTypes.STRING, allowNull: true }
	},
	{
		sequelize,
		tableName: 'users',
		timestamps: true,
		modelName: 'User'
	}
);

class SessionModel extends Model<Session> implements Session {
	public id!: string;
	public user_id!: string;
	public expires!: Date;
}

SessionModel.init(
	{
		id: { type: DataTypes.STRING, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
		user_id: { type: DataTypes.STRING, allowNull: false },
		expires: { type: DataTypes.DATE, allowNull: false }
	},
	{
		sequelize,
		tableName: 'sessions',
		timestamps: false,
		modelName: 'Session'
	}
);

class TokenModel extends Model<Token> implements Token {
	public id!: string;
	public user_id!: string;
	public token!: string;
	public email?: string;
	public expires!: Date;
}

TokenModel.init(
	{
		id: { type: DataTypes.STRING, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
		user_id: { type: DataTypes.STRING, allowNull: false },
		token: { type: DataTypes.STRING, allowNull: false },
		email: { type: DataTypes.STRING, allowNull: true },
		expires: { type: DataTypes.DATE, allowNull: false }
	},
	{
		sequelize,
		tableName: 'tokens',
		timestamps: true,
		modelName: 'Token'
	}
);

export class MariaDBAuthAdapter implements AuthDBAdapter {
	private sequelize: Sequelize;
	private UserModel: typeof UserModel;
	private SessionModel: typeof SessionModel;
	private TokenModel: typeof TokenModel;

	constructor() {
		this.sequelize = sequelize;
		this.UserModel = UserModel;
		this.SessionModel = SessionModel;
		this.TokenModel = TokenModel;
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
			id: crypto.randomUUID(),
			user_id: data.user_id,
			expires: new Date(Date.now() + data.expires)
		});
		return session.toJSON() as Session;
	}

	async destroySession(session_id: string): Promise<void> {
		await this.SessionModel.destroy({ where: { id: session_id } });
	}

	async validateSession(session_id: string): Promise<User | null> {
		const session = await this.SessionModel.findByPk(session_id);
		if (session && session.expires > new Date()) {
			const user = await this.UserModel.findByPk(session.user_id);
			return user ? (user.toJSON() as User) : null;
		}
		return null;
	}

	async invalidateAllUserSessions(user_id: string): Promise<void> {
		await this.SessionModel.destroy({ where: { user_id } });
	}

	async createToken(user_id: string, email: string, expires: number): Promise<string> {
		const tokenString = crypto.randomBytes(16).toString('hex');
		await this.TokenModel.create({
			id: crypto.randomUUID(),
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
