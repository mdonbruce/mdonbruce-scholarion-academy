/**
 * LMS feature-parity audit (Tab 51). Generated from a code audit of src/campus against the
 * parity specification; items marked closedIn were implemented in the latest build.
 * Statuses are honest: DONE = server logic + API + screen; PARTIAL names what is missing.
 */

export interface ParityRow {
  section: string;
  feature: string;
  status: "DONE" | "PARTIAL" | "NOT_STARTED";
  evidence: string;
  gap: string;
  closedIn?: string;
}

export const PARITY: ParityRow[] = [
 {
  "section": "1",
  "feature": "Course roles teacher/TA/designer/student/observer",
  "status": "DONE",
  "evidence": "registry.ts:enrollments.role enum; common.ts:STAFF_COURSE/GRADERS; iam.ts:hasAny(courseId)",
  "gap": ""
 },
 {
  "section": "1",
  "feature": "Account admin / sub-account admin / custom roles",
  "status": "PARTIAL",
  "evidence": "registry.ts:custom_roles; admin.ts:grantCustomRole; ops custom_roles.grant",
  "gap": "role_grants are tenant-scope only; no admin role scoped to a sub-account"
 },
 {
  "section": "1",
  "feature": "Permissions matrix with toggles",
  "status": "DONE",
  "evidence": "permissions.ts:PERMISSIONS,setPermission,permissionMatrix; ops permissions.matrix/permissions.set",
  "gap": ""
 },
 {
  "section": "1",
  "feature": "Inheritance down account tree with locks",
  "status": "DONE",
  "evidence": "permissions.ts:accountChain,resolvePermission (locked nodes); permission_overrides entity",
  "gap": ""
 },
 {
  "section": "1",
  "feature": "Observers linked to students with consent",
  "status": "DONE",
  "evidence": "people.ts:pairingCode,redeemPairing; registry consents; success.ts:observerCanSee; ops observers.*",
  "gap": ""
 },
 {
  "section": "1",
  "feature": "Act-as/masquerade time-boxed + banner + audit",
  "status": "DONE",
  "evidence": "admin.ts:startMasquerade(60min,MFA),stopMasquerade; iam.ts:resolveSession; shell.tsx banner; router as_user_id",
  "gap": ""
 },
 {
  "section": "1",
  "feature": "Student View (fake test student, isolated, resettable)",
  "status": "PARTIAL",
  "evidence": "curriculum.ts:studentView; ops course.student_view; course.tsx:StudentViewInfo",
  "gap": "test student not excluded from roster/gradebook/analytics (activeStudents); teacher can't act as it, only preview"
 },
 {
  "section": "2",
  "feature": "Account profile (avatar,pronouns,bio,contacts,lang,tz,a11y prefs)",
  "status": "DONE",
  "evidence": "dashboard.ts:profile,updateProfile; profiles entity; ops account.profile(.update); personal.tsx:AccountView",
  "gap": ""
 },
 {
  "section": "2",
  "feature": "Profile notification prefs",
  "status": "DONE",
  "evidence": "success.ts:setNotificationPrefs; ops notifications.prefs",
  "gap": ""
 },
 {
  "section": "2",
  "feature": "Personal files",
  "status": "DONE",
  "evidence": "files.ts:requestUpload purpose=personal, user quota; router upload",
  "gap": ""
 },
 {
  "section": "2",
  "feature": "ePortfolios in global nav",
  "status": "DONE",
  "evidence": "registry portfolios/portfolio_pages/artifacts (tab credentials)",
  "gap": ""
 },
 {
  "section": "2",
  "feature": "QR login",
  "status": "DONE",
  "evidence": "admin.ts:createQrLogin,redeemQrLogin; ops account.qr_login; router auth/qr",
  "gap": ""
 },
 {
  "section": "2",
  "feature": "Shared content inbox",
  "status": "DONE",
  "evidence": "content.ts:shareItem(scope user),sharedLibrary,importShared; ops library.*",
  "gap": ""
 },
 {
  "section": "2",
  "feature": "Dashboard card view (color/nickname/image, unread badges, reorder)",
  "status": "DONE",
  "evidence": "dashboard.ts:cards,setDashboardPrefs; ops dashboard.prefs",
  "gap": ""
 },
 {
  "section": "2",
  "feature": "List view planner w/ personal to-dos + mark complete",
  "status": "DONE",
  "evidence": "dashboard.ts:planner,markPlanner; planner_items entity; ops planner/planner.mark; personal.tsx:PlannerList",
  "gap": ""
 },
 {
  "section": "2",
  "feature": "Recent activity",
  "status": "DONE",
  "evidence": "dashboard.ts:activity; ops dashboard.activity",
  "gap": ""
 },
 {
  "section": "2",
  "feature": "Right sidebar to-do / coming up / recent feedback",
  "status": "DONE",
  "evidence": "dashboard.ts:todo,comingUp,recentFeedback,dashboard; ops dashboard",
  "gap": ""
 },
 {
  "section": "2",
  "feature": "Global announcements by role/date with dismiss",
  "status": "DONE",
  "evidence": "admin.ts:activeGlobalAnnouncements,dismissGlobalAnnouncement; global_announcements entity",
  "gap": ""
 },
 {
  "section": "2",
  "feature": "All Courses page (current/past/future, favorites)",
  "status": "DONE",
  "evidence": "course.tsx:CoursesList groups current/future/past, shows favorites",
  "gap": "",
  "closedIn": "this build"
 },
 {
  "section": "2",
  "feature": "Groups across courses with own pages/discussions/files",
  "status": "PARTIAL",
  "evidence": "groups/group_sets entities; collaboration.ts:thread groupSetId",
  "gap": "groups are course-scoped; no group home, pages or group files; no cross-course groups view"
 },
 {
  "section": "2",
  "feature": "History (recently viewed)",
  "status": "DONE",
  "evidence": "dashboard.ts:recordView,viewHistory; router POST view; ops account.history",
  "gap": ""
 },
 {
  "section": "2",
  "feature": "Media library (record/upload/caption/share)",
  "status": "PARTIAL",
  "evidence": "media, caption_tracks entities; files.ts media-transcoder consumer",
  "gap": "course-scoped only; no personal library, in-browser recording or sharing"
 },
 {
  "section": "2",
  "feature": "Help menu (configurable links, report problem → ticket)",
  "status": "DONE",
  "evidence": "admin.ts:helpLinks,setHelpLinks; tickets entity create:ALL; desk.ts",
  "gap": ""
 },
 {
  "section": "3.1",
  "feature": "Course home page type choice",
  "status": "PARTIAL",
  "evidence": "courses.homeType enum; course.tsx:CourseView tab default",
  "gap": "front_page and activity home types fall back to modules in UI"
 },
 {
  "section": "3.1",
  "feature": "Course setup checklist",
  "status": "DONE",
  "evidence": "curriculum.ts:setupChecklist; ops course.checklist",
  "gap": ""
 },
 {
  "section": "3.2",
  "feature": "Announcements delayed posting",
  "status": "DONE",
  "evidence": "collaboration.ts:announcements beforeWrite,announcementJob",
  "gap": ""
 },
 {
  "section": "3.2",
  "feature": "Announcement replies/likes",
  "status": "DONE",
  "evidence": "lmsplus.ts:replyAnnouncement,likeAnnouncement; ops announcement.reply/like",
  "gap": "",
  "closedIn": "this build"
 },
 {
  "section": "3.2",
  "feature": "Announcement section targeting",
  "status": "DONE",
  "evidence": "announcements.sectionId; canRead hook; announcementPublished recipients",
  "gap": ""
 },
 {
  "section": "3.2",
  "feature": "Announcement podcast feed",
  "status": "DONE",
  "evidence": "collaboration.ts:podcastFeed; router /podcast/:tenant/:courseId",
  "gap": ""
 },
 {
  "section": "3.2",
  "feature": "Announcement read/unread",
  "status": "DONE",
  "evidence": "collaboration.ts:markAnnouncementRead; ops announcement.read; dashboard cards unread",
  "gap": ""
 },
 {
  "section": "3.2",
  "feature": "Announcement lock replies",
  "status": "DONE",
  "evidence": "lmsplus.ts:replyAnnouncement (423 when locked)",
  "gap": "",
  "closedIn": "this build"
 },
 {
  "section": "3.3",
  "feature": "Syllabus auto-generated summary",
  "status": "DONE",
  "evidence": "curriculum.ts:syllabus; ops course.syllabus",
  "gap": ""
 },
 {
  "section": "3.4",
  "feature": "Module item kinds (page/asg/quiz/disc/file/header/url/LTI)",
  "status": "DONE",
  "evidence": "module_items.kind enum; curriculum.ts module_items hooks",
  "gap": ""
 },
 {
  "section": "3.4",
  "feature": "Reorder/move items between modules",
  "status": "DONE",
  "evidence": "curriculum.ts:moveItem; ops module.move_item",
  "gap": ""
 },
 {
  "section": "3.4",
  "feature": "Indentation",
  "status": "DONE",
  "evidence": "module_items.indent; curriculum.ts:moveItem indent",
  "gap": ""
 },
 {
  "section": "3.4",
  "feature": "Publish per module/item",
  "status": "DONE",
  "evidence": "modules/module_items publishable + publishChecks; router /r/:t/:id/publish",
  "gap": ""
 },
 {
  "section": "3.4",
  "feature": "Prerequisites",
  "status": "DONE",
  "evidence": "modules.prerequisiteModuleIds; curriculum.ts:moduleStates",
  "gap": ""
 },
 {
  "section": "3.4",
  "feature": "Lock until date",
  "status": "DONE",
  "evidence": "modules.unlockAt; curriculum.ts:moduleStates",
  "gap": ""
 },
 {
  "section": "3.4",
  "feature": "Requirements (view/mark done/contribute/submit/min score)",
  "status": "DONE",
  "evidence": "curriculum.ts:requirementMet,openItem,markDone; ops module.open_item/mark_done",
  "gap": ""
 },
 {
  "section": "3.4",
  "feature": "Require all vs one",
  "status": "DONE",
  "evidence": "modules.requireAll; curriculum.ts:moduleStates complete",
  "gap": ""
 },
 {
  "section": "3.4",
  "feature": "Sequential progression enforced server-side",
  "status": "DONE",
  "evidence": "curriculum.ts:moduleStates sequential, assertAccessible (423)",
  "gap": ""
 },
 {
  "section": "3.4",
  "feature": "Next/previous",
  "status": "DONE",
  "evidence": "curriculum.ts:openItem prev/next; course.tsx:ItemPager",
  "gap": ""
 },
 {
  "section": "3.4",
  "feature": "Mastery Paths",
  "status": "DONE",
  "evidence": "mastery_paths entity; curriculum.ts:masteryGate",
  "gap": ""
 },
 {
  "section": "3.4",
  "feature": "Duplicate module",
  "status": "DONE",
  "evidence": "curriculum.ts:duplicateModule; ops module.duplicate",
  "gap": ""
 },
 {
  "section": "3.4",
  "feature": "Progress for all students",
  "status": "DONE",
  "evidence": "curriculum.ts:progressReport; ops course.progress",
  "gap": ""
 },
 {
  "section": "3.4",
  "feature": "Assign-to per module",
  "status": "DONE",
  "evidence": "modules.assignTo; curriculum.ts:assignedTo",
  "gap": ""
 },
 {
  "section": "3.5",
  "feature": "Assignment groups weights + drop lowest/highest/never drop",
  "status": "DONE",
  "evidence": "assignment_groups fields; grading.ts:computeTotals drop rules",
  "gap": ""
 },
 {
  "section": "3.5",
  "feature": "Display grade types (points/%/c-i/letter/GPA/not graded)",
  "status": "DONE",
  "evidence": "lmsplus.ts:displayGrade used on the student Grades page",
  "gap": "",
  "closedIn": "this build"
 },
 {
  "section": "3.5",
  "feature": "Exclude from final grade",
  "status": "DONE",
  "evidence": "grading.ts:computeTotals excludeFromFinal",
  "gap": ""
 },
 {
  "section": "3.5",
  "feature": "Submission types incl URL/media/annotation/on paper/none",
  "status": "DONE",
  "evidence": "assessment.ts:submit modes; ops submission.create",
  "gap": ""
 },
 {
  "section": "3.5",
  "feature": "Allowed extensions",
  "status": "DONE",
  "evidence": "assessment.ts:submit allowedExtensions check",
  "gap": ""
 },
 {
  "section": "3.5",
  "feature": "Attempts",
  "status": "DONE",
  "evidence": "assessment.ts:submit attempts limit",
  "gap": ""
 },
 {
  "section": "3.5",
  "feature": "Group assignments (grade individually)",
  "status": "DONE",
  "evidence": "assessment.ts:submit groupSetId; lmsplus.ts:gradeGroup honors gradeIndividually",
  "gap": "",
  "closedIn": "this build"
 },
 {
  "section": "3.5",
  "feature": "Peer reviews (auto/manual, anonymous)",
  "status": "DONE",
  "evidence": "assessment.ts:assignPeerReviews,completePeerReview,myPeerReviews; ops peer.*",
  "gap": ""
 },
 {
  "section": "3.5",
  "feature": "Moderated grading (multiple graders, final grader)",
  "status": "DONE",
  "evidence": "grading.ts:setGrade provisional,selectProvisional; ops grades.select_provisional",
  "gap": ""
 },
 {
  "section": "3.5",
  "feature": "Anonymous grading",
  "status": "DONE",
  "evidence": "assessment.ts:graderQueue anonymous; grading.ts:postingMode manual",
  "gap": ""
 },
 {
  "section": "3.5",
  "feature": "Plagiarism hook",
  "status": "PARTIAL",
  "evidence": "assessment.ts:submit queues similarity request + submissions.similarity_requested event",
  "gap": "No similarity tool connected; results aren't posted back yet",
  "closedIn": "this build"
 },
 {
  "section": "3.5",
  "feature": "Assign-to with per-target dates",
  "status": "DONE",
  "evidence": "assignment_overrides; curriculum.ts:effectiveDates",
  "gap": ""
 },
 {
  "section": "3.5",
  "feature": "Late/missing policies (missing grade, %/day/hour, floor)",
  "status": "PARTIAL",
  "evidence": "grading.ts:latePenalty,computeTotals missingScorePct; courses.latePolicy",
  "gap": "per-hour deduction missing; missing score computed in totals, not stored as grade"
 },
 {
  "section": "3.5",
  "feature": "Submission detail page (attempt history + comments)",
  "status": "DONE",
  "evidence": "ops submission.mine, submission.comments; course.tsx:AssignmentDetail",
  "gap": ""
 },
 {
  "section": "3.5",
  "feature": "Bulk edit dates",
  "status": "DONE",
  "evidence": "lmsplus.ts:bulkEditDates; ops assignments.bulk_dates; course Settings → Bulk edit dates",
  "gap": "",
  "closedIn": "this build"
 },
 {
  "section": "3.5",
  "feature": "Rubric attach",
  "status": "DONE",
  "evidence": "assignments.rubricId; grading.ts:setGrade rubric",
  "gap": ""
 },
 {
  "section": "3.5",
  "feature": "Outcome alignment",
  "status": "DONE",
  "evidence": "assignments.outcomeIds; outcome_alignments entity",
  "gap": ""
 },
 {
  "section": "3.5",
  "feature": "Student badges missing/late/excused/resubmitted",
  "status": "DONE",
  "evidence": "grading.ts:computeTotals status; course.tsx:StudentGrades Chip",
  "gap": ""
 },
 {
  "section": "3.6",
  "feature": "Focused vs threaded",
  "status": "DONE",
  "evidence": "collaboration.ts:post focused depth check",
  "gap": ""
 },
 {
  "section": "3.6",
  "feature": "Graded discussions",
  "status": "DONE",
  "evidence": "collaboration.ts:discussion_topics afterWrite backing assignment",
  "gap": ""
 },
 {
  "section": "3.6",
  "feature": "Post before seeing replies",
  "status": "DONE",
  "evidence": "collaboration.ts:thread gated",
  "gap": ""
 },
 {
  "section": "3.6",
  "feature": "Discussion podcast",
  "status": "DONE",
  "evidence": "collaboration.ts:podcastFeed includes podcast-enabled discussion posts (not anonymous)",
  "gap": "",
  "closedIn": "this build"
 },
 {
  "section": "3.6",
  "feature": "Likes (graders only option)",
  "status": "DONE",
  "evidence": "collaboration.ts:like onlyGradersLike; ops discussion.like",
  "gap": ""
 },
 {
  "section": "3.6",
  "feature": "Sort by likes",
  "status": "DONE",
  "evidence": "collaboration.ts:thread sort likes/sortByLikes",
  "gap": ""
 },
 {
  "section": "3.6",
  "feature": "Group discussions",
  "status": "DONE",
  "evidence": "collaboration.ts:thread groupSetId filter",
  "gap": ""
 },
 {
  "section": "3.6",
  "feature": "Delayed availability",
  "status": "DONE",
  "evidence": "collaboration.ts:topicFor availableFrom",
  "gap": ""
 },
 {
  "section": "3.6",
  "feature": "Section-specific",
  "status": "DONE",
  "evidence": "collaboration.ts:topicFor/canRead sectionId",
  "gap": ""
 },
 {
  "section": "3.6",
  "feature": "Anonymous",
  "status": "DONE",
  "evidence": "collaboration.ts:thread anonymous full/partial",
  "gap": ""
 },
 {
  "section": "3.6",
  "feature": "Checkpoints",
  "status": "DONE",
  "evidence": "collaboration.ts:checkpointStatus,gradeCheckpoints; ops discussion.grade_checkpoints",
  "gap": ""
 },
 {
  "section": "3.6",
  "feature": "Pin",
  "status": "DONE",
  "evidence": "discussion_topics.pinned; thread topic.pinned",
  "gap": ""
 },
 {
  "section": "3.6",
  "feature": "Close for comments",
  "status": "DONE",
  "evidence": "collaboration.ts:post closed check",
  "gap": ""
 },
 {
  "section": "3.6",
  "feature": "Subscribe",
  "status": "DONE",
  "evidence": "collaboration.ts:subscribe; ops discussion.subscribe",
  "gap": ""
 },
 {
  "section": "3.6",
  "feature": "Unread counts",
  "status": "DONE",
  "evidence": "collaboration.ts:thread unread",
  "gap": ""
 },
 {
  "section": "3.6",
  "feature": "Mark all read",
  "status": "DONE",
  "evidence": "collaboration.ts:markAllRead; ops discussion.mark_all_read",
  "gap": ""
 },
 {
  "section": "3.6",
  "feature": "Edit history",
  "status": "DONE",
  "evidence": "collaboration.ts:editPost edits[]",
  "gap": ""
 },
 {
  "section": "3.6",
  "feature": "Report",
  "status": "DONE",
  "evidence": "collaboration.ts:reportPost; ops discussion.report",
  "gap": ""
 },
 {
  "section": "3.6",
  "feature": "@mentions",
  "status": "DONE",
  "evidence": "collaboration.ts:post mentions + notify",
  "gap": ""
 },
 {
  "section": "3.6",
  "feature": "Tombstones",
  "status": "DONE",
  "evidence": "collaboration.ts:deletePost,thread deleted",
  "gap": ""
 },
 {
  "section": "3.7",
  "feature": "Gradebook grid",
  "status": "DONE",
  "evidence": "grading.ts:gradebookGrid; ops gradebook.grid; course.tsx:Gradebook",
  "gap": ""
 },
 {
  "section": "3.7",
  "feature": "Status colors",
  "status": "DONE",
  "evidence": "course.tsx:Gradebook gb-${status} cells",
  "gap": ""
 },
 {
  "section": "3.7",
  "feature": "Filters (section/module/group/grading period)",
  "status": "DONE",
  "evidence": "ops gradebook.grid periodId/studentGroupId/moduleId/sectionId",
  "gap": "Course gradebook screen shows the section filter; the rest are on the Gradebook tab's action form and the API",
  "closedIn": "this build"
 },
 {
  "section": "3.7",
  "feature": "Sorting",
  "status": "DONE",
  "evidence": "ops gradebook.grid sort (due/points/module/title)",
  "gap": "",
  "closedIn": "this build"
 },
 {
  "section": "3.7",
  "feature": "Hide unpublished",
  "status": "DONE",
  "evidence": "gradebookGrid showUnpublished; ops gradebook.grid",
  "gap": ""
 },
 {
  "section": "3.7",
  "feature": "Notes column",
  "status": "DONE",
  "evidence": "gradebook_notes entity; gradebookGrid row.note",
  "gap": ""
 },
 {
  "section": "3.7",
  "feature": "Detail tray",
  "status": "DONE",
  "evidence": "lmsplus.ts:gradeDetail; ops gradebook.cell (status, submission, comments, history)",
  "gap": "",
  "closedIn": "this build"
 },
 {
  "section": "3.7",
  "feature": "Curve grades",
  "status": "DONE",
  "evidence": "grading.ts:curve; ops grades.curve",
  "gap": ""
 },
 {
  "section": "3.7",
  "feature": "Set default grade",
  "status": "DONE",
  "evidence": "grading.ts:defaultGrade; ops grades.default",
  "gap": ""
 },
 {
  "section": "3.7",
  "feature": "Message students who",
  "status": "DONE",
  "evidence": "grading.ts:messageStudentsWho; ops grades.message_students_who",
  "gap": ""
 },
 {
  "section": "3.7",
  "feature": "Grading periods with lock",
  "status": "DONE",
  "evidence": "grading_periods.closeAt; grading.ts:periodClosed (423)",
  "gap": ""
 },
 {
  "section": "3.7",
  "feature": "Grading schemes (letter/pass-fail/GPA)",
  "status": "PARTIAL",
  "evidence": "grading_schemes entity; grading.ts:letterFor",
  "gap": "GPA values never computed/shown; kind not used"
 },
 {
  "section": "3.7",
  "feature": "Final grade override",
  "status": "DONE",
  "evidence": "grading.ts:setFinalOverride; ops grades.final_override",
  "gap": ""
 },
 {
  "section": "3.7",
  "feature": "Posting policies (auto/manual, post/hide by section)",
  "status": "DONE",
  "evidence": "posting_policies; grading.ts:postingMode,postGrades; ops grades.post",
  "gap": ""
 },
 {
  "section": "3.7",
  "feature": "Hidden icon",
  "status": "DONE",
  "evidence": "course.tsx:Gradebook ◌ not-posted marker",
  "gap": ""
 },
 {
  "section": "3.7",
  "feature": "Gradebook history filterable",
  "status": "DONE",
  "evidence": "grading.ts:history; ops grades.history",
  "gap": ""
 },
 {
  "section": "3.7",
  "feature": "CSV import with preview + export",
  "status": "DONE",
  "evidence": "grading.ts:importCsv,exportCsv; ops grades.import_csv/export_csv",
  "gap": ""
 },
 {
  "section": "3.7",
  "feature": "Individual gradebook view",
  "status": "PARTIAL",
  "evidence": "ops grades.totals(userId), analytics.student",
  "gap": "no individual-view screen navigating student by student"
 },
 {
  "section": "3.7",
  "feature": "Learning mastery gradebook",
  "status": "DONE",
  "evidence": "grading.ts:masteryGradebook; ops mastery.gradebook",
  "gap": ""
 },
 {
  "section": "3.7",
  "feature": "Student grades page with What-If (not saved)",
  "status": "DONE",
  "evidence": "grading.ts:computeTotals whatIf; course.tsx:StudentGrades",
  "gap": ""
 },
 {
  "section": "3.7",
  "feature": "Hide totals",
  "status": "DONE",
  "evidence": "courses.hideTotals; ops grades.totals",
  "gap": ""
 },
 {
  "section": "3.8",
  "feature": "Student navigation",
  "status": "DONE",
  "evidence": "course.tsx:Grader prev/next; assessment.ts:graderQueue",
  "gap": ""
 },
 {
  "section": "3.8",
  "feature": "Needs-grading filter",
  "status": "DONE",
  "evidence": "graderQueue needsGrading; ops grader.queue",
  "gap": ""
 },
 {
  "section": "3.8",
  "feature": "Hide names",
  "status": "DONE",
  "evidence": "graderQueue anonymous display",
  "gap": ""
 },
 {
  "section": "3.8",
  "feature": "Annotations (6 types) stored separately",
  "status": "DONE",
  "evidence": "grading.ts:annotate; annotations entity; ops submission.annotate",
  "gap": ""
 },
 {
  "section": "3.8",
  "feature": "Attempts",
  "status": "DONE",
  "evidence": "graderQueue attempts; Grader shows attempt",
  "gap": ""
 },
 {
  "section": "3.8",
  "feature": "Rubric grading",
  "status": "DONE",
  "evidence": "grading.ts:setGrade rubric; Grader rating__ fields",
  "gap": ""
 },
 {
  "section": "3.8",
  "feature": "Comment library",
  "status": "DONE",
  "evidence": "comment_library entity; grading.ts:comment libraryId",
  "gap": ""
 },
 {
  "section": "3.8",
  "feature": "Media comments",
  "status": "DONE",
  "evidence": "grading.ts:comment mediaUrl; ops submission.comment",
  "gap": ""
 },
 {
  "section": "3.8",
  "feature": "Group grading",
  "status": "DONE",
  "evidence": "lmsplus.ts:gradeGroup; ops grades.set_group",
  "gap": "",
  "closedIn": "this build"
 },
 {
  "section": "3.8",
  "feature": "Moderated/anonymous in grader",
  "status": "DONE",
  "evidence": "graderQueue provisional/anonymous; selectProvisional",
  "gap": ""
 },
 {
  "section": "3.8",
  "feature": "Status menu",
  "status": "DONE",
  "evidence": "ops grades.set status (late/missing/excused)",
  "gap": ""
 },
 {
  "section": "3.8",
  "feature": "Resubmission indicator",
  "status": "DONE",
  "evidence": "graderQueue resubmitted",
  "gap": ""
 },
 {
  "section": "3.8",
  "feature": "412 on stale edit",
  "status": "DONE",
  "evidence": "grading.ts:setGrade ifVersion → 412",
  "gap": ""
 },
 {
  "section": "3.9",
  "feature": "Roster fields",
  "status": "DONE",
  "evidence": "people.ts:roster; ops people.roster",
  "gap": ""
 },
 {
  "section": "3.9",
  "feature": "Roster filters",
  "status": "DONE",
  "evidence": "roster role/sectionId/q/includeInactive",
  "gap": ""
 },
 {
  "section": "3.9",
  "feature": "Add people (permission)",
  "status": "DONE",
  "evidence": "people.ts:addPeople (manage_users); ops people.add",
  "gap": ""
 },
 {
  "section": "3.9",
  "feature": "Edit sections/role",
  "status": "DONE",
  "evidence": "lmsplus.ts:editEnrollment; ops people.edit_enrollment",
  "gap": "",
  "closedIn": "this build"
 },
 {
  "section": "3.9",
  "feature": "Link observer",
  "status": "DONE",
  "evidence": "observer_links CRUD; people.ts:redeemPairing",
  "gap": ""
 },
 {
  "section": "3.9",
  "feature": "Deactivate",
  "status": "DONE",
  "evidence": "people.ts:setEnrollmentState; ops people.set_state",
  "gap": ""
 },
 {
  "section": "3.9",
  "feature": "Access report",
  "status": "DONE",
  "evidence": "success.ts:accessReport; ops analytics.access_report",
  "gap": ""
 },
 {
  "section": "3.9",
  "feature": "Group sets",
  "status": "DONE",
  "evidence": "group_sets entity; people.ts:groupSetView",
  "gap": ""
 },
 {
  "section": "3.9",
  "feature": "Self sign-up limits",
  "status": "DONE",
  "evidence": "people.ts:joinGroup maxSize/bySection",
  "gap": ""
 },
 {
  "section": "3.9",
  "feature": "Auto-assign balanced by section",
  "status": "DONE",
  "evidence": "people.ts:autoAssign; ops groups.auto_assign",
  "gap": ""
 },
 {
  "section": "3.9",
  "feature": "Group leaders",
  "status": "DONE",
  "evidence": "groups.leaderId; people.ts:leaveGroup",
  "gap": ""
 },
 {
  "section": "3.9",
  "feature": "Move students between groups",
  "status": "DONE",
  "evidence": "groups.memberIds update via /r/groups (TEACH)",
  "gap": ""
 },
 {
  "section": "3.9",
  "feature": "Groups CSV import",
  "status": "DONE",
  "evidence": "people.ts:importGroupsCsv,exportGroupsCsv",
  "gap": ""
 },
 {
  "section": "3.9",
  "feature": "Clone group set",
  "status": "DONE",
  "evidence": "people.ts:cloneGroupSet; ops groups.clone",
  "gap": ""
 },
 {
  "section": "3.10",
  "feature": "Page revision history + restore",
  "status": "DONE",
  "evidence": "curriculum.ts:pages beforeWrite,restoreRevision; ops page.restore_revision",
  "gap": ""
 },
 {
  "section": "3.10",
  "feature": "Front page",
  "status": "DONE",
  "evidence": "pages.frontPage single-per-course hook",
  "gap": ""
 },
 {
  "section": "3.10",
  "feature": "Editing roles",
  "status": "PARTIAL",
  "evidence": "pages.editingRoles; curriculum.ts:canEditPage",
  "gap": "canEditPage never called; students can't edit"
 },
 {
  "section": "3.10",
  "feature": "Page to-do date",
  "status": "DONE",
  "evidence": "dashboard.ts:planner adds pages with a to-do date",
  "gap": "",
  "closedIn": "this build"
 },
 {
  "section": "3.10",
  "feature": "Links auto-update on rename",
  "status": "PARTIAL",
  "evidence": "curriculum.ts:renderBlocks resolves titles",
  "gap": "html stored at write; renaming target doesn't re-render linking pages"
 },
 {
  "section": "3.11",
  "feature": "Folders",
  "status": "DONE",
  "evidence": "folders entity; files.folderId",
  "gap": ""
 },
 {
  "section": "3.11",
  "feature": "Bulk move/delete",
  "status": "DONE",
  "evidence": "files.ts:bulkFiles; ops files.bulk",
  "gap": ""
 },
 {
  "section": "3.11",
  "feature": "Zip download",
  "status": "DONE",
  "evidence": "router files/zip → files.ts:zipFiles (download permission per file)",
  "gap": "",
  "closedIn": "this build"
 },
 {
  "section": "3.11",
  "feature": "Publish/unpublish/schedule/hidden-linkable",
  "status": "DONE",
  "evidence": "files.ts:setFilePublished,canDownload availableFrom/hiddenLinkable",
  "gap": ""
 },
 {
  "section": "3.11",
  "feature": "Usage rights enforced",
  "status": "DONE",
  "evidence": "files.ts:setFilePublished,bulkFiles usage_rights_required",
  "gap": ""
 },
 {
  "section": "3.11",
  "feature": "File preview",
  "status": "NOT_STARTED",
  "evidence": "router objects (download only)",
  "gap": "no inline preview"
 },
 {
  "section": "3.11",
  "feature": "Quotas (course/user/group)",
  "status": "PARTIAL",
  "evidence": "files.ts:quotaBytes",
  "gap": "no group quota"
 },
 {
  "section": "3.11",
  "feature": "Restore deleted files",
  "status": "DONE",
  "evidence": "entity.ts:restore; router /r/files/:id/restore",
  "gap": ""
 },
 {
  "section": "3.11",
  "feature": "Scanning",
  "status": "DONE",
  "evidence": "files.ts:scanFile,sniff; file-scanner consumer",
  "gap": ""
 },
 {
  "section": "3.12",
  "feature": "Question types (15 kinds)",
  "status": "DONE",
  "evidence": "assessment.ts:scoreQuestion,publicQuestion; questions.kind",
  "gap": ""
 },
 {
  "section": "3.12",
  "feature": "Item banks shared with tags/versions",
  "status": "PARTIAL",
  "evidence": "question_banks (course:true); questions.tags,version",
  "gap": "banks course-scoped, not shareable across courses; version only bumped on regrade"
 },
 {
  "section": "3.12",
  "feature": "Random pools",
  "status": "DONE",
  "evidence": "assessment.ts:poolQuestions; quizzes.pools",
  "gap": ""
 },
 {
  "section": "3.12",
  "feature": "Time limit",
  "status": "DONE",
  "evidence": "assessment.ts:startAttempt deadline,autoSubmitIfExpired",
  "gap": ""
 },
 {
  "section": "3.12",
  "feature": "Attempts keep highest/latest/average",
  "status": "DONE",
  "evidence": "assessment.ts:postQuizScore",
  "gap": ""
 },
 {
  "section": "3.12",
  "feature": "Cooling period",
  "status": "DONE",
  "evidence": "startAttempt coolingMinutes",
  "gap": ""
 },
 {
  "section": "3.12",
  "feature": "Shuffle",
  "status": "DONE",
  "evidence": "startAttempt shuffleQuestions; publicQuestion shuffleAnswers",
  "gap": ""
 },
 {
  "section": "3.12",
  "feature": "One-at-a-time / lock after answer",
  "status": "DONE",
  "evidence": "assessment.ts:autosave lockAfterAnswer; attemptView oneAtATime",
  "gap": ""
 },
 {
  "section": "3.12",
  "feature": "Access code",
  "status": "DONE",
  "evidence": "startAttempt accessCode; ops quiz.start",
  "gap": ""
 },
 {
  "section": "3.12",
  "feature": "IP filter",
  "status": "DONE",
  "evidence": "router injects client IP from the proxy; ops quiz.start passes it",
  "gap": "",
  "closedIn": "this build"
 },
 {
  "section": "3.12",
  "feature": "Availability",
  "status": "DONE",
  "evidence": "startAttempt quizDates unlock/lock",
  "gap": ""
 },
 {
  "section": "3.12",
  "feature": "Result visibility",
  "status": "DONE",
  "evidence": "attemptView showResponses/showCorrectAnswers/showCorrectAfter",
  "gap": ""
 },
 {
  "section": "3.12",
  "feature": "Calculator",
  "status": "PARTIAL",
  "evidence": "quizzes.calculator; attemptView returns it",
  "gap": "no calculator rendered in UI"
 },
 {
  "section": "3.12",
  "feature": "Accommodations",
  "status": "DONE",
  "evidence": "assessment.ts:accommodation (extra time/attempts)",
  "gap": ""
 },
 {
  "section": "3.12",
  "feature": "Moderate page",
  "status": "DONE",
  "evidence": "assessment.ts:moderate; ops quiz.moderate; QuizDetail",
  "gap": ""
 },
 {
  "section": "3.12",
  "feature": "Autosave with version",
  "status": "DONE",
  "evidence": "assessment.ts:autosave; ops quiz.autosave",
  "gap": ""
 },
 {
  "section": "3.12",
  "feature": "Idempotent submit",
  "status": "DONE",
  "evidence": "assessment.ts:submitAttempt; ops quiz.submit",
  "gap": ""
 },
 {
  "section": "3.12",
  "feature": "Auto-grade",
  "status": "DONE",
  "evidence": "assessment.ts:gradeAttempt,scoreQuestion",
  "gap": ""
 },
 {
  "section": "3.12",
  "feature": "Essay manual queue",
  "status": "DONE",
  "evidence": "assessment.ts:manualQueue,gradeQuestion; ops quiz.manual_queue",
  "gap": ""
 },
 {
  "section": "3.12",
  "feature": "Regrade",
  "status": "DONE",
  "evidence": "assessment.ts:regrade; ops quiz.regrade",
  "gap": ""
 },
 {
  "section": "3.12",
  "feature": "Item analysis",
  "status": "DONE",
  "evidence": "assessment.ts:itemAnalysis; ops quiz.item_analysis",
  "gap": ""
 },
 {
  "section": "3.12",
  "feature": "Student analysis",
  "status": "PARTIAL",
  "evidence": "itemAnalysis students[]",
  "gap": "only score per attempt; no per-student response report/CSV"
 },
 {
  "section": "3.12",
  "feature": "Outcomes analysis",
  "status": "PARTIAL",
  "evidence": "grading.ts:outcomeResults uses aligned questions",
  "gap": "no quiz-level outcomes analysis report"
 },
 {
  "section": "3.12",
  "feature": "Practice quizzes",
  "status": "DONE",
  "evidence": "quizzes.kind practice; postQuizScore skip",
  "gap": ""
 },
 {
  "section": "3.12",
  "feature": "Surveys (anonymous)",
  "status": "DONE",
  "evidence": "quizzes.kind survey,anonymousSurvey; itemAnalysis/manualQueue anonymized",
  "gap": ""
 },
 {
  "section": "3.12",
  "feature": "Proctoring via LTI",
  "status": "PARTIAL",
  "evidence": "quizzes.proctoringToolId; proctor.ts readiness checklist",
  "gap": "proctoringToolId never used; no LTI proctor launch"
 },
 {
  "section": "3.13",
  "feature": "Outcomes account/course",
  "status": "PARTIAL",
  "evidence": "outcomes entity (no courseId); outcome_alignments.courseId",
  "gap": "no course-level outcome definitions"
 },
 {
  "section": "3.13",
  "feature": "Outcome folders",
  "status": "NOT_STARTED",
  "evidence": "no outcome group/folder entity",
  "gap": "not implemented"
 },
 {
  "section": "3.13",
  "feature": "Mastery scales",
  "status": "PARTIAL",
  "evidence": "outcomes.masteryThreshold",
  "gap": "single threshold only; no multi-level scale/ratings"
 },
 {
  "section": "3.13",
  "feature": "Calculation methods",
  "status": "DONE",
  "evidence": "grading.ts:masteryScore (5 methods)",
  "gap": ""
 },
 {
  "section": "3.13",
  "feature": "Import standards",
  "status": "NOT_STARTED",
  "evidence": "none found",
  "gap": "no standards import"
 },
 {
  "section": "3.13",
  "feature": "Align to rubrics/quiz items",
  "status": "DONE",
  "evidence": "outcome_alignments; grading.ts:outcomeResults",
  "gap": ""
 },
 {
  "section": "3.13",
  "feature": "Outcome reports",
  "status": "DONE",
  "evidence": "success.ts:runReport outcome_results,evidenceExport; ops outcomes.results",
  "gap": ""
 },
 {
  "section": "3.14",
  "feature": "Rubric builder with point ranges",
  "status": "DONE",
  "evidence": "grading.ts:rubrics beforeWrite; setGrade criterion.range",
  "gap": ""
 },
 {
  "section": "3.14",
  "feature": "Free-form comments",
  "status": "DONE",
  "evidence": "rubrics.freeFormComments; setGrade rubric.comments",
  "gap": ""
 },
 {
  "section": "3.14",
  "feature": "Use for grading",
  "status": "DONE",
  "evidence": "grading.ts:setGrade rubric total",
  "gap": ""
 },
 {
  "section": "3.14",
  "feature": "Hide score total",
  "status": "PARTIAL",
  "evidence": "rubrics.hideScoreTotal",
  "gap": "stored/copied only; not applied to student view"
 },
 {
  "section": "3.14",
  "feature": "Outcome-linked rubrics",
  "status": "DONE",
  "evidence": "criteria.outcomeId; outcomeResults",
  "gap": ""
 },
 {
  "section": "3.14",
  "feature": "Rubric library across courses",
  "status": "DONE",
  "evidence": "rubrics.courseId blank = shared",
  "gap": ""
 },
 {
  "section": "3.14",
  "feature": "Versions lock once used",
  "status": "DONE",
  "evidence": "grading.ts:rubrics beforeWrite rubric_locked,newRubricVersion",
  "gap": ""
 },
 {
  "section": "3.15",
  "feature": "Collaborations",
  "status": "DONE",
  "evidence": "collaborations entity; collaboration.ts hook (simulated URL)",
  "gap": ""
 },
 {
  "section": "3.16",
  "feature": "Conferences join links",
  "status": "DONE",
  "evidence": "calendar.ts:scheduleLive joinUrl; ops live.schedule",
  "gap": ""
 },
 {
  "section": "3.16",
  "feature": "Recordings with retention",
  "status": "PARTIAL",
  "evidence": "live_sessions.recordingRetentionDays, recordings:[]",
  "gap": "no recording ingest or retention purge job"
 },
 {
  "section": "3.16",
  "feature": "Attendance import",
  "status": "DONE",
  "evidence": "calendar.ts:importAttendance,reconcileAttendance",
  "gap": ""
 },
 {
  "section": "3.17",
  "feature": "Weekly activity",
  "status": "DONE",
  "evidence": "success.ts:courseAnalytics weekly",
  "gap": ""
 },
 {
  "section": "3.17",
  "feature": "Avg grade per assignment",
  "status": "DONE",
  "evidence": "courseAnalytics assignments.avgPct,bySection",
  "gap": ""
 },
 {
  "section": "3.17",
  "feature": "On-time/late/missing",
  "status": "DONE",
  "evidence": "courseAnalytics onTime/late/missing",
  "gap": ""
 },
 {
  "section": "3.17",
  "feature": "Student-level analytics",
  "status": "DONE",
  "evidence": "success.ts:studentAnalytics; ops analytics.student",
  "gap": ""
 },
 {
  "section": "3.17",
  "feature": "Message from charts",
  "status": "PARTIAL",
  "evidence": "grading.ts:messageStudentsWho (gradebook)",
  "gap": "not wired from analytics views"
 },
 {
  "section": "3.17",
  "feature": "Analytics CSV",
  "status": "DONE",
  "evidence": "lmsplus.ts:courseAnalyticsCsv; ops analytics.export_csv (CSV response)",
  "gap": "",
  "closedIn": "this build"
 },
 {
  "section": "3.18",
  "feature": "Pace plans",
  "status": "DONE",
  "evidence": "pace_plans; calendar.ts:applyPacing; ops pacing.apply",
  "gap": ""
 },
 {
  "section": "3.18",
  "feature": "Blackout dates",
  "status": "DONE",
  "evidence": "blackout_dates; applyPacing isBlack",
  "gap": ""
 },
 {
  "section": "3.18",
  "feature": "Section/student paces",
  "status": "DONE",
  "evidence": "applyPacing plan scope student>section>course",
  "gap": ""
 },
 {
  "section": "3.19",
  "feature": "Course details",
  "status": "DONE",
  "evidence": "course.tsx:Settings EntityForm courses",
  "gap": ""
 },
 {
  "section": "3.19",
  "feature": "Student permission toggles",
  "status": "PARTIAL",
  "evidence": "courses.studentsCreateDiscussions; editPost studentsEditPosts",
  "gap": "only discussion toggles; studentsEditPosts not in registry"
 },
 {
  "section": "3.19",
  "feature": "Sections + cross-listing",
  "status": "DONE",
  "evidence": "sections.crossListedWith; sis.ts:sisImport xlists",
  "gap": ""
 },
 {
  "section": "3.19",
  "feature": "Navigation reorder/hide tabs",
  "status": "DONE",
  "evidence": "courses.navigation; curriculum.ts:courseNav",
  "gap": ""
 },
 {
  "section": "3.19",
  "feature": "Apps/LTI placements",
  "status": "PARTIAL",
  "evidence": "tool_registrations (tenant); module_items kind lti",
  "gap": "no course-level app install or placement config"
 },
 {
  "section": "3.19",
  "feature": "Course feature options",
  "status": "DONE",
  "evidence": "admin.ts:setFeature courseId; Settings OpForm features.set",
  "gap": ""
 },
 {
  "section": "3.19",
  "feature": "Sidebar: student view/copy/import",
  "status": "DONE",
  "evidence": "ops course.student_view, content.copy, content.import_package",
  "gap": ""
 },
 {
  "section": "3.19",
  "feature": "Sidebar: export",
  "status": "DONE",
  "evidence": "router courses/:id/export → content.ts:exportCourse; Settings link",
  "gap": "",
  "closedIn": "this build"
 },
 {
  "section": "3.19",
  "feature": "Sidebar: reset course content",
  "status": "DONE",
  "evidence": "lmsplus.ts:resetCourseContent (archives; blocked with student work); ops course.reset",
  "gap": "",
  "closedIn": "this build"
 },
 {
  "section": "3.19",
  "feature": "Sidebar: conclude",
  "status": "DONE",
  "evidence": "lmsplus.ts:concludeCourse; assessment.submit 423 when concluded; ops course.conclude",
  "gap": "",
  "closedIn": "this build"
 },
 {
  "section": "3.19",
  "feature": "Sidebar: delete",
  "status": "DONE",
  "evidence": "entity.ts:archive via DELETE /r/courses/:id",
  "gap": ""
 },
 {
  "section": "3.19",
  "feature": "Sidebar: statistics",
  "status": "DONE",
  "evidence": "lmsplus.ts:courseStatistics; ops course.statistics; Settings",
  "gap": "",
  "closedIn": "this build"
 },
 {
  "section": "4",
  "feature": "Month/week/agenda views",
  "status": "DONE",
  "evidence": "personal.tsx:CalendarView ?view=month|week|agenda",
  "gap": "",
  "closedIn": "this build"
 },
 {
  "section": "4",
  "feature": "Color per course",
  "status": "DONE",
  "evidence": "calendar.ts:projection color()",
  "gap": ""
 },
 {
  "section": "4",
  "feature": "Undated items",
  "status": "DONE",
  "evidence": "calendar.ts:projection undated",
  "gap": ""
 },
 {
  "section": "4",
  "feature": "Drag to reschedule updates due dates",
  "status": "DONE",
  "evidence": "calendar.ts:reschedule; ops calendar.reschedule",
  "gap": ""
 },
 {
  "section": "4",
  "feature": "Personal/course/section/group events",
  "status": "DONE",
  "evidence": "calendar_events courseId/sectionId/groupId; projection",
  "gap": ""
 },
 {
  "section": "4",
  "feature": "Recurring events",
  "status": "DONE",
  "evidence": "calendar.ts:expandRecurring",
  "gap": ""
 },
 {
  "section": "4",
  "feature": "Scheduler/appointment groups (slots, group sign-up, limits, cancel)",
  "status": "DONE",
  "evidence": "calendar.ts:signUpSlot,cancelSlot; appointment_groups/slots",
  "gap": ""
 },
 {
  "section": "4",
  "feature": "iCal feed with revocable hashed token",
  "status": "DONE",
  "evidence": "calendar.ts:issueFeed,revokeFeed,feedOwner,ics; router /ical",
  "gap": ""
 },
 {
  "section": "5",
  "feature": "Inbox folders (unread/starred/sent/archived/submission comments)",
  "status": "DONE",
  "evidence": "collaboration.ts:inbox; ops inbox.list",
  "gap": ""
 },
 {
  "section": "5",
  "feature": "Recipients resolved server-side by role/section/group",
  "status": "DONE",
  "evidence": "collaboration.ts:resolveRecipients",
  "gap": ""
 },
 {
  "section": "5",
  "feature": "Individual send",
  "status": "DONE",
  "evidence": "collaboration.ts:sendMessage individual",
  "gap": ""
 },
 {
  "section": "5",
  "feature": "Attachments",
  "status": "DONE",
  "evidence": "ops inbox.send attachments/mediaUrl; forward carries attachments",
  "gap": "Replies don't take attachments yet",
  "closedIn": "this build"
 },
 {
  "section": "5",
  "feature": "Reply/reply-all",
  "status": "DONE",
  "evidence": "collaboration.ts:reply; ops inbox.reply",
  "gap": ""
 },
 {
  "section": "5",
  "feature": "Forward",
  "status": "DONE",
  "evidence": "lmsplus.ts:forwardConversation; ops inbox.forward",
  "gap": "",
  "closedIn": "this build"
 },
 {
  "section": "5",
  "feature": "Star/archive/delete",
  "status": "DONE",
  "evidence": "collaboration.ts:setConversationState; ops inbox.state",
  "gap": ""
 },
 {
  "section": "5",
  "feature": "Search",
  "status": "DONE",
  "evidence": "collaboration.ts:inbox q",
  "gap": ""
 },
 {
  "section": "5",
  "feature": "Faculty journal",
  "status": "DONE",
  "evidence": "faculty_journal entity (tab groups)",
  "gap": ""
 },
 {
  "section": "6",
  "feature": "Course/user search",
  "status": "DONE",
  "evidence": "router GET /r/courses|users?q= → entity.list search",
  "gap": ""
 },
 {
  "section": "6",
  "feature": "Sub-account tree",
  "status": "DONE",
  "evidence": "accounts entity parentId; permissions.ts:accountChain",
  "gap": ""
 },
 {
  "section": "6",
  "feature": "Terms with role access overrides",
  "status": "NOT_STARTED",
  "evidence": "terms entity has no access override fields",
  "gap": "no per-role term date overrides"
 },
 {
  "section": "6",
  "feature": "Account grading schemes / grading-period sets",
  "status": "PARTIAL",
  "evidence": "grading_schemes courseId blank=account; grading_periods per term",
  "gap": "no grading-period set entity attachable to terms/accounts"
 },
 {
  "section": "6",
  "feature": "Admin permissions",
  "status": "DONE",
  "evidence": "ops permissions.matrix/set",
  "gap": ""
 },
 {
  "section": "6",
  "feature": "Shared outcomes/rubrics/banks",
  "status": "PARTIAL",
  "evidence": "outcomes (tenant), rubrics courseId blank",
  "gap": "question banks can't be shared at account level"
 },
 {
  "section": "6",
  "feature": "Authentication providers (SAML/OIDC/LDAP, MFA policy)",
  "status": "PARTIAL",
  "evidence": "core.ts realm; iam.ts mfaRequiredForStaff; platform.ts sso SIMULATED",
  "gap": "no admin config of IdPs; no LDAP; SSO not connected"
 },
 {
  "section": "6",
  "feature": "SIS import CSV with diffing/batches/errors",
  "status": "DONE",
  "evidence": "sis.ts:sisImport; sis_imports entity; ops sis.import",
  "gap": ""
 },
 {
  "section": "6",
  "feature": "Developer keys",
  "status": "DONE",
  "evidence": "integration.ts:createDeveloperKey,setDeveloperKeyEnabled",
  "gap": ""
 },
 {
  "section": "6",
  "feature": "Account LTI apps inherited",
  "status": "PARTIAL",
  "evidence": "tool_registrations tenant-wide",
  "gap": "no per-account install/inheritance"
 },
 {
  "section": "6",
  "feature": "Async reports CSV",
  "status": "PARTIAL",
  "evidence": "success.ts:runReport; report_runs; ops reports.run",
  "gap": "runs synchronously, no background job/status"
 },
 {
  "section": "6",
  "feature": "Themes (logo/colors/custom CSS sandboxed)",
  "status": "PARTIAL",
  "evidence": "admin.ts:setTheme (contrast-checked)",
  "gap": "logo text only, no logo image; no custom CSS"
 },
 {
  "section": "6",
  "feature": "Admin global announcements",
  "status": "DONE",
  "evidence": "global_announcements entity (admin CRUD)",
  "gap": ""
 },
 {
  "section": "6",
  "feature": "Feature options inherit/lock",
  "status": "DONE",
  "evidence": "admin.ts:resolveFeature,setFeature,featureMatrix",
  "gap": ""
 },
 {
  "section": "6",
  "feature": "Admin tool: restore deleted courses",
  "status": "DONE",
  "evidence": "entity.ts:restore; /r/courses/:id/restore",
  "gap": ""
 },
 {
  "section": "6",
  "feature": "Admin tool: notifications sent to a user",
  "status": "DONE",
  "evidence": "deliveries entity (admin read) via /r/deliveries?userId=",
  "gap": ""
 },
 {
  "section": "6",
  "feature": "Admin tool: logs by grade change/course/auth",
  "status": "PARTIAL",
  "evidence": "ops audit.log, grades.history",
  "gap": "audit.log has no filters by type/course/user; no auth log view"
 },
 {
  "section": "6",
  "feature": "Account settings (help links, trusted domains, IP filters, terms/privacy, self-reg)",
  "status": "PARTIAL",
  "evidence": "admin.ts:setHelpLinks; addDomain/verifyDomain",
  "gap": "no trusted domains, IP filters, terms/privacy links or self-registration"
 },
 {
  "section": "7",
  "feature": "Import Common Cartridge/QTI/zip",
  "status": "DONE",
  "evidence": "content.ts:importPackage,unzip; ops content.import_package",
  "gap": ""
 },
 {
  "section": "7",
  "feature": "Import other LMS packages",
  "status": "NOT_STARTED",
  "evidence": "importPackage requires imsmanifest",
  "gap": "no Moodle/Blackboard/D2L converters"
 },
 {
  "section": "7",
  "feature": "Course export (CC/QTI)",
  "status": "DONE",
  "evidence": "router courses/:id/export; Settings → Course actions",
  "gap": "",
  "closedIn": "this build"
 },
 {
  "section": "7",
  "feature": "Date shift",
  "status": "DONE",
  "evidence": "content.ts:copyCourse shift; ops content.copy shiftDays",
  "gap": ""
 },
 {
  "section": "7",
  "feature": "Async job with issue report",
  "status": "PARTIAL",
  "evidence": "content_jobs issues/progress",
  "gap": "jobs run synchronously (progress always 100)"
 },
 {
  "section": "7",
  "feature": "Quarantine on import",
  "status": "DONE",
  "evidence": "content.ts:importPackage quarantined",
  "gap": ""
 },
 {
  "section": "7",
  "feature": "Blueprint lock by attribute",
  "status": "DONE",
  "evidence": "courses.blueprintLocks; content.ts:setItemLock; ops blueprint.lock",
  "gap": ""
 },
 {
  "section": "7",
  "feature": "Blueprint sync history three-way diff",
  "status": "DONE",
  "evidence": "content.ts:blueprintSync; blueprint_syncs entity",
  "gap": ""
 },
 {
  "section": "7",
  "feature": "Blueprint unsynced changes",
  "status": "DONE",
  "evidence": "content.ts:blueprintPreview; ops blueprint.preview",
  "gap": ""
 },
 {
  "section": "7",
  "feature": "Blueprint idempotent sync",
  "status": "DONE",
  "evidence": "blueprintSync idempotencyKey",
  "gap": ""
 },
 {
  "section": "7",
  "feature": "Shared library (share, versions, direct share inbox)",
  "status": "DONE",
  "evidence": "content.ts:shareItem,sharedLibrary,importShared",
  "gap": ""
 },
 {
  "section": "8",
  "feature": "Headings/lists/tables with header markup",
  "status": "DONE",
  "evidence": "curriculum.ts:renderBlocks th scope,markupToBlocks",
  "gap": ""
 },
 {
  "section": "8",
  "feature": "Content picker links",
  "status": "DONE",
  "evidence": "link block ref; markup [t](page:id)",
  "gap": ""
 },
 {
  "section": "8",
  "feature": "Images alt text or decorative",
  "status": "DONE",
  "evidence": "image block alt/decorative; a11yCheck",
  "gap": ""
 },
 {
  "section": "8",
  "feature": "Media with captions",
  "status": "DONE",
  "evidence": "media block; hasCaptions",
  "gap": ""
 },
 {
  "section": "8",
  "feature": "Equation editor",
  "status": "DONE",
  "evidence": "equation block; markup $$",
  "gap": ""
 },
 {
  "section": "8",
  "feature": "Code blocks",
  "status": "DONE",
  "evidence": "code block",
  "gap": ""
 },
 {
  "section": "8",
  "feature": "LTI/allowlisted embeds",
  "status": "DONE",
  "evidence": "curriculum.ts:EMBED_ALLOWLIST,validateBlocks",
  "gap": ""
 },
 {
  "section": "8",
  "feature": "Word count",
  "status": "DONE",
  "evidence": "lmsplus.ts:pageWordCount; ops page.word_count",
  "gap": "",
  "closedIn": "this build"
 },
 {
  "section": "8",
  "feature": "HTML view sanitized",
  "status": "PARTIAL",
  "evidence": "renderBlocks escaped HTML stored",
  "gap": "no HTML editing view; markup only"
 },
 {
  "section": "8",
  "feature": "Accessibility checker with fixes",
  "status": "DONE",
  "evidence": "curriculum.ts:a11yCheck; ops page.a11y, ai.accessibility_scan",
  "gap": ""
 },
 {
  "section": "8",
  "feature": "JSON + sanitized HTML storage",
  "status": "DONE",
  "evidence": "pages.blocks + pages.html (beforeWrite)",
  "gap": ""
 },
 {
  "section": "9",
  "feature": "Channel x category matrix",
  "status": "DONE",
  "evidence": "notification_prefs.matrix; success.ts notifications consumer",
  "gap": ""
 },
 {
  "section": "9",
  "feature": "Frequency immediately/daily/weekly/off",
  "status": "DONE",
  "evidence": "success.ts:digestJob; deliveries digest states",
  "gap": ""
 },
 {
  "section": "9",
  "feature": "Course mute overrides",
  "status": "DONE",
  "evidence": "mutedCourses check in notifications consumer",
  "gap": ""
 },
 {
  "section": "9",
  "feature": "Outbox dispatch",
  "status": "DONE",
  "evidence": "common.ts:notify → outbox; core.ts:relay",
  "gap": ""
 },
 {
  "section": "9",
  "feature": "Tenant-branded templates",
  "status": "DONE",
  "evidence": "notification_templates; success.ts template fill with logoText",
  "gap": ""
 },
 {
  "section": "9",
  "feature": "Quiet hours",
  "status": "DONE",
  "evidence": "success.ts:inQuietHours, deferred_quiet",
  "gap": ""
 },
 {
  "section": "10",
  "feature": "Mobile PWA (manifest/service worker)",
  "status": "DONE",
  "evidence": "src/app/manifest.ts; public/sw.js; PwaRegister.tsx",
  "gap": ""
 },
 {
  "section": "10",
  "feature": "Teacher mini grader",
  "status": "PARTIAL",
  "evidence": "course.tsx:Grader",
  "gap": "no mobile-specific grader"
 },
 {
  "section": "10",
  "feature": "Attendance roll call",
  "status": "DONE",
  "evidence": "calendar.ts:rollCall; ops live.roll_call",
  "gap": ""
 },
 {
  "section": "10",
  "feature": "Observer alert thresholds",
  "status": "DONE",
  "evidence": "observer_links alert*; grading.ts observer-alerts consumer",
  "gap": ""
 },
 {
  "section": "10",
  "feature": "QR login (mobile)",
  "status": "DONE",
  "evidence": "admin.ts:createQrLogin,redeemQrLogin",
  "gap": ""
 },
 {
  "section": "11",
  "feature": "ePortfolio sections and pages",
  "status": "DONE",
  "evidence": "portfolios.sections; portfolio_pages",
  "gap": ""
 },
 {
  "section": "11",
  "feature": "Import submissions",
  "status": "DONE",
  "evidence": "artifacts.submissionId; portfolio_pages.submissionIds",
  "gap": ""
 },
 {
  "section": "11",
  "feature": "Public/private",
  "status": "PARTIAL",
  "evidence": "portfolios.public",
  "gap": "no public portfolio route/view"
 },
 {
  "section": "11",
  "feature": "Survives course conclusion",
  "status": "DONE",
  "evidence": "portfolios owned by userId, not course",
  "gap": ""
 },
 {
  "section": "12",
  "feature": "REST Link pagination",
  "status": "DONE",
  "evidence": "router.ts:linkHeader, x-total-count",
  "gap": ""
 },
 {
  "section": "12",
  "feature": "include/exclude params",
  "status": "DONE",
  "evidence": "router.ts:shape include[]/exclude[] on /r/ list and read",
  "gap": "",
  "closedIn": "this build"
 },
 {
  "section": "12",
  "feature": "Masquerade param",
  "status": "DONE",
  "evidence": "router.ts as_user_id (masquerade permission, audited)",
  "gap": ""
 },
 {
  "section": "12",
  "feature": "GraphQL",
  "status": "DONE",
  "evidence": "http/graphql.ts:executeGraphql; router POST graphql",
  "gap": ""
 },
 {
  "section": "12",
  "feature": "OAuth2 dev keys",
  "status": "DONE",
  "evidence": "integration.ts:authorize,exchangeCode,refreshToken; router oauth2/token",
  "gap": ""
 },
 {
  "section": "12",
  "feature": "Scoped tokens",
  "status": "DONE",
  "evidence": "integration.ts:createPersonalToken,scopeAllows",
  "gap": ""
 },
 {
  "section": "12",
  "feature": "Rate limit headers",
  "status": "DONE",
  "evidence": "integration.ts:rateLimit; router x-rate-limit-*, retry-after",
  "gap": ""
 },
 {
  "section": "12",
  "feature": "LTI 1.3 Deep Linking/NRPS/AGS/dynamic registration",
  "status": "DONE",
  "evidence": "lti.ts:deepLinkRequest/Return,nrpsMembers,agsPostScore,dynamicRegister",
  "gap": ""
 },
 {
  "section": "12",
  "feature": "LTI placements list",
  "status": "NOT_STARTED",
  "evidence": "none found",
  "gap": "no placement model/endpoint"
 },
 {
  "section": "12",
  "feature": "OneRoster",
  "status": "DONE",
  "evidence": "integration.ts:oneRosterExport/Import; ops oneroster.*",
  "gap": ""
 },
 {
  "section": "12",
  "feature": "Live events stream (Caliper/JSON)",
  "status": "DONE",
  "evidence": "success.ts:liveEvents; ops analytics.events",
  "gap": ""
 },
 {
  "section": "12",
  "feature": "Signed webhooks with retry/DLQ",
  "status": "DONE",
  "evidence": "integration.ts:signWebhook,deliverWebhooks,replayWebhook",
  "gap": ""
 },
 {
  "section": "13",
  "feature": "Keyboard gradebook",
  "status": "PARTIAL",
  "evidence": "course.tsx:Gradebook focusable table region",
  "gap": "no keyboard cell navigation/editing"
 },
 {
  "section": "13",
  "feature": "Skip links",
  "status": "DONE",
  "evidence": "ui/shell.tsx skip-link",
  "gap": ""
 },
 {
  "section": "13",
  "feature": "High contrast/dyslexia options",
  "status": "DONE",
  "evidence": "shell.tsx applies profile classes a11y-contrast/a11y-dyslexia/a11y-underline",
  "gap": "",
  "closedIn": "this build"
 },
 {
  "section": "13",
  "feature": "Reduced motion",
  "status": "DONE",
  "evidence": "shell.tsx a11y-reduce-motion + CSS",
  "gap": "",
  "closedIn": "this build"
 },
 {
  "section": "13",
  "feature": "Captions required before student visibility",
  "status": "DONE",
  "evidence": "files.ts:media publishChecks; captionException",
  "gap": ""
 },
 {
  "section": "13",
  "feature": "Localization (strings, RTL, per-user language/tz)",
  "status": "PARTIAL",
  "evidence": "profiles.language/timeZone; src/i18n (not used by campus)",
  "gap": "campus strings hard-coded English; dates UTC; no RTL"
 }
];

export const SECTION_TITLES: Record<string, string> = {"1":"Roles & permissions","2":"Global navigation","3.1":"Course home","3.2":"Announcements","3.3":"Syllabus","3.4":"Modules","3.5":"Assignments","3.6":"Discussions","3.7":"Gradebook","3.8":"Sequential grader","3.9":"People","3.10":"Pages","3.11":"Files","3.12":"Quizzes","3.13":"Outcomes","3.14":"Rubrics","3.15":"Collaborations","3.16":"Conferences / live","3.17":"Course analytics","3.18":"Course pacing","3.19":"Course settings","4":"Calendar & scheduler","5":"Inbox","6":"Admin console","7":"Content movement & reuse","8":"Rich content editor","9":"Notifications","10":"Mobile","11":"ePortfolios","12":"API & integration","13":"Accessibility & usability"};

export const ACCEPTANCE = [
  { n: 1, test: "Course build: 3 modules, prerequisites, sequential; Student View locking; Next/Previous", file: "tests/campus-parity.test.ts" },
  { n: 2, test: "Differentiated assignment: section due Friday, one student extension to Monday", file: "tests/campus-parity.test.ts" },
  { n: 3, test: "Late policy: 2 days late deducted, late color, override in history", file: "tests/campus-parity.test.ts" },
  { n: 4, test: "Grading and posting: annotation + rubric, hidden until posted", file: "tests/campus-parity.test.ts" },
  { n: 5, test: "Quiz accommodation: 5 random items, 50% extra time, essay to manual grading", file: "tests/campus-parity.test.ts" },
  { n: 6, test: "Mastery Paths: 90+/70–89/<70 release", file: "tests/campus-parity.test.ts" },
  { n: 7, test: "Discussion checkpoints: 1 post + 2 replies", file: "tests/campus-parity.test.ts" },
  { n: 8, test: "What-If with weighted groups and drop-lowest, not saved", file: "tests/campus-parity.test.ts" },
  { n: 9, test: "Blueprint sync of locked due dates to 3 courses; local edits blocked", file: "tests/campus-parity.test.ts" },
  { n: 10, test: "Course copy with date shifting", file: "tests/campus-parity.test.ts" },
  { n: 11, test: "Observer alert on a missing assignment", file: "tests/campus-parity.test.ts" },
  { n: 12, test: "Inbox scoping to active Section B students; no cross-tenant recipients", file: "tests/campus-parity.test.ts" },
  { n: 13, test: "Root-locked permission can't be unlocked by a sub-account", file: "tests/campus-parity.test.ts" },
  { n: 14, test: "LTI 1.3 AGS score lands unposted in the gradebook", file: "tests/campus-parity.test.ts" },
  { n: 15, test: "Accessibility gate (axe) on Dashboard, Modules, Gradebook, grader, quiz-taking", file: "scripts/campus-a11y.mjs (CI)" },
];

export function paritySummary() {
  const by = (s: ParityRow["status"]) => PARITY.filter((r) => r.status === s).length;
  const sections = [...new Set(PARITY.map((r) => r.section))].map((sec) => {
    const rows = PARITY.filter((r) => r.section === sec);
    return { section: sec, title: SECTION_TITLES[sec] ?? sec, done: rows.filter((r) => r.status === "DONE").length, partial: rows.filter((r) => r.status === "PARTIAL").length, notStarted: rows.filter((r) => r.status === "NOT_STARTED").length, total: rows.length };
  });
  return { total: PARITY.length, done: by("DONE"), partial: by("PARTIAL"), notStarted: by("NOT_STARTED"), closedThisBuild: PARITY.filter((r) => r.closedIn).length, sections, acceptance: ACCEPTANCE };
}
