# ASTIG Firebase and Resend deployment

## Security first

The Resend API key is a server secret. Never put it in `VITE_*`, GitHub Pages settings, frontend source code, or a committed `.env` file. Because a key was shared in chat, revoke it in Resend and create a replacement before deployment.

## Requirements

- Firebase CLI installed and signed in
- Firebase project `astig-backend`
- Firebase project upgraded to Blaze for Cloud Functions and the daily scheduler
- A verified sending domain in Resend when emailing different teacher addresses

## Configure the server secret

Run from the project root in Google Cloud Shell or PowerShell:

```sh
firebase login
firebase use astig-backend
firebase functions:secrets:set RESEND_API_KEY
```

Paste the new key only when the Firebase CLI prompts for it.

Create `functions/.env.astig-backend` with this non-secret setting:

```env
RESEND_FROM_EMAIL=ASTIG Attendance <attendance@your-verified-domain.com>
```

For initial testing, Resend's `onboarding@resend.dev` sender normally only delivers to the Resend account owner. Use a verified domain before emailing all advisers.

## Deploy backend and rules

```sh
npm --prefix functions install
npm --prefix functions run build
firebase deploy --only database,functions
```

The schedule runs daily at 12:00 PM in `Asia/Manila`. The Attendance page also has **Send report now**, which uses its selected date, grade, and section filters.

## Publish the frontend

Commit and push the updated files to the GitHub repository. The existing GitHub Pages Action will rebuild the site. Do not place `RESEND_API_KEY` in GitHub Pages or frontend environment variables.

## Teacher data requirements

Each section needs an assigned adviser, and that teacher record needs a valid email address. Sections without an adviser email are skipped and listed in the report result.
