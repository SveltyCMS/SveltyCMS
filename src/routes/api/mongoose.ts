import mongoose, { Schema } from 'mongoose';

// Define the revision schema
const RevisionSchema = new mongoose.Schema(
  {
    revisionNumber: { type: Number, default: 0 },
    editedAt: { type: Date, default: Date.now },
    editedBy: { type: String, default: 'System' },
    changes: { type: Object, default: {} }
  },
  { _id: false }
);

// Define the base schema with revisions
const BaseSchema = new mongoose.Schema(
  {
    createdAt: Date,
    updatedAt: Date,
    createdBy: String,
    __v: [RevisionSchema], // versionKey
    translationStatus: {}
  },
  {
    typeKey: '$type',
    strict: false,
    timestamps: true // Use the default Mongoose timestamp
  }
);

// Define the media schemas
const mediaSchemas = {
  images: new mongoose.Schema({}, { typeKey: '$type', strict: false, timestamps: true }),
  documents: new mongoose.Schema({}, { typeKey: '$type', strict: false, timestamps: true }),
  audio: new mongoose.Schema({}, { typeKey: '$type', strict: false, timestamps: true }),
  videos: new mongoose.Schema({}, { typeKey: '$type', strict: false, timestamps: true }),
  remote: new mongoose.Schema({}, { typeKey: '$type', strict: false, timestamps: true })
};

// Define a function to create collection schemas
export function createCollectionSchema(fields: any[]) {
  const schema = new mongoose.Schema(
    fields.reduce((acc, field) => {
      acc[field.name] = field.type;
      return acc;
    }, { ...BaseSchema.obj })
  );

  return schema;
}

// Create and export collection models
export const collectionModels: { [key: string]: mongoose.Model<any> } = {};

export async function getCollectionModels(collections: any[]) {
  for (const collection of collections) {
    if (!collection.name) continue;

    const schema = createCollectionSchema(collection.fields);
    collectionModels[collection.name] =
      mongoose.models[collection.name] ||
      mongoose.model(collection.name, schema);
  }
}

// Set up authentication collections if they don't already exist
if (!mongoose.models['auth_tokens']) {
  mongoose.model('auth_tokens', new mongoose.Schema({}, { strict: false }));
}
if (!mongoose.models['auth_users']) {
  mongoose.model('auth_users', new mongoose.Schema({}, { strict: false }));
}
if (!mongoose.models['auth_sessions']) {
  mongoose.model('auth_sessions', new mongoose.Schema({}, { strict: false }));
}

// Set up media collections if they don't already exist
if (!mongoose.models['media_images']) {
  mongoose.model('media_images', mediaSchemas.images);
}
if (!mongoose.models['media_documents']) {
  mongoose.model('media_documents', mediaSchemas.documents);
}
if (!mongoose.models['media_audio']) {
  mongoose.model('media_audio', mediaSchemas.audio);
}
if (!mongoose.models['media_videos']) {
  mongoose.model('media_videos', mediaSchemas.videos);
}
if (!mongoose.models['media_remote']) {
  mongoose.model('media_remote', mediaSchemas.remote);
}