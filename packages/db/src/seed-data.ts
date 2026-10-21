/**
 * Starting configuration for ProSolution Outreach, taken from
 * ProSolution_Service_Profile.md and the Phase 2 decisions (21 Oct 2026).
 *
 * This is configuration only: no leads, no prices. Everything here can be
 * edited or disabled by an admin in the app afterwards; re-running the seed
 * never overwrites those edits.
 */

export const COMPANY_PROFILE = {
  companyName: "ProSolution Infotech",
  tagline: "Grow Your Business Digitally",
  description:
    "Digital solutions, web development and digital marketing agency in Surat. We help businesses improve their digital presence, create professional content, attract relevant audiences and grow through digital solutions. We work through our company and project-based collaborations; we are not an in-house team of the client's business.",
  city: "Surat",
  publicEmail: "prosolutionsw@gmail.com",
  publicPhone: "+91 8780301147",
  instagramHandle: "_pro.solutions_",
  website: null,
  qualificationNotes:
    "Use only legitimately available public information. Recommend services based on evidence. Never invent facts, never claim a business has a problem without evidence, and never criticise its current marketing. Do not quote prices unless an authorised user has approved them. Respect opt-outs and do-not-contact requests.",
  requireOnlinePresence: false,
};

export { DEFAULT_LEAD_RETENTION_DAYS as DEFAULT_RETENTION_DAYS } from "@prosolution/shared";

export interface SeedService {
  key: string;
  name: string;
  category: string;
  description: string;
  idealCustomer: string;
  keyBenefits: string[];
  restrictions?: string;
}

/** The 11 approved services. No prices (pricing policy, Service Profile §5). */
export const SERVICES: SeedService[] = [
  {
    key: "website",
    name: "Website design & development",
    category: "Website",
    description:
      "Business and corporate websites, landing pages, real estate websites and property listing systems, website redesign and UI/UX improvement, and website maintenance where agreed.",
    idealCustomer: "Startups, local businesses, real estate companies, retailers, manufacturers and service providers.",
    keyBenefits: ["Professional online presence", "Clear information for customers", "Enquiry-ready pages"],
  },
  {
    key: "ecommerce",
    name: "E-commerce development",
    category: "Website",
    description: "E-commerce websites for selling products online, including catalogue and product pages.",
    idealCustomer: "Product brands, jewellery, fashion, skincare and retail businesses that want to sell online.",
    keyBenefits: ["Sell products online", "Organised product catalogue"],
  },
  {
    key: "digital-marketing",
    name: "Digital marketing",
    category: "Marketing",
    description:
      "Digital marketing strategy, online brand positioning, campaign planning and campaign performance analysis.",
    idealCustomer: "Businesses seeking better online visibility, enquiries and customer acquisition.",
    keyBenefits: ["Planned campaigns", "Clear positioning", "Performance reviews"],
  },
  {
    key: "social-media",
    name: "Social media management",
    category: "Social & content",
    description:
      "Social media content planning, post and carousel creation, reels planning, captions and content calendars, profile improvement, and account management according to the agreed scope.",
    idealCustomer: "Cafés, restaurants, salons, fashion brands, jewellery businesses, startups and local businesses.",
    keyBenefits: ["Consistent posting", "Content calendar", "Improved profile"],
  },
  {
    key: "influencer",
    name: "Influencer marketing",
    category: "Social & content",
    description: "Influencer discovery and coordination, promotional collaboration planning and influencer-led content campaigns.",
    idealCustomer: "Consumer brands and local businesses that want reach through creators.",
    keyBenefits: ["Creator coordination", "Campaign planning"],
    restrictions: "Influencer availability, fees and deliverables depend on the campaign and must be confirmed separately.",
  },
  {
    key: "video",
    name: "Video shooting & editing",
    category: "Social & content",
    description:
      "Promotional videos, Instagram reels, product videos, business and brand videos, short-form marketing content, video editing and professional shoot coordination.",
    idealCustomer: "Cafés, restaurants, product brands, real estate businesses, fashion brands and service providers.",
    keyBenefits: ["Professional reels and videos", "Short-form content for social media"],
  },
  {
    key: "graphic-design",
    name: "Graphic design & branding",
    category: "Design",
    description:
      "Logo design, social media creatives, posters and promotional designs, brochures and catalogues, business presentations and brand identity creatives.",
    idealCustomer: "Startups, small businesses, established brands and event-based businesses.",
    keyBenefits: ["Consistent brand identity", "Ready-to-use creatives"],
  },
  {
    key: "google-business-profile",
    name: "Google Business Profile management",
    category: "Local visibility",
    description:
      "Profile setup where eligible, profile optimisation, business information updates, photo and post planning, and local visibility improvement support.",
    idealCustomer: "Local businesses that customers find through Google Search and Maps.",
    keyBenefits: ["Accurate business information", "Better local presence"],
  },
  {
    key: "meta-ads",
    name: "Meta advertising & lead generation",
    category: "Marketing",
    description:
      "Planning and managing Facebook and Instagram advertising and lead generation campaigns, where agreed, with campaign performance analysis.",
    idealCustomer: "Real estate, retail, fitness and service businesses that want enquiries from Facebook and Instagram.",
    keyBenefits: ["Targeted local campaigns", "Enquiry generation support"],
    restrictions: "Advertising budgets are separate from service fees and are agreed per campaign. No guaranteed results.",
  },
  {
    key: "ai-automation",
    name: "AI marketing automation",
    category: "AI & automation",
    description:
      "Website chatbot integration, business enquiry automation, AI-assisted content workflows, lead management and workflow automation, and custom AI solutions based on business requirements.",
    idealCustomer: "Businesses with regular enquiries that want faster responses and organised follow-up.",
    keyBenefits: ["Faster responses to enquiries", "Organised lead handling"],
    restrictions: "Features depend on technical feasibility, third-party platform permissions and the agreed project scope.",
  },
  {
    key: "model-shoot",
    name: "Model & product shoot coordination",
    category: "Social & content",
    description:
      "Model coordination for suitable shoots, product photography and video coordination, promotional shoot planning, and creative direction and content production coordination.",
    idealCustomer: "Fashion, jewellery, skincare, cosmetics and product brands.",
    keyBenefits: ["Planned professional shoots", "Product and model content"],
    restrictions: "Availability, shoot requirements and production costs must be confirmed for each project.",
  },
];

export interface SeedIndustry {
  name: string;
  description?: string;
  /** Keys from SERVICES: starting suggestions, not rules (Service Profile §4). */
  services: string[];
}

/** The approved merged list of 16 distinct industries. */
export const INDUSTRIES: SeedIndustry[] = [
  { name: "Cafés & restaurants", services: ["video", "social-media", "model-shoot", "google-business-profile", "digital-marketing"] },
  { name: "Real estate & property developers", services: ["website", "meta-ads", "digital-marketing", "video", "ai-automation"] },
  { name: "Salons & spas", services: ["social-media", "video", "graphic-design", "google-business-profile", "meta-ads"] },
  { name: "Skincare & beauty businesses", services: ["social-media", "model-shoot", "influencer", "ecommerce", "meta-ads"] },
  { name: "Makeup & cosmetics businesses", services: ["social-media", "model-shoot", "influencer", "ecommerce", "video"] },
  { name: "Clothing & fashion businesses", services: ["model-shoot", "social-media", "ecommerce", "influencer", "meta-ads"] },
  { name: "Jewellery businesses", services: ["model-shoot", "video", "ecommerce", "social-media", "digital-marketing"] },
  { name: "Retail businesses", services: ["google-business-profile", "social-media", "meta-ads", "graphic-design"] },
  { name: "E-commerce businesses", services: ["ecommerce", "meta-ads", "model-shoot", "digital-marketing", "ai-automation"] },
  { name: "Gyms & fitness businesses", services: ["video", "social-media", "meta-ads", "google-business-profile"] },
  { name: "Hotels & hospitality", services: ["website", "video", "google-business-profile", "social-media", "digital-marketing"] },
  { name: "Event organisers & Ganpati mandals", services: ["video", "social-media", "graphic-design", "influencer"] },
  {
    name: "Influencers & models",
    description:
      "Usually individuals rather than businesses: store only contact details they publish for business enquiries (DPDP Act).",
    services: ["video", "graphic-design", "website"],
  },
  { name: "Manufacturers & distributors", services: ["website", "graphic-design", "digital-marketing", "ai-automation"] },
  { name: "Startups & small businesses", services: ["website", "graphic-design", "social-media", "digital-marketing"] },
  { name: "Local service providers", services: ["google-business-profile", "website", "social-media", "meta-ads"] },
];

export const CITIES = [
  {
    name: "Surat",
    state: "Gujarat",
    areas: ["Vesu", "Adajan", "City Light", "Piplod", "Pal", "Dumas", "Varachha", "Katargam", "Udhna", "Athwa", "Althan", "VIP Road"],
  },
];
