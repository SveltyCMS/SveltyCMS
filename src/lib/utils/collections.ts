import mongoose from 'mongoose';

const collectionSchema = new mongoose.Schema({
	// Define your collection's fields and data types here
});

const Collection = mongoose.model('Collection', collectionSchema);

// Create
export const createCollection = async (data) => {
	try {
		const newCollection = new Collection(data);
		await newCollection.save();
		return newCollection;
	} catch (error) {
		console.error(error);
		throw error;
	}
};

// Read
export const getCollection = async (id) => {
	try {
		const collection = await Collection.findById(id);
		return collection;
	} catch (error) {
		console.error(error);
		throw error;
	}
};

export const getCollections = async () => {
	try {
		const collections = await Collection.find();
		return collections;
	} catch (error) {
		console.error(error);
		throw error;
	}
};

// Update
export const updateCollection = async (id, data) => {
	try {
		const updatedCollection = await Collection.findByIdAndUpdate(id, data, { new: true });
		return updatedCollection;
	} catch (error) {
		console.error(error);
		throw error;
	}
};

// Delete
export const deleteCollection = async (id) => {
	try {
		const deletedCollection = await Collection.findByIdAndDelete(id);
		return deletedCollection;
	} catch (error) {
		console.error(error);
		throw error;
	}
};
