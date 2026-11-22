import { v2 as cloudinary } from "cloudinary";

function configureCloudinary() {
  cloudinary.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

export async function generateUploadSignature({ publicId, folder, resourceType = "image" }) {
  configureCloudinary();
  const timestamp = Math.floor(Date.now() / 1000);
  const params = { public_id: publicId, timestamp };
  if (folder) params.folder = folder;
  const signature = await cloudinary.v2.utils.api_sign_request(params, process.env.CLOUDINARY_API_SECRET);
  return {
    ...params,
    publicId,
    folder,
    signature,
    resourceType,
    uploadUrl: `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`,
  };
}
