# ASTIG email setup — Firebase Spark + Vercel + Brevo Free

The attendance email backend runs as a Vercel Function. Firebase remains on the Spark plan for Authentication and Realtime Database. Brevo sends the transactional attendance reports.

## Required Vercel build configuration

Keep `framework: null`, `buildCommand: "npm run build"`, and `outputDirectory: "build/client"` in the root `vercel.json`. This intentionally selects Vercel's Other preset: its React Router preset ignores standalone Node functions under `api/`. React Router still builds the frontend in SPA mode through the build command.

The function pattern in `vercel.json` is a deployment guard: the build must fail if `api/attendance-report.ts` is not registered. After pushing this configuration, inspect the new deployment's Resources for the attendance-report function. Opening `/api/attendance-report` without credentials should return a JSON error, never the website HTML. A JSON environment-variable error means the function is deployed but server configuration is incomplete.

## 1. Create and verify the Brevo sender

In Brevo, open **Settings → Senders, Domains & Dedicated IPs → Senders**, then choose **Add a sender**.

Use:

```text
From name: ASTIG Attendance
From email: the email address you can verify
```

Enter the verification code Brevo sends to that address. The email must appear as verified before ASTIG can use it.

## 2. Generate a Brevo API key

Open **Settings → SMTP & API → API Keys**, generate a key named `ASTIG Vercel`, and copy it immediately. Do not upload it to GitHub or paste it into client-side code.

Use an API key, not an SMTP key.

## 3. Firebase service-account credentials

The existing Firebase Admin variables are still required by the Vercel Function. If the previous service-account private key was exposed, revoke it in Google Cloud IAM and generate a replacement from Firebase Console → Project settings → Service accounts.

## 4. Vercel environment variables

Open Vercel → ASTIG project → Settings → Environment Variables. Add these to **Production**:

| Variable | Value |
| --- | --- |
| `BREVO_API_KEY` | Brevo API key beginning with `xkeysib-` |
| `BREVO_FROM_EMAIL` | The exact verified sender email from Brevo |
| `BREVO_FROM_NAME` | `ASTIG Attendance` |
| `FIREBASE_PROJECT_ID` | Firebase service-account JSON `project_id` |
| `FIREBASE_CLIENT_EMAIL` | Firebase service-account JSON `client_email` |
| `FIREBASE_PRIVATE_KEY` | Entire `private_key`, including BEGIN/END lines |
| `FIREBASE_DATABASE_URL` | `https://astig-backend-default-rtdb.asia-southeast1.firebasedatabase.app` |
| `CRON_SECRET` | Random secret containing at least 32 characters |

Remove the obsolete `RESEND_API_KEY` and `RESEND_FROM_EMAIL` variables after the Brevo deployment works.

Never prefix server secrets with `VITE_`, because that would expose them to the browser.

## 5. Deploy and test

Commit and push the update to GitHub. In Vercel, wait for the new production deployment to report **Ready**. Environment-variable changes only affect new deployments.

On the completed Vercel deployment, open **Functions** and confirm that `api/attendance-report.ts` is listed. If it is absent, the ZIP contents were copied into a nested folder instead of the repository root. The repository root must directly contain `api`, `app`, `features`, `package.json`, and `vercel.json`.

Open ASTIG → Attendance, select one grade and section whose adviser email you control, then select **Send report now**. Confirm:

1. ASTIG reports one successful email.
2. The message arrives with the CSV attachment.
3. The delivery appears in Brevo → Transactional → Logs.

The automated route runs daily at `04:00 UTC`, which is `12:00 PM` in Asia/Manila. The free Brevo allowance is currently 300 sends per day, so 42 section reports use 42 sends.

Scheduled reports store a successful-delivery marker in Firebase under `emailReportDeliveries/<date>/<sectionId>` so a cron retry does not resend the same section's report. Manual reports remain available for intentional resends.
