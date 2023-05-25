import mongoose from "mongoose";
import {
  DB_TYPE,
  DB_HOST_MONGO,
  DB_HOST_ATLAS,
  DB_NAME,
  DB_PASSWORD,
  DB_USER,
} from "$env/static/private";
import type { Handle } from "@sveltejs/kit";
import schemas from "$src/collections";
import { fieldsToSchema } from "$src/lib/utils/utils";

import { User } from "../models/user-model";

export const dbConnect: Handle = async ({ resolve, event }) => {
  try {
    // Turn off strict mode for query filters. Default in Mongodb 7
    mongoose.set("strictQuery", false);

    if (DB_TYPE === "mongodb") {
      // use for local mongodb
      await mongoose.connect(DB_HOST_MONGO, {
        authSource: "admin",
        user: DB_USER,
        pass: DB_PASSWORD,
        dbName: DB_NAME,
      });
    } else if (DB_TYPE === "atlas") {
      // use for mongodb Atlas
      await mongoose.connect(DB_HOST_ATLAS, {
        authSource: "admin",
        user: DB_USER,
        pass: DB_PASSWORD,
        dbName: DB_NAME,
      });
    } else {
      console.error("Error: database type not defined");
    }
  } catch (error) {
    console.error(error);
  }

  return await resolve(event);
};

const collections: { [Key: string]: mongoose.Model<any> } = {};

// iterates over an array of schemas and creates a new Mongoose schema and model for each on
// if collections is not empty
for (const schema of schemas) {
  const schema_object = new mongoose.Schema(
    { ...fieldsToSchema(schema.fields), createdAt: Number, updatedAt: Number },
    {
      typeKey: "$type",
      strict: schema.strict || false,
      timestamps: { currentTime: () => Date.now() },
    }
  );
  collections[schema.name] = mongoose.models[schema.name]
    ? mongoose.model(schema.name)
    : mongoose.model(schema.name, schema_object);
}

collections["user"] = User;
export { collections };



// import mongoose from "mongoose";
// import redis from 'redis';
// import {
//   DB_TYPE,
//   DB_HOST_MONGO,
//   DB_HOST_ATLAS,
//   DB_NAME,
//   DB_PASSWORD,
//   DB_USER,
//   USE_REDIS
// } from "$env/static/private";
// import type { Handle } from "@sveltejs/kit";
// import schemas from "$src/collections";
// import { fieldsToSchema } from "$src/lib/utils/utils";

// import { User } from "../models/user-model";

// let client;
// if (USE_REDIS === 'true') {
//   client = redis.createClient();
//   client.on('error', function (err) {
//     console.log('Error ' + err);
//   });
// }

// export const dbConnect: Handle = async ({ resolve, event }) => {
//   try {
//     // Turn off strict mode for query filters. Default in Mongodb 7
//     mongoose.set("strictQuery", false);

//     if (DB_TYPE === "mongodb") {
//       // use for local mongodb
//       await mongoose.connect(DB_HOST_MONGO, {
//         authSource: "admin",
//         user: DB_USER,
//         pass: DB_PASSWORD,
//         dbName: DB_NAME,
//       });
//     } else if (DB_TYPE === "atlas") {
//       // use for mongodb Atlas
//       await mongoose.connect(DB_HOST_ATLAS, {
//         authSource: "admin",
//         user: DB_USER,
//         pass: DB_PASSWORD,
//         dbName: DB_NAME,
//       });
//     } else {
//       console.error("Error: database type not defined");
//     }
//   } catch (error) {
//     console.error(error);
//   }

//   return await resolve(event);
// };

// const collections: { [Key: string]: mongoose.Model<any> } = {};

// // iterates over an array of schemas and creates a new Mongoose schema and model for each on
// // if collections is not empty
// for (const schema of schemas) {
//   const schema_object = new mongoose.Schema(
//     { ...fieldsToSchema(schema.fields), createdAt: Number, updatedAt: Number },
//     {
//       typeKey: "$type",
//       strict: schema.strict || false,
//       timestamps: { currentTime: () => Date.now() },
//     }
//   );
//   collections[schema.name] = mongoose.models[schema.name]
//     ? mongoose.model(schema.name)
//     : mongoose.model(schema.name, schema_object);
// }

// collections["user"] = User;
// export { collections };