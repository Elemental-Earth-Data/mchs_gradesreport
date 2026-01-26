/**
 * Google Apps Script - Report Card Grade Entry Backend
 * 
 * SETUP INSTRUCTIONS:
 * 1. Create a new Google Sheet for storing grade data
 * 2. Go to Extensions > Apps Script
 * 3. Copy this entire code into the script editor
 * 4. Update SPREADSHEET_ID with your sheet's ID
 * 5. Deploy > New deployment > Web app
 *    - Execute as: Me
 *    - Who has access: Anyone (or Anyone with Google Account for security)
 * 6. Copy the web app URL and paste it into the React app's CONFIG.APPS_SCRIPT_URL
 */

// ============================================
// CONFIGURATION - UPDATE THIS
// ============================================
const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE'; // Replace with your Google Sheet ID
const SHEET_NAME = 'Grades'; // Name of the sheet tab to use

// Learning skills (must match the React app's CONFIG.LEARNING_SKILLS)
const LEARNING_SKILLS = [
  'Responsibility',
  'Organization', 
  'Independent Work',
  'Collaboration',
  'Initiative',
  'Self-Regulation'
];

// ============================================
// MAIN HANDLERS
// ============================================

/**
 * Handle POST requests from the React app
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const result = saveGradeEntry(data);
    
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ 
        success: false, 
        error: error.message 
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Handle GET requests (for testing and data retrieval)
 * Supports JSONP for cross-origin requests from the HTML app
 */
function doGet(e) {
  const action = e.parameter.action;
  const callback = e.parameter.callback; // For JSONP support
  
  try {
    let result;
    
    switch(action) {
      case 'getAll':
        result = getAllEntries();
        break;
      case 'getByTeacher':
        result = getEntriesByTeacher(e.parameter.teacher);
        break;
      case 'getByStudent':
        result = getEntriesByStudent(e.parameter.student);
        break;
      default:
        result = { message: 'Report Card API is running. Available actions: getAll, getByTeacher, getByStudent' };
    }
    
    const jsonOutput = JSON.stringify(result);
    
    // If callback parameter provided, return JSONP
    if (callback) {
      return ContentService
        .createTextOutput(callback + '(' + jsonOutput + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    
    return ContentService
      .createTextOutput(jsonOutput)
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    const errorResult = JSON.stringify({ 
      success: false, 
      error: error.message 
    });
    
    if (e.parameter.callback) {
      return ContentService
        .createTextOutput(e.parameter.callback + '(' + errorResult + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    
    return ContentService
      .createTextOutput(errorResult)
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================
// DATA OPERATIONS
// ============================================

/**
 * Save or update a grade entry
 */
function saveGradeEntry(data) {
  const sheet = getOrCreateSheet();
  const headers = getHeaders();
  
  // Find existing row for this student AND course combination
  const existingRow = findStudentRow(sheet, data.student, data.course);
  
  // Prepare row data
  const rowData = [
    data.timestamp || new Date().toISOString(),
    data.teacher,
    data.teacherName,
    data.course || '',
    data.student,
    data.percentageMark || '',
    data.classesMissed || '',
    data.timesLate || '',
  ];
  
  // Add learning skills in order
  for (const skill of LEARNING_SKILLS) {
    rowData.push(data.skills[skill] || '');
  }
  
  // Add comment
  rowData.push(data.comment);
  
  // Add last modified timestamp
  rowData.push(new Date().toISOString());
  
  if (existingRow > 0) {
    // Update existing row
    sheet.getRange(existingRow, 1, 1, rowData.length).setValues([rowData]);
    return { success: true, action: 'updated', student: data.student, course: data.course };
  } else {
    // Append new row
    sheet.appendRow(rowData);
    return { success: true, action: 'created', student: data.student, course: data.course };
  }
}

/**
 * Get all grade entries
 */
function getAllEntries() {
  const sheet = getOrCreateSheet();
  const data = sheet.getDataRange().getValues();
  
  if (data.length <= 1) {
    return { success: true, entries: [] };
  }
  
  const headers = data[0];
  const entries = data.slice(1).map(row => rowToObject(headers, row));
  
  return { success: true, entries: entries };
}

/**
 * Get entries by teacher email
 */
function getEntriesByTeacher(teacherEmail) {
  const allData = getAllEntries();
  const filtered = allData.entries.filter(entry => entry.teacher_email === teacherEmail);
  return { success: true, entries: filtered };
}

/**
 * Get entries by student name
 */
function getEntriesByStudent(studentName) {
  const allData = getAllEntries();
  const filtered = allData.entries.filter(entry => entry.student === studentName);
  return { success: true, entries: filtered };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get or create the grades sheet with proper headers
 */
function getOrCreateSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);
  
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    setupSheetHeaders(sheet);
  } else if (sheet.getLastRow() === 0) {
    setupSheetHeaders(sheet);
  }
  
  return sheet;
}

/**
 * Set up sheet headers
 */
function setupSheetHeaders(sheet) {
  const headers = getHeaders();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  
  // Format header row
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#f3f3f3');
  
  // Set column widths
  sheet.setColumnWidth(1, 180); // Timestamp
  sheet.setColumnWidth(2, 200); // Teacher Email
  sheet.setColumnWidth(3, 150); // Teacher Name
  sheet.setColumnWidth(4, 120); // Course
  sheet.setColumnWidth(5, 150); // Student
  sheet.setColumnWidth(6, 120); // Percentage Mark
  sheet.setColumnWidth(7, 110); // Classes Missed
  sheet.setColumnWidth(8, 100); // Times Late
  
  // Learning skills columns
  for (let i = 0; i < LEARNING_SKILLS.length; i++) {
    sheet.setColumnWidth(9 + i, 130);
  }
  
  sheet.setColumnWidth(9 + LEARNING_SKILLS.length, 400); // Comment
  sheet.setColumnWidth(10 + LEARNING_SKILLS.length, 180); // Last Modified
  
  // Freeze header row
  sheet.setFrozenRows(1);
}

/**
 * Get column headers
 */
function getHeaders() {
  const headers = [
    'Timestamp',
    'Teacher Email',
    'Teacher Name',
    'Course',
    'Student Name',
    'Percentage Mark',
    'Classes Missed',
    'Times Late',
  ];
  
  // Add learning skills
  for (const skill of LEARNING_SKILLS) {
    headers.push(skill);
  }
  
  headers.push('Comment');
  headers.push('Last Modified');
  
  return headers;
}

/**
 * Find the row number for a specific student in a specific course
 */
function findStudentRow(sheet, studentName, courseName) {
  const data = sheet.getDataRange().getValues();
  const courseCol = 3; // Index 3 = Course column (0-indexed)
  const studentCol = 4; // Index 4 = Student Name column (0-indexed)
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][studentCol] === studentName && data[i][courseCol] === courseName) {
      return i + 1; // Return 1-indexed row number
    }
  }
  
  return 0; // Not found
}

/**
 * Convert a row array to an object using headers
 */
function rowToObject(headers, row) {
  const obj = {};
  
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    
    // Group learning skills into a skills object
    if (LEARNING_SKILLS.includes(header)) {
      if (!obj.skills) obj.skills = {};
      obj.skills[header] = row[i];
    } else {
      // Convert header to camelCase key
      const key = header.toLowerCase().replace(/ /g, '_');
      obj[key] = row[i];
    }
  }
  
  return obj;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Clear all data (except headers) - use carefully!
 */
function clearAllData() {
  const sheet = getOrCreateSheet();
  const lastRow = sheet.getLastRow();
  
  if (lastRow > 1) {
    sheet.deleteRows(2, lastRow - 1);
  }
}

/**
 * Export data as CSV
 */
function exportToCsv() {
  const sheet = getOrCreateSheet();
  const data = sheet.getDataRange().getValues();
  
  let csv = '';
  for (const row of data) {
    csv += row.map(cell => {
      // Escape quotes and wrap in quotes if contains comma
      const str = String(cell);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    }).join(',') + '\n';
  }
  
  return csv;
}

/**
 * Generate a summary report
 */
function generateSummaryReport() {
  const allData = getAllEntries();
  const entries = allData.entries;
  
  const summary = {
    totalEntries: entries.length,
    byTeacher: {},
    byGrade: {},
    averageCommentLength: 0
  };
  
  let totalCommentLength = 0;
  
  for (const entry of entries) {
    // Count by teacher
    if (!summary.byTeacher[entry.teacher_name]) {
      summary.byTeacher[entry.teacher_name] = 0;
    }
    summary.byTeacher[entry.teacher_name]++;
    
    // Count by grade
    if (!summary.byGrade[entry.grade]) {
      summary.byGrade[entry.grade] = 0;
    }
    summary.byGrade[entry.grade]++;
    
    // Sum comment lengths
    totalCommentLength += (entry.comment || '').length;
  }
  
  summary.averageCommentLength = entries.length > 0 
    ? Math.round(totalCommentLength / entries.length) 
    : 0;
  
  return summary;
}

// ============================================
// VALIDATION FUNCTIONS
// ============================================

/**
 * Validate incoming data
 */
function validateData(data) {
  const errors = [];
  
  if (!data.teacher) {
    errors.push('Teacher email is required');
  }
  
  if (!data.student) {
    errors.push('Student name is required');
  }
  
  if (!data.grade) {
    errors.push('Grade is required');
  }
  
  if (!data.skills || typeof data.skills !== 'object') {
    errors.push('Learning skills are required');
  } else {
    for (const skill of LEARNING_SKILLS) {
      if (!data.skills[skill]) {
        errors.push(`${skill} rating is required`);
      }
    }
  }
  
  if (!data.comment) {
    errors.push('Comment is required');
  } else if (data.comment.length > 500) {
    errors.push('Comment must be 500 characters or less');
  }
  
  return errors;
}

// ============================================
// TEST FUNCTION
// ============================================

/**
 * Test the script by adding a sample entry
 */
function testSaveEntry() {
  const testData = {
    teacher: 'teacher1@school.edu',
    teacherName: 'Ms. Johnson',
    course: 'Math 7A',
    student: 'Test Student',
    percentageMark: 85,
    classesMissed: 2,
    timesLate: 1,
    skills: {
      'Responsibility': 'Excellent',
      'Organization': 'Good',
      'Independent Work': 'Excellent',
      'Collaboration': 'Satisfactory',
      'Initiative': 'Good',
      'Self-Regulation': 'Excellent'
    },
    comment: 'This is a test comment for the report card entry system.',
    timestamp: new Date().toISOString()
  };
  
  const result = saveGradeEntry(testData);
  Logger.log(result);
}
