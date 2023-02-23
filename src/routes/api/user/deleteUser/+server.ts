import { json } from "@sveltejs/kit";
import type { RequestHandler } from "@sveltejs/kit";
import { auth } from "../../../../lib/server/lucia";

export const POST: RequestHandler = async ({request}) => {
  const { id } = (await request.formData()) as any;
  await auth.deleteUser(id);
  return json({message: "User deleted"});
}
