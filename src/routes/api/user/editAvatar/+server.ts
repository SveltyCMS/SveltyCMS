import type { RequestHandler } from "@sveltejs/kit";
import { json } from "@sveltejs/kit";
import to from "await-to-js";
import { Buffer } from "buffer";
import { User } from "../../../../lib/models/user-model";
import sharp from 'sharp';

export const POST: RequestHandler = async ({ request, locals }) => {
  const formData = await request.formData();
  if (!formData.has("dataurl")) {
    return json({ message: "No file provided" }, {
      status: 400
    });
  }
  const { user } = await locals.validateUser();
  const dataUrl = formData.get("dataurl") as string;

  const parts = dataUrl.split(";");
  const mimType = parts[0].split(":")[1];
  const imageData = parts[1].split(",")[1];

  const buffer = Buffer.from(imageData, "base64");
  const [err, b64data] = await to(sharp(buffer).resize(200, 200).toBuffer());
  if (err) {
    return json({ message: "Could not resize image" }, {
      status: 500
    });
  }
  const resizedDataUrl = `data:${mimType};base64,${b64data.toString('base64')}`;

  await User.findOneAndUpdate({
    _id: user?.userId
  }, {
    avatar: resizedDataUrl
  });
  return json({ message: "Uploaded avatar successfully", resizedDataUrl }, {
    status: 200
  });
};
