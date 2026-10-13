# ASTIG scanner definitive path fix

Copy these files over the matching repository paths, commit, and push.

The scan flow no longer requests Firebase's reserved
`.info/serverTimeOffset` location. That leading-dot path was being rejected by
the deployed Realtime Database transport as `Invalid token in path` before an
attendance record could be written.

This package also retains the database URL normalization, 12-digit LRN
sanitization, and HTTPS long-polling compatibility fixes.

After Vercel deploys the commit, open the newest deployment, hard-refresh the
kiosk with `Ctrl+Shift+R`, and scan again.
