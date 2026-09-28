import "dotenv/config";
import { v2 as cloudinary } from "cloudinary";

if (process.env.ALLOW_CLOUDINARY_CLEANUP !== "YES") {
  throw new Error("Set ALLOW_CLOUDINARY_CLEANUP=YES before deleting CommerceX assets.");
}

const result = await cloudinary.api.delete_resources_by_prefix("media/", {
  resource_type: "image",
  type: "upload",
  invalidate: true,
});

const deleted = Object.values(result.deleted || {}).filter((value) => value === "deleted").length;
console.log(`Deleted ${deleted} old CommerceX Cloudinary resources from media/.`);
