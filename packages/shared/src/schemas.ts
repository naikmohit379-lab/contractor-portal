import { z } from "zod";
import { MARKET_COUNTRIES } from "./market";

export const JOB_STAGES = [
  "lead",
  "measured",
  "estimated",
  "claim_filed",
  "approved",
  "materials_ordered",
  "in_progress",
  "complete",
  "paid",
] as const;
export type JobStage = (typeof JOB_STAGES)[number];

export const STAGE_LABELS: Record<JobStage, string> = {
  lead: "Enquiry",
  measured: "Measured",
  estimated: "Estimate prepared",
  claim_filed: "Quotation sent",
  approved: "Work approved",
  materials_ordered: "Materials ordered",
  in_progress: "In progress",
  complete: "Complete",
  paid: "Paid",
};

export const jobStageLabelsSchema = z.object({
  lead: z.string().trim().min(1).max(40),
  measured: z.string().trim().min(1).max(40),
  estimated: z.string().trim().min(1).max(40),
  claim_filed: z.string().trim().min(1).max(40),
  approved: z.string().trim().min(1).max(40),
  materials_ordered: z.string().trim().min(1).max(40),
  in_progress: z.string().trim().min(1).max(40),
  complete: z.string().trim().min(1).max(40),
  paid: z.string().trim().min(1).max(40),
});
export type JobStageLabels = z.infer<typeof jobStageLabelsSchema>;

/** Job types offered for Indian roofing work. Legacy U.S. types remain readable in stored records. */
export const JOB_TYPES = ["residential", "commercial", "repair"] as const;
export const LEGACY_JOB_TYPES = ["insurance", "retail"] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const MEASUREMENT_STATUSES = ["ordered", "processing", "delivered", "failed"] as const;
export type MeasurementStatus = (typeof MEASUREMENT_STATUSES)[number];

const email = z.string().trim().toLowerCase().email("Enter a valid email address");

export const registerSchema = z.object({
  companyName: z.string().trim().min(2, "Enter your company name").max(120),
  name: z.string().trim().min(2, "Enter your name").max(100),
  email,
  password: z.string().min(10, "Use at least 10 characters").max(128),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password"),
});
export type LoginInput = z.infer<typeof loginSchema>;

const optionalEmail = z.union([email, z.literal("")]).optional();
const coordinatesSchema = z.object({ lat: z.number().finite().min(-90).max(90), lng: z.number().finite().min(-180).max(180) });

const propertyAddressSchema = z.object({
  line1: z.string().trim().min(3, "Enter the street address").max(200),
  line2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(2, "Enter the city, town, or locality").max(100),
  locality: z.string().trim().max(100).optional(),
  district: z.string().trim().max(100).optional(),
  state: z.string().trim().min(2, "Enter the state or Union Territory").max(100),
  zip: z.string().trim().max(10).optional(),
  pinCode: z.string().trim().optional(),
  landmark: z.string().trim().max(200).optional(),
  coordinates: coordinatesSchema.optional(),
  country: z.enum(MARKET_COUNTRIES).optional(),
}).superRefine((address, ctx) => {
  const country = address.country ?? "IN";
  if (country === "IN") {
    if (!address.district?.trim()) ctx.addIssue({ code: "custom", path: ["district"], message: "Enter the district" });
    if (!address.pinCode || !/^[1-9][0-9]{5}$/.test(address.pinCode)) {
      ctx.addIssue({ code: "custom", path: ["pinCode"], message: "Enter a valid 6-digit PIN code" });
    }
  } else {
    ctx.addIssue({ code: "custom", path: ["country"], message: "RoofDesk currently accepts Indian property addresses only" });
  }
}).transform((address) => ({ ...address, country: "IN" as const }));

export const jobCreateSchema = z.object({
  customer: z.object({
    name: z.string().trim().min(2, "Enter the customer name").max(120),
    email: optionalEmail,
    phone: z.string().trim().max(30).optional(),
  }),
  property: propertyAddressSchema,
  type: z.enum(JOB_TYPES).default("residential"),
  notes: z.string().trim().max(2000).optional(),
});
export type JobCreateInput = z.input<typeof jobCreateSchema>;

export const jobUpdateSchema = z.object({
  customer: jobCreateSchema.shape.customer.partial().optional(),
  property: z.object({ coordinates: coordinatesSchema.optional() }).optional(),
  type: z.enum(JOB_TYPES).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const jobStageSchema = z.object({ stage: z.enum(JOB_STAGES) });

export const jobListQuerySchema = z.object({
  stage: z.enum(JOB_STAGES).optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

export const MEASUREMENT_PROVIDERS = ["mock", "roofv"] as const;
export const measurementOrderSchema = z.object({
  provider: z.enum(MEASUREMENT_PROVIDERS).default("mock"),
  pitch: z.number().finite().min(0).max(24).optional(),
  building: z.number().int().min(1).max(4).optional(),
  roofvConsent: z.boolean().optional(),
});

export const manualMeasurementSchema = z.object({
  measurementSystem: z.enum(["metric", "imperial"]),
  facets: z.array(z.object({
    id: z.string().trim().min(1).max(20),
    area: z.number().finite().positive().max(1_000_000),
    pitch: z.string().trim().min(1).max(20),
  })).min(1).max(80),
  linear: z.object({
    ridge: z.number().finite().min(0).max(1_000_000),
    hip: z.number().finite().min(0).max(1_000_000),
    valley: z.number().finite().min(0).max(1_000_000),
    eave: z.number().finite().min(0).max(1_000_000),
    rake: z.number().finite().min(0).max(1_000_000),
  }),
  wastePct: z.number().finite().min(0).max(100),
  imageryDate: z.string().date().optional(),
  sourceNote: z.string().trim().max(300).optional(),
});

// ---- API response shapes shared with the web app ----
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: import("./permissions").Role;
  company: { id: string; name: string; settings?: import("./market").CompanyMarketSettings };
}

export interface JobDTO {
  id: string;
  jobNumber: string;
  customer: { name: string; email?: string; phone?: string };
  property: {
    line1: string; line2?: string; city: string; locality?: string; district?: string;
    state: string; zip?: string; pinCode?: string; landmark?: string;
    coordinates?: { lat: number; lng: number }; country?: (typeof MARKET_COUNTRIES)[number];
  };
  type: JobType;
  stage: JobStage;
  assigneeIds?: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MeasurementDTO {
  id: string;
  jobId: string;
  provider: string;
  status: MeasurementStatus;
  preliminary?: boolean;
  reviewStatus?: string;
  imageryDate?: string;
  facets: { id: string; areaSqFt: number; pitch: string }[];
  linear: { ridge: number; hip: number; valley: number; eave: number; rake: number };
  totals?: { areaSqFt: number; squares: number; wastePct: number };
  error?: string;
  sourceNote?: string;
  createdAt: string;
}
