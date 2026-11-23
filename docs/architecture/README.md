# Architecture

Multi-tenant hierarchy:

`Organization -> Owner -> Businesses -> Admins and Employees`

Frontend uses ES Modules. Authentication and identity use Firebase Authentication,
operational data uses Cloud Firestore, file content uses Cloudinary, and sensitive
server operations use Vercel Functions under `api/`.
