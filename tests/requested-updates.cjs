const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const Module = require('node:module');
const ts = require('typescript');
const XLSX = require('xlsx');
const ExcelJS = require('exceljs');
function load(file) {
  const filename = path.resolve(__dirname, '..', file);
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename);
  return mod.exports;
}
const { parseStudentWorkbook } = load('features/student/studentImport.ts');
function book(data) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), 'Students');
  return XLSX.read(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });
}
async function main() {
  const imported = parseStudentWorkbook(book([
    ['FILE NAME FORMAT: Grade Level - Section'], ['INSTRUCTIONS: fill in fields'],
    ['Name of Student\n(Last Name, Given Name, Middle Name)', 'Name of Parent\n(Last Name, Given Name, Middle Name)', 'Email Address\n(e.g. student123@gmail.com)', 'Phone No. (Parent)', 'LRN\n(12 digits)'],
    ['Sample, Anna, B.', 'Sample, Parent', '', '09123456789', '012345678901'],
  ]));
  assert.equal(imported.length, 1);
  assert.equal(imported[0].lrn, '012345678901');
  assert.equal(imported[0].parentEmail, '');
  assert.equal(imported[0].sourceRow, 4);
  assert.equal(imported[0].parentPhone, '09123456789');
  const reordered = parseStudentWorkbook(book([['Extra', 'LRN (12 digits)', 'Unused', 'Student Name'], ['ignore', 238003150001, 'ignore', 'Example, Ben']]));
  assert.equal(reordered[0].studentName, 'Example, Ben');
  assert.equal(reordered[0].lrn, '238003150001');
  const separate = parseStudentWorkbook(book([['Last Name', 'First Name', 'LRN'], ['Example', 'Chris', '123456789012']]));
  assert.equal(separate[0].studentName, 'Example, Chris');
  const vertical = parseStudentWorkbook(book([['Student Name','Example, Chris'],['LRN','123456789012'],['Email','']]));
  assert.equal(vertical[0].lrn, '123456789012');
  assert.throws(() => parseStudentWorkbook(book([['Unknown'], ['Nobody']])), /No student data/);
  assert.throws(() => parseStudentWorkbook(book([['Student Name', 'LRN', 'LRN'], ['Example', '123456789012', '123456789013']])), /more than one/);
  const { attendanceWorkbook } = load('lib/server/attendanceWorkbook.ts');
  const bytes = await attendanceWorkbook([
    { student: 'Sample, Anna', lrn: '012345678901', entry: '7:20 AM', exit: '—', remarks: 'LATE' },
    { student: 'Example, Ben', lrn: '238003150001', entry: '7:00 AM', exit: '12:00 PM', remarks: 'ON TIME' },
    { student: 'Example, Chris', lrn: '123456789012', entry: '—', exit: '—', remarks: 'ABSENT' },
  ], 'Grade 12 – Sample', '2026-10-13');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes);
  const sheet = wb.getWorksheet('Attendance');
  assert.equal(sheet.getCell('B5').value, '012345678901');
  assert.equal(sheet.getCell('E5').font.color.argb, 'FFB91C1C');
  assert.equal(sheet.getCell('E6').font.color.argb, 'FF222222');
  assert.ok(sheet.getColumn(1).width >= 40);
  assert.equal(sheet.getCell('A5').alignment.wrapText, true);
  assert.equal(sheet.getCell('A9').value, 'The following students are late:');
  assert.equal(sheet.getCell('A10').value, '1. Sample, Anna');
  const empty = new ExcelJS.Workbook();
  await empty.xlsx.load(await attendanceWorkbook([], 'Empty section', '2026-10-13'));
  assert.ok(empty.getWorksheet(1).getSheetValues().flat().includes('No late students.'));
  const { createTeacherSchema } = load('features/teachers/schema/teacherSchema.ts');
  const teacher = { email:'teacher@example.com',password:'',firstName:'Anna',middleName:null,lastName:'Sample',extension:null,address:'School',dateOfBirth:'1990-01-01',profilePictureUrl:null };
  assert.equal(createTeacherSchema.safeParse(teacher).success, true);
  assert.equal(createTeacherSchema.safeParse({...teacher,password:'short'}).success, false);
  const { StudentAvatar } = load('features/verification/components/StudentAvatar.tsx');
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  assert.match(renderToStaticMarkup(React.createElement(StudentAvatar,{ firstName:'Anna',lastName:'Sample',profilePicture:null })), /AS/);
  assert.match(renderToStaticMarkup(React.createElement(StudentAvatar,{ firstName:'Anna',lastName:'Sample',profilePicture:'https://example.com/photo.png' })), /<img/);
  console.log('PASS: template/reordered imports, optional student email, preserved LRNs, Excel formatting and late list, optional teacher password, kiosk photo and initials.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
