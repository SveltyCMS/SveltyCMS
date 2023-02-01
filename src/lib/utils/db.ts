import mongoose from 'mongoose';
import { DB_HOST, DB_NAME, DB_PASSWORD, DB_USER } from '$env/static/private';
import type { Handle } from '@sveltejs/kit';

export const dbConnect: Handle = async ({ resolve, event }) => {
	// Turn off strict mode for query filters. Default in Mongodb 7
	mongoose.set('strictQuery', false);

	// use for mongodb Atalas
	// mongoose.connect(`mongodb+srv://${env.DB_USER}:${env.DB_PASSWORD}@${env.DB_HOST}/${env.DB_NAME}?retryWrites=true&w=majority`);

	// use for mongodb
	mongoose
		.connect(DB_HOST, {
			authSource: 'admin',
			user: DB_USER,
			pass: DB_PASSWORD,
			dbName: DB_NAME
		})
		.then((res) => {
			// console.log({dbRes: res})
		})
		.catch((err) => {
			console.log({ dbErr: err });
		});

	return await resolve(event);
};
