import "dotenv/config";
import { v2 as cloudinary } from "cloudinary";
import { query } from "../src/db/index.js";

const media = {
  "dhaka-essentials": ["https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=600", "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=1600"],
  "urban-thread": ["https://images.unsplash.com/photo-1445205170230-053b83016050?w=600", "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=1600"],
  "green-basket": ["https://images.unsplash.com/photo-1542838132-92c53300491e?w=600", "https://images.unsplash.com/photo-1542838132-92c53300491e?w=1600"],
  "tech-harbor": ["https://images.unsplash.com/photo-1498049794561-7780e7231661?w=600", "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1600"],
  "crafted-home": ["https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=600", "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=1600"],
  "mira-crafts": ["https://images.unsplash.com/photo-1452860606245-08befc0ff44b?w=600", "https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?w=1600"],
};

for (const [slug, [logoSource, bannerSource]] of Object.entries(media)) {
  const logo = await cloudinary.uploader.upload(logoSource, { public_id: `commercex/shops/logo/${slug}`, overwrite: true, transformation: [{ width: 600, height: 600, crop: "fill", quality: "auto", fetch_format: "auto" }] });
  const banner = await cloudinary.uploader.upload(bannerSource, { public_id: `commercex/shops/banner/${slug}`, overwrite: true, transformation: [{ width: 1600, height: 520, crop: "fill", quality: "auto", fetch_format: "auto" }] });
  await query("UPDATE seller_profiles SET logo=$1,banner=$2,updated_at=NOW() WHERE slug=$3", [logo.secure_url, banner.secure_url, slug]);
  console.log(`Added shop media for ${slug}`);
}

process.exit(0);
