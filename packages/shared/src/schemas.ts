import { z } from "zod";

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
  lead: "Lead",
  measured: "Measured",
  estimated: "Estimated",
  claim_filed: "Claim filed",
  approved: "Approved",
  materials_ordered: "Materials ordered",
  in_progress: "In progress",
  complete: "Complete",
  paid: "Paid",
};

export const JOB_TYPES = ["insurance", "retail", "commercial"] as const;
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

export const jobCreateSchema = z.object({
  customer: z.object({
    name: z.string().trim().min(2, "Enter the customer name").max(120),
    email: optionalEmail,
    phone: z.string().trim().max(30).optional(),
  }),
  property: z.object({
    line1: z.string().trim().min(3, "Enter the street address").max(200),
    city: z.string().trim().min(2, "Enter the city").max(100),
    state: z.string().trim().length(2, "Use the 2-letter state code").transform((s) => s.toUpperCase()),
    zip: z.string().trim().min(5, "Enter the ZIP code").max(10),
  }),
  type: z.enum(JOB_TYPES).default("insurance"),
  notes: z.string().trim().max(2000).optional(),
});
export type JobCreateInput = z.input<typeof jobCreateSchema>;

export const jobUpdateSchema = z.object({
  customer: jobCreateSchema.shape.customer.partial().optional(),
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

export const MEASUREMENT_PROVIDERS = ["mock"] as const; // add "eagleview", "hover", ... as adapters are built
export const measurementOrderSchema = z.object({
  provider: z.enum(MEASUREMENT_PROVIDERS).default("mock"),
});

// ---- API response shapes shared with the web app ----
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: import("./permissions").Role;
  company: { id: string; name: string };
}

export interface JobDTO {
  id: string;
  jobNumber: string;
  customer: { name: string; email?: string; phone?: string };
  property: { line1: string; city: string; state: string; zip: string };
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
  imageryDate?: string;
  facets: { id: string; areaSqFt: number; pitch: string }[];
  linear: { ridge: number; hip: number; valley: number; eave: number; rake: number };
  totals?: { areaSqFt: number; squares: number; wastePct: number };
  error?: string;
  createdAt: string;
}
