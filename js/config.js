/* ============================================================
 * AGNIVEER VAYU CBT — CENTRAL CONFIGURATION
 * Edit this object (or use Settings → Exam Configuration in-app)
 * to change exam behaviour WITHOUT rewriting the application.
 * ============================================================ */

const EXAM_CONFIG = {
  name: 'Air Force Agniveervayu',
  mode: 'BS',                      // Both Subjects
  candidateName: 'Practice Candidate',

  duration: 85 * 60,               // total seconds (85 minutes)

  marking: {
    correct: 1,                    // +1 per correct answer
    wrong: -0.25,                  // -0.25 per wrong answer
    unattempted: 0
  },

  /* ---------------- TIMER / SECTION ENGINE ---------------- */
  timerMode: 'section',            // 'section' (each section timed) | 'global' (one countdown)
  sectionLock: true,               // future sections inaccessible
  sectionSubmitRequired: true,     // explicit "SUBMIT SECTION" at section end
  allowPreviousSection: false,     // submitted sections never reopen
  allowFutureSection: false,
  autoSubmitOnTimerExpiry: true,   // section auto-submits at 00:00
  allowPause: false,               // never during real exam mode

  /* ---------------- NAVIGATION / RANDOMIZATION ---------------- */
  shuffleQuestions: false,
  shuffleOptions: false,
  shuffleSubjectOrder: false,
  instantExplanation: false,       // practice mode only

  /* ---------------- LANGUAGE ---------------- */
  defaultLanguage: 'en',           // 'en' | 'hi' (UI + instructions)

  /* ---------------- GENERATION ---------------- */
  selectionStrategy: 'smart', // smart (no repeat after 2× correct) | balanced-unseen | random | balanced | unseen-first | weak-topic | wrong-weighted
  retakeMode: 'fresh',             // 'fresh' (reattempt = NEW questions, same blueprint — kam repeat) | 'same' | 'random'

  /* ---------------- WEAK/STRONG TOPIC THRESHOLDS ---------------- */
  thresholds: { strong: 80, average: 60 },  // >=80 strong, 60-79 average, <60 needs practice

  /* ---------------- TIMER WARNING STATES ---------------- */
  timerWarning: 300,               // seconds — amber below this
  timerCritical: 120,              // seconds — red below this

  /* ---------------- SUBJECTS (order = exam order) ---------------- */
  subjects: [
    { id: 'physics',      name: 'Physics',      questions: 25, duration: 20 * 60 },
    { id: 'mathematics',  name: 'Mathematics',  questions: 25, duration: 20 * 60 },
    { id: 'english',      name: 'English',      questions: 20, duration: 20 * 60 },
    { id: 'raga',         name: 'RAGA',         questions: 30, duration: 25 * 60 }
  ],

  /* ---------------- DERIVED (read-only helpers) ---------------- */
  get totalQuestions() { return this.subjects.reduce((a, s) => a + s.questions, 0); },
  get maxMarks() { return this.subjects.reduce((a, s) => a + s.questions, 0) * this.marking.correct; }
};

/* Practice-mode preset used for subject/chapter/topic/custom tests
 * (section timing/locking still follows the test's own config). */
const PRACTICE_PRESET = {
  timerMode: 'global',
  sectionLock: false,
  sectionSubmitRequired: false,
  allowPause: false,
  autoSubmitOnTimerExpiry: true,
  instantExplanation: false
};

const EXAM_PRESET = {
  timerMode: 'section',
  sectionLock: true,
  sectionSubmitRequired: true,
  allowPause: false,
  autoSubmitOnTimerExpiry: true,
  instantExplanation: false
};

/* ---------------- UI STRINGS (English / Hindi) ---------------- */
const I18N = {
  en: {
    appName: 'Kineora Exam',
    dashboard: 'Dashboard', tests: 'Test Library', questions: 'Question Bank',
    import: 'Import', attempts: 'My Attempts', settings: 'Settings',
    timeLeft: 'Time Left', instructions: 'Instructions',
    markReviewNext: 'Mark for Review & Next', clearResponse: 'Clear Response',
    saveNext: 'Save & Next', submit: 'Submit', submitSection: 'Submit Section',
    prevShort: 'Prev', clearShort: 'Clear', markShort: 'Review ▸',
    previous: 'Previous', next: 'Next', questionPalette: 'Question Palette',
    answered: 'Answered', notAnswered: 'Not Answered', notVisited: 'Not Visited',
    markedReview: 'Marked for Review', answeredMarked: 'Answered & Marked for Review',
    willBeEvaluated: 'will be evaluated', sectionBar: 'Section',
    viewIn: 'View in', questionNo: 'Question No.',
    currentSection: 'Current Section', sectionProgress: 'Question',
    of: 'of', candidate: 'Candidate', legend: 'Legend',
    readyToBegin: 'I am ready to begin',
    readInstructions: 'I have read and understood the instructions. I declare that I will not use any unfair means during the examination.',
    chooseLanguage: 'Choose your default language',
    sectionComplete: 'SECTION COMPLETE', endOf: 'End of', submitConfirm: 'Are you sure you want to submit this section?',
    afterSubmit: 'After submission, this section cannot be revisited.',
    unansweredZero: 'Unanswered questions will receive 0 marks.',
    cancel: 'Cancel', submitTest: 'Submit Test', backToQuestions: 'Back to Questions',
    examCompleted: 'EXAM COMPLETED', resumeExam: 'RESUME EXAM', endAttempt: 'END ATTEMPT',
    leaveExamTitle: 'Leave examination?', leaveExamBody: 'Your attempt will be saved and can be resumed from the dashboard.',
    stay: 'Stay', leave: 'Leave'
  },
  hi: {
    appName: 'किनोरा एग्ज़ाम',
    dashboard: 'डैशबोर्ड', tests: 'टेस्ट लाइब्रेरी', questions: 'प्रश्न बैंक',
    import: 'इंपोर्ट', attempts: 'मेरे प्रयास', settings: 'सेटिंग्स',
    timeLeft: 'शेष समय', instructions: 'निर्देश',
    markReviewNext: 'रिव्यू के लिए चिन्हित करें व अगला', clearResponse: 'उत्तर हटाएँ',
    saveNext: 'सुरक्षित करें व अगला', submit: 'जमा करें', submitSection: 'सेक्शन जमा करें',
    prevShort: 'पिछला', clearShort: 'हटाएँ', markShort: 'रिव्यू ▸',
    previous: 'पिछला', next: 'अगला', questionPalette: 'प्रश्न पैलेट',
    answered: 'उत्तरित', notAnswered: 'अनुत्तरित', notVisited: 'नहीं देखा गया',
    markedReview: 'रिव्यू हेतु चिन्हित', answeredMarked: 'उत्तरित व रिव्यू हेतु चिन्हित',
    willBeEvaluated: 'का मूल्यांकन होगा', sectionBar: 'खंड',
    viewIn: 'भाषा में देखें', questionNo: 'प्रश्न संख्या',
    currentSection: 'वर्तमान खंड', sectionProgress: 'प्रश्न',
    of: 'में से', candidate: 'अभ्यर्थी', legend: 'संकेत',
    readyToBegin: 'मैं परीक्षा शुरू करने के लिए तैयार हूँ',
    readInstructions: 'मैंने निर्देश पढ़ लिए हैं और समझ लिए हैं। मैं घोषणा करता/करती हूँ कि परीक्षा में कोई अनुचित साधन का प्रयोग नहीं करूँगा/करूँगी।',
    chooseLanguage: 'अपनी डिफ़ॉल्ट भाषा चुनें',
    sectionComplete: 'खंड पूर्ण', endOf: 'खंड समाप्त', submitConfirm: 'क्या आप वाकई यह खंड जमा करना चाहते हैं?',
    afterSubmit: 'जमा करने के बाद इस खंड में दोबारा नहीं जा सकते।',
    unansweredZero: 'अनुत्तरित प्रश्नों के लिए 0 अंक मिलेंगे।',
    cancel: 'रद्द करें', submitTest: 'टेस्ट जमा करें', backToQuestions: 'प्रश्नों पर लौटें',
    examCompleted: 'परीक्षा पूर्ण', resumeExam: 'परीक्षा जारी रखें', endAttempt: 'प्रयास समाप्त करें',
    leaveExamTitle: 'परीक्षा छोड़ें?', leaveExamBody: 'आपका प्रयास सुरक्षित कर दिया जाएगा और डैशबोर्ड से फिर से शुरू किया जा सकता है।',
    stay: 'रुकें', leave: 'छोड़ें'
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { EXAM_CONFIG, I18N, PRACTICE_PRESET, EXAM_PRESET };
}
