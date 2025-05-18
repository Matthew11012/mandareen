declare module 'next-pwa' {
  import { NextConfig } from 'next';
  import { PWAPluginOptions } from 'next-pwa';

  const withPWA: (options: PWAPluginOptions) => (nextConfig: NextConfig) => NextConfig;
  export default withPWA;
}
