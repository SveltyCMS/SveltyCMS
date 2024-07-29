import { json, type RequestHandler } from "@sveltejs/kit";
import { authAdapter, initializationPromise } from "@api/databases/db";

export const GET :RequestHandler = async({request,cookies,url})=>{
    await initializationPromise;
    if (!authAdapter) {
        throw new Error('Auth adapter is not initialized');
    }
    const permissionsData = await authAdapter.getAllPermissions();
    return json({
        permissionsData
    })
}