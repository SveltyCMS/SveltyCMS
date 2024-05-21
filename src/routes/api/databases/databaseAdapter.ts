// Define DatabaseAdapter interface
export interface databaseAdapter {
	connect(): Promise<void>;
	getCollectionModels(): Promise<any>;
	setupAuthModels(): void;
	setupMediaModels(): void;
}
