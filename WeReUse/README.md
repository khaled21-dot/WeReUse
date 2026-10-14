# WeReUse - Registration, Login, Authentication & Verification module

MERN stack (MongoDB, Express, React, Node.js). This module lets a student register with a university ID
card, log in securely, and be approved by an admin before the rest of the platform (listings, chat) unlocks.
Admins are a separate account type with their own database collection and a golden **Admin** badge.

![logo](client/public/logo.png)

---

## 1. Quick start (Mac)

**Prerequisites:** Node.js 18 or newer (`node -v`) and MongoDB running (you already have it):

```bash
brew services list            # mongodb-community@7.0 must say "started"
brew services start mongodb-community@7.0    # only if it is not started
```

**Install and run** (from this folder):

```bash
npm run install:all           # installs server + client (about 1 minute; re-run it after an update that adds packages)
npm run seed:admin            # creates the admin account (safe to run again)

# Terminal 1 - API on http://localhost:5050
npm run dev:server

# Terminal 2 - website on http://localhost:5173
npm run dev:client
```

Open **http://localhost:5173**.

| Account | Email | Password |
|---|---|---|
| Admin | `admin@wereuse.com` | `Admin@12345` |
| Student | create one on the Register page | your choice |

The admin's details come from `server/.env`: `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PHONE`, `ADMIN_REG_NUMBER`,
`ADMIN_PASSWORD`. The admin lives in its own **`admins`** collection (not in `users`) and needs an ID card photo.
By default `seed:admin` stores a placeholder image; to store the real photo use:

```bash
ADMIN_ID_CARD="/full/path/to/your-id-card.jpg" npm run seed:admin
```

`server/.env` is already created for you with a random `JWT_SECRET`. It is git-ignored; keep it private.

> **Upgrading from the first version?** Your old admin is stored inside `users`. Run `npm run seed:admin` **once**:
> it moves that admin into `admins` (same id, so old audit-log entries stay linked) and your students are not touched.
> The server prints a reminder at start-up until this is done. Everybody has to log in again once, because the
> login token format changed.
>
> **Updating to the e-mail verification version?** It adds one package (`nodemailer`), so run `npm run install:all` again.
> Accounts that already exist keep working: they are not asked to verify their e-mail, and the server automatically adds the
> new registration-number key to them when it starts. If two old accounts turn out to share a number it prints a warning.

> **First run tip:** if you added test documents to `wereuse.users` by hand in Compass earlier, delete them
> (or drop that collection) first. The module creates the collection itself with the right indexes.

### Pre-flight checklist (do this before class)

1. `brew services list` shows MongoDB `started`.
2. `npm run install:all` finished without errors.
3. `npm run seed:admin` prints "Admin account created" (or "updated"), with the golden **Admin** badge line.
4. `npm run dev:server` prints `MongoDB connected` and `WeReUse API running on http://localhost:5050`.
5. `npm run dev:client` prints the `Local: http://localhost:5173/` line.
6. Register a test student, then log in as admin in a private window and approve it (see the demo script).
7. Optional: `npm run test:server` (110 tests) and `npm run test:client` (91 tests) should both end green.
   (Server tests use a separate database called `wereuse_test`, which they empty on every run.)

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

## 3. Lab demo script (about 7 minutes)

1. **Home page** - explain the idea in one sentence, click *Create your account*.
2. **Validation** - press *Create account* on the empty form (every error appears at once). Type a weak password
   (`abc`), a mismatching confirmation, and try a `.gif`/`.pdf` as ID: the page rejects each one.
3. **Register** a student with a JPG/PNG ID photo. The page asks for the **6-digit code**: with SMTP set up it arrives by
   e-mail; in development it is printed in the **server terminal** (`DEV MODE: e-mail NOT sent`). Enter it and you land on
   the **dashboard**: the student pass shows *Under review* and the three features are *Locked until verified*.
   *(Show)* a wrong code (4 attempts left), *Resend code* (60 s cooldown), and registering again with the same
   registration number written as `24135032`: it is refused as a duplicate.
4. **Second window (private/incognito)** - log in as admin (same login page). Point out the **golden Admin badge** in
   the navbar and the admin profile card (name, email, phone, registration number, ID card). Open the student in the
   **Verification queue** and compare the photo with the typed registration number.
   *(Optional)* In any student's panel, **Admin rights > Make this student an admin** (enter their phone number): the
   student disappears from the queue, logs in again with the same email and password, and now sees the golden badge.
   *Say:* the image is not a public URL; the browser fetches it with the login cookie and the server checks
   "owner or admin".
5. Click **Approve**. In the student window open **My profile** (it only appears once verified): edit the name, change the
   e-mail with a code, change the password; point out that the registration number and ID photo are read-only.
   Switch to the student window: it refreshes as soon as you click back into it (otherwise within 15 seconds, or press
   *Check status now*) and the pass turns green, a toast says *You're verified!*, and the bell shows a notification.
6. **Rejection path** - register a second student, *Reject* with a quick reason. The student sees the reason,
   uploads a new photo, and reappears in the admin's *Pending* list.
7. **Security talking points** - open `http://localhost:5050/api/verification/id-card/<any id>` in a logged-out
   tab (401). In Compass, show `users`: only a bcrypt hash is stored; `idCardImageUrl` is just a random file name.
   Show that `admins` and `users` are separate collections, and that every document in `adminactionlogs` has an
   `adminId` pointing at one admin (one admin, many log entries). Finish with `npm run test:server` (110 tests) and
   `npm run test:client` (91 tests).

---

## 4. How it works

```
React (Vite, :5173) --/api--> Vite proxy --> Express (:5050) --> MongoDB (wereuse)
                                                  |
                                                  +--> server/storage/id-cards/  (private files)
```

* The browser only talks to `/api` on its own address; Vite forwards it to Express. That keeps the login cookie
  same-origin and avoids CORS problems.
* **Register:** multipart form -> validated with Zod -> real file type checked from the file's first bytes (not the
  file name) -> duplicates checked -> password hashed with bcrypt -> file saved with a random name -> user saved
  as `pending` -> cookie set.
* **Login:** one form for everybody. The email is looked up in `admins` and in `users` (emails are unique across both),
  and the token records the account type (`admin` or `student`).
* **Every protected request:** cookie -> JWT verified -> account loaded from the right collection -> blocked if
  suspended/banned (students) or disabled (admins). So a decision or a suspension takes effect immediately.
* **Promote to admin:** the admin record is created first (same `_id`), then the student record is deleted, and the first step is
  undone if the second fails, so nobody is ever lost or left in both collections (a plain local MongoDB has no transactions).
* **Review:** an atomic `updateOne` that only matches a `pending` student, so two admins can never review the same
  person twice.

### Folder structure

```
server/src
  config/        env.js (settings), db.js (connection + index check)
  models/        User (students), Admin, PendingRegistration, Notification, AdminActionLog
  middleware/    auth (protect, requireRole, requireVerified), upload, sanitize, rateLimiters, errorHandler
  controllers/   auth, verification, admin, profile, notification
  routes/        /api/auth, /api/verification, /api/profile, /api/admin, /api/notifications
  utils/         validators (Zod), token (JWT cookie), fileStore + sendIdCard (private files), imageType, placeholderIdCard,
                 mailer + emailCode (verification codes), regKey + accountLookup (one account per number), backfillRegKeys
  scripts/       seedAdmin.js (creates/updates the admin and migrates the old one)
server/tests     api.test.js (110 integration tests)
client/src
  pages/         Home, Register (2 steps), Login, Dashboard, Profile, AdminVerifications, NotFound
  components/    Navbar, AdminBadge, EmailCodeForm, NotificationBell, PassCard, FileDropzone, PrivateImage, RouteGuards, ...
  context/       AuthContext (session), ToastContext
  api/           axios client + endpoint functions
  utils/         validators (mirror the server), formatting
  __tests__/     91 component/flow tests
```

---

## 5. API reference

All responses look like `{ "success": true, "message": "...", "data": { ... } }` or
`{ "success": false, "message": "...", "code": "...", "errors": { "field": "message" } }`.

| Method & path | Who | Purpose |
|---|---|---|
| `POST /api/auth/register` | public | **step 1** - multipart: `name, email, password, confirmPassword, universityRegNumber, department?, batch?, idCard`. Validates, then e-mails a 6-digit code (HTTP 202). No account yet |
| `POST /api/auth/verify-email` | public | **step 2** - `{ email, code }`. The right code creates the account and logs in (HTTP 201) |
| `POST /api/auth/resend-code` | public | `{ email }` - a new code for a registration that is waiting (max 1 per minute, 5 per registration) |
| `POST /api/auth/login` | public | `{ email, password }` for students **and** admins - sets the cookie; the response has `role` |
| `POST /api/auth/logout` | anyone | clears the cookie |
| `GET /api/auth/me` | logged in | current user |
| `POST /api/verification/resubmit` | rejected student | multipart: `idCard`, optional `universityRegNumber` |
| `GET /api/verification/id-card/:userId` | owner or admin | the ID image |
| `GET /api/admin/stats` | admin | counts by status |
| `GET /api/admin/verifications?status=&search=&page=&limit=` | admin | the queue |
| `PATCH /api/admin/verifications/:id/approve` | admin | approve |
| `PATCH /api/admin/verifications/:id/reject` | admin | `{ reason }` (5-500 chars) |
| `POST /api/admin/students/:id/promote` | admin | `{ phone }` - make that student an admin (moves them from `users` to `admins`) |
| `POST /api/admin/admins` | admin | create another admin; multipart: `name, email, phone, universityRegNumber, password, idCard` |
| `GET /api/admin/id-card/:adminId` | that admin only | the admin's own ID card photo |
| `GET /api/notifications` | logged in | latest 20 + unread count |
| `PATCH /api/notifications/read-all`, `/:id/read` | logged in | mark as read |
| `PATCH /api/profile` | verified student or admin | `{ name, department?, batch? }` / `{ name, phone }`. Sending `universityRegNumber`, `idCard`... is refused (400) |
| `POST /api/profile/password` | verified student or admin | `{ currentPassword, newPassword, confirmPassword }` - logs out other devices |
| `POST /api/profile/email/request` | verified student or admin | `{ newEmail, password }` - e-mails a code to the NEW address |
| `POST /api/profile/email/confirm`, `/resend`; `DELETE /api/profile/email` | verified student or admin | `{ code }` / new code / cancel |
| `GET /api/health` | public | server + database status |

Using it from Postman works too: log in, then Postman keeps the cookie; or send `Authorization: Bearer <token>`.

### Protecting the next modules

```js
const { protect, requireVerified } = require('../middleware/auth');
router.post('/listings', protect, requireVerified, createListing);   // only approved students
```

---

## 6. Security measures (for the viva)

| Threat | Protection |
|---|---|
| Stolen passwords | bcrypt hashes (cost 12); password never stored or returned |
| Token theft by scripts (XSS) | JWT only in an **httpOnly** cookie; React never sees it |
| Cross-site request forgery | `SameSite=Lax` cookie; CORS limited to the frontend origin |
| Guessing passwords | only *failed* logins are counted (30 per 15 min per IP); same message for a wrong password and an unknown email, and the same amount of work for both (no timing clue) |
| NoSQL injection | Zod rejects non-string input + a sanitizer strips `$` and `.` keys |
| Fake uploads | type + size checked in the browser and again on the server; the real bytes (JPG/PNG signature) are verified |
| ID card leaks | private folder, random file names, owner-or-admin endpoint, `Cache-Control: no-store`, never present in any JSON |
| Privilege escalation | only an admin can promote a student (never a student, never anonymous); suspended/banned accounts cannot be promoted; every promotion is written to the audit log; admins are a separate collection that the public sign-up cannot write to; the token carries a signed account type; role checked on every admin route; old-format tokens are rejected |
| Race conditions | unique database indexes + atomic review/resubmit updates |
| Header attacks | Helmet security headers, body-size limits |
| Fake or mistyped e-mail addresses | the account only exists after the code is entered; nothing is created in `users` before that |
| Guessing the 6-digit code | only a keyed hash of the code is stored; 5 wrong tries lock it (counted atomically, so parallel guesses do not help); 10-minute expiry; per-IP limits |
| Flooding someone's inbox with codes | 1 e-mail per minute per address, 5 resends per registration, per-IP hourly limit |
| Two accounts for one person | normalised registration-number key + unique index, checked across students and admins |
| Bypassing verification by editing the e-mail | changing the e-mail needs the password AND a code sent to the new address |
| Tampering with locked profile fields | the server refuses `universityRegNumber`, `idCard` and `idCardImageUrl` in a profile request; there is no upload route |
| Stolen session after a password change | changing the password invalidates every older login |

---

## 7. E-mail setup (verification codes)

* **Development (nothing to configure):** leave `SMTP_HOST` empty in `server/.env`. The server then prints each code in its
  terminal, inside a box that says `DEV MODE: e-mail NOT sent`. Copy the code from there.
* **Real e-mails with Gmail (good for the presentation):**
  1. Google Account > Security > turn on **2-Step Verification**.
  2. Open <https://myaccount.google.com/apppasswords>, create an app password (16 letters).
  3. In `server/.env` set `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_SECURE=false`, `SMTP_USER=yourname@gmail.com`,
     `SMTP_PASS=<the app password>` and `MAIL_FROM=WeReUse <yourname@gmail.com>`. Restart `npm run dev:server`.
  Any other SMTP service works the same way (Brevo, Mailtrap, your university's mail server).
* If sending fails, the sign-up is rolled back and the student sees "We could not send the verification email".
* In production the server refuses to start sending without SMTP, so codes are never silently lost.

---

## 8. Troubleshooting

| Problem | Fix |
|---|---|
| `Could not connect to MongoDB` | `brew services start mongodb-community@7.0`, and keep `127.0.0.1` in `MONGODB_URI` (not `localhost`) |
| `JWT_SECRET is missing` | copy `server/.env.example` to `server/.env` |
| `Port 5050 is already in use` | change `PORT` in `server/.env` **and** the proxy in `client/vite.config.js` (or set `VITE_API_PROXY`) |
| Website shows "Cannot reach the server" | the API is not running: start `npm run dev:server` |
| `Could not create the database indexes` | delete old test documents / the `users` collection in Compass, then start again |
| Login works but the page logs you out | open the site at `http://localhost:5173` (not a different host name) |
| No code arrives | check the spam folder; in development read the code in the **server terminal**; with Gmail make sure you used an *app password* and restarted the server |
| "Please wait N seconds before asking for another code" | only one e-mail per minute per address is allowed; wait and press *Resend code* |
| "Too many wrong codes" | press *Resend code* for a fresh one (the old one is locked) |
| Start-up warning about old accounts sharing a registration number | two old accounts used the same number in different spellings; review them in Compass and keep one |
| Forgot the admin password | `npm run seed:admin` resets it to the value in `server/.env` |
| `A student account already uses admin@...` | a student registered with the admin's email; set a different `ADMIN_EMAIL` in `server/.env` |
| Logged out after updating the project | expected once: the login token format changed. Log in again |
| Start fresh | in Compass drop the `wereuse` database, delete `server/storage`, run `npm run seed:admin` |
| Admin ID card shows a plain placeholder | run `ADMIN_ID_CARD="/full/path/photo.jpg" npm run seed:admin` |

Port 5000 is deliberately not used: on recent macOS versions "AirPlay Receiver" occupies it.
