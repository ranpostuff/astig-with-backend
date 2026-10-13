# ASTIG scanner network and path fix

Copy these files over the matching paths in the repository, commit, and push.

This update:

- accepts only the Firebase Realtime Database origin and removes accidental
  Firebase Console suffixes such as `/null` or `/:null`;
- forces Firebase HTTPS long polling so school networks, VPNs, and proxies that
  reject WebSockets do not break kiosk/mobile synchronization;
- sanitizes QR contents down to a valid 12-digit LRN.

Keep this Vercel Production environment variable:

`VITE_FIREBASE_DATABASE_URL=https://astig-backend-default-rtdb.asia-southeast1.firebasedatabase.app`

After Vercel deploys the commit, open the newest deployment, use
`Ctrl+Shift+R`, and scan again. Turning off the browser VPN for the site is also
recommended.
