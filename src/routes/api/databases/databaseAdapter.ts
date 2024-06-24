// Define DatabaseAdapter interface
export interface DatabaseAdapter {
	// Database Connection and Setup Methods
	connect(): Promise<void>;
	getCollectionModels(): Promise<Record<string, any>>;
	setupAuthModels(): void;
	setupMediaModels(): void;

	// Additional Methods for Data Operations
	findOne(collection: string, query: object): Promise<any>;
	insertMany(collection: string, docs: object[]): Promise<any[]>;
}
