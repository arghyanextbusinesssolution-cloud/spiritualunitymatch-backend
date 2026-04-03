import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dxx54fccl',
  api_key: process.env.CLOUDINARY_API_KEY || '149937643231624',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'whOZPJleA7xJeu_R8kckqq3Lprc'
});

export default cloudinary;