# Kiosk, attendance reports and student import update

Extract this update and copy its contents into the existing repository (the folder containing package.json). Replace matching files, commit, and push. Vercel installs the new ExcelJS dependency from package.json/package-lock.json. Keep the working Vercel configuration and existing environment variables. No database rule changes are required.

- Kiosk images use the saved student directory photo, with compatibility for older photo field names. Missing or broken pictures display initials. Saving a student's photo in Students updates both their record and kiosk directory.
- Reports now attach an XLSX workbook instead of CSV. Names wrap, columns are sized, LRNs remain text, LATE remarks are red, and a late-student list appears below the table. The email also includes that list. Attachment placement is controlled by the email client.
- Teacher password entry is optional. Leaving it blank creates the login with a cryptographically random password and sends a Firebase password-reset email so the teacher can choose their own password. A failed setup email is reported without undoing the saved teacher. Teacher email is still required for login and attendance delivery.
- Student import email is optional. The importer finds Name of Student and LRN headers below title/instruction rows, accepts header notes in parentheses, ignores extra columns, and accepts reordered or transposed tables. Separate First Name and Last Name columns are also supported. It chooses the first worksheet containing a recognized table with data. Duplicate LRNs remain protected.

After deployment: save a student's photo and scan their ID; import a small file using the template with an empty email; create a teacher with a blank password; send a report for one section and check the attachment. Actual email delivery and Firebase writes require a signed-in live test.

Checks: node tests/requested-updates.cjs; node node_modules/typescript/bin/tsc --noEmit; npm run build.
