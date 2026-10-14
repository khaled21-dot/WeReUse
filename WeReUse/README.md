# WeReUse - Registration, Login, Authentication & Verification module

MERN stack (MongoDB, Express, React, Node.js). This module lets a student register with a university ID
card, log in securely, and be approved by an admin before the rest of the platform (listings, chat) unlocks.
Admins are a separate account type with their own database collection and a golden **Admin** badge.

![logo](client/public/logo.png)

---

## 2. What is included

| Area | What it does | Requirement |
|---|---|---|
| Registration | Name, email, password, **university registration number (required)**, optional department/batch, **ID card photo (required)** | FR1 |
| **E-mail verification** | Registration is two steps: the form, then a **6-digit code e-mailed** to the address. The account is created only after the code is entered. Codes expire (10 min), lock after 5 wrong tries, and can be resent once a minute | new |
| **One account per registration number** | `241-35-032`, `24135032` and `241/35/032` count as the SAME number. Checked against students and admins when registering, re-submitting, creating or promoting an admin, and enforced by a unique database index | new |
| **Profile editing** | Verified students and admins can change their name, department/batch (students), phone (admins), e-mail (confirmed with a code sent to the new address) and password. **The registration number and ID card photo cannot be changed** - the server refuses it | new |
| Pending state | New accounts are `pending`; they can log in and see their status, but protected features stay locked (`requireVerified` middleware) | FR2 |
| Admin queue | Filter by status, search, pagination, view the ID card, **approve** or **reject with a reason** | FR3 |
| Notifications | The student is notified in-app (bell icon, toast, and the dashboard updates by itself). Admins do not receive in-app notifications | FR4 |
| Resubmission | A rejected student uploads a new photo (and may fix the registration number) and returns to the queue | FR5 |
| Verified badge | `isVerifiedBadge` is derived from the status and shown on the student pass | FR6 |
| Separate admin accounts | Admins are stored in their own `admins` collection: name, email, phone, registration number, ID card photo, password hash, **golden `Admin` badge** | design v2 |
| Golden Admin badge | A gold badge with the text **Admin** appears in the navbar, the admin profile card and next to the reviewer's name in a student's review panel | design v2 |
| Create admins | An admin can create another admin (`POST /api/admin/admins`); admins can never sign up through the public form | design v2 |
| **Make any student an admin** | Any admin can promote any active student from the student's review panel. The student **moves** from `users` to `admins` (same id) and keeps their email, password and ID card; the promoting admin enters the new admin's phone number. Logged as `promote_to_admin` | design v3 |
| Login / logout / session | JWT in an **httpOnly cookie**, 7-day expiry, server re-checks the account on every request | NFR3 |
| Private ID storage | Files are stored outside any public folder and served only to the owner and admins | NFR4, NFR5 |
| Retention | The old ID image is deleted when a new one replaces it; a failed sign-up leaves no file behind | NFR13 |
| Audit trail | Every approve/reject is stored in `adminactionlogs` with the admin id, time and reason. **One admin has many log entries** (`adminId` refers to `admins`). Creating and promoting admins is logged too (`create_admin`, `promote_to_admin`) | auditability |

Not in this module (separate work): email-link verification and "forgot password", listings, chat, payments.

---
