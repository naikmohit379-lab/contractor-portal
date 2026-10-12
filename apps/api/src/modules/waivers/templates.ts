import { WAIVER_TYPES, WAIVER_TYPE_LABELS, type WaiverType } from "@roofdesk/shared";
import { WaiverTemplate } from "../../models/WaiverTemplate";

/**
 * Generic starter wording. It is NOT a statutory form: several states require specific forms,
 * so every template stays unapproved until the company's counsel has reviewed it.
 */
const COMMON_HEADER = `Project: {{propertyAddress}} (Job {{jobNumber}})
Owner: {{ownerName}}
Contractor: {{companyName}}
Claimant: {{partyName}}
Through date: {{throughDate}}
Payment amount: {{amount}}
`;

const DEFAULT_BODIES: Record<WaiverType, string> = {
  conditional_progress: `${COMMON_HEADER}
This waiver is conditional on the Claimant actually receiving payment of {{amount}}. When that payment is received, the Claimant waives and releases lien rights for labor, services, equipment or materials furnished to the project through {{throughDate}}.
This waiver does not cover retention, unpaid change orders, or amounts furnished after the through date. The Claimant confirms they have authority to sign for the company named above.`,
  unconditional_progress: `${COMMON_HEADER}
The Claimant acknowledges receipt of payment of {{amount}} and waives and releases lien rights for labor, services, equipment or materials furnished to the project through {{throughDate}}.
This waiver does not cover retention, unpaid change orders, or amounts furnished after the through date. The Claimant confirms they have authority to sign for the company named above.`,
  conditional_final: `${COMMON_HEADER}
This waiver is conditional on the Claimant actually receiving final payment of {{amount}}. When that payment is received, the Claimant waives and releases all lien rights for all labor, services, equipment and materials furnished to the project.
The Claimant confirms they have authority to sign for the company named above.`,
  unconditional_final: `${COMMON_HEADER}
The Claimant acknowledges receipt of final payment of {{amount}} and waives and releases all lien rights for all labor, services, equipment and materials furnished to the project.
The Claimant confirms they have authority to sign for the company named above.`,
};

/** Makes sure the company has an active version-1 template for each waiver type. */
export async function ensureTemplates() {
  const existing = await WaiverTemplate.find({ active: true, state: "*" });
  const have = new Set(existing.map((t) => t.type));
  const missing = WAIVER_TYPES.filter((t) => !have.has(t));
  if (missing.length) {
    await WaiverTemplate.insertMany(missing.map((type) => ({ type, version: 1, body: DEFAULT_BODIES[type] })));
  }
  return WaiverTemplate.find({ active: true, state: "*" });
}

export const waiverTitle = (type: WaiverType) => WAIVER_TYPE_LABELS[type];

export function renderTemplate(body: string, values: Record<string, string>) {
  return body.replace(/\{\{(\w+)\}\}/g, (_m, key) => values[key] ?? `{{${key}}}`);
}
