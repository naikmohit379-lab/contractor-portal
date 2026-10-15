# Operations workspace

The Operations Intern workspace is the authenticated `/dashboard` view for users with the `operations` role. It shows assigned jobs and operational queues for jobs with no uploaded files, claims awaiting follow-up, requested/viewed waivers, supplier orders in progress, and open follow-up tasks.

## Onboard an intern

1. An owner or admin opens **Team access** from the portal navigation.
2. Invite the intern by name and work email. RoofDesk emails a single-use setup link that expires after 48 hours. If the email provider is not configured, copy the link and share it securely with the intended recipient.
3. The intern accepts the invitation and sets a password of at least 10 characters, then signs in.
4. An owner, admin, or project manager opens a job and assigns the intern under **Operations assignment**.
5. The intern sees only jobs assigned to her. The API also checks assignment before allowing access to a job or its nested resources.

## Intern permissions

Operations Interns can view assigned job records and queues, create internal follow-up tasks for assigned jobs, and update tasks attached to those assigned jobs. They cannot edit job or claim details, create estimates or orders, request waivers, request or refund payments, view company reports, invite users, or change company settings. The existing app has no dedicated field-staff task scheduler; these tasks are internal follow-up records, not automated reminders.

Owners and admins can also invite a Project Manager from **Team access**. Project Managers can manage jobs and operational follow-ups and assign Operations Interns to jobs; they do not receive owner/admin permissions such as user management or company reports.

Owners, admins, and project managers see the company-wide operations queues and can create or update tasks. Job assignment changes are recorded in the audit log.

## Owner and admin workflow

Owners and admins can open **Admin Panel** from the portal navigation. It is a read-only company overview for jobs on file, claims awaiting follow-up, unsigned waivers, flagged payment records, late supplier orders, overdue follow-up tasks, jobs without uploaded files, active accounts, recently updated jobs, and recent audit activity. Queue cards link to the existing job, payment, supplier, team, and operations workspaces. The API requires `user:manage` and scopes every count and activity record to the signed-in company. It does not expose payment amounts, audit metadata, or controls for changing roles or financial records.

Use the Admin Panel as a triage entry point:

1. Review flagged and overdue queues, then open the linked work area and confirm the underlying record.
2. Open **Team access** to invite a Project Manager or Operations Intern. Each invitee sets their own password using the single-use link.
3. Assign approved jobs from the job workspace. The intern can then work assigned queues and create/update follow-up tasks.
4. Use **Settings** for personal notification email preferences and **Business overview** for the company reports the current role is allowed to access. Company policy controls and general user-role editing are not part of this panel yet.
5. Escalate payment decisions and legal waiver wording to an authorized owner/admin and counsel. The Admin Panel summarizes payment exceptions; it does not initiate or approve payments/refunds.

The dashboard treats a job as missing documents when it has no uploaded files of any kind. This is an initial operational signal, not a checklist that certifies claim-file completeness. Texas waiver forms remain generic templates until counsel supplies and approves all four Texas forms. Payment provider stays in mock mode for the first release, and live EagleView reports are unavailable until vendor API credentials are provisioned.
