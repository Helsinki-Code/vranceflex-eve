import type { NextConfig } from "next";
import { withEve } from "eve/next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: "/blog/b2b-lead-generation-guide",
        destination: "/resources/guides/b2b-icp",
        permanent: true,
      },
      {
        source: "/blog/founder-led-outbound",
        destination: "/solutions/founders",
        permanent: true,
      },
      {
        source: "/blog/cold-email-benchmarks-2026",
        destination: "/resources/guides/human-approved-outreach",
        permanent: true,
      },
      {
        source: "/blog/cold-email-reply-rate-benchmarks",
        destination: "/resources/guides/human-approved-outreach",
        permanent: true,
      },
      {
        source: "/blog/sdr-outbound-playbook",
        destination: "/resources/guides/human-approved-outreach",
        permanent: true,
      },
      {
        source: "/blog/linkedin-dm-outbound-playbook",
        destination: "/trust/responsible-outreach",
        permanent: true,
      },
      {
        source: "/blog/what-is-multi-channel-outreach",
        destination: "/resources/guides/byok-delivery",
        permanent: true,
      },
      {
        source: "/blog/:path*",
        destination: "/resources/guides",
        permanent: true,
      },
    ];
  },
};

export default withEve(nextConfig, {
  eveRoot: ".",
  eveBuildCommand: "npm run build:eve",
});
