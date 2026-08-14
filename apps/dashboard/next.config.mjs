import createMDX from "@next/mdx";
// Suppress Node.js DEP0108 warning from Google Analytics SDK zlib stream
const originalEmit = process.emit;
process.emit = function (name, data, ...args) {
  if (
    name === "warning" &&
    typeof data === "object" &&
    data?.name === "DeprecationWarning" &&
    data?.code === "DEP0108"
  ) {
    return false;
  }
  return originalEmit.apply(process, [name, data, ...args]);
};

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  allowedDevOrigins: ["app.sarviandg.local"],
  // Let `.mdx` files act as routes/pages alongside `.ts`/`.tsx`.
  pageExtensions: ["ts", "tsx", "js", "jsx", "md", "mdx"],
  experimental: {
    // Enables React's <ViewTransition> integration so route navigations animate
    // shared elements (the auth image/logo) across the home <-> login transition.
    viewTransition: true,
  },
  images: {
    // Hold optimized images (incl. rotating Instagram CDN thumbnails) for 6h so they
    // don't re-optimize on every revisit. Matches the server-side media cache window.
    minimumCacheTTL: 21600,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
      },
      {
        protocol: "https",
        hostname: "storage.googleapis.com",
      },
      {
        protocol: "https",
        hostname: "cdn.weatherapi.com",
      },
      // Instagram media (post images and video thumbnails) served via the Meta CDN.
      {
        protocol: "https",
        hostname: "**.cdninstagram.com",
      },
      {
        protocol: "https",
        hostname: "**.fbcdn.net",
      },
    ],
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },
  async redirects() {
    return [
      {
        source: "/dashboard",
        destination: "/dashboard/home",
        permanent: false,
      },
    ];
  },
};

const withMDX = createMDX({
  options: {
    // Plugins are passed as strings (not imports) so they're serializable for
    // Turbopack, the default bundler in Next 16.
    remarkPlugins: [
      // Parse `---` YAML frontmatter so it drives the nav instead of rendering as text.
      "remark-frontmatter",
    ],
    rehypePlugins: [
      // Shiki-based build-time syntax highlighting for fenced code blocks.
      [
        "rehype-pretty-code",
        { theme: "github-dark-default", keepBackground: true },
      ],
    ],
  },
});

export default withMDX(nextConfig);
