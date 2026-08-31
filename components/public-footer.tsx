import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { BrandLockup } from "@/components/brand/vranceflex-logo";

const groups = [
  {
    title: "Product",
    links: [
      ["Product", "/product"],
      ["Lead verification", "/product/lead-verification"],
      ["Human approval", "/product/human-approval"],
      ["Recurring schedules", "/product/recurring-schedules"],
      ["Pricing", "/pricing"],
    ],
  },
  {
    title: "Integrations",
    links: [
      ["Parallel", "/integrations/parallel"],
      ["Resend", "/integrations/resend"],
      ["Twilio", "/integrations/twilio"],
    ],
  },
  {
    title: "Resources",
    links: [
      ["Guided demo", "/demo"],
      ["Guides", "/resources/guides"],
      ["Glossary", "/resources/glossary"],
      ["Security", "/security"],
      ["Contact", "/contact"],
    ],
  },
  {
    title: "Legal",
    links: [
      ["Privacy", "/privacy"],
      ["Terms", "/terms"],
      ["Responsible outreach", "/trust/responsible-outreach"],
    ],
  },
] as const;

export function PublicFooter() {
  return (
    <footer className="public-footer">
      <div className="public-footer-inner">
        <div className="public-footer-brand">
          <Link href="/" aria-label="VranceFlex home"><BrandLockup /></Link>
          <p>Agent-led B2B research and approved outreach, delivered through providers you own.</p>
          <Link className="public-footer-cta" href="/sign-up">Start a campaign <ArrowUpRight size={15} /></Link>
        </div>
        <div className="public-footer-links">
          {groups.map((group) => (
            <div key={group.title}>
              <h2>{group.title}</h2>
              <ul>
                {group.links.map(([label, href]) => <li key={href}><Link href={href}>{label}</Link></li>)}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="public-footer-bottom">
        <span>© {new Date().getFullYear()} VranceFlex</span>
        <span>Research first. Approve every send.</span>
      </div>
    </footer>
  );
}
