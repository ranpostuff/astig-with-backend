# ASTIG scanner invalid-path fix

Copy these files over the matching paths in the repository, commit, and push:

- `lib/firebase.ts`
- `features/tracking/trackingService.ts`
- `features/tracking/MobileScannerPage.tsx`
- `database.rules.json`

The Firebase initialization now accepts only the Realtime Database origin. It
automatically removes an accidentally copied Firebase Console path such as
`/null` or `/:null`, which otherwise makes scans fail with `Invalid token in
path`.

In Vercel, `VITE_FIREBASE_DATABASE_URL` should still be set exactly to:

`https://astig-backend-default-rtdb.asia-southeast1.firebasedatabase.app`

After Vercel finishes deploying, open the newest deployment, hard-refresh the
kiosk page with `Ctrl+Shift+R`, and scan again.
