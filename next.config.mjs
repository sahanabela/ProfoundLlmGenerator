/** @type {import('next').NextConfig} */
const nextConfig = {
  // ESLint is configured and clean (see .eslintrc.json / `npm run lint`), so
  // `next build` enforces it too rather than silently skipping it.
  serverExternalPackages: ['playwright', '@prisma/client'],
};

export default nextConfig;
