import { v2 as cloudinary } from "cloudinary";
import { query } from "../db/index.js";
import ApiError from "../utils/apiError.js";
import asyncHandler from "../utils/asyncHandler.js";

const uploadBuffer = (buffer) => new Promise((resolve, reject) => {
  const stream = cloudinary.uploader.upload_stream({ folder: "commercex/products" }, (error, result) => error ? reject(error) : resolve(result));
  stream.end(buffer);
});

const uploadShopBuffer = (buffer, kind) => new Promise((resolve, reject) => {
  const stream = cloudinary.uploader.upload_stream(
    { folder: `commercex/shops/${kind}`, transformation: [{ quality: "auto", fetch_format: "auto" }] },
    (error, result) => error ? reject(error) : resolve(result),
  );
  stream.end(buffer);
});

const ownsProduct = async (productId, userId) => (await query(`SELECT p.id FROM products p JOIN seller_profiles s ON s.id=p.seller_id WHERE p.id=$1 AND s.user_id=$2`,[productId,userId])).rowCount>0;

export const addImage=asyncHandler(async(req,res)=>{if(!req.file)throw new ApiError(400,"Image is required.");if(!(await ownsProduct(req.body.product,req.user.id)))throw new ApiError(403,"Not your product.");const uploaded=await uploadBuffer(req.file.buffer);const primary=String(req.body.is_primary)==="true";if(primary)await query("UPDATE product_images SET is_primary=FALSE WHERE product_id=$1",[req.body.product]);const row=await query("INSERT INTO product_images(product_id,image,alt_text,is_primary) VALUES($1,$2,$3,$4) RETURNING *",[req.body.product,uploaded.secure_url,req.body.alt_text||"",primary]);res.status(201).json(row.rows[0]);});
export const updateImage=asyncHandler(async(req,res)=>{const found=await query(`SELECT pi.* FROM product_images pi JOIN products p ON p.id=pi.product_id JOIN seller_profiles s ON s.id=p.seller_id WHERE pi.id=$1 AND s.user_id=$2`,[req.params.id,req.user.id]);if(!found.rowCount)throw new ApiError(404,"Not found.");if(req.body.is_primary){await query("UPDATE product_images SET is_primary=FALSE WHERE product_id=$1",[found.rows[0].product_id]);}const row=await query("UPDATE product_images SET is_primary=COALESCE($1,is_primary),alt_text=COALESCE($2,alt_text) WHERE id=$3 RETURNING *",[req.body.is_primary,req.body.alt_text,req.params.id]);res.json(row.rows[0]);});
export const deleteImage=asyncHandler(async(req,res)=>{const row=await query(`DELETE FROM product_images WHERE id IN(SELECT pi.id FROM product_images pi JOIN products p ON p.id=pi.product_id JOIN seller_profiles s ON s.id=p.seller_id WHERE pi.id=$1 AND s.user_id=$2) RETURNING id`,[req.params.id,req.user.id]);if(!row.rowCount)throw new ApiError(404,"Not found.");res.status(204).send();});

export const uploadShopMedia=asyncHandler(async(req,res)=>{const kind=req.params.kind;if(!["logo","banner"].includes(kind))throw new ApiError(400,"Invalid image type.");if(!req.file)throw new ApiError(400,"Image is required.");const uploaded=await uploadShopBuffer(req.file.buffer,kind);const row=await query(`UPDATE seller_profiles SET ${kind}=$1,updated_at=NOW() WHERE user_id=$2 RETURNING *`,[uploaded.secure_url,req.user.id]);if(!row.rowCount)throw new ApiError(404,"Seller profile not found.");res.json({url:uploaded.secure_url,profile:row.rows[0]});});
