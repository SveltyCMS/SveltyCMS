import { json } from "@sveltejs/kit";
import type { RequestHandler } from "@sveltejs/kit";
import _ from "lodash";
import { auth } from "../../../../lib/server/lucia";

export const POST: RequestHandler = async ({request}) => {
  const j = await request.json();
  const userObj = _.omit(j, 'id');
  const id = j.id;

  await auth.updateUserAttributes(id, userObj);
  return json({ message: 'User Edited' }, {
    status: 200
  });
}
