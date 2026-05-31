/**
 * @fileoverview Next.js configuration file with transpile settings for workspace packages
 * @module @my-agent/web/next.config
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@my-agent/core', '@my-agent/shared'],
}

export default nextConfig
