export type IntegrationStatus = {
  id: string;
  name: string;
  description: string;
  configured: boolean;
  required: boolean;
};

function configured(name: string) {
  return Boolean(process.env[name]?.trim());
}

export function getIntegrationStatuses(): IntegrationStatus[] {
  return [
    {
      id: "parallel",
      name: "Parallel",
      description: "Lead research, discovery and evidence-backed enrichment",
      configured: configured("PARALLEL_API_KEY"),
      required: true,
    },
    {
      id: "ai",
      name: "AI model gateway",
      description: "Eve orchestrator and specialist model access",
      configured: configured("AI_GATEWAY_API_KEY") || configured("VERCEL_OIDC_TOKEN"),
      required: true,
    },
    {
      id: "email",
      name: "Resend email (platform account)",
      description: "Authentication OTPs and team-invite email only. Outreach email uses each client's own connected Resend account below.",
      configured:
        configured("RESEND_API_KEY") &&
        configured("RESEND_FROM_EMAIL"),
      required: true,
    },
    {
      id: "database",
      name: "PostgreSQL",
      description: "Durable organization, campaign, approval and audit data",
      configured: configured("DATABASE_URL"),
      required: true,
    },
    {
      id: "billing",
      name: "Stripe billing",
      description: "Paid workspace subscriptions and verified-prospect credit top-ups",
      configured:
        configured("STRIPE_SECRET_KEY") &&
        configured("STRIPE_WEBHOOK_SECRET") &&
        configured("STRIPE_PRICE_ID_LAUNCH_MONTHLY") &&
        configured("STRIPE_PRICE_ID_LAUNCH_YEARLY") &&
        (configured("STRIPE_PRICE_ID_GROWTH_MONTHLY") || configured("STRIPE_PRICE_ID_PRO")) &&
        configured("STRIPE_PRICE_ID_GROWTH_YEARLY") &&
        configured("STRIPE_PRICE_ID_TOPUP_100") &&
        configured("STRIPE_PRICE_ID_TOPUP_500") &&
        configured("STRIPE_PRICE_ID_TOPUP_2000"),
      required: true,
    },
    {
      id: "storage",
      name: "File storage",
      description: "CSV imports, exports and generated campaign reports",
      configured: configured("STORAGE_BUCKET"),
      required: false,
    },
    {
      id: "monitoring",
      name: "Error monitoring",
      description: "Production exceptions, provider failures and job alerts",
      configured: configured("ERROR_MONITORING_DSN"),
      required: true,
    },
    {
      id: "analytics",
      name: "Product analytics",
      description: "Privacy-aware onboarding and campaign funnel analytics",
      configured: configured("NEXT_PUBLIC_ANALYTICS_KEY"),
      required: false,
    },
  ];
}
