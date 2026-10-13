# ASTIG email setup — Firebase Spark + Vercel Hobby + Resend Free

The attendance email backend runs as a Vercel Function. Firebase remains on the free Spark plan and is only used for Authentication and Realtime Database.

## 1. Replace the exposed Resend key

Revoke any Resend API key that was pasted into chat or committed to a repository. Create a new key and keep it private.

## 2. Verify a Resend sending domain

Verify a domain in Resend and prepare a sender such as:

```text
ASTIG Attendance <attendance@your-school-domain.com>
```

Resend's `onboarding@resend.dev` sender is suitable only for restricted testing and normally cannot deliver to all adviser addresses.

## 3. Create a Firebase service-account key

Open Firebase Console → Project settings → Service accounts → Generate new private key. Download the JSON file and do not upload it to GitHub.

## 4. Add Vercel environment variables

Open Vercel → ASTIG project → Settings → Environment Variables. Add these to Production:

| Variable | Value |
| --- | --- |
| `RESEND_API_KEY` | New Resend API key |
| `RESEND_FROM_EMAIL` | `ASTIG Attendance <attendance@your-school-domain.com>` |
| `FIREBASE_PROJECT_ID` | JSON file's `project_id` |
| `FIREBASE_CLIENT_EMAIL` | JSON file's `client_email` |
| `FIREBASE_PRIVATE_KEY` | Entire JSON file `private_key`, including BEGIN/END lines |
| `FIREBASE_DATABASE_URL` | `https://astig-backend-default-rtdb.asia-southeast1.firebasedatabase.app` |
| `CRON_SECRET` | A random secret with at least 32 characters |

Never prefix these with `VITE_`; that would expose them to the browser.

## 5. Redeploy

Commit and push the update to GitHub, then redeploy the project in Vercel. Environment-variable changes apply only to new deployments.

The cron route runs once daily at `04:00 UTC`, which corresponds to `12:00 PM` in Asia/Manila. Vercel Hobby may invoke a daily cron at any point during that hour, so delivery can occur between 12:00 and 12:59 PM.

The Attendance page's **Send report now** button calls the same protected Vercel Function using the signed-in administrator or teacher's Firebase ID token.
