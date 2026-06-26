// i18n.jsx — UI string dictionary for iORA LMS (English / 中文 / Bahasa Melayu)
// Exposes window.LANGS and window.UI (a nested dict keyed by lang code).

const LANGS = [
  { code: "en", label: "English", short: "EN" },
  { code: "zh", label: "中文", short: "中" },
  { code: "ms", label: "Bahasa Melayu", short: "MS" },
];

// Helper: t3(en, zh, ms) -> {en, zh, ms}
const t3 = (en, zh, ms) => ({ en, zh, ms });

const UI = {
  // sidebar / progress
  brandSub: t3("Learning Hub", "学习中心", "Hab Pembelajaran"),
  completed: t3("Completed", "已完成", "Selesai"),
  journeyComplete: t3("Journey complete", "旅程完成", "Perjalanan selesai"),
  upcoming: t3("Upcoming", "即将到来", "Akan Datang"),
  nothingUpcoming: t3(
    "Nothing upcoming — nice work!",
    "暂无待办事项，做得好！",
    "Tiada tugasan — syabas!",
  ),
  dueOn: t3("Due", "截止", "Tarikh akhir"),
  downloadCert: t3(
    "Download E-Certificate",
    "下载电子证书",
    "Muat Turun E-Sijil",
  ),
  certReady: t3(
    "Your certificate is ready",
    "您的证书已就绪",
    "Sijil anda telah sedia",
  ),

  // dashboard / lesson cards
  myCourses: t3(
    "My Onboarding Journey",
    "我的入职旅程",
    "Perjalanan Onboarding Saya",
  ),
  week: t3("Week", "第", "Minggu"),
  weekSuffix: t3("", "周", ""),
  lesson: t3("Lesson", "课程", "Pelajaran"),
  finalTest: t3("Final Test", "期末测验", "Ujian Akhir"),
  locked: t3("Locked", "已锁定", "Dikunci"),

  // lesson parts
  slides: t3("Slides", "幻灯片", "Slaid"),
  reading: t3("Reading (PDF)", "阅读材料 (PDF)", "Bacaan (PDF)"),
  video: t3("Video", "视频", "Video"),
  quiz: t3("Quiz", "测验", "Kuiz"),
  of: t3("of", "/", "drpd"),
  finishWatching: t3(
    "I have finished watching",
    "我已看完",
    "Saya telah selesai menonton",
  ),
  watchToContinue: t3(
    "Watch the video to continue",
    "观看视频以继续",
    "Tonton video untuk meneruskan",
  ),
  markRead: t3("Mark as read", "标记为已读", "Tanda telah dibaca"),
  slidesDeck: t3("Course Slides.pptx", "课程幻灯片.pptx", "Slaid Kursus.pptx"),
  backToDash: t3("Back to dashboard", "返回主页", "Kembali ke papan pemuka"),
  continueTo: t3("Continue", "继续", "Teruskan"),
  partDone: t3("Done", "完成", "Selesai"),

  // quiz / test
  question: t3("Question", "问题", "Soalan"),
  submitAnswer: t3("Submit", "提交", "Hantar"),
  nextQuestion: t3("Next question", "下一题", "Soalan seterusnya"),
  seeResults: t3("See results", "查看结果", "Lihat keputusan"),
  passMark: t3("Pass mark", "及格分", "Markah lulus"),
  yourScore: t3("Your score", "您的得分", "Markah anda"),
  passed: t3("Passed", "通过", "Lulus"),
  failed: t3("Not passed", "未通过", "Tidak lulus"),
  passedMsg: t3(
    "Great job! The next step in your journey is now unlocked.",
    "太棒了！您旅程的下一步已解锁。",
    "Syabas! Langkah seterusnya dalam perjalanan anda kini dibuka.",
  ),
  failedMsg: t3(
    "You need 30 out of 40 to pass. Review the material and try again.",
    "您需要答对 40 题中的 30 题才能通过。请复习后重试。",
    "Anda perlukan 30 daripada 40 untuk lulus. Semak semula dan cuba lagi.",
  ),
  attempts: t3("Attempts", "尝试次数", "Percubaan"),
  hrFlagged: t3(
    "HR has been notified to follow up with you.",
    "HR 已收到通知将跟进。",
    "HR telah dimaklumkan untuk membantu anda.",
  ),
  tryAgain: t3("Try again", "重试", "Cuba lagi"),
  correct: t3("Correct", "正确", "Betul"),
  incorrect: t3("Incorrect", "错误", "Salah"),
  finishLesson: t3("Finish lesson", "完成课程", "Selesaikan pelajaran"),

  // top nav menus
  notifications: t3("Notifications", "通知", "Pemberitahuan"),
  markAllRead: t3("Mark all as read", "全部标为已读", "Tanda semua dibaca"),
  noNotifs: t3(
    "You are all caught up.",
    "没有新通知。",
    "Tiada pemberitahuan baharu.",
  ),

  // profile menu
  myProfile: t3("My Profile", "我的资料", "Profil Saya"),
  changePassword: t3("Change Password", "修改密码", "Tukar Kata Laluan"),
  theme: t3("Theme", "主题", "Tema"),
  themeLight: t3("Ivory", "象牙白", "Gading"),
  themeDark: t3("Noir", "玄黑", "Noir"),
  themeMidnight: t3("Stone", "石灰", "Batu"),
  themeMaroon: t3("Rosewood", "玫紫", "Rosewood"),
  themeLavender: t3("Camel", "驼色", "Unta"),
  themeGreen: t3("Olive", "橄榄", "Zaitun"),
  logOut: t3("Log Out", "退出登录", "Log Keluar"),
  role: t3(
    "Retail Associate · Onboarding",
    "零售员 · 入职中",
    "Penjual Runcit · Onboarding",
  ),
  currentPw: t3("Current password", "当前密码", "Kata laluan semasa"),
  newPw: t3("New password", "新密码", "Kata laluan baharu"),
  confirmPw: t3(
    "Confirm new password",
    "确认新密码",
    "Sahkan kata laluan baharu",
  ),
  save: t3("Save", "保存", "Simpan"),
  cancel: t3("Cancel", "取消", "Batal"),
  pwUpdated: t3("Password updated", "密码已更新", "Kata laluan dikemas kini"),

  // test complete
  congrats: t3("Congratulations!", "恭喜您！", "Tahniah!"),
  congratsBody: t3(
    "You have completed your entire onboarding journey. Your results have been sent to HR to confirm your permanent status.",
    "您已完成全部入职旅程。您的成绩已发送给人力资源部以确认您的转正状态。",
    "Anda telah menyelesaikan perjalanan onboarding anda. Keputusan anda telah dihantar kepada HR untuk pengesahan jawatan tetap.",
  ),
  syncedToHr: t3("Synced to HR", "已同步至 HR", "Disegerak ke HR"),
  backHome: t3("Back to dashboard", "返回主页", "Kembali ke papan pemuka"),

  // certificate
  certTitle: t3(
    "Certificate of Completion",
    "结业证书",
    "Sijil Tamat Pengajian",
  ),
  certPresented: t3(
    "This is to certify that",
    "兹证明",
    "Ini mengesahkan bahawa",
  ),
  certHasDone: t3(
    "has successfully completed the",
    "已成功完成",
    "telah berjaya menyelesaikan",
  ),
  certProgram: t3(
    "New Staff Onboarding Programme",
    "新员工入职培训计划",
    "Program Onboarding Staf Baharu",
  ),
  certDate: t3("Date of completion", "完成日期", "Tarikh tamat"),
  certSign: t3(
    "Training & Development",
    "培训与发展部",
    "Latihan & Pembangunan",
  ),
  print: t3(
    "Print / Save as PDF",
    "打印 / 另存为 PDF",
    "Cetak / Simpan sebagai PDF",
  ),

  // ---- tests / timer / attempts ----
  test: t3("Test", "测验", "Ujian"),
  testInstructions: t3(
    "Test instructions",
    "测验须知",
    "Arahan ujian",
  ),
  testIntro: t3(
    "You have 30 minutes to answer 40 questions. You need 30 correct to pass. The timer starts as soon as you begin and the test submits automatically when it runs out.",
    "您有 30 分钟回答 40 道题，需答对 30 题方可通过。计时从开始时启动，时间到将自动提交。",
    "Anda mempunyai 30 minit untuk menjawab 40 soalan. Anda perlukan 30 betul untuk lulus. Pemasa bermula sebaik anda mula dan ujian dihantar secara automatik apabila tamat masa.",
  ),
  beginTest: t3("Begin test", "开始测验", "Mula ujian"),
  timeRemaining: t3("Time remaining", "剩余时间", "Masa berbaki"),
  timeUp: t3("Time's up", "时间到", "Masa tamat"),
  timeUpMsg: t3(
    "Your time ran out and the test was submitted automatically.",
    "时间已到，测验已自动提交。",
    "Masa anda telah tamat dan ujian dihantar secara automatik.",
  ),
  attemptsLeft: t3(
    "Attempts remaining",
    "剩余尝试次数",
    "Percubaan berbaki",
  ),
  attemptOf: t3("Attempt", "第", "Percubaan"),
  questionsPicked: t3(
    "40 of 60 questions, randomly selected",
    "从 60 题中随机抽取 40 题",
    "40 daripada 60 soalan, dipilih secara rawak",
  ),
  prevQuestion: t3("Previous", "上一题", "Sebelumnya"),
  submitTest: t3("Submit test", "提交测验", "Hantar ujian"),
  unanswered: t3("unanswered", "未作答", "tidak dijawab"),
  answered: t3("answered", "已作答", "dijawab"),
  reviewBeforeSubmit: t3(
    "You can go back and change answers before submitting.",
    "提交前您可以返回修改答案。",
    "Anda boleh kembali dan menukar jawapan sebelum menghantar.",
  ),

  // ---- lockout ----
  lockedOut: t3("Test locked", "测验已锁定", "Ujian dikunci"),
  lockedOutMsg: t3(
    "You have used all 3 attempts. This test is now locked. Please contact HR, who can reset your access.",
    "您已用完全部 3 次尝试。此测验现已锁定。请联系人力资源部以重置您的访问权限。",
    "Anda telah menggunakan kesemua 3 percubaan. Ujian ini kini dikunci. Sila hubungi HR untuk menetapkan semula akses anda.",
  ),
  alreadyPassed: t3("Already passed", "已通过", "Sudah lulus"),
  alreadyPassedMsg: t3(
    "You have already passed this test.",
    "您已通过此测验。",
    "Anda telah lulus ujian ini.",
  ),

  // ---- survey ----
  surveyTitle: t3("Feedback Survey", "反馈问卷", "Tinjauan Maklum Balas"),
  surveyIntro: t3(
    "Before you download your certificate, please tell us about your onboarding experience. This is required.",
    "在下载证书之前，请告诉我们您的入职体验。此项为必填。",
    "Sebelum memuat turun sijil anda, sila beritahu kami tentang pengalaman onboarding anda. Ini diperlukan.",
  ),
  surveyClarity: t3(
    "How clear was the training content?",
    "培训内容是否清晰？",
    "Sejauh mana kandungan latihan jelas?",
  ),
  surveyPace: t3(
    "How was the pace of the programme?",
    "课程节奏如何？",
    "Bagaimana rentak program?",
  ),
  surveyUseful: t3(
    "How useful was the training for your role?",
    "培训对您的工作有多大帮助？",
    "Sejauh mana latihan berguna untuk peranan anda?",
  ),
  surveyComment: t3(
    "Any additional comments? (optional)",
    "还有其他意见吗？（选填）",
    "Sebarang komen tambahan? (pilihan)",
  ),
  surveyCommentPlaceholder: t3(
    "Tell us what went well or what could be better…",
    "告诉我们哪些做得好或可以改进…",
    "Beritahu kami apa yang baik atau boleh diperbaiki…",
  ),
  surveySubmit: t3("Submit & continue", "提交并继续", "Hantar & teruskan"),
  surveyRequired: t3(
    "Please rate all three questions before continuing.",
    "请先为全部三个问题评分后再继续。",
    "Sila nilai ketiga-tiga soalan sebelum meneruskan.",
  ),
  surveyThanks: t3(
    "Thank you for your feedback!",
    "感谢您的反馈！",
    "Terima kasih atas maklum balas anda!",
  ),
  rateLow: t3("Poor", "差", "Lemah"),
  rateHigh: t3("Excellent", "优秀", "Cemerlang"),
  certNeedsSurvey: t3(
    "Complete the feedback survey to unlock your certificate.",
    "完成反馈问卷以解锁您的证书。",
    "Lengkapkan tinjauan maklum balas untuk membuka sijil anda.",
  ),
  takeSurvey: t3("Take the survey", "填写问卷", "Isi tinjauan"),

  // ---- admin ----
  adminConsole: t3("Admin Console", "管理控制台", "Konsol Admin"),
  adminFiles: t3("Course files", "课程文件", "Fail kursus"),
  adminFilesHint: t3(
    "Replace the materials learners see. Uploads are stored in this browser only (front-end demo).",
    "替换学员所见的资料。上传仅保存在此浏览器中（前端演示）。",
    "Ganti bahan yang dilihat pelajar. Muat naik disimpan dalam pelayar ini sahaja (demo bahagian hadapan).",
  ),
  adminUnit: t3("Unit", "单元", "Unit"),
  adminSlides: t3("Slides (.pptx)", "幻灯片 (.pptx)", "Slaid (.pptx)"),
  adminPdf: t3("Reading (.pdf)", "阅读 (.pdf)", "Bacaan (.pdf)"),
  adminVideo: t3("Video (YouTube URL)", "视频（YouTube 链接）", "Video (URL YouTube)"),
  adminBank: t3("Question bank (.csv)", "题库 (.csv)", "Bank soalan (.csv)"),
  adminUpload: t3("Upload", "上传", "Muat naik"),
  adminReplace: t3("Replace", "替换", "Ganti"),
  adminCustom: t3("Custom file in use", "正在使用自定义文件", "Fail tersuai digunakan"),
  adminDefault: t3("Using bundled file", "使用内置文件", "Menggunakan fail terbina"),
  adminRevert: t3("Revert", "还原", "Kembalikan"),
  adminSave: t3("Save URL", "保存链接", "Simpan URL"),
  adminAttempts: t3("Learner attempts & lockouts", "学员尝试与锁定", "Percubaan & kunci pelajar"),
  adminResetAttempts: t3("Reset attempts", "重置尝试", "Tetapkan semula percubaan"),
  adminSurveyResponses: t3("Survey responses", "问卷反馈", "Maklum balas tinjauan"),
  adminNoSurvey: t3("No survey submitted yet.", "尚无问卷提交。", "Belum ada tinjauan dihantar."),
  adminApplied: t3("Saved — reloading materials…", "已保存 — 正在重新加载…", "Disimpan — memuat semula bahan…"),
  adminViewLabel: t3("View", "视图", "Paparan"),
  adminAsUser: t3("Learner", "学员", "Pelajar"),
  adminAsAdmin: t3("Admin", "管理员", "Admin"),
  openAdmin: t3("Admin Console", "管理控制台", "Konsol Admin"),
  passedLabel: t3("Passed", "已通过", "Lulus"),
  lockedLabel: t3("Locked", "已锁定", "Dikunci"),
  inProgress: t3("In progress", "进行中", "Sedang berjalan"),
  notStarted: t3("Not started", "未开始", "Belum bermula"),

  // ---- screenshot guard ----
  shieldMsg: t3(
    "Protected content hidden",
    "受保护内容已隐藏",
    "Kandungan terlindung disembunyikan",
  ),
  shieldSub: t3(
    "Return to this window to continue.",
    "返回此窗口以继续。",
    "Kembali ke tetingkap ini untuk meneruskan.",
  ),
  screenshotBlocked: t3(
    "Screenshots are disabled for this training.",
    "此培训已禁用截图。",
    "Tangkapan skrin dilumpuhkan untuk latihan ini.",
  ),
};

window.t3 = t3;
window.LANGS = LANGS;
window.UI = UI;
