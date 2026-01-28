require('dotenv').config();
console.log('JWT_ACCESS_SECRET exists:', !!process.env.JWT_ACCESS_SECRET);
console.log('JWT_ACCESS_SECRET length:', process.env.JWT_ACCESS_SECRET?.length);
console.log('JWT_ACCESS_SECRET (first 20 chars):', process.env.JWT_ACCESS_SECRET?.substring(0, 20));
