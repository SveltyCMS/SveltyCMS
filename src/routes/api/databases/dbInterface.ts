// Define dbInterface
export interface dbInterface {
	// Database Connection and Setup Methods
	connect(): Promise<void>;
	getCollectionModels(): Promise<Record<string, any>>;
	setupAuthModels(): void;
	setupMediaModels(): void;

	// Additional Methods for Data Operations
	findOne(collection: string, query: object): Promise<any>;
	findMany(collection: string, query: object): Promise<any[]>;
	insertMany(collection: string, docs: object[]): Promise<any[]>;
	updateOne(collection: string, query: object, update: object): Promise<any>;
	updateMany(collection: string, query: object, update: object): Promise<any>;
	deleteOne(collection: string, query: object): Promise<number>;
	deleteMany(collection: string, query: object): Promise<number>;
	countDocuments(collection: string, query?: object): Promise<number>;

	// Methods for Draft and Revision Management
	generateId(): string;
	createDraft(content: any, originalDocumentId: string, userId: string): Promise<any>;
	updateDraft(draftId: string, content: any): Promise<any>;
	publishDraft(draftId: string): Promise<any>;
	getDraftsByUser(userId: string): Promise<any[]>;
	createRevision(documentId: string, content: any, userId: string): Promise<any>;
	getRevisions(documentId: string): Promise<any[]>;

	// Methods for Widget Management
	installWidget(widgetData: { name: string; isActive?: boolean }): Promise<void>;
	getAllWidgets(): Promise<any[]>;
	getActiveWidgets(): Promise<string[]>;
	activateWidget(widgetName: string): Promise<void>;
	deactivateWidget(widgetName: string): Promise<void>;
	updateWidget(widgetName: string, updateData: any): Promise<void>;

	// Method for Disconnecting
	disconnect(): Promise<void>;
}
// Define a generic Collection type to be used by database adapters
export interface CollectionModel {
	modelName: string;
	find(query: object): Promise<any[]>;
	updateOne(query: object, update: object): Promise<any>;
	updateMany(query: object, update: object): Promise<any>;
	insertMany(docs: object[]): Promise<any[]>;
	deleteOne(query: object): Promise<number>;
	deleteMany(query: object): Promise<number>;
	countDocuments(query?: object): Promise<number>;
}
