# WeReUse - Authentication, Profiles, Notifications, Categories, Messages, Ratings & Complaints


![logo](client/public/logo.png)

This part of WeReUse contains: **authentication, profile management, notifications, categories, messaging, ratings and the complaint box**. Listings are included as well, because every chat is about an item.

---

## 1. Getting started

```bash
npm run install:all                 # installs server + client packages
cp server/.env.example server/.env  # then set a long random JWT_SECRET (and SMTP_* to send real e-mails)
npm run seed:admin                  # creates the first admin (ADMIN_EMAIL / ADMIN_PASSWORD in server/.env)
npm run dev:server                  # API on http://localhost:5050
npm run dev:client                  # app on http://localhost:5173
```

MongoDB must be running locally (see `MONGODB_URI`). Tests: `npm run test:server` (needs MongoDB) and `npm run test:client`.

## 2. Authentication, profiles, notifications and categories

| Area | What it does | Requirement |
|---|---|---|
| Registration | Name, email, password, **university registration number (required)**, optional department/batch, **ID card photo (required)** | FR1 |
| **E-mail verification** | Registration is two steps: the form, then a **6-digit code e-mailed** to the address. The account is created only after the code is entered. Codes expire (10 min), lock after 5 wrong tries, and can be resent once a minute | new |
| **One account per registration number** | `241-35-032`, `24135032` and `241/35/032` count as the SAME number. Checked against students and admins when registering, re-submitting, creating or promoting an admin, and enforced by a unique database index | new |
| **Profile editing** | Verified students and admins can change their name, department/batch (students), phone (admins), e-mail (confirmed with a code sent to the new address) and password. **The registration number and ID card photo cannot be changed** - the server refuses it | new |
| Pending state | New accounts are `pending`; they can log in and see their status, but protected features stay locked (`requireVerified` middleware) | FR2 |
| Admin queue | Filter by status, search, pagination, view the ID card, **approve** or **reject with a reason** | FR3 |
| Notifications | The student is notified in-app (bell icon, toast, and the dashboard updates by itself). Admins do not receive in-app notifications | FR4 |
| Categories | Admins create, rename, enable / disable and delete categories (`/admin/categories`). Students see only active ones, and a category that is still used by items cannot be deleted | - |
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

---

## 3. Listings (what the chat is about)

| Area | What it does |
|---|---|
| **Post an item** | Verified students post items to **sell** (with a price), **exchange** or **donate**, with a category, condition, time used and 1-5 photos (`/listings/new`) |
| **Browse & search** | `/listings`: search, filter by category, condition, type and price, sort by newest or price. Items of disabled categories and blocked students are hidden |
| **My listings** | `/listings/mine`: edit, close, re-open or delete your items |

## 4. Messages

| Area | What it does |
|---|---|
| **Chat about an item** | "Message seller" on an item opens a private conversation between the buyer and the seller (one per item and buyer). Verified students only |
| **Inbox** | `/messages`: newest first, with the last message, unread counts and a badge on the Messages link |
| **Real time** | Socket.IO pushes new messages, offers, "Seen" and notifications instantly; without it, the screens refresh every few seconds |
| **Offers** | A price offer (items for sale) or an exchange offer (exchange items). The other side accepts or declines, the sender can withdraw; a new offer replaces a waiting one. After a deal the seller can mark the item as sold |
| **Safety** | Only the two students see the conversation, no e-mail or phone numbers are shown, and a deleted item leaves the chat read-only |

API: `GET|POST /api/conversations`, `GET /api/conversations/unread-count`, `GET /api/conversations/:id`, `GET|POST /api/conversations/:id/messages`, `PATCH /api/conversations/:id/messages/:messageId/offer`, `POST /api/conversations/:id/read`.

## 5. Complaint box

| Area | What it does |
|---|---|
| **Complaint box** | `/support`: any student (also unverified) can report a scam, a money problem or a system issue. Admins handle them at `/admin/complaints` (open → in review → resolved / closed) and can reply; the student is notified |

API: `POST /api/complaints`, `GET /api/complaints/mine`, admin: `GET /api/admin/complaints`, `PATCH /api/admin/complaints/:id`.

## 6. Profiles, rating & reporting students, moderation

| Area | What it does |
|---|---|
| **Public profiles** | `/users/:id`: name, photo, department, member since, star rating, items on offer and reviews. Click a student's name anywhere (item page, chat, reviews) to open it. Blocked or removed students are hidden from other students |
| **Rate a student** | On another student's profile: 1-5 stars and an optional comment. One rating per student, which can be changed or removed. The average and count appear on the profile and next to the student's items, with the latest reviews |
| **Report a student** | "Report user" on a profile (also "Report seller" on an item page): a reason and what happened. Only admins see it; one open report per pair. Students see their reports and the admins' answers on the Help page |
| **Admin report box** | `/admin/reports`: reports by status, who reported whom, and how often that student has been reported in total. Admins dismiss or mark reports handled, with a note to the reporter |
| **Block / remove** | Admins can **block a student temporarily** (1-365 days), **remove** them (permanent until restored) or **restore** the account. This works from the report box and the student's profile. The student is logged out at once and their items are hidden. At login they see the reason (and the end date for a block). Blocks end by themselves. Logged as `suspend_user` / `ban_user` / `restore_user` |

API: `GET /api/users/:id`, `GET /api/ratings/seller/:id`, `PUT|DELETE /api/users/:id/rating`, `POST /api/users/:id/report`, `GET /api/users/reports/mine`, admin: `GET /api/admin/reports`, `PATCH /api/admin/reports/:id`, `POST /api/admin/users/:id/moderate`.
