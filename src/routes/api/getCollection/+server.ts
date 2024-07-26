import { error, json, redirect, type RequestHandler } from "@sveltejs/kit"

export const GET: RequestHandler = async ({ url,request }) => {
    const fileNameQuery = url.searchParams.get("fileName");
    if(!fileNameQuery) return error(500,"Query not found")
    var fileName = fileNameQuery.split("?")[0]
    var result = await import(/* @vite-ignore */ import.meta.env.collectionsFolderJS+fileName)
    let reqInit = {
        headers:{
            "Content-Type":"application/javascript"
        }
    };
    return json(result,{...reqInit});
}