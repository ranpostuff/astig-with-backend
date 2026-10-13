# ASTIG full functional refinement

This package contains the complete deployable project source. It intentionally excludes local `node_modules`, generated build folders, and local `.env` files.

## Main fixes

- Attendance grade and section filters now use stable Firebase IDs.
- Attendance loads every grade from the Grades collection, including grades with no students yet.
- Student, section, import, and attendance dropdowns consistently cascade by grade ID and section ID.
- Student Records now opens the complete violation history for a selected student.
- Grade, section, and teacher renames cascade into dependent records.
- Deletion is blocked when it would leave dependent records orphaned.
- Excel imports require an existing grade and section and skip invalid or duplicate LRNs.
- Manual student LRNs must contain exactly 12 digits and cannot be changed after creation.
- Selected student and teacher profile pictures are now actually saved (maximum 1 MB).
- Existing QR scanner behavior and Firebase/Vercel configuration are preserved.

## Deploy

1. Extract this ZIP.
2. Copy its files over the root of the GitHub project, preserving the folders.
3. Commit and push the changes.
4. Let Vercel build the new commit.
5. After Vercel reports Ready, open the newest deployment and hard-refresh with `Ctrl+F5`.

No new environment variable or Firebase rule change is required for these refinements. Keep the environment variables already configured in Vercel.

## Smoke test after deployment

1. Create or confirm a Grade 12 grade and a section under it.
2. Open Attendance and verify Grade 12 appears, then select its section.
3. Open Students and verify its Grade and Section filters match the same data.
4. Import a small spreadsheet after selecting the destination grade and section.
5. Record two violations for one student, open Student Records, and select View history.
6. Confirm the full newest-to-oldest history appears.
7. Confirm the existing QR scanner still records attendance normally.
