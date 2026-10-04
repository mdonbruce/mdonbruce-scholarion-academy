import { CampusError, replayDead, type TenantContext, type TenantStore } from "../core";
import { hasAny, type Actor } from "../iam";
import { permissionMatrix, setPermission } from "../permissions";
import * as entity from "../entity";
import * as cur from "../services/curriculum";
import * as fil from "../services/files";
import * as sis from "../services/sis";
import * as grd from "../services/grading";
import * as asm from "../services/assessment";
import * as col from "../services/collaboration";
import * as cal from "../services/calendar";
import * as suc from "../services/success";
import * as ai from "../services/ai";
import * as lti from "../services/lti";
import * as int from "../services/integration";
import * as adm from "../services/admin";
import * as opsSvc from "../services/ops";
import * as cnt from "../services/content";
import * as dsh from "../services/dashboard";
import * as ppl from "../services/people";
import * as desk from "../services/desk";
import * as acad from "../services/academy";
import * as tut from "../services/tutor";
import * as prc from "../services/proctor";
import * as prog from "../services/programs";
import * as plus from "../services/lmsplus";
import * as hub from "../services/hub";
import * as assess from "../services/assess";
import * as alabs from "../services/agentlabs";
import * as simlab from "../services/simlab";
import * as graded from "../services/graded";
import * as studio from "../services/studio";
import * as bridge from "../services/bridge";
import * as oc from "../services/outcomes";
import * as termsvc from "../services/terms";
import * as apps from "../services/apps";
import * as lmsimp from "../services/lmsimport";
import * as dept from "../services/departments";
import * as voice from "../services/voice";
import * as oat from "../services/acceptance";
import { readinessQuestions, readinessScore } from "../services/readiness";
import * as wsp from "../services/workspace";
import * as learn from "../services/learnarea";
import * as proj from "../services/projection";
import { submitProject } from "../academy/ai801-seed";
import * as eco from "../services/ecosystem";
import * as plat from "../services/platform";
import * as camp from "../services/campaigns";
import * as design from "../services/design";
import * as plans from "../services/plans";
import * as cci from "../services/cci";
import * as comms from "../services/comms";
import * as uploads from "../services/uploads";
import { isStaff, requireTenant } from "../services/common";
import { decideSupportGrant, grantRole, requestSupportGrant, revokeRole } from "../iam";

/**
 * Named workflow operations (commands and queries) exposed over REST
 * (`POST /a/:name`, `GET /q/:name`), GraphQL and the campus UI. Each operation calls a
 * domain service; authorization happens inside the service.
 */

export type ParamType = "string" | "number" | "boolean" | "json" | "list" | "text" | "date";
export interface Param {
  name: string;
  type?: ParamType;
  required?: boolean;
  help?: string;
  options?: string[];
}
export interface OpCtx {
  store: TenantStore;
  actor: Actor;
  args: Args;
  tenant: TenantContext;
  sessionSecret?: string;
}
export interface Operation {
  name: string;
  tab: string;
  kind: "command" | "query";
  summary: string;
  params: Param[];
  run: (x: OpCtx) => unknown;
}

export class Args {
  constructor(readonly raw: Record<string, unknown>) {}
  has(k: string) {
    return this.raw[k] !== undefined && this.raw[k] !== "";
  }
  s(k: string): string {
    const v = this.raw[k];
    if (v === undefined || v === null || v === "") throw new CampusError("invalid", `${k} is required.`, 422, { field: k });
    return String(v);
  }
  so(k: string): string | undefined {
    return this.has(k) ? String(this.raw[k]) : undefined;
  }
  n(k: string, d?: number): number {
    if (!this.has(k)) {
      if (d !== undefined) return d;
      throw new CampusError("invalid", `${k} is required.`, 422, { field: k });
    }
    const n = Number(this.raw[k]);
    if (!Number.isFinite(n)) throw new CampusError("invalid", `${k} must be a number.`, 422, { field: k });
    return n;
  }
  b(k: string, d = false): boolean {
    if (!this.has(k)) return d;
    const v = this.raw[k];
    return v === true || v === "true" || v === "on" || v === "1";
  }
  j<T = unknown>(k: string, d?: T): T {
    if (!this.has(k)) {
      if (d !== undefined) return d;
      throw new CampusError("invalid", `${k} is required.`, 422, { field: k });
    }
    const v = this.raw[k];
    if (typeof v !== "string") return v as T;
    try {
      return JSON.parse(v) as T;
    } catch {
      throw new CampusError("invalid", `${k} must be JSON.`, 422, { field: k });
    }
  }
  l(k: string): string[] {
    const v = this.raw[k];
    if (v === undefined || v === "") return [];
    if (Array.isArray(v)) return v.map(String);
    const s = String(v).trim();
    if (s.startsWith("[")) return this.j<string[]>(k).map(String);
    return s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  }
}

const OPS: Operation[] = [];
const P = (name: string, type: ParamType = "string", required = true, extra: Partial<Param> = {}): Param => ({ name, type, required, ...extra });
const opt = (name: string, type: ParamType = "string", extra: Partial<Param> = {}) => P(name, type, false, extra);
function cmd(name: string, tab: string, summary: string, params: Param[], run: Operation["run"]) {
  OPS.push({ name, tab, kind: "command", summary, params, run });
}
function qry(name: string, tab: string, summary: string, params: Param[], run: Operation["run"]) {
  OPS.push({ name, tab, kind: "query", summary, params, run });
}

/* 1 Identity */
qry("me", "identity", "Who am I: roles, course roles, act-as state.", [], ({ actor }) => ({ id: actor.id, name: actor.name, email: actor.email, roles: actor.roles, courseRoles: actor.courseRoles, mfa: actor.mfa, masqueradedBy: actor.masqueradedBy ?? null, platformOperator: actor.platformOperator }));
cmd("roles.grant", "identity", "Grant a tenant role (optionally until a date).", [P("userId"), P("role", "string", true, { options: ["admin", "registrar", "advisor", "support", "designer"] }), opt("expiresAt", "date")], ({ store, actor, args }) => store.tx(() => grantRole(store, actor, args.s("userId"), args.s("role") as never, args.so("expiresAt"))));
cmd("roles.revoke", "identity", "Revoke a role grant.", [P("grantId")], ({ store, actor, args }) => store.tx(() => revokeRole(store, actor, args.s("grantId"))));
cmd("support.request", "identity", "Support staff: request time-boxed access.", [P("reason", "text"), opt("ticketId"), opt("targetUserId"), opt("hours", "number")], ({ store, actor, args }) => store.tx(() => requestSupportGrant(store, actor, { reason: args.s("reason"), ticketId: args.so("ticketId"), targetUserId: args.so("targetUserId"), hours: args.has("hours") ? args.n("hours") : undefined })));
cmd("support.decide", "identity", "Admin: approve or deny a support access request.", [P("grantId"), P("approve", "boolean")], ({ store, actor, args }) => store.tx(() => decideSupportGrant(store, actor, args.s("grantId"), args.b("approve"))));
qry("permissions.matrix", "tenant-admin", "Permission matrix with inheritance and locks.", [opt("accountId")], ({ store, actor, args }) => {
  requireTenant(store, actor, ["admin"], "permissions.read");
  return permissionMatrix(store, args.so("accountId"));
});
cmd("permissions.set", "tenant-admin", "Enable/disable a permission for a role on an account (optionally lock for sub-accounts).", [P("accountId"), P("role"), P("permission"), P("enabled", "boolean"), opt("locked", "boolean")], ({ store, actor, args }) => setPermission(store, actor, { accountId: args.s("accountId"), role: args.s("role"), permission: args.s("permission"), enabled: args.b("enabled"), locked: args.b("locked") }));

/* 2 Curriculum */
qry("course.modules", "curriculum", "Modules with lock state, requirements and progress for me (or a student).", [P("courseId"), opt("userId")], ({ store, actor, args }) => cur.moduleStates(store, actor, args.s("courseId"), args.so("userId")));
qry("course.nav", "curriculum", "Course navigation for my role.", [P("courseId")], ({ store, actor, args }) => cur.courseNav(store, actor, args.s("courseId")));
qry("course.syllabus", "curriculum", "Syllabus with the automatic summary of dated items.", [P("courseId")], ({ store, actor, args }) => cur.syllabus(store, actor, args.s("courseId")));
qry("course.checklist", "curriculum", "Course setup checklist.", [P("courseId")], ({ store, actor, args }) => {
  if (!isStaff(actor, args.s("courseId"))) throw new CampusError("forbidden", "Course staff only.", 403);
  return cur.setupChecklist(store, args.s("courseId"));
});
qry("course.progress", "curriculum", "Module progress for every student.", [P("courseId")], ({ store, actor, args }) => cur.progressReport(store, actor, args.s("courseId")));
cmd("module.open_item", "curriculum", "Open a module item (records the view requirement).", [P("itemId")], ({ store, actor, args }) => cur.openItem(store, actor, args.s("itemId")));
cmd("module.mark_done", "curriculum", "Mark a 'mark as done' item complete or not.", [P("itemId"), opt("done", "boolean")], ({ store, actor, args }) => cur.markDone(store, actor, args.s("itemId"), args.b("done", true)));
cmd("module.duplicate", "curriculum", "Duplicate a module and its items.", [P("moduleId")], ({ store, actor, args }) => cur.duplicateModule(store, actor, args.s("moduleId")));
cmd("module.move_item", "curriculum", "Move or indent a module item.", [P("itemId"), P("moduleId"), P("position", "number"), opt("indent", "number")], ({ store, actor, args }) => cur.moveItem(store, actor, args.s("itemId"), args.s("moduleId"), args.n("position"), args.has("indent") ? args.n("indent") : undefined));
cmd("page.restore_revision", "curriculum", "Restore an earlier page revision.", [P("revisionId")], ({ store, actor, args }) => cur.restoreRevision(store, actor, args.s("revisionId")));
qry("page.a11y", "curriculum", "Accessibility check for a page's content.", [P("pageId")], ({ store, actor, args }) => {
  const p = store.get("pages", args.s("pageId"));
  if (!p || !isStaff(actor, p.courseId as string)) throw new CampusError("not_found", "Page not found", 404);
  return cur.a11yCheck(store, (p.blocks as cur.Block[]) ?? []);
});
cmd("course.student_view", "curriculum", "Enter Student View (a resettable test student).", [P("courseId"), opt("reset", "boolean")], ({ store, actor, args }) => cur.studentView(store, actor, args.s("courseId"), args.b("reset")));

/* 3 Enrollment */
cmd("enrollment.reconcile", "enrollment", "Compare LMS access with SIS registrations; optionally fix.", [opt("apply", "boolean")], ({ store, actor, args }) => sis.reconcile(store, actor, args.b("apply")));
qry("people.roster", "groups", "Course roster (staff see email and activity).", [P("courseId"), opt("role"), opt("sectionId"), opt("q"), opt("includeInactive", "boolean")], ({ store, actor, args }) => ppl.roster(store, actor, args.s("courseId"), { role: args.so("role"), sectionId: args.so("sectionId"), q: args.so("q"), includeInactive: args.b("includeInactive") }));
cmd("people.add", "groups", "Add people to a course by email.", [P("courseId"), P("emails", "list"), P("role", "string", true, { options: ["student", "ta", "designer", "observer", "instructor"] }), opt("sectionId")], ({ store, actor, args }) => ppl.addPeople(store, actor, args.s("courseId"), { emails: args.l("emails"), role: args.s("role") as never, sectionId: args.so("sectionId") }));
cmd("people.set_state", "groups", "Deactivate, conclude or remove an enrollment.", [P("enrollmentId"), P("state", "string", true, { options: ["active", "inactive", "concluded", "deleted"] })], ({ store, actor, args }) => ppl.setEnrollmentState(store, actor, args.s("enrollmentId"), args.s("state") as never));

/* 4 Assessment */
cmd("submission.create", "assessment", "Submit an assignment.", [P("assignmentId"), P("mode", "string", true, { options: ["text", "file", "url", "media", "annotation"] }), opt("body", "text"), opt("url"), opt("fileId"), opt("mediaUrl")], ({ store, actor, args }) => asm.submit(store, actor, args.s("assignmentId"), { mode: args.s("mode") as asm.SubmissionMode, body: args.so("body"), url: args.so("url"), fileId: args.so("fileId"), mediaUrl: args.so("mediaUrl") }));
qry("submission.mine", "assessment", "My submissions for an assignment.", [P("assignmentId")], ({ store, actor, args }) => asm.mySubmissions(store, actor, args.s("assignmentId")));
qry("grader.queue", "gradebook", "Submissions to grade (respects anonymous and moderated grading).", [P("assignmentId"), opt("needsGrading", "boolean"), opt("sectionId")], ({ store, actor, args }) => asm.graderQueue(store, actor, args.s("assignmentId"), { needsGrading: args.b("needsGrading"), sectionId: args.so("sectionId") }));
cmd("peer.assign", "assessment", "Assign peer reviews automatically (or manually).", [P("assignmentId"), opt("manual", "json")], ({ store, actor, args }) => asm.assignPeerReviews(store, actor, args.s("assignmentId"), args.has("manual") ? args.j("manual") : undefined));
cmd("peer.complete", "assessment", "Complete a peer review.", [P("reviewId"), P("comments", "text"), opt("rubric", "json")], ({ store, actor, args }) => asm.completePeerReview(store, actor, args.s("reviewId"), args.s("comments"), args.has("rubric") ? args.j("rubric") : undefined));
qry("peer.mine", "assessment", "Peer reviews assigned to me.", [P("assignmentId")], ({ store, actor, args }) => asm.myPeerReviews(store, actor, args.s("assignmentId")));
cmd("quiz.start", "assessment", "Start a quiz attempt.", [P("quizId"), opt("accessCode")], ({ store, actor, args }) => asm.startAttempt(store, actor, args.s("quizId"), { accessCode: args.so("accessCode"), ip: args.so("__clientIp") }));
qry("quiz.attempt", "assessment", "View an attempt (questions, saved answers, time left).", [P("attemptId")], ({ store, actor, args }) => asm.attemptView(store, actor, args.s("attemptId")));
cmd("quiz.autosave", "assessment", "Save answers (version-checked).", [P("attemptId"), P("answers", "json"), P("version", "number")], ({ store, actor, args }) => asm.autosave(store, actor, args.s("attemptId"), args.j("answers"), args.n("version")));
cmd("quiz.finish", "assessment", "Save answers and submit the attempt.", [P("attemptId"), P("answers", "json"), P("version", "number")], ({ store, actor, args }) => {
  asm.autosave(store, actor, args.s("attemptId"), args.j("answers"), args.n("version"));
  return asm.submitAttempt(store, actor, args.s("attemptId"));
});
cmd("page.save_text", "curriculum", "Save a page from the text editor (headings, lists, images with alt text, links, tables).", [P("pageId"), P("text", "text"), opt("title"), opt("ifVersion", "number")], ({ store, actor, args }) => entity.update(store, actor, "pages", args.s("pageId"), { blocks: cur.markupToBlocks(args.s("text")), ...(args.has("title") ? { title: args.s("title") } : {}) }, args.has("ifVersion") ? args.n("ifVersion") : undefined));
cmd("quiz.submit", "assessment", "Submit an attempt (idempotent).", [P("attemptId")], ({ store, actor, args }) => asm.submitAttempt(store, actor, args.s("attemptId")));
cmd("quiz.grade_question", "assessment", "Score a manually graded question.", [P("attemptId"), P("questionId"), P("points", "number")], ({ store, actor, args }) => asm.gradeQuestion(store, actor, args.s("attemptId"), args.s("questionId"), args.n("points")));
cmd("quiz.moderate", "assessment", "Extra time, an extra attempt, or reopen for one student.", [P("quizId"), P("userId"), P("action", "string", true, { options: ["extend", "extra_attempt", "reopen"] }), opt("minutes", "number")], ({ store, actor, args }) => asm.moderate(store, actor, args.s("quizId"), args.s("userId"), args.s("action") as never, args.n("minutes", 10)));
cmd("quiz.regrade", "assessment", "Change a question's answer and regrade attempts.", [P("quizId"), P("questionId"), P("newAnswer"), P("option", "string", true, { options: ["full_credit", "both", "new_only"] })], ({ store, actor, args }) => asm.regrade(store, actor, args.s("quizId"), args.s("questionId"), args.s("newAnswer"), args.s("option") as never));
qry("quiz.item_analysis", "assessment", "Item analysis: difficulty and discrimination.", [P("quizId")], ({ store, actor, args }) => asm.itemAnalysis(store, actor, args.s("quizId")));
qry("quiz.manual_queue", "assessment", "Questions waiting for manual grading.", [P("courseId")], ({ store, actor, args }) => asm.manualQueue(store, actor, args.s("courseId")));

/* 5 Gradebook */
qry("gradebook.grid", "gradebook", "Gradebook grid with filters.", [P("courseId"), opt("sectionId"), opt("groupId"), opt("moduleId"), opt("periodId"), opt("studentGroupId"), opt("sort", "string", { options: ["due", "points", "module", "title"] }), opt("showUnpublished", "boolean")], ({ store, actor, args }) => grd.gradebookGrid(store, actor, args.s("courseId"), { sectionId: args.so("sectionId"), groupId: args.so("groupId"), moduleId: args.so("moduleId"), periodId: args.so("periodId"), studentGroupId: args.so("studentGroupId"), sort: args.so("sort") as never, showUnpublished: args.b("showUnpublished") }));
cmd("grades.set", "gradebook", "Enter or change a grade (pass ifVersion to avoid overwriting someone else's change).", [P("assignmentId"), P("userId"), opt("score", "number"), opt("excused", "boolean"), opt("status", "string", { options: ["none", "late", "missing", "excused"] }), opt("rubric", "json"), opt("ifVersion", "number"), opt("comment", "text")], ({ store, actor, args }) => grd.setGrade(store, actor, { assignmentId: args.s("assignmentId"), userId: args.s("userId"), score: args.has("score") ? args.n("score") : undefined, excused: args.has("excused") ? args.b("excused") : undefined, status: args.so("status") as never, rubric: args.has("rubric") ? args.j("rubric") : undefined, ifVersion: args.has("ifVersion") ? args.n("ifVersion") : undefined, comment: args.so("comment") }));
cmd("grades.post", "gradebook", "Post (release) or hide grades for an assignment.", [P("assignmentId"), opt("sectionId"), opt("gradedOnly", "boolean"), opt("hide", "boolean")], ({ store, actor, args }) => grd.postGrades(store, actor, args.s("assignmentId"), { sectionId: args.so("sectionId"), gradedOnly: args.b("gradedOnly"), hide: args.b("hide") }));
cmd("grades.select_provisional", "gradebook", "Moderated grading: choose the final grade.", [P("gradeId"), opt("graderId"), opt("score", "number")], ({ store, actor, args }) => grd.selectProvisional(store, actor, args.s("gradeId"), args.so("graderId") ?? null, args.has("score") ? args.n("score") : undefined));
cmd("grades.final_override", "gradebook", "Override a student's final course grade.", [P("courseId"), P("userId"), opt("grade")], ({ store, actor, args }) => grd.setFinalOverride(store, actor, args.s("courseId"), args.s("userId"), args.so("grade") ?? null));
cmd("grades.curve", "gradebook", "Curve an assignment to a target average.", [P("assignmentId"), P("targetAvgPct", "number")], ({ store, actor, args }) => grd.curve(store, actor, args.s("assignmentId"), args.n("targetAvgPct")));
cmd("grades.default", "gradebook", "Set a default grade for ungraded (or all) students.", [P("assignmentId"), P("score", "number"), opt("overwrite", "boolean")], ({ store, actor, args }) => grd.defaultGrade(store, actor, args.s("assignmentId"), args.n("score"), args.b("overwrite")));
cmd("grades.message_students_who", "gradebook", "Message students who haven't submitted, scored below, etc.", [P("assignmentId"), P("criterion", "string", true, { options: ["not_submitted", "not_graded", "scored_below", "scored_above"] }), opt("value", "number"), P("subject"), P("body", "text")], ({ store, actor, args }) => grd.messageStudentsWho(store, actor, args.s("assignmentId"), args.s("criterion") as never, args.has("value") ? args.n("value") : undefined, args.s("subject"), args.s("body")));
qry("grades.export_csv", "gradebook", "Export the gradebook as CSV.", [P("courseId")], ({ store, actor, args }) => grd.exportCsv(store, actor, args.s("courseId")));
cmd("grades.import_csv", "gradebook", "Import grades from CSV (preview first, then apply).", [P("courseId"), P("csv", "text"), opt("apply", "boolean")], ({ store, actor, args }) => grd.importCsv(store, actor, args.s("courseId"), args.s("csv"), args.b("apply")));
qry("grades.history", "gradebook", "Grade change history.", [P("courseId"), opt("userId"), opt("assignmentId"), opt("graderId")], ({ store, actor, args }) => grd.history(store, actor, args.s("courseId"), { userId: args.so("userId"), assignmentId: args.so("assignmentId"), graderId: args.so("graderId") }));
qry("grades.totals", "gradebook", "Course totals for a student; students may pass What-If scores.", [P("courseId"), opt("userId"), opt("whatIf", "json")], ({ store, actor, args }) => {
  const cid = args.s("courseId");
  const uid = args.so("userId") ?? actor.id;
  const staff = isStaff(actor, cid) || actor.roles.includes("admin");
  if (uid !== actor.id && !staff) {
    if (!suc.observerCanSee(store, actor.id, uid, "grade_summary")) throw new CampusError("forbidden", "You can't see these grades.", 403);
  }
  if (uid === actor.id && !(actor.courseRoles[cid] ?? []).includes("student")) throw new CampusError("forbidden", "You're not a student in this course.", 403);
  const c = store.get("courses", cid);
  if (c?.hideTotals && !staff) return { hidden: true };
  return grd.computeTotals(store, cid, uid, { whatIf: args.has("whatIf") ? args.j("whatIf") : undefined, includeUnposted: staff });
});
cmd("rubric.new_version", "gradebook", "Create a new version of a rubric that's already been used.", [P("rubricId")], ({ store, actor, args }) => grd.newRubricVersion(store, actor, args.s("rubricId")));
cmd("submission.annotate", "gradebook", "Add an annotation to a submission document.", [P("submissionId"), P("type", "string", true, { options: ["point", "highlight", "strikeout", "freehand", "text", "area"] }), P("page", "number"), P("coords", "json"), opt("comment", "text"), opt("quote")], ({ store, actor, args }) => grd.annotate(store, actor, args.s("submissionId"), { type: args.s("type") as never, page: args.n("page"), coords: args.j("coords"), comment: args.so("comment"), quote: args.so("quote") }));
cmd("submission.comment", "gradebook", "Comment on a submission (hidden until grades are posted).", [P("submissionId"), P("body", "text"), opt("mediaUrl"), opt("libraryId")], ({ store, actor, args }) => grd.comment(store, actor, args.s("submissionId"), args.s("body"), { mediaUrl: args.so("mediaUrl"), libraryId: args.so("libraryId") }));
qry("submission.comments", "gradebook", "Comments on a submission.", [P("submissionId")], ({ store, actor, args }) => grd.commentsFor(store, actor, args.s("submissionId")));
qry("mastery.gradebook", "outcomes", "Learning mastery gradebook.", [P("courseId")], ({ store, actor, args }) => grd.masteryGradebook(store, actor, args.s("courseId")));

/* 6 Collaboration */
cmd("discussion.create_student_topic", "collaboration", "Student-created discussion (when allowed).", [P("courseId"), P("title"), P("prompt", "text")], ({ store, actor, args }) => col.createStudentTopic(store, actor, args.s("courseId"), args.s("title"), args.s("prompt")));
cmd("discussion.post", "collaboration", "Reply to a topic or a post.", [P("topicId"), P("body", "text"), opt("parentId")], ({ store, actor, args }) => col.post(store, actor, args.s("topicId"), args.s("body"), args.so("parentId") ?? null));
cmd("discussion.edit", "collaboration", "Edit your post (history kept).", [P("postId"), P("body", "text")], ({ store, actor, args }) => col.editPost(store, actor, args.s("postId"), args.s("body")));
cmd("discussion.delete", "collaboration", "Delete a post.", [P("postId")], ({ store, actor, args }) => col.deletePost(store, actor, args.s("postId")));
cmd("discussion.like", "collaboration", "Like or unlike a post.", [P("postId"), opt("on", "boolean")], ({ store, actor, args }) => col.like(store, actor, args.s("postId"), args.b("on", true)));
cmd("discussion.report", "collaboration", "Report a post to the instructor.", [P("postId"), P("reason", "text")], ({ store, actor, args }) => col.reportPost(store, actor, args.s("postId"), args.s("reason")));
cmd("discussion.subscribe", "collaboration", "Subscribe or unsubscribe.", [P("topicId"), opt("on", "boolean")], ({ store, actor, args }) => col.subscribe(store, actor, args.s("topicId"), args.b("on", true)));
cmd("discussion.mark_all_read", "collaboration", "Mark every reply read.", [P("topicId")], ({ store, actor, args }) => col.markAllRead(store, actor, args.s("topicId")));
qry("discussion.thread", "collaboration", "A discussion with replies (post-first, groups and anonymity enforced).", [P("topicId"), opt("sort", "string", { options: ["newest", "oldest", "likes"] }), opt("cursor")], ({ store, actor, args }) => col.thread(store, actor, args.s("topicId"), { sort: args.so("sort") as never, cursor: args.so("cursor") }));
cmd("discussion.grade_checkpoints", "collaboration", "Grade a student's checkpoints.", [P("topicId"), P("userId"), opt("override", "json")], ({ store, actor, args }) => col.gradeCheckpoints(store, actor, args.s("topicId"), args.s("userId"), args.has("override") ? args.j("override") : undefined));
cmd("announcement.read", "collaboration", "Mark an announcement read.", [P("announcementId")], ({ store, actor, args }) => col.markAnnouncementRead(store, actor, args.s("announcementId")));
cmd("inbox.send", "collaboration", "Send a message (recipients are checked on the server).", [P("courseId"), opt("role", "string", { options: ["student", "instructor", "ta", "observer", "all"] }), opt("sectionId"), opt("groupId"), opt("userIds", "list"), P("subject"), P("body", "text"), opt("individual", "boolean"), opt("attachments", "list", { help: "File ids" }), opt("mediaUrl")], ({ store, actor, args }) => col.sendMessage(store, actor, { recipients: { courseId: args.s("courseId"), role: args.so("role") as never, sectionId: args.so("sectionId"), groupId: args.so("groupId"), userIds: args.l("userIds").length ? args.l("userIds") : undefined }, subject: args.s("subject"), body: args.s("body"), individual: args.b("individual"), attachments: args.l("attachments"), mediaUrl: args.so("mediaUrl") }));
cmd("inbox.reply", "collaboration", "Reply (or reply all).", [P("conversationId"), P("body", "text"), opt("all", "boolean")], ({ store, actor, args }) => col.reply(store, actor, args.s("conversationId"), args.s("body"), args.b("all", true)));
cmd("inbox.state", "collaboration", "Mark read/unread, star, archive or delete.", [P("conversationId"), opt("read", "boolean"), opt("starred", "boolean"), opt("folder", "string", { options: ["inbox", "archived", "deleted"] })], ({ store, actor, args }) => col.setConversationState(store, actor, args.s("conversationId"), { read: args.has("read") ? args.b("read") : undefined, starred: args.has("starred") ? args.b("starred") : undefined, folder: args.so("folder") as never }));
qry("inbox.list", "collaboration", "Inbox, unread, starred, sent, archived or submission comments.", [opt("folder", "string", { options: ["inbox", "unread", "starred", "sent", "archived", "submission_comments"] }), opt("courseId"), opt("q")], ({ store, actor, args }) => col.inbox(store, actor, { folder: args.so("folder") as never, courseId: args.so("courseId"), q: args.so("q") }));
qry("inbox.conversation", "collaboration", "One conversation.", [P("conversationId")], ({ store, actor, args }) => col.conversationView(store, actor, args.s("conversationId")));

/* 7 Files */
cmd("files.request_upload", "files", "Step 1: get a signed upload URL (file goes to quarantine).", [P("name"), P("mime"), P("size", "number"), opt("courseId"), opt("folderId"), opt("purpose", "string", { options: ["course", "submission", "personal", "application"] })], ({ store, actor, args }) => fil.requestUpload(store, actor, { name: args.s("name"), mime: args.s("mime"), size: args.n("size"), courseId: args.so("courseId"), folderId: args.so("folderId"), purpose: args.so("purpose") as never }));
qry("files.download_url", "files", "Signed short-lived download URL.", [P("fileId")], ({ store, actor, args }) => fil.downloadUrl(store, actor, args.s("fileId")));
cmd("files.publish", "files", "Publish or unpublish a file (needs usage rights).", [P("fileId"), opt("published", "boolean")], ({ store, actor, args }) => fil.setFilePublished(store, actor, args.s("fileId"), args.b("published", true)));
cmd("files.bulk", "files", "Bulk move/delete/publish files.", [P("courseId"), P("action", "string", true, { options: ["move", "delete", "publish", "unpublish"] }), P("fileIds", "list"), opt("folderId")], ({ store, actor, args }) => fil.bulkFiles(store, actor, args.s("courseId"), args.s("action") as never, args.l("fileIds"), args.so("folderId")));

/* 8 Analytics */
qry("analytics.course", "analytics", "Course analytics (activity, submissions, grades).", [P("courseId")], ({ store, actor, args }) => suc.courseAnalytics(store, actor, args.s("courseId")));
qry("analytics.student", "analytics", "One student's analytics in a course.", [P("courseId"), P("userId")], ({ store, actor, args }) => suc.studentAnalytics(store, actor, args.s("courseId"), args.s("userId")));
qry("analytics.access_report", "analytics", "Access report for a student.", [P("courseId"), P("userId")], ({ store, actor, args }) => suc.accessReport(store, actor, args.s("courseId"), args.s("userId")));
qry("analytics.events", "analytics", "Pseudonymous learning events (Caliper-style).", [opt("since")], ({ store, actor, args }) => suc.liveEvents(store, actor, args.so("since")));
cmd("analytics.recompute_risk", "analytics", "Recompute explainable risk signals.", [opt("courseId")], ({ store, actor, args }) => suc.recomputeSignals(store, actor, args.so("courseId")));

/* 9 Integration / 38 Developer */
qry("oneroster.export", "integration", "OneRoster 1.2 CSV export (files).", [], ({ store, actor }) => int.oneRosterExport(store, actor).files);
cmd("oneroster.import", "integration", "Import a OneRoster 1.2 CSV set (JSON map of file name → CSV text).", [P("files", "json")], ({ store, actor, args }) => int.oneRosterImport(store, actor, args.j("files")));
cmd("sis.import", "integration", "SIS CSV import (users, terms, courses, sections, enrollments, groups, xlists).", [P("kind", "string", true, { options: ["users", "terms", "courses", "sections", "enrollments", "groups", "xlists"] }), P("csv", "text"), opt("diffing", "boolean")], ({ store, actor, args }) => sis.sisImport(store, actor, args.s("kind") as never, args.s("csv"), args.b("diffing")));
cmd("webhooks.create", "integration", "Create a signed webhook (secret shown once).", [P("url"), P("events", "list")], ({ store, actor, args }) => int.createWebhook(store, actor, { url: args.s("url"), events: args.l("events") }));
cmd("webhooks.deliver", "integration", "Run the webhook delivery job now.", [], ({ store, actor }) => {
  requireTenant(store, actor, ["admin"], "webhooks.deliver");
  return int.deliverWebhooks(store);
});
cmd("webhooks.replay", "integration", "Replay a dead-lettered delivery.", [P("deliveryId")], ({ store, actor, args }) => int.replayWebhook(store, actor, args.s("deliveryId")));
cmd("outbox.replay", "integration", "Replay a dead-lettered outbox event.", [P("eventId")], ({ store, actor, args }) => {
  requireTenant(store, actor, ["admin"], "outbox.replay");
  return { delivered: replayDead(store, args.s("eventId")) };
});
cmd("developer_keys.create", "developer", "Create an API developer key (secret shown once).", [P("name"), P("scopes", "list"), opt("redirectUri"), opt("rateLimitPerMin", "number")], ({ store, actor, args }) => int.createDeveloperKey(store, actor, { name: args.s("name"), scopes: args.l("scopes"), redirectUri: args.so("redirectUri"), rateLimitPerMin: args.has("rateLimitPerMin") ? args.n("rateLimitPerMin") : undefined }));
cmd("developer_keys.toggle", "developer", "Enable or disable a developer key (disabling revokes its tokens).", [P("keyId"), P("enabled", "boolean")], ({ store, actor, args }) => int.setDeveloperKeyEnabled(store, actor, args.s("keyId"), args.b("enabled")));
cmd("oauth.authorize", "developer", "Approve an app's access (OAuth2 authorization code).", [P("clientId"), P("redirectUri"), P("scopes", "list"), P("state")], ({ store, actor, args }) => int.authorize(store, actor, { clientId: args.s("clientId"), redirectUri: args.s("redirectUri"), scopes: args.l("scopes"), state: args.s("state") }));
cmd("tokens.create", "developer", "Create a personal access token (shown once).", [P("purpose"), P("scopes", "list"), opt("days", "number")], ({ store, actor, args }) => int.createPersonalToken(store, actor, { purpose: args.s("purpose"), scopes: args.l("scopes"), days: args.has("days") ? args.n("days") : undefined }));
cmd("tokens.revoke", "developer", "Revoke a token.", [P("tokenId")], ({ store, actor, args }) => int.revokeToken(store, actor, args.s("tokenId")));
qry("tokens.mine", "developer", "My tokens and app authorizations.", [], ({ store, actor }) => int.myTokens(store, actor));

/* 10–12 SIS */
qry("admissions.checklist", "admissions", "Required documents checklist for an application.", [P("applicationId")], ({ store, actor, args }) => {
  requireTenant(store, actor, ["admin", "registrar"], "admissions.checklist");
  return sis.applicationChecklist(store, args.s("applicationId"));
});
cmd("admissions.decide", "admissions", "Admit, deny or waitlist (admit creates the student account).", [P("applicationId"), P("outcome", "string", true, { options: ["admit", "deny", "waitlist"] }), opt("note", "text")], ({ store, actor, args }) => sis.decideApplication(store, actor, args.s("applicationId"), args.s("outcome") as never, args.so("note")));
qry("registration.check", "registration", "Check whether a student can register for a section, with reasons.", [P("sectionId"), opt("userId")], ({ store, actor, args }) => {
  const uid = args.so("userId") ?? actor.id;
  if (uid !== actor.id && !hasAny(actor, ["registrar", "advisor", "admin"])) throw new CampusError("forbidden", "You can only check your own registration.", 403);
  const v = sis.validateRegistration(store, uid, args.s("sectionId"));
  return { checks: v.checks, full: v.full };
});
cmd("registration.register", "registration", "Register (idempotent with a key; waitlists when full).", [P("sectionId"), opt("userId"), opt("idempotencyKey")], ({ store, actor, args }) => sis.register(store, actor, { sectionId: args.s("sectionId"), userId: args.so("userId"), idempotencyKey: args.so("idempotencyKey") }));
cmd("registration.drop", "registration", "Drop a registration (promotes the waitlist).", [P("registrationId")], ({ store, actor, args }) => sis.drop(store, actor, args.s("registrationId")));
qry("records.transcript", "registration", "Unofficial transcript.", [opt("userId")], ({ store, actor, args }) => sis.unofficialTranscript(store, actor, args.so("userId") ?? actor.id));
qry("finance.account", "finance", "Student account: charges, aid, payments, balance.", [opt("userId")], ({ store, actor, args }) => sis.account(store, actor, args.so("userId") ?? actor.id));
cmd("finance.aid_respond", "finance", "Accept or decline an aid award.", [P("awardId"), P("accept", "boolean")], ({ store, actor, args }) => sis.respondToAid(store, actor, args.s("awardId"), args.b("accept")));
cmd("finance.pay", "finance", "Make a SANDBOX payment.", [P("amount", "number"), opt("userId")], ({ store, actor, args }) => sis.pay(store, actor, args.n("amount"), args.so("userId")));
cmd("finance.payment_plan", "finance", "Set up a payment plan.", [P("installments", "number")], ({ store, actor, args }) => sis.createPaymentPlan(store, actor, args.n("installments")));

/* 13–14 Calendar & live */
qry("calendar.items", "calendar", "Calendar items for a date range (assignments, quizzes, events, meetings, appointments, to-dos).", [P("from", "date"), P("to", "date"), opt("courseIds", "list")], ({ store, actor, args }) => cal.projection(store, actor, args.s("from"), args.s("to"), { courseIds: args.l("courseIds").length ? args.l("courseIds") : undefined }));
cmd("calendar.reschedule", "calendar", "Drag-and-drop reschedule (permission-checked).", [P("kind", "string", true, { options: ["assignment", "quiz", "event", "todo"] }), P("refId"), P("newStart", "date")], ({ store, actor, args }) => cal.reschedule(store, actor, args.s("kind") as never, args.s("refId"), args.s("newStart")));
cmd("calendar.feed", "calendar", "Create a private iCal feed URL.", [opt("label")], ({ store, actor, args }) => cal.issueFeed(store, actor, args.so("label")));
cmd("calendar.revoke_feed", "calendar", "Revoke an iCal feed.", [P("feedId")], ({ store, actor, args }) => cal.revokeFeed(store, actor, args.s("feedId")));
cmd("scheduler.sign_up", "calendar", "Sign up for an appointment slot.", [P("slotId"), opt("asGroup", "boolean")], ({ store, actor, args }) => cal.signUpSlot(store, actor, args.s("slotId"), args.b("asGroup")));
cmd("scheduler.cancel", "calendar", "Cancel an appointment.", [P("slotId"), opt("userId")], ({ store, actor, args }) => cal.cancelSlot(store, actor, args.s("slotId"), args.so("userId")));
cmd("pacing.apply", "pacing", "Apply course pacing: generate per-student due dates.", [P("courseId")], ({ store, actor, args }) => cal.applyPacing(store, actor, args.s("courseId")));
cmd("live.schedule", "live", "Schedule a live session (connector + consent required).", [P("courseId"), opt("sectionId"), P("title"), P("startsAt", "date"), P("minutes", "number"), P("provider", "string", true, { options: ["zoom", "teams"] })], ({ store, actor, args }) => cal.scheduleLive(store, actor, { courseId: args.s("courseId"), sectionId: args.so("sectionId"), title: args.s("title"), startsAt: args.s("startsAt"), minutes: args.n("minutes"), provider: args.s("provider") as never }));
cmd("live.import_attendance", "live", "Import attendance from the provider (as assertions).", [P("sessionId"), P("rows", "json")], ({ store, actor, args }) => cal.importAttendance(store, actor, args.s("sessionId"), args.j("rows")));
cmd("live.reconcile_attendance", "live", "Confirm an attendance record.", [P("recordId"), P("status", "string", true, { options: ["present", "partial", "absent", "excused"] })], ({ store, actor, args }) => cal.reconcileAttendance(store, actor, args.s("recordId"), args.s("status") as never));
cmd("live.roll_call", "live", "Roll call for a session.", [P("sessionId"), P("marks", "json")], ({ store, actor, args }) => cal.rollCall(store, actor, args.s("sessionId"), args.j("marks")));

/* 15–19 Success */
qry("outcomes.results", "outcomes", "Outcome results for a student.", [P("courseId"), opt("userId")], ({ store, actor, args }) => {
  const uid = args.so("userId") ?? actor.id;
  if (uid !== actor.id && !isStaff(actor, args.s("courseId")) && !actor.roles.includes("admin")) throw new CampusError("forbidden", "Not allowed", 403);
  return grd.outcomeResults(store, args.s("courseId"), uid);
});
qry("outcomes.evidence_export", "outcomes", "Accreditation-style evidence export (DEMONSTRATION data).", [opt("courseId")], ({ store, actor, args }) => suc.evidenceExport(store, actor, args.so("courseId")));
cmd("advising.open_case", "advising", "Open an advising case from a risk signal.", [P("signalId"), opt("summary", "text")], ({ store, actor, args }) => suc.openCaseFromSignal(store, actor, args.s("signalId"), args.so("summary")));
qry("advising.caseload", "advising", "My advising caseload.", [], ({ store, actor }) => suc.caseload(store, actor));
cmd("surveys.respond", "evaluations", "Respond to a survey (anonymous).", [P("surveyId"), P("answers", "json")], ({ store, actor, args }) => suc.respondSurvey(store, actor, args.s("surveyId"), args.j("answers")));
qry("surveys.results", "evaluations", "Survey results (minimum group size applies).", [P("surveyId")], ({ store, actor, args }) => suc.surveyResults(store, actor, args.s("surveyId")));
cmd("credentials.issue", "credentials", "Issue a signed credential.", [P("userId"), P("title"), P("kind", "string", true, { options: ["certificate", "badge"] }), opt("courseId")], ({ store, actor, args }) => suc.issueCredential(store, actor, { userId: args.s("userId"), title: args.s("title"), kind: args.s("kind") as never, courseId: args.so("courseId") }));
cmd("credentials.revoke", "credentials", "Revoke a credential.", [P("credentialId"), P("reason", "text")], ({ store, actor, args }) => suc.revokeCredential(store, actor, args.s("credentialId"), args.s("reason")));
cmd("careers.placement_sync", "careers", "Sync consenting students to the placement service (internal tenants only).", [], ({ store, actor }) => suc.placementSync(store, actor));

/* 20–21 Notifications & search */
qry("notifications.mine", "notifications", "My in-app notifications.", [], ({ store, actor }) => suc.myNotifications(store, actor));
cmd("notifications.read", "notifications", "Mark one (or all) read.", [P("deliveryId")], ({ store, actor, args }) => suc.readNotification(store, actor, args.s("deliveryId")));
cmd("notifications.prefs", "notifications", "Set notification preferences (matrix, channels, quiet hours, muted courses).", [opt("email", "boolean"), opt("inApp", "boolean"), opt("push", "boolean"), opt("sms", "boolean"), opt("digest", "string", { options: ["off", "daily", "weekly"] }), opt("quietStart"), opt("quietEnd"), opt("matrix", "json"), opt("mutedCourses", "list")], ({ store, actor, args }) => {
  const v: Record<string, unknown> = {};
  for (const k of ["email", "inApp", "push", "sms"]) if (args.has(k)) v[k] = args.b(k);
  for (const k of ["digest", "quietStart", "quietEnd"]) if (args.has(k)) v[k] = args.s(k);
  if (args.has("matrix")) v.matrix = args.j("matrix");
  if (args.has("mutedCourses")) v.mutedCourses = args.l("mutedCourses");
  return suc.setNotificationPrefs(store, actor, v);
});
qry("search", "search", "Search everything you're allowed to see.", [P("q")], ({ store, actor, args }) => suc.search(store, actor, args.s("q")));
cmd("search.rebuild", "search", "Rebuild the search index.", [], ({ store, actor }) => suc.rebuildIndex(store, actor));

/* 22–23 AI */
qry("ai.control_center", "ai-control", "Agents, policies, evaluation status and usage.", [], ({ store, actor }) => ai.controlCenter(store, actor));
cmd("ai.ask", "ai-control", "Ask the course assistant (cited answers or an honest refusal).", [P("question", "text"), opt("courseId"), opt("agent")], ({ store, actor, args }) => ai.ask(store, actor, args.so("agent") ?? "course_assistant", args.s("question"), { courseId: args.so("courseId") }));
cmd("ai.policy.save", "ai-control", "Save a new policy version for an agent.", [P("agentKey"), P("label"), P("policy", "json")], ({ store, actor, args }) => ai.savePolicyVersion(store, actor, args.s("agentKey"), args.s("label"), args.j("policy")));
cmd("ai.eval.run", "ai-control", "Run the evaluation suite for a policy version.", [P("policyVersionId")], ({ store, actor, args }) => ai.runEval(store, actor, args.s("policyVersionId")));
cmd("ai.policy.activate", "ai-control", "Activate a policy version (only if its evaluation passed).", [P("policyVersionId")], ({ store, actor, args }) => ai.activatePolicy(store, actor, args.s("policyVersionId")));
cmd("ai.agent.toggle", "ai-control", "Turn an agent on or off.", [P("agentKey"), P("enabled", "boolean")], ({ store, actor, args }) => ai.setAgentEnabled(store, actor, args.s("agentKey"), args.b("enabled")));
qry("ai.review_queue", "ai-control", "AI drafts waiting for a person.", [opt("state"), opt("agentKey")], ({ store, actor, args }) => ai.reviewQueue(store, actor, { state: args.so("state"), agentKey: args.so("agentKey") }));
cmd("ai.review", "ai-control", "Approve (optionally with edits) or reject an AI draft.", [P("draftId"), P("decision", "string", true, { options: ["approve", "reject"] }), opt("edits", "json")], ({ store, actor, args }) => ai.reviewDraft(store, actor, args.s("draftId"), args.s("decision") as never, args.has("edits") ? args.j("edits") : undefined));
cmd("ai.generate_course", "curriculum-engine", "Generate a draft course shell to the standard template (goes to review).", [P("topic"), P("code"), opt("templateId"), opt("startAt", "date")], ({ store, actor, args }) => ai.generateCourse(store, actor, { topic: args.s("topic"), code: args.s("code"), templateId: args.so("templateId"), startAt: args.so("startAt") }));
qry("ai.template_conformance", "curriculum-engine", "Check a course against the standard template.", [P("courseId")], ({ store, actor, args }) => {
  if (!isStaff(actor, args.s("courseId")) && !hasAny(actor, ["admin", "designer"])) throw new CampusError("forbidden", "Not allowed", 403);
  return ai.templateConformance(store, args.s("courseId"));
});
cmd("ai.accessibility_scan", "ai-control", "Run the accessibility checker on a course (drafts fixes).", [P("courseId")], ({ store, actor, args }) => ai.accessibilityScan(store, actor, args.s("courseId")));
cmd("ai.migration_plan", "content", "Draft a fix-up plan for an import's issues.", [P("contentJobId")], ({ store, actor, args }) => ai.migrationPlan(store, actor, args.s("contentJobId")));
qry("ai.registration_guide", "registration", "Which sections can I register for, and why not?", [P("termId"), opt("userId")], ({ store, actor, args }) => ai.registrationGuide(store, actor, args.s("termId"), args.so("userId")));
cmd("ai.early_warning", "advising", "Draft outreach for high-risk students (for review).", [opt("courseId")], ({ store, actor, args }) => ai.earlyWarning(store, actor, args.so("courseId")));
cmd("ai.draft_feedback", "gradebook", "Draft feedback for a submission (never scores).", [P("submissionId")], ({ store, actor, args }) => ai.draftFeedback(store, actor, args.s("submissionId")));

/* 24 Cloud Lab / LTI */
cmd("lti.launch", "cloud-lab", "Launch the tool for an assignment (signed LTI 1.3 id_token).", [P("assignmentId")], ({ store, actor, args }) => lti.launch(store, actor, args.s("assignmentId")));
cmd("lab.open", "cloud-lab", "Open the Cloud Lab for an assignment (signed launch, verified by the tool).", [P("assignmentId")], ({ store, actor, args }) => {
  const l = lti.launch(store, actor, args.s("assignmentId"));
  return lti.toolReceiveLaunch(store, l.idToken);
});
cmd("lab.save", "cloud-lab", "Save lab code.", [P("sessionId"), P("code", "text")], ({ store, actor, args }) => lti.labSave(store, actor, args.s("sessionId"), args.s("code")));
cmd("lab.submit", "cloud-lab", "Run hidden tests and pass the score back (unposted).", [P("sessionId"), opt("code", "text")], ({ store, actor, args }) => lti.labSubmit(store, actor, args.s("sessionId"), args.so("code")));
qry("lab.sessions", "cloud-lab", "Lab sessions in a course.", [P("courseId")], ({ store, actor, args }) => lti.labSessionsFor(store, actor, args.s("courseId")));
cmd("lti.deep_link", "integration", "Start content selection with a tool (deep linking).", [P("toolId"), P("courseId"), P("moduleId")], ({ store, actor, args }) => lti.deepLinkRequest(store, actor, args.s("toolId"), args.s("courseId"), args.s("moduleId")));
cmd("lti.deep_link_return", "integration", "Accept a tool's signed deep-linking response.", [P("jwt", "text")], ({ store, actor, args }) => lti.deepLinkReturn(store, actor, args.s("jwt")));
cmd("lti.register", "integration", "Dynamic registration of an LTI 1.3 tool (starts disabled).", [P("client_name"), P("target_link_uri"), opt("jwks_uri"), opt("public_pem", "text"), opt("scope")], ({ store, actor, args }) => lti.dynamicRegister(store, actor, { client_name: args.s("client_name"), target_link_uri: args.s("target_link_uri"), jwks_uri: args.so("jwks_uri"), public_pem: args.so("public_pem"), scope: args.so("scope") }));
cmd("lti.rotate_key", "integration", "Rotate the platform signing key.", [], ({ store, actor }) => lti.rotatePlatformKey(store, actor));

/* 25 Admin console */
qry("admin.overview", "tenant-admin", "Tenant overview: counts, outbox, features, act-as log.", [], ({ store, actor }) => adm.adminOverview(store, actor));
cmd("admin.theme", "tenant-admin", "Set branding (contrast-checked).", [P("primary"), P("accent"), P("logoText")], ({ store, actor, args }) => adm.setTheme(store, actor, { primary: args.s("primary"), accent: args.s("accent"), logoText: args.s("logoText") }));
cmd("admin.flag", "tenant-admin", "Turn a tenant feature flag on or off.", [P("flag", "string", true, { options: adm.TENANT_FLAGS }), P("on", "boolean")], ({ store, actor, args }) => adm.setTenantFlag(store, actor, args.s("flag"), args.b("on")));
qry("features.matrix", "tenant-admin", "Feature options with inheritance.", [opt("accountId"), opt("courseId")], ({ store, args }) => adm.featureMatrix(store, { accountId: args.so("accountId"), courseId: args.so("courseId") }));
cmd("features.set", "tenant-admin", "Set a feature option at an account (optionally locked) or course.", [P("key", "string", true, { options: Object.keys(adm.FEATURE_DEFAULTS) }), opt("accountId"), opt("courseId"), P("enabled", "boolean"), opt("locked", "boolean")], ({ store, actor, args }) => adm.setFeature(store, actor, { key: args.s("key"), accountId: args.so("accountId"), courseId: args.so("courseId"), enabled: args.b("enabled"), locked: args.b("locked") }));
cmd("admin.add_domain", "tenant-admin", "Add a custom domain (verification required).", [P("host")], ({ store, actor, args }) => adm.addDomain(store, actor, args.s("host")));
cmd("admin.verify_domain", "tenant-admin", "Verify a custom domain by its DNS TXT record.", [P("host")], ({ store, actor, args }) => adm.verifyDomain(store, actor, args.s("host")));
qry("global_announcements.active", "tenant-admin", "Active global announcements for me.", [], ({ store, actor }) => adm.activeGlobalAnnouncements(store, actor));
cmd("global_announcements.dismiss", "tenant-admin", "Dismiss a global announcement.", [P("id")], ({ store, actor, args }) => adm.dismissGlobalAnnouncement(store, actor, args.s("id")));
cmd("admin.help_links", "tenant-admin", "Set the Help menu links.", [P("links", "json")], ({ store, actor, args }) => adm.setHelpLinks(store, actor, args.j("links")));
qry("admin.help_links.get", "tenant-admin", "Help menu links.", [], ({ store }) => adm.helpLinks(store));
cmd("custom_roles.grant", "tenant-admin", "Give a user a custom role.", [P("userId"), P("roleKey")], ({ store, actor, args }) => adm.grantCustomRole(store, actor, args.s("userId"), args.s("roleKey")));
qry("audit.log", "tenant-admin", "Recent audit records.", [opt("limit", "number")], ({ store, actor, args }) => {
  requireTenant(store, actor, ["admin"], "audit.read");
  return store.auditLog(Math.min(args.n("limit", 200), 1000));
});
qry("outbox.status", "tenant-admin", "Outbox events (pending, delivered, dead).", [opt("status")], ({ store, actor, args }) => {
  requireTenant(store, actor, ["admin"], "outbox.read");
  return store.outbox().filter((e) => !args.has("status") || e.status === args.s("status")).slice(-200).reverse();
});

/* 26 Privacy */
qry("privacy.observer_summary", "observers", "Observer view of a student (consent required).", [P("studentId")], ({ store, actor, args }) => suc.observerSummary(store, actor, args.s("studentId")));
cmd("privacy.request", "privacy", "Request a data export or erasure.", [P("kind", "string", true, { options: ["export", "erase"] }), opt("userId")], ({ store, actor, args }) => suc.requestDsr(store, actor, args.s("kind") as never, args.so("userId")));
cmd("privacy.process", "privacy", "Process a data request (erasure refused under legal hold).", [P("dsrId")], ({ store, actor, args }) => suc.processDsr(store, actor, args.s("dsrId")));

/* 27 Help desk */
qry("helpdesk.mine", "helpdesk", "My tickets.", [], ({ store, actor }) => desk.myTickets(store, actor));
qry("helpdesk.queue", "helpdesk", "Ticket queue (needs an active support grant).", [opt("status"), opt("tier")], ({ store, actor, args }) => desk.ticketQueue(store, actor, { status: args.so("status"), tier: args.so("tier") }));
qry("helpdesk.ticket", "helpdesk", "A ticket with its messages.", [P("ticketId")], ({ store, actor, args }) => desk.ticketView(store, actor, args.s("ticketId")));
cmd("helpdesk.reply", "helpdesk", "Reply to a ticket (staff can add internal notes).", [P("ticketId"), P("body", "text"), opt("internal", "boolean")], ({ store, actor, args }) => desk.replyTicket(store, actor, args.s("ticketId"), args.s("body"), args.b("internal")));
cmd("helpdesk.update", "helpdesk", "Change status, tier or assignee.", [P("ticketId"), opt("status", "string", { options: ["open", "pending", "solved"] }), opt("tier", "string", { options: ["1", "2", "3"] }), opt("assigneeId")], ({ store, actor, args }) => desk.setTicket(store, actor, args.s("ticketId"), { status: args.so("status") as never, tier: args.so("tier") as never, assigneeId: args.so("assigneeId") }));
qry("helpdesk.stats", "helpdesk", "Queue statistics.", [], ({ store, actor }) => desk.helpdeskStats(store, actor));

/* 28 Operations (platform operators) */
qry("ops.overview", "operations", "Tenants, backups and SLOs.", [], ({ actor }) => opsSvc.opsOverview(actor));
cmd("ops.backup", "operations", "Back up a tenant.", [P("tenantId")], ({ actor, args }) => adm.backupTenant(actor, args.s("tenantId")));
cmd("ops.restore_drill", "operations", "Restore a backup into a validation tenant and verify it.", [P("backupId")], ({ actor, args }) => adm.restoreDrill(actor, args.s("backupId")));
cmd("ops.tenant_status", "operations", "Suspend or reactivate a tenant.", [P("tenantId"), P("status", "string", true, { options: ["active", "suspended"] })], ({ actor, args }) => adm.setTenantStatus(actor, args.s("tenantId"), args.s("status") as never));
cmd("ops.run_jobs", "operations", "Run scheduled jobs for this tenant now.", [], ({ store, actor }) => {
  if (!actor.platformOperator && !actor.roles.includes("admin")) throw new CampusError("forbidden", "Admins and operators only.", 403);
  return opsSvc.runJobs(store);
});

/* 29 Marketplace */
qry("marketplace.catalog", "marketplace", "Curated, reviewed listings.", [], ({ store, actor }) => desk.catalog(store, actor));
cmd("marketplace.request", "marketplace", "Request an install.", [P("listingId"), P("reason", "text")], ({ store, actor, args }) => desk.requestInstall(store, actor, args.s("listingId"), args.s("reason")));
cmd("marketplace.decide", "marketplace", "Approve or decline an install.", [P("installId"), P("approve", "boolean")], ({ store, actor, args }) => desk.decideInstall(store, actor, args.s("installId"), args.b("approve")));

/* 30 Offline */
cmd("offline.package", "offline", "Build an offline package for a course.", [P("courseId")], ({ store, actor, args }) => desk.buildOfflinePackage(store, actor, args.s("courseId")));
qry("offline.sync", "offline", "Changes since this device's cursor.", [P("deviceId")], ({ store, actor, args }) => desk.syncChanges(store, actor, args.s("deviceId")));
cmd("offline.save_draft", "offline", "Save a draft written offline.", [P("assignmentId"), P("body", "text"), P("baseVersion", "number")], ({ store, actor, args }) => desk.saveOfflineDraft(store, actor, args.s("assignmentId"), args.s("body"), args.n("baseVersion")));
cmd("offline.sync_draft", "offline", "Upload an offline draft (conflicts are held for you to decide).", [P("draftId"), opt("resolve", "string", { options: ["submit_anyway", "discard"] })], ({ store, actor, args }) => desk.syncOfflineDraft(store, actor, args.s("draftId"), args.so("resolve") as never));

/* 31–32 Accommodations, groups */
qry("accommodations.mine", "accommodations", "Accommodations for me (or a student).", [opt("userId"), opt("courseId")], ({ store, actor, args }) => ppl.accommodationsFor(store, actor, args.so("userId") ?? actor.id, args.so("courseId")));
qry("accommodations.course", "accommodations", "Accommodations of students in a course.", [P("courseId")], ({ store, actor, args }) => ppl.courseAccommodations(store, actor, args.s("courseId")));
qry("groups.set", "groups", "A group set with its groups.", [P("setId")], ({ store, actor, args }) => ppl.groupSetView(store, actor, args.s("setId")));
cmd("groups.join", "groups", "Join a self sign-up group.", [P("groupId")], ({ store, actor, args }) => ppl.joinGroup(store, actor, args.s("groupId")));
cmd("groups.leave", "groups", "Leave a self sign-up group.", [P("groupId")], ({ store, actor, args }) => ppl.leaveGroup(store, actor, args.s("groupId")));
cmd("groups.auto_assign", "groups", "Auto-assign unassigned students (creates groups if a count is given).", [P("setId"), opt("groupCount", "number")], ({ store, actor, args }) => ppl.autoAssign(store, actor, args.s("setId"), { groupCount: args.has("groupCount") ? args.n("groupCount") : undefined }));
cmd("groups.clone", "groups", "Clone a group set.", [P("setId"), P("name")], ({ store, actor, args }) => ppl.cloneGroupSet(store, actor, args.s("setId"), args.s("name")));
qry("groups.export_csv", "groups", "Export group memberships as CSV.", [P("setId")], ({ store, actor, args }) => ppl.exportGroupsCsv(store, actor, args.s("setId")));
cmd("groups.import_csv", "groups", "Import group memberships from CSV (group_name,email).", [P("setId"), P("csv", "text")], ({ store, actor, args }) => ppl.importGroupsCsv(store, actor, args.s("setId"), args.s("csv")));

/* 34 Reports */
cmd("reports.run", "reports", "Run an account report (CSV).", [P("kind", "string", true, { options: [...suc.REPORT_KINDS] })], ({ store, actor, args }) => suc.runReport(store, actor, args.s("kind") as never));

/* 35 Dashboard, 40 Account */
qry("dashboard", "dashboard", "Dashboard: cards, to-do, coming up, recent feedback, grades.", [], ({ store, actor }) => dsh.dashboard(store, actor));
qry("dashboard.activity", "dashboard", "Recent activity stream.", [], ({ store, actor }) => dsh.activity(store, actor));
cmd("dashboard.prefs", "dashboard", "Dashboard view, card order, favorites, colors and nicknames.", [opt("view", "string", { options: ["cards", "list", "activity"] }), opt("cardOrder", "list"), opt("favorites", "list"), opt("colors", "json"), opt("nicknames", "json")], ({ store, actor, args }) => dsh.setDashboardPrefs(store, actor, { view: args.so("view") as never, cardOrder: args.has("cardOrder") ? args.l("cardOrder") : undefined, favorites: args.has("favorites") ? args.l("favorites") : undefined, colors: args.has("colors") ? args.j("colors") : undefined, nicknames: args.has("nicknames") ? args.j("nicknames") : undefined }));
qry("planner", "dashboard", "Planner items for a date range.", [P("from", "date"), P("to", "date")], ({ store, actor, args }) => dsh.planner(store, actor, args.s("from"), args.s("to")));
cmd("planner.mark", "dashboard", "Mark a planner item done or not.", [P("refType"), P("refId"), opt("done", "boolean")], ({ store, actor, args }) => dsh.markPlanner(store, actor, args.s("refType"), args.s("refId"), args.b("done", true)));
qry("account.profile", "account", "My profile and accessibility preferences.", [], ({ store, actor }) => dsh.profile(store, actor));
cmd("account.profile.update", "account", "Update my profile and accessibility preferences.", [opt("displayName"), opt("pronouns"), opt("bio", "text"), opt("language", "string", { options: ["en", "es", "fr"] }), opt("timeZone"), opt("highContrast", "boolean"), opt("dyslexiaFont", "boolean"), opt("underlineLinks", "boolean"), opt("reducedMotion", "boolean")], ({ store, actor, args }) => dsh.updateProfile(store, actor, args.raw));
qry("account.history", "account", "Recently viewed.", [], ({ store, actor }) => dsh.viewHistory(store, actor));
cmd("account.qr_login", "account", "Create a QR code to sign in on the mobile app.", [], ({ store, actor }) => adm.createQrLogin(store, actor));
cmd("observers.pairing_code", "observers", "Student: create a pairing code for an observer.", [], ({ store, actor }) => ppl.pairingCode(store, actor));
cmd("observers.pair", "observers", "Observer: link to a student with a pairing code.", [P("code")], ({ store, actor, args }) => ppl.redeemPairing(store, actor, args.s("code")));
qry("observers.mine", "observers", "Students I observe.", [], ({ store, actor }) => ppl.myObservees(store, actor));

/* 37 Content */
cmd("content.copy", "content", "Copy a course's content (with date adjustment).", [P("sourceCourseId"), P("targetCourseId"), opt("shiftDays", "number"), opt("removeDates", "boolean"), opt("only", "list"), opt("idempotencyKey")], ({ store, actor, args }) => cnt.copyCourse(store, actor, args.s("sourceCourseId"), args.s("targetCourseId"), { shift: { days: args.has("shiftDays") ? args.n("shiftDays") : undefined, remove: args.b("removeDates") }, only: args.l("only").length ? args.l("only") : undefined, idempotencyKey: args.so("idempotencyKey") }));
qry("outcomes.tree", "outcomes", "Outcome folders, outcomes and mastery scales (account-level, plus a course's own when courseId is given).", [opt("courseId")], ({ store, actor, args }) => oc.outcomeTree(store, actor, args.so("courseId") ?? null));
cmd("outcomes.group_create", "outcomes", "Create an outcome folder (account-level, or in a course).", [P("title"), opt("parentId"), opt("courseId"), opt("description", "text")], ({ store, actor, args }) => oc.createGroup(store, actor, { title: args.s("title"), parentId: args.so("parentId") ?? null, courseId: args.so("courseId") ?? null, description: args.so("description") }));
cmd("outcomes.move", "outcomes", "Move a folder or outcome into another folder (or to the root).", [P("kind", "string", true, { options: ["group", "outcome"] }), P("id"), opt("toGroupId")], ({ store, actor, args }) => oc.moveItem(store, actor, { kind: args.s("kind") as "group", id: args.s("id"), toGroupId: args.so("toGroupId") || null }));
cmd("outcomes.scale_create", "outcomes", "Create a mastery scale: ratings highest-first as JSON [{label, points}] and the mastery points.", [P("title"), P("ratings", "json"), P("masteryPoints", "number"), opt("courseId")], ({ store, actor, args }) => oc.createScale(store, actor, { title: args.s("title"), ratings: args.j("ratings"), masteryPoints: args.n("masteryPoints"), courseId: args.so("courseId") ?? null }));
cmd("outcomes.import", "outcomes", "Import standards from the outcomes CSV (dry run supported; idempotent by vendor_guid; per-row issue report).", [P("csv", "text"), opt("courseId"), opt("dryRun", "boolean"), opt("source")], ({ store, actor, args }) => oc.importStandards(store, actor, { csv: args.s("csv"), courseId: args.so("courseId") ?? null, dryRun: args.b("dryRun"), source: args.so("source") }));
qry("outcomes.export_csv", "outcomes", "Export outcomes in the same CSV format (round-trips through outcomes.import).", [opt("courseId")], ({ store, actor, args }) => oc.exportStandards(store, actor, args.so("courseId") ?? null));
qry("terms.access", "registration", "A term's per-role access windows and its grading-period set.", [P("termId")], ({ store, actor, args }) => termsvc.termAccessSummary(store, actor, args.s("termId")));
cmd("terms.role_override", "registration", "Set a role's access window for a term (blank = term dates).", [P("termId"), P("role", "string", true, { options: ["student", "ta", "instructor", "designer", "observer"] }), opt("startsAt"), opt("endsAt")], ({ store, actor, args }) => termsvc.setRoleOverride(store, actor, { termId: args.s("termId"), role: args.s("role"), startsAt: args.so("startsAt") || null, endsAt: args.so("endsAt") || null }));
cmd("terms.enforce", "registration", "Turn access-window enforcement on or off for a term.", [P("termId"), P("enforce", "boolean")], ({ store, actor, args }) => termsvc.setEnforcement(store, actor, args.s("termId"), args.b("enforce")));
qry("terms.window", "registration", "The access window that applies to a role in a course.", [P("courseId"), P("role", "string", true, { options: ["student", "ta", "instructor", "designer", "observer"] })], ({ store, args }) => termsvc.accessWindow(store, args.s("courseId"), args.s("role") as "student"));
cmd("grading_periods.set_create", "gradebook", "Create a grading-period set attached to terms (or the account default).", [P("title"), opt("termIds", "json"), opt("weighted", "boolean"), opt("accountDefault", "boolean")], ({ store, actor, args }) => termsvc.createPeriodSet(store, actor, { title: args.s("title"), termIds: args.has("termIds") ? args.j("termIds") : [], weighted: args.b("weighted"), accountDefault: args.b("accountDefault") }));
cmd("grading_periods.add", "gradebook", "Add a period to a set (no overlaps; start < end ≤ close).", [P("setId"), P("name"), P("startsAt"), P("endsAt"), P("closeAt"), opt("weight", "number")], ({ store, actor, args }) => termsvc.addPeriodToSet(store, actor, { setId: args.s("setId"), name: args.s("name"), startsAt: args.s("startsAt"), endsAt: args.s("endsAt"), closeAt: args.s("closeAt"), weight: args.has("weight") ? args.n("weight") : undefined }));
qry("grading_periods.for_course", "gradebook", "A course's grading periods and where they come from (term's set, account default set, or term).", [P("courseId")], ({ store, args }) => {
  const r = termsvc.periodsForCourse(store, args.s("courseId"));
  return { source: r.source, set: r.set ? { id: r.set.id, title: r.set.title, weighted: !!r.set.weighted } : null, periods: r.periods.map((p) => ({ id: p.id, name: p.name, startsAt: p.startsAt, endsAt: p.endsAt, closeAt: p.closeAt, weight: p.weight ?? null })) };
});
qry("apps.placement_types", "integration", "The LTI placements an app can use.", [], () => apps.PLACEMENTS);
cmd("apps.install", "integration", "Install a registered LTI tool at an account (inherited below it) or in one course, with its placements (JSON [{key, label}]).", [P("toolId"), P("scope", "string", true, { options: ["account", "course"] }), opt("accountId"), opt("courseId"), P("placements", "json")], ({ store, actor, args }) => apps.installTool(store, actor, { toolId: args.s("toolId"), scope: args.s("scope") as "account", accountId: args.so("accountId"), courseId: args.so("courseId"), placements: args.j("placements") }));
cmd("apps.placements_update", "integration", "Change an install's placements (JSON [{key, label, enabled}]).", [P("installId"), P("placements", "json")], ({ store, actor, args }) => apps.updatePlacements(store, actor, args.s("installId"), args.j("placements")));
cmd("apps.course_visibility", "integration", "Hide (or show again) an inherited account app in one course.", [P("toolId"), P("courseId"), P("hidden", "boolean")], ({ store, actor, args }) => apps.setHiddenInCourse(store, actor, { toolId: args.s("toolId"), courseId: args.s("courseId"), hidden: args.b("hidden") }));
qry("apps.placements", "integration", "Apps that appear in a course, optionally at one placement, with where each comes from.", [P("courseId"), opt("placement")], ({ store, actor, args }) => apps.placementsFor(store, actor, { courseId: args.s("courseId"), placement: args.so("placement") }));
cmd("content.import_foreign", "content", "Import a Moodle (.mbz), Blackboard or D2L export, or any IMS package (base64). Detected automatically unless platform is given.", [P("courseId"), P("packageBase64", "text"), opt("platform", "string", { options: ["moodle", "blackboard", "d2l", "ims"] }), opt("idempotencyKey")], ({ store, actor, args }) => lmsimp.importForeignPackage(store, actor, args.s("courseId"), Buffer.from(args.s("packageBase64"), "base64"), { platform: args.so("platform") as "moodle" | undefined, idempotencyKey: args.so("idempotencyKey") }));
cmd("content.import_package", "content", "Import a course package (base64 zip).", [P("courseId"), P("packageBase64", "text"), opt("idempotencyKey")], ({ store, actor, args }) => cnt.importPackage(store, actor, args.s("courseId"), Buffer.from(args.s("packageBase64"), "base64"), { idempotencyKey: args.so("idempotencyKey") }));
cmd("blueprint.associate", "content", "Associate courses with a blueprint.", [P("blueprintId"), P("courseIds", "list")], ({ store, actor, args }) => cnt.associate(store, actor, args.s("blueprintId"), args.l("courseIds")));
cmd("blueprint.lock", "content", "Lock or unlock a blueprint item.", [P("table"), P("id"), P("locked", "boolean")], ({ store, actor, args }) => cnt.setItemLock(store, actor, args.s("table"), args.s("id"), args.b("locked")));
qry("blueprint.preview", "content", "Preview a blueprint sync (three-way diff).", [P("blueprintId")], ({ store, actor, args }) => cnt.blueprintPreview(store, actor, args.s("blueprintId")));
cmd("blueprint.sync", "content", "Sync a blueprint to its courses (idempotent).", [P("blueprintId"), P("idempotencyKey")], ({ store, actor, args }) => cnt.blueprintSync(store, actor, args.s("blueprintId"), args.s("idempotencyKey")));
cmd("library.share", "content", "Share an item to a colleague or the institution library.", [P("table", "string", true, { options: ["pages", "assignments", "quizzes", "discussion_topics", "modules"] }), P("id"), P("scope", "string", true, { options: ["user", "institution"] }), opt("recipientId"), opt("tags", "list")], ({ store, actor, args }) => cnt.shareItem(store, actor, { table: args.s("table"), id: args.s("id"), scope: args.s("scope") as never, recipientId: args.so("recipientId"), tags: args.l("tags") }));
qry("library.list", "content", "Shared content library.", [opt("q")], ({ store, actor, args }) => cnt.sharedLibrary(store, actor, args.so("q")));
cmd("library.import", "content", "Import a shared item into a course.", [P("sharedId"), P("courseId")], ({ store, actor, args }) => cnt.importShared(store, actor, args.s("sharedId"), args.s("courseId")));


/* 41–43 Catalog, pathways, commerce */
qry("catalog.hub", "catalog", "Catalog page data: cards, filters, comparison, path diagram, structured data.", [opt("type"), opt("level"), opt("skill"), opt("q"), opt("maxPrice", "number"), opt("compare", "list")], ({ store, args }) => acad.catalogHub(store, { type: args.so("type"), level: args.so("level"), skill: args.so("skill"), q: args.so("q"), maxPrice: args.has("maxPrice") ? args.n("maxPrice") : undefined, compare: args.l("compare") }));
qry("catalog.recommender_questions", "catalog", "Recommender quiz questions.", [], () => acad.RECOMMENDER_QUESTIONS);
qry("catalog.recommend", "catalog", "Recommend offerings from quiz answers (with reasons).", [P("answers", "json")], ({ store, args }) => acad.recommend(store, args.j("answers")));
cmd("catalog.check_copy", "catalog", "Catalog Copy Checker: flag unverified claims in text.", [P("text", "text")], ({ store, actor, args }) => acad.checkCopy(store, actor, args.s("text")));
qry("pathways.evaluate", "pathways", "Evaluate pathway rules for enrolling in an offering.", [P("offeringId"), opt("userId")], ({ store, actor, args }) => {
  const uid = args.so("userId") ?? actor.id;
  if (uid !== actor.id && !hasAny(actor, ["admin", "registrar", "advisor"])) throw new CampusError("forbidden", "Not allowed", 403);
  return acad.evaluatePathway(store, uid, args.s("offeringId"));
});
qry("pathways.consolidation_report", "pathways", "Catalog consolidation report: overlaps, transfer rules, merge/retire candidates.", [], ({ store, actor }) => acad.consolidationReport(store, actor));
qry("commerce.quote", "commerce", "Price quote (early-bird, coupon, simulated tax, installments).", [P("offeringId"), opt("coupon"), opt("plan", "string", { options: ["full", "installments"] }), opt("installments", "number")], ({ store, args }) => acad.quote(store, { offeringId: args.s("offeringId"), coupon: args.so("coupon"), plan: args.so("plan") as never, installments: args.has("installments") ? args.n("installments") : undefined }));
cmd("commerce.checkout", "commerce", "Sandbox checkout (no real payment).", [P("offeringId"), opt("sectionId"), opt("coupon"), opt("plan", "string", { options: ["full", "installments", "pay_later"] }), opt("installments", "number"), opt("funding", "string", { options: ["self", "federal_aid", "employer"] }), opt("sandboxCard"), opt("idempotencyKey")], ({ store, actor, args }) => acad.checkout(store, actor, { offeringId: args.s("offeringId"), sectionId: args.so("sectionId"), coupon: args.so("coupon"), plan: args.so("plan") as never, installments: args.has("installments") ? args.n("installments") : undefined, funding: args.so("funding") as never, sandboxCard: args.so("sandboxCard"), idempotencyKey: args.so("idempotencyKey") }));
cmd("commerce.subscribe", "commerce", "Start the subscription (sandbox).", [opt("plan")], ({ store, actor, args }) => acad.subscribe(store, actor, args.so("plan")));
cmd("commerce.cancel_subscription", "commerce", "Cancel the subscription.", [], ({ store, actor }) => acad.cancelSubscription(store, actor));
cmd("commerce.enroll_with_subscription", "commerce", "Enroll in an offering included in the subscription.", [P("offeringId")], ({ store, actor, args }) => acad.enrollWithSubscription(store, actor, args.s("offeringId")));
cmd("commerce.assign_seat", "commerce", "Assign a corporate seat to a learner.", [P("licenseId"), P("email")], ({ store, actor, args }) => acad.assignSeat(store, actor, args.s("licenseId"), args.s("email")));
cmd("commerce.invoice_seats", "commerce", "Issue a sandbox invoice for a seat license.", [P("licenseId")], ({ store, actor, args }) => acad.invoiceSeats(store, actor, args.s("licenseId")));
cmd("commerce.refund", "commerce", "Request a refund or deferral (policy engine decides, with reasons).", [P("orderId"), P("kind", "string", true, { options: ["refund", "deferral"] }), P("reason", "text")], ({ store, actor, args }) => acad.requestRefund(store, actor, args.s("orderId"), args.s("kind") as never, args.s("reason")));
cmd("commerce.reset_deadlines", "commerce", "Self-paced: reset my suggested deadlines.", [P("offeringId")], ({ store, actor, args }) => acad.resetDeadlines(store, actor, args.s("offeringId")));
cmd("offerings.evaluate_completion", "credentials", "Check completion requirements and issue the credential.", [P("offeringId"), opt("userId")], ({ store, actor, args }) => acad.evaluateCompletion(store, actor, args.so("userId") ?? actor.id, args.s("offeringId")));
qry("analytics.program", "analytics", "Program funnel, completion and credential rates, waivers.", [], ({ store, actor }) => acad.programAnalytics(store, actor));
qry("analytics.commerce", "commerce", "Commerce analytics (sandbox).", [], ({ store, actor }) => acad.commerceAnalytics(store, actor));
cmd("credentials.reissue", "credentials", "Revoke with a reason code and issue a corrected credential.", [P("credentialId"), P("reasonCode", "string", true, { options: [...suc.REASON_CODES] }), opt("title")], ({ store, actor, args }) => suc.reissueCredential(store, actor, args.s("credentialId"), args.s("reasonCode") as never, args.so("title")));
qry("credentials.clr", "credentials", "Comprehensive Learner Record (signed).", [opt("userId")], ({ store, actor, args }) => suc.clrExport(store, actor, args.so("userId") ?? actor.id));
qry("credentials.share", "credentials", "Verification, LinkedIn and wallet links for a credential.", [P("credentialId")], ({ store, actor, args }) => suc.shareLinks(store, actor, args.s("credentialId")));

/* 44–45 Tutor, key vault */
cmd("tutor.ask", "tutor", "Ask the AI tutor (explain, hint, practice quiz, study plan).", [P("courseId"), P("mode", "string", true, { options: ["explain", "hint", "quiz", "study_plan"] }), opt("question", "text"), opt("language", "string", { options: ["en", "en-NG", "pcm"] }), opt("avatar", "string", { options: ["amara", "tunde"] })], ({ store, actor, args }) => tut.tutor(store, actor, { courseId: args.s("courseId"), mode: args.s("mode") as tut.TutorMode, question: args.so("question"), language: args.so("language") as never, avatar: args.so("avatar") as never }));
cmd("tutor.escalate", "tutor", "Send my question to the instructor.", [P("courseId"), P("question", "text")], ({ store, actor, args }) => tut.escalate(store, actor, args.s("courseId"), args.s("question")));
qry("tutor.memory", "tutor", "What the tutor remembers about my sessions.", [opt("courseId")], ({ store, actor, args }) => tut.tutorMemory(store, actor, args.so("courseId")));
cmd("tutor.erase_memory", "tutor", "Erase tutor memory (all or one course).", [opt("courseId")], ({ store, actor, args }) => tut.eraseTutorMemory(store, actor, args.so("courseId")));
qry("tutor.analytics", "tutor", "Tutor usage, refusals and escalations.", [], ({ store, actor }) => tut.tutorAnalytics(store, actor));
cmd("proctor.ask", "proctor-support", "Ask the proctored-assessment setup assistant.", [P("question", "text")], ({ store, actor, args }) => prc.proctorAsk(store, actor, args.s("question")));
qry("proctor.reply", "proctor-support", "Show a setup-assistant reply again (only to the person who asked).", [P("id")], ({ store, actor, args }) => prc.proctorReply(store, actor, args.s("id")));
qry("proctor.my_assessments", "proctor-support", "My proctored assessments and checklist status.", [], ({ store, actor }) => prc.myProctoredAssessments(store, actor));
qry("proctor.readiness", "proctor-support", "Pre-test checklist for a proctored assessment.", [P("quizId")], ({ store, actor, args }) => prc.readiness(store, actor, args.s("quizId")));
cmd("proctor.save_readiness", "proctor-support", "Save my pre-test checklist.", [P("quizId"), opt("checks", "list", { options: prc.CHECKLIST.map((c) => c.key) })], ({ store, actor, args }) => prc.saveReadiness(store, actor, args.s("quizId"), args.l("checks")));
qry("proctor.staff_guide", "proctor-support", "Staff guidance: expectations, focus areas, approved answers, staff notes.", [], ({ store, actor }) => prc.staffGuide(store, actor));
qry("proctor.overview", "proctor-support", "Questions, escalations, checklist completion and questions awaiting an approved answer.", [], ({ store, actor }) => prc.proctorOverview(store, actor));
cmd("proctor.promote", "proctor-support", "Draft a talking point from a logged question (admin publishes it).", [P("logId"), P("key"), P("answer", "text"), opt("triggers", "list"), opt("question")], ({ store, actor, args }) => prc.promoteQuestion(store, actor, args.s("logId"), { key: args.s("key"), answer: args.s("answer"), triggers: args.l("triggers"), question: args.so("question") }));
cmd("announcement.reply", "collaboration", "Reply to an announcement (when replies are on).", [P("announcementId"), P("body", "text")], ({ store, actor, args }) => plus.replyAnnouncement(store, actor, args.s("announcementId"), args.s("body")));
cmd("announcement.like", "collaboration", "Like an announcement or a reply.", [P("announcementId"), opt("replyId")], ({ store, actor, args }) => plus.likeAnnouncement(store, actor, args.s("announcementId"), args.so("replyId")));
qry("announcement.replies", "collaboration", "Replies and likes on an announcement.", [P("announcementId")], ({ store, actor, args }) => plus.announcementReplies(store, actor, args.s("announcementId")));
cmd("assignments.bulk_dates", "assessment", "Bulk edit dates: per-item dates, shift all by N days, or remove dates.", [P("courseId"), opt("items", "json", { help: '[{"kind":"assignment","id":"…","dueAt":"…"}]' }), opt("shiftDays", "number"), opt("removeDates", "boolean")], ({ store, actor, args }) => plus.bulkEditDates(store, actor, args.s("courseId"), { items: args.has("items") ? args.j("items") : undefined, shiftDays: args.has("shiftDays") ? args.n("shiftDays") : undefined, removeDates: args.b("removeDates") }));
qry("gradebook.cell", "gradebook", "Grade detail tray: status, submission, comments and history for one cell.", [P("assignmentId"), P("userId")], ({ store, actor, args }) => plus.gradeDetail(store, actor, args.s("assignmentId"), args.s("userId")));
cmd("grades.set_group", "gradebook", "Grade a group assignment for the whole group (unless graded individually).", [P("assignmentId"), P("userId"), opt("score", "number"), opt("comment", "text")], ({ store, actor, args }) => plus.gradeGroup(store, actor, { assignmentId: args.s("assignmentId"), userId: args.s("userId"), score: args.has("score") ? args.n("score") : undefined, comment: args.so("comment") }));
cmd("people.edit_enrollment", "groups", "Change an enrollment's section or role.", [P("enrollmentId"), opt("sectionId"), opt("role", "string", { options: ["student", "ta", "instructor", "designer", "observer"] })], ({ store, actor, args }) => plus.editEnrollment(store, actor, args.s("enrollmentId"), { sectionId: args.so("sectionId"), role: args.so("role") as never }));
cmd("inbox.forward", "collaboration", "Forward a conversation (recipients checked on the server).", [P("conversationId"), P("courseId"), opt("role", "string", { options: ["student", "instructor", "ta", "observer", "all"] }), opt("sectionId"), opt("userIds", "list"), opt("note", "text")], ({ store, actor, args }) => plus.forwardConversation(store, actor, args.s("conversationId"), { courseId: args.s("courseId"), role: args.so("role") as never, sectionId: args.so("sectionId"), userIds: args.l("userIds").length ? args.l("userIds") : undefined }, args.so("note")));
qry("analytics.export_csv", "analytics", "Course analytics as CSV.", [P("courseId")], ({ store, actor, args }) => plus.courseAnalyticsCsv(store, actor, args.s("courseId")));
qry("course.statistics", "curriculum", "Course statistics: items, students, submissions, storage.", [P("courseId")], ({ store, actor, args }) => plus.courseStatistics(store, actor, args.s("courseId")));
cmd("course.conclude", "curriculum", "Conclude (or reopen) a course; concluded courses are read-only for students.", [P("courseId"), opt("reopen", "boolean")], ({ store, actor, args }) => plus.concludeCourse(store, actor, args.s("courseId"), !args.b("reopen")));
cmd("course.reset", "curriculum", "Reset course content (archives items; only when there is no student work).", [P("courseId"), P("confirm", "string", true, { help: "Type the course code" })], ({ store, actor, args }) => plus.resetCourseContent(store, actor, args.s("courseId"), args.s("confirm")));
qry("page.word_count", "curriculum", "Word count for a page.", [P("pageId")], ({ store, actor, args }) => plus.pageWordCount(store, actor, args.s("pageId")));
qry("agentic.hub", "program-studio", "Agentic AI Courses & Certifications hub (filters, rails, paths, comparison).", [opt("tab"), opt("track"), opt("level"), opt("coding", "string", { options: ["yes", "no"] }), opt("duration"), opt("format"), opt("credential"), opt("skill"), opt("access"), opt("q"), opt("compare", "list")], ({ store, args }) => hub.agenticHub(store, { tab: args.so("tab"), track: args.so("track"), level: args.so("level"), coding: args.so("coding") as never, duration: args.so("duration"), format: args.so("format"), credential: args.so("credential"), skill: args.so("skill"), access: args.so("access"), q: args.so("q"), compare: args.l("compare") }));
qry("agentic.quiz_questions", "program-studio", "“Which program is right for me?” questions.", [], () => hub.HUB_QUIZ);
qry("agentic.recommend", "program-studio", "Recommend programs from quiz answers, with reasons.", [P("answers", "json")], ({ store, args }) => hub.hubRecommend(store, args.j<Record<string, string>>("answers")));
qry("assess.programs", "assessment-studio", "Programs and modules available to the generators.", [], ({ store, actor }) => (requireTenant(store, actor, ["admin", "designer", "instructor"], "assess.programs"), assess.studioPrograms(store)));
qry("assess.context", "assessment-studio", "Context header for a module (competencies, outcomes, readings, tools, run environment).", [P("offeringId"), P("week")], ({ store, actor, args }) => { requireTenant(store, actor, ["admin", "designer", "instructor"], "assess.context"); const { spec: _s, ...c } = assess.contextHeader(store, args.s("offeringId"), args.s("week")); return c; });
cmd("assess.generate", "assessment-studio", "Generate an AI DRAFT lab, activity, quiz + item bank, exercises, mini-project, real-world project, senior capstone or simulated lab for a module.", [P("offeringId"), P("week"), P("kind", "string", true, { options: [...assess.KINDS] }), opt("n", "number")], ({ store, actor, args }) => assess.generateDraft(store, actor, { offeringId: args.s("offeringId"), week: args.s("week"), kind: args.s("kind") as assess.DraftKind, n: args.has("n") ? args.n("n") : undefined }));
qry("assess.drafts", "assessment-studio", "Assessment and project drafts.", [opt("offeringId")], ({ store, actor, args }) => assess.draftsList(store, actor, args.so("offeringId")));
qry("assess.view", "assessment-studio", "A draft's student or instructor edition.", [P("id"), P("edition", "string", true, { options: ["student", "instructor"] })], ({ store, actor, args }) => assess.draftView(store, actor, args.s("id"), args.s("edition") as "student"));
cmd("assess.fill", "assessment-studio", "Write expert content into [SME] slots (JSON of path → text). Clears approvals.", [P("id"), P("patch", "json")], ({ store, actor, args }) => assess.fillDraft(store, actor, args.s("id"), args.j<Record<string, string>>("patch")));
cmd("assess.approve", "assessment-studio", "Approve a draft as the SME or the instructional designer (two different people).", [P("id"), P("as", "string", true, { options: ["sme", "id"] })], ({ store, actor, args }) => assess.approveDraft(store, actor, args.s("id"), args.s("as") as "sme"));
cmd("assess.publish", "assessment-studio", "Publish an approved draft into its course (created unpublished for scheduling).", [P("id")], ({ store, actor, args }) => assess.publishDraft(store, actor, args.s("id")));
qry("simlab.scenarios", "assessment-studio", "Sandbox scenarios for simulated Student/Instructor labs and demo apps.", [], ({ store, actor }) => (requireTenant(store, actor, ["admin", "designer", "instructor", "ta"], "simlab.scenarios"), simlab.simScenarios()));
qry("agentlabs.mine", "agentic-cloud-labs", "My Agentic Cloud Labs with attempts used and best score.", [], ({ store, actor }) => alabs.myLabs(store, actor));
qry("agentlabs.open", "agentic-cloud-labs", "Open a lab: brief, tools and permissions, budget, rubric, my workspace, attempts and runs.", [P("labId")], ({ store, actor, args }) => alabs.openLab(store, actor, args.s("labId")));
cmd("agentlabs.save", "agentic-cloud-labs", "Save my agent spec to the workspace (keeps the last 10 versions).", [P("labId"), P("code", "text")], ({ store, actor, args }) => alabs.saveWorkspace(store, actor, args.s("labId"), args.s("code")));
cmd("agentlabs.run", "agentic-cloud-labs", "Run my agent autonomously: practice (unlimited) or graded (uses one of my attempts and posts the best score to the gradebook).", [P("labId"), P("mode", "string", true, { options: ["practice", "graded"] }), opt("code", "text")], ({ store, actor, args }) => alabs.runLab(store, actor, args.s("labId"), args.s("mode") as "practice", args.so("code")));
cmd("agentlabs.restore", "agentic-cloud-labs", "Restore a saved workspace version.", [P("labId"), P("index", "number")], ({ store, actor, args }) => alabs.restoreVersion(store, actor, args.s("labId"), args.n("index")));
cmd("agentlabs.reset", "agentic-cloud-labs", "Reset my workspace to the starter spec (the current version is kept in history).", [P("labId")], ({ store, actor, args }) => alabs.resetWorkspace(store, actor, args.s("labId")));
qry("agentlabs.run_detail", "agentic-cloud-labs", "A run's rubric breakdown and run log.", [P("runId")], ({ store, actor, args }) => alabs.runDetail(store, actor, args.s("runId")));
qry("agentlabs.roster", "agentic-cloud-labs", "Staff: each learner's attempts, best score and violations.", [P("labId")], ({ store, actor, args }) => alabs.labRoster(store, actor, args.s("labId")));
cmd("agentlabs.grant_attempt", "agentic-cloud-labs", "Staff: grant a learner one more graded attempt (reason required, audited).", [P("labId"), P("userId"), P("reason", "text")], ({ store, actor, args }) => alabs.grantAttempt(store, actor, args.s("labId"), args.s("userId"), args.s("reason")));
qry("agentlabs.verify", "agentic-cloud-labs", "Staff: check the reference agent scores 100 and the starter scores below the pass mark.", [P("labId")], ({ store, actor, args }) => alabs.verifyLab(store, actor, args.s("labId")));
/* 55 Hosted learning area: graded items, workspaces, bounded agent runs, projection lock */
const answersOf = (args: { has: (k: string) => boolean; j: <T>(k: string) => T; raw: Record<string, unknown> }) => {
  if (args.has("answers")) return args.j<Record<string, unknown>>("answers");
  // Form posts: fields named a.<id> (repeated fields arrive as arrays).
  return Object.fromEntries(Object.entries(args.raw).filter(([k]) => k.startsWith("a.")).map(([k, v]) => [k.slice(2), v]));
};
qry("learn.overview", "learning-area", "Everything the course's learning area shows me: modules, topics, sources, graded items with my attempts, workspaces, Studio runs, policy, projection lock and gradebook.", [P("courseId")], ({ store, actor, args }) => learn.learnOverview(store, actor, args.s("courseId")));
qry("learn.sections", "learning-area", "The 15 learning-area sections.", [], () => learn.LEARN_SECTIONS);
qry("graded.view", "learning-area", "Open a graded item: instructions, rubric, mandatory criteria, pass mark, attempts and my submissions (never answer keys).", [P("itemId")], ({ store, actor, args }) => graded.itemView(store, actor, args.s("itemId")));
cmd("graded.practice", "learning-area", "Practice an item: unlimited, immediate feedback with hints; never uses an attempt or posts a grade.", [P("itemId"), opt("answers", "json")], ({ store, actor, args }) => {
  const r = graded.practice(store, actor, args.s("itemId"), answersOf(args as never));
  // Compact so form redirects can carry the feedback.
  return { practice: true, score: r.score, results: r.results.map((x) => ({ id: x.id, ok: x.correct, hint: x.hint ? String(x.hint).slice(0, 90) : null })), note: r.note };
});
cmd("graded.submit", "learning-area", "Submit a graded attempt (idempotent by key). Two attempts; the highest valid attempt is posted to the gradebook and passbook.", [P("itemId"), P("idempotencyKey"), opt("answers", "json")], ({ store, actor, args }) => graded.submit(store, actor, args.s("itemId"), answersOf(args as never), args.s("idempotencyKey")));
cmd("graded.submit_project", "learning-area", "Submit a workspace project: the workspace is frozen as a snapshot and that snapshot is graded. Infrastructure failures don't use an attempt.", [P("itemId"), P("workspaceId"), P("idempotencyKey")], ({ store, actor, args }) => submitProject(store, actor, args.s("itemId"), args.s("workspaceId"), args.s("idempotencyKey")));
qry("graded.review", "learning-area", "Check Answers for a graded submission (learner after grading; staff any time).", [P("submissionId")], ({ store, actor, args }) => graded.reviewAnswers(store, actor, args.s("submissionId")));
qry("graded.gradebook", "learning-area", "Course gradebook and competency passbook (learners see their own row).", [P("courseId")], ({ store, actor, args }) => graded.courseGradebook(store, actor, args.s("courseId")));
cmd("graded.regrade", "learning-area", "Staff: post-hoc regrade with a required reason (audited; the learner is notified; never delays the original grade).", [P("submissionId"), P("score", "number"), P("reason", "text")], ({ store, actor, args }) => graded.regrade(store, actor, args.s("submissionId"), args.n("score"), args.s("reason")));
cmd("graded.retry", "learning-area", "Retry failed gradebook postings (never regrades or uses attempts).", [P("courseId")], ({ store, actor, args }) => graded.retryPostings(store, actor, args.s("courseId")));
qry("workspace.templates", "learning-area", "Workspace templates (programming, agentic, data, DevOps, cloud simulation, lecture lab).", [], () => wsp.listTemplates());
qry("workspace.mine", "learning-area", "My saved workspaces.", [opt("courseId")], ({ store, actor, args }) => wsp.listMyWorkspaces(store, actor, args.so("courseId")));
cmd("workspace.launch", "learning-area", "Launch or resume my workspace for a lab (one per learner per lab).", [P("courseId"), P("labKey"), P("templateId")], ({ store, actor, args }) => wsp.launchWorkspace(store, actor, { courseId: args.s("courseId"), labKey: args.s("labKey"), templateId: args.s("templateId") }));
qry("workspace.get", "learning-area", "A workspace: files, status, save status, usage and budget.", [P("wsId")], ({ store, actor, args }) => wsp.getWorkspace(store, actor, args.s("wsId")));
qry("workspace.files", "learning-area", "File listing.", [P("wsId")], ({ store, actor, args }) => wsp.listFiles(store, actor, args.s("wsId")));
qry("workspace.read", "learning-area", "Read a file.", [P("wsId"), P("path")], ({ store, actor, args }) => wsp.readFile(store, actor, args.s("wsId"), args.s("path")));
cmd("workspace.write", "learning-area", "Write a file (autosaved).", [P("wsId"), P("path"), P("content", "text")], ({ store, actor, args }) => wsp.writeFile(store, actor, args.s("wsId"), args.s("path"), args.s("content")));
cmd("workspace.command", "learning-area", "Run a command in the simulated terminal (virtual filesystem; nothing executes on a server).", [P("wsId"), P("command", "text")], ({ store, actor, args }) => wsp.runCommand(store, actor, args.s("wsId"), args.s("command")));
cmd("workspace.save", "learning-area", "Save now.", [P("wsId")], ({ store, actor, args }) => wsp.saveWorkspace(store, actor, args.s("wsId")));
cmd("workspace.stop", "learning-area", "Stop (files are kept).", [P("wsId")], ({ store, actor, args }) => wsp.stopWorkspace(store, actor, args.s("wsId")));
cmd("workspace.resume", "learning-area", "Resume a stopped workspace.", [P("wsId")], ({ store, actor, args }) => wsp.resumeWorkspace(store, actor, args.s("wsId")));
cmd("workspace.reset", "learning-area", "Reset to the template: first call shows what changes; confirm=true applies it.", [P("wsId"), opt("confirm", "boolean")], ({ store, actor, args }) => wsp.resetWorkspace(store, actor, args.s("wsId"), args.b("confirm")));
cmd("workspace.snapshot", "learning-area", "Freeze a read-only snapshot for an assessment.", [P("wsId"), P("assessmentKey")], ({ store, actor, args }) => wsp.snapshotForSubmission(store, actor, args.s("wsId"), args.s("assessmentKey")));
cmd("workspace.agent_run", "learning-area", "Run a bounded agent plan in my workspace (autonomous; blocked actions fail automatically under the lab policy).", [P("wsId"), P("plan", "json")], ({ store, actor, args }) => wsp.runAgent(store, actor, args.s("wsId"), args.j("plan")));
cmd("workspace.agent_stop", "learning-area", "Stop a running agent run.", [P("runId")], ({ store, actor, args }) => wsp.stopAgentRun(store, actor, args.s("runId")));
qry("workspace.agent_runs", "learning-area", "Run logs for my workspace (actions, policy results and usage — no model reasoning).", [P("wsId")], ({ store, actor, args }) => wsp.listAgentRuns(store, actor, args.s("wsId")));
cmd("workspace.pause", "learning-area", "Instructor: pause every workspace in a lab (files kept; commands and agent runs disabled).", [P("courseId"), P("labKey")], ({ store, actor, args }) => wsp.pauseWorkspaces(store, actor, args.s("courseId"), args.s("labKey")));
cmd("workspace.unpause", "learning-area", "Instructor: resume a paused lab.", [P("courseId"), P("labKey")], ({ store, actor, args }) => wsp.resumeWorkspaces(store, actor, args.s("courseId"), args.s("labKey")));
qry("workspace.policy", "learning-area", "The lab's execution policy: tools, filesystem, network, credentials and budgets.", [P("courseId"), P("labKey")], ({ store, actor, args }) => wsp.getPolicy(store, actor, args.s("courseId"), args.s("labKey")));
cmd("workspace.set_policy", "learning-area", "Instructor: change the policy for future runs (a new version; running and past runs keep theirs).", [P("courseId"), P("labKey"), P("patch", "json")], ({ store, actor, args }) => wsp.setPolicy(store, actor, args.s("courseId"), args.s("labKey"), args.j("patch")));
qry("workspace.progress", "learning-area", "Instructor: class progress — last activity, validation labels and budget use per learner.", [P("courseId"), P("labKey")], ({ store, actor, args }) => wsp.classProgress(store, actor, args.s("courseId"), args.s("labKey")));
qry("projection.state", "learning-area", "Projection lock state for a course.", [P("courseId")], ({ store, args }) => proj.lockState(store, args.s("courseId")));
cmd("projection.lock", "learning-area", "Hide answer keys and instructor editions now.", [P("courseId")], ({ store, actor, args }) => proj.setProjectionLock(store, actor, args.s("courseId"), true));
cmd("projection.set_pin", "learning-area", "Instructor: set the course PIN that encrypts answer keys inside downloaded instructor lab files.", [P("courseId"), P("pin")], ({ store, actor, args }) => proj.setInstructorPin(store, actor, args.s("courseId"), args.s("pin")));
cmd("projection.unlock", "learning-area", "Instructor: show answer keys for 30 minutes (then they lock again).", [P("courseId")], ({ store, actor, args }) => proj.setProjectionLock(store, actor, args.s("courseId"), false));
/* 56 Course Studio */
cmd("studio.add_source", "course-studio", "Add a source (pasted text, uploaded document text or a URL). Source text is data, never instructions; unreachable URLs are stored as unavailable. If the topic already has a run, it is regenerated as a new version (autoRegenerate=false to skip).", [P("courseKey"), P("module", "number"), P("topic"), P("kind", "string", true, { options: ["text", "file", "url"] }), opt("title"), opt("body", "text"), opt("filename"), opt("url"), opt("author"), opt("year"), opt("autoRegenerate", "boolean")], ({ store, actor, args }) => studio.addSourceAndRefresh(store, actor, { courseKey: args.s("courseKey"), module: args.n("module"), topic: args.s("topic"), kind: args.s("kind") as "text", title: args.so("title"), body: args.so("body"), filename: args.so("filename"), url: args.so("url"), author: args.so("author"), year: args.so("year") }, { autoRegenerate: args.has("autoRegenerate") ? args.b("autoRegenerate") : true }));
qry("studio.sources", "course-studio", "Sources for a course (staff).", [P("courseKey"), opt("module", "number"), opt("topic")], ({ store, actor, args }) => studio.listSources(store, actor, { courseKey: args.s("courseKey"), module: args.has("module") ? args.n("module") : undefined, topic: args.so("topic") }));
cmd("studio.start", "course-studio", "Generate the full topic package (resumable). For AI-801 pass topicKey; otherwise pass input JSON.", [opt("courseId"), opt("topicKey"), opt("input", "json")], ({ store, actor, args }) => studio.startRun(store, actor, args.has("input") ? args.j("input") : learn.studioInputFor(store, args.s("courseId"), args.s("topicKey")), { render: process.env.STUDIO_RENDER_PREVIEW === "1" }));
cmd("studio.resume", "course-studio", "Resume a failed or partial run from the failed step.", [P("runId")], ({ store, actor, args }) => studio.resumeRun(store, actor, args.s("runId"), { render: process.env.STUDIO_RENDER_PREVIEW === "1" }));
cmd("studio.regenerate", "course-studio", "Regenerate as a new version (instructor-edited files are kept).", [P("runId")], ({ store, actor, args }) => studio.regenerateRun(store, actor, args.s("runId"), { render: process.env.STUDIO_RENDER_PREVIEW === "1" }));
cmd("studio.regenerate_quiz", "course-studio", "A new practice-quiz set that avoids earlier stems.", [P("runId")], ({ store, actor, args }) => studio.regenerateQuiz(store, actor, args.s("runId")));
cmd("studio.release", "course-studio", "Instructor review complete: release learner files of this version (QA must pass).", [P("runId")], ({ store, actor, args }) => studio.releaseRun(store, actor, args.s("runId")));
qry("studio.runs", "course-studio", "Runs for a course.", [P("courseKey")], ({ store, actor, args }) => studio.listRuns(store, actor, args.s("courseKey")));
qry("studio.run", "course-studio", "A run's steps, state and QA.", [P("runId")], ({ store, actor, args }) => studio.getRunStatus(store, actor, args.s("runId")));
qry("studio.outputs", "course-studio", "Output files (learners: released learner files only).", [P("runId")], ({ store, actor, args }) => studio.listOutputs(store, actor, args.s("runId")));
cmd("studio.edit_output", "course-studio", "Instructor edit of a text output (kept on regeneration).", [P("outputId"), P("content", "text")], ({ store, actor, args }) => studio.editOutput(store, actor, args.s("outputId"), args.s("content")));
cmd("studio.check_minilab", "course-studio", "Server-side check of a Studio mini-lab (answers never sent to the browser). reveal=true returns the worked solution after two checks (staff any time).", [P("runId"), P("labId"), opt("answers", "json"), opt("reveal", "boolean")], ({ store, actor, args }) => studio.checkRunMiniLab(store, actor, args.s("runId"), args.s("labId"), answersOf(args as never), { reveal: args.has("reveal") && args.b("reveal") }));
qry("bridge.status", "governed-bridge", "Module crosswalk between this campus and the Python governed service, service health and bundle provenance.", [], ({ store, actor }) => bridge.bridgeStatus(store, actor));
cmd("bridge.probe", "governed-bridge", "Probe the Python governed service or HavenConnect (GET /, 2 s timeout, no credentials, loopback or https only).", [P("target", "string", true, { options: ["governed", "havenconnect"] })], ({ store, actor, args }) => bridge.probe(store, actor, args.s("target") as "governed"));
qry("departments.status", "departments", "Department readiness: loaded policy version, missing sections, department states and recent previews.", [], ({ store, actor }) => dept.departmentStatus(store, actor));
cmd("departments.policy_set", "departments", "Load a versioned department policy (admin or registrar). Use example=true to load the clearly synthetic example.", [P("versionLabel"), opt("policy", "json"), opt("example", "boolean")], ({ store, actor, args }) => dept.setPolicy(store, actor, { versionLabel: args.s("versionLabel"), policy: args.has("example") && args.b("example") ? dept.EXAMPLE_POLICY : args.j("policy") }));
cmd("departments.preview", "departments", "Non-executing preview on synthetic data: holds (invoice), refund (purchase + elapsedDays) or identity (provider result).", [P("kind", "string", true, { options: ["holds", "refund", "identity"] }), P("synthetic", "boolean"), opt("invoice", "json"), opt("purchase", "json"), opt("elapsedDays", "number"), opt("identity", "json"), opt("priorFailures", "number")], ({ store, actor, args }) => dept.preview(store, actor, { kind: args.s("kind") as "holds", synthetic: args.b("synthetic"), invoice: args.has("invoice") ? args.j("invoice") : undefined, purchase: args.has("purchase") ? args.j("purchase") : undefined, elapsedDays: args.has("elapsedDays") ? args.n("elapsedDays") : undefined, identity: args.has("identity") ? args.j("identity") : undefined, priorFailures: args.has("priorFailures") ? args.n("priorFailures") : undefined }));
qry("voice.overview", "voice-studio", "Personas, languages, capability status labels, model registry and licence gate, consent cases, voices, pronunciations and recent requests.", [], ({ store, actor }) => voice.voiceOverview(store, actor));
qry("voice.persona_reply", "voice-studio", "Text-only, AI-disclosed reply from Amara or Tunde in the chosen language (never inferred).", [P("persona", "string", true, { options: ["amara", "tunde"] }), P("language", "string", true, { options: ["en", "en-NG", "pcm"] }), P("message", "text")], ({ args }) => voice.personaReply(args.s("persona"), args.s("language"), args.s("message")));
cmd("voice.route_set", "voice-studio", "Route a model to a plan and capability; the licence gate refuses non-commercial or unverified models on paid plans.", [P("plan"), P("capability"), P("modelId")], ({ store, actor, args }) => voice.setRoute(store, actor, { plan: args.s("plan"), capability: args.s("capability"), modelId: args.s("modelId") }));
cmd("voice.license_verify", "voice-studio", "Record that a person verified a model's licence (with a reference).", [P("modelId"), P("reference", "text")], ({ store, actor, args }) => voice.verifyLicense(store, actor, args.s("modelId"), args.s("reference")));
cmd("voice.consent_open", "voice-studio", "Open a consent & identity case for a real person's voice or digital double.", [P("subjectName"), P("purposes", "text"), P("expiresOn"), P("kind", "string", true, { options: ["voice", "digital_double"] })], ({ store, actor, args }) => voice.openConsentCase(store, actor, { subjectName: args.s("subjectName"), purposes: args.s("purposes"), expiresOn: args.s("expiresOn"), kind: args.s("kind") as "voice" }));
cmd("voice.consent_evidence", "voice-studio", "Record an evidence reference for one consent check (references only; never ID images or numbers).", [P("caseId"), P("check", "string", true, { options: voice.CONSENT_CHECKS.map((c) => c.key) }), P("reference")], ({ store, actor, args }) => voice.recordConsentEvidence(store, actor, args.s("caseId"), args.s("check"), args.s("reference")));
cmd("voice.consent_approve", "voice-studio", "Approve (first reviewer) or second-review a complete consent case; evidence recorders can't approve.", [P("caseId")], ({ store, actor, args }) => voice.approveConsent(store, actor, args.s("caseId")));
cmd("voice.consent_revoke", "voice-studio", "Revoke consent: blocks generation immediately and lists affected voices and projects.", [P("caseId"), P("reason", "text")], ({ store, actor, args }) => voice.revokeConsent(store, actor, args.s("caseId"), args.s("reason")));
cmd("voice.voice_create", "voice-studio", "Create a synthetic voice design, or a cloned voice record (needs an active consent case; no training runs).", [P("name"), P("kind", "string", true, { options: ["synthetic", "cloned"] }), P("language", "string", true, { options: ["en", "en-NG", "pcm"] }), opt("description", "text"), opt("consentId")], ({ store, actor, args }) => voice.createVoice(store, actor, { name: args.s("name"), kind: args.s("kind") as "synthetic", language: args.s("language"), description: args.so("description"), consentId: args.so("consentId") }));
cmd("voice.pronunciation_add", "voice-studio", "Add or update a pronunciation dictionary entry.", [P("term"), P("say"), P("language", "string", true, { options: ["en", "en-NG", "pcm"] })], ({ store, actor, args }) => voice.addPronunciation(store, actor, { term: args.s("term"), say: args.s("say"), language: args.s("language") }));
cmd("voice.story_create", "voice-studio", "Create a storyboard project (immutable revisions).", [P("title")], ({ store, actor, args }) => voice.createStory(store, actor, args.s("title")));
qry("voice.stories", "voice-studio", "Your storyboard projects (latest revision).", [], ({ store, actor }) => voice.listStories(store, actor));
cmd("voice.story", "voice-studio", "Storyboard action: scene, change_all (dryRun / confirmed), archive, restore, history, export (with provenance).", [P("id"), P("action", "string", true, { options: ["scene", "change_all", "archive", "restore", "history", "export"] }), opt("revision", "number"), opt("speaker"), opt("avatar"), opt("voice"), opt("language"), opt("script", "text"), opt("targetRevision", "number"), opt("dryRun", "boolean"), opt("confirmed", "boolean")], ({ store, actor, args }) => voice.storyCommand(store, actor, args.s("id"), args.s("action") as "scene", { revision: args.has("revision") ? args.n("revision") : undefined, speaker: args.so("speaker"), avatar: args.so("avatar"), voice: args.so("voice"), language: args.so("language"), script: args.so("script"), targetRevision: args.has("targetRevision") ? args.n("targetRevision") : undefined, dryRun: args.has("dryRun") ? args.b("dryRun") : undefined, confirmed: args.has("confirmed") ? args.b("confirmed") : undefined }));
cmd("voice.generate", "voice-studio", "Request generation: moderated and costed; stops at 'not operational' because no model is served.", [P("capability", "string", true, { options: Object.keys(voice.CREDIT_RATES) }), P("text", "text"), opt("voiceId"), opt("plan")], ({ store, actor, args }) => voice.requestGeneration(store, actor, { capability: args.s("capability"), text: args.s("text"), voiceId: args.so("voiceId"), plan: args.so("plan") }));
qry("acceptance.status", "acceptance", "Operational-acceptance areas, evidence, sign-offs and blockers. Production is never allowed by the register alone.", [opt("release")], ({ store, actor, args }) => oat.acceptanceStatus(store, actor, args.so("release")));
cmd("acceptance.record", "acceptance", "Submit evidence for an area (stays unverified until a different admin verifies it).", [P("area", "string", true, { options: Object.keys(oat.AREAS) }), P("release"), P("owner"), P("reference", "text"), P("note", "text")], ({ store, actor, args }) => oat.recordEvidence(store, actor, { area: args.s("area"), release: args.s("release"), owner: args.s("owner"), reference: args.s("reference"), note: args.s("note") }));
cmd("acceptance.verify", "acceptance", "Verify or reject evidence (not by the submitter).", [P("id"), P("decision", "string", true, { options: ["verified", "rejected"] }), P("note", "text")], ({ store, actor, args }) => oat.verifyEvidence(store, actor, args.s("id"), args.s("decision") as "verified", args.s("note")));
cmd("acceptance.signoff", "acceptance", "Sign off a release as platform owner, security lead or academic operations (three different people).", [P("role", "string", true, { options: [...oat.SIGNOFF_ROLES] }), P("release")], ({ store, actor, args }) => oat.signOff(store, actor, args.s("role"), args.s("release")));
qry("readiness.questions", "catalog", "Public advisory readiness self-check (10 questions). Nothing is stored.", [], () => readinessQuestions());
qry("readiness.score", "catalog", "Score the advisory self-check and suggest where to start. No admission, credit or enrollment decision; nothing stored.", [P("answers", "json"), P("goal", "string", true, { options: ["agents", "data"] })], ({ args }) => readinessScore(args.j("answers"), args.s("goal")));
cmd("studio.rebuild", "course-studio", "Rebuild one part of the current version: cover, cover_a, cover_b, deck, chapters, readings, rubrics or minilabs. Edited files are kept; QA and manifest are refreshed.", [P("runId"), P("target", "string", true, { options: Object.keys(studio.REBUILD_TARGETS) })], ({ store, actor, args }) => studio.rebuildTarget(store, actor, args.s("runId"), args.s("target")));
qry("studio.lms_package", "course-studio", "Export a topic as an IMS Common Cartridge 1.3 package (staff). Download at /api/campus/v1/t/{tenant}/learn/{courseId}/studio/{runId}/lms.imscc.", [P("runId")], ({ store, actor, args }) => {
  const p = studio.studioLmsPackage(store, actor, args.s("runId"));
  return { name: p.name, files: p.files, bytes: p.zip.length, pending: p.pending };
});
cmd("studio.profile_set", "course-studio", "Set the course branding profile used by covers and decks (institution, motto, colours, footer cells, key topics, process). Pass profile JSON or the individual fields; lists are comma-separated.", [P("courseKey"), opt("profile", "json"), opt("institution"), opt("motto"), opt("primary"), opt("accent"), opt("light"), opt("format"), opt("keyTopics"), opt("process")], ({ store, actor, args }) => {
  const list = (k: string) => (args.has(k) ? args.s(k).split(",").map((x) => x.trim()).filter(Boolean) : undefined);
  const base = args.has("profile") ? args.j<Record<string, unknown>>("profile") : {};
  const fields = { institution: args.so("institution"), motto: args.so("motto"), primary: args.so("primary"), accent: args.so("accent"), light: args.so("light"), format: args.so("format"), keyTopics: list("keyTopics"), process: list("process") };
  return studio.setProfile(store, actor, args.s("courseKey"), { ...base, ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined && v !== "")) });
});
qry("studio.profile", "course-studio", "The course branding profile (staff).", [P("courseKey")], ({ store, actor, args }) => {
  if (!studio.canGenerate(store, actor, args.s("courseKey"))) throw new CampusError("forbidden", "Only course staff can see the branding profile.", 403);
  return studio.getProfile(store, args.s("courseKey")) ?? {};
});
/* 57 Free Education Resource Hub */
const bool = (args: { b: (k: string) => boolean }, k: string) => args.b(k) || undefined;
qry("eco.summary", "free-resources", "Hub summary: verified, pending, stale and unavailable records, connected services, active opportunities, recent activity.", [], ({ store, actor }) => eco.hubSummary(store, actor));
qry("eco.resources", "free-resources", "Search the catalog (filters: group, category, subject, freeOnly, noCard, api, selfHosted, accessible, status, connection; paginated).", [opt("q"), opt("group"), opt("category"), opt("kind"), opt("subject"), opt("freeOnly", "boolean"), opt("noCard", "boolean"), opt("api", "boolean"), opt("selfHosted", "boolean"), opt("accessible", "boolean"), opt("status"), opt("connection"), opt("page", "number"), opt("pageSize", "number")], ({ store, actor, args }) => eco.listResources(store, actor, { q: args.so("q"), group: args.so("group"), category: args.so("category"), kind: args.so("kind"), subject: args.so("subject"), freeOnly: bool(args, "freeOnly"), noCard: bool(args, "noCard"), api: bool(args, "api"), selfHosted: bool(args, "selfHosted"), accessible: bool(args, "accessible"), status: args.so("status"), connection: args.so("connection"), page: args.has("page") ? args.n("page") : undefined, pageSize: args.has("pageSize") ? args.n("pageSize") : undefined }));
qry("eco.resource", "free-resources", "One record: evidence, limits, versions, course mappings, connection state and its Integration Definition.", [P("id")], ({ store, actor, args }) => eco.getResource(store, actor, args.s("id")));
cmd("eco.curate", "free-resources", "Add or update a catalog record (it stays pending until official evidence verifies it).", [P("name"), P("provider"), P("officialUrl"), opt("category"), opt("kind"), opt("description", "text"), opt("classification"), opt("apiAccess"), opt("integrationMethod"), opt("license"), opt("subjects", "list")], ({ store, actor, args }) => eco.curateResource(store, actor, { ...args.raw, subjects: args.has("subjects") ? args.l("subjects") : [] }));
cmd("eco.add_evidence", "free-resources", "Attach an official source page and the claims it supports; the verification job confirms it.", [P("resourceId"), P("url"), opt("claims", "list"), opt("checkTerms", "list")], ({ store, actor, args }) => eco.addEvidence(store, actor, args.s("resourceId"), { url: args.s("url"), claims: args.has("claims") ? args.l("claims") : [], checkTerms: args.has("checkTerms") ? args.l("checkTerms") : [] }));
cmd("eco.archive", "free-resources", "Archive a record (kept in history).", [P("resourceId"), opt("reason", "text")], ({ store, actor, args }) => eco.archiveResource(store, actor, args.s("resourceId"), args.so("reason") ?? ""));
cmd("eco.bookmark", "free-resources", "Bookmark or un-bookmark a resource.", [P("resourceId")], ({ store, actor, args }) => eco.toggleBookmark(store, actor, args.s("resourceId")));
qry("eco.bookmarks", "free-resources", "My bookmarks.", [], ({ store, actor }) => eco.myBookmarks(store, actor));
cmd("eco.report_completion", "free-resources", "Record an external completion with your own evidence (opening a link is never treated as completion).", [P("resourceId"), P("evidenceUrl"), opt("note", "text")], ({ store, actor, args }) => eco.reportExternalCompletion(store, actor, args.s("resourceId"), args.s("evidenceUrl"), args.so("note") ?? ""));
cmd("eco.subscribe", "free-resources", "Subscribe to in-site What's New notifications by subject, course or career interest.", [P("kind", "string", true, { options: ["subject", "course", "career", "all"] }), opt("value")], ({ store, actor, args }) => eco.subscribe(store, actor, args.s("kind"), args.so("value") ?? ""));
cmd("eco.unsubscribe", "free-resources", "Remove a subscription.", [P("id")], ({ store, actor, args }) => eco.unsubscribe(store, actor, args.s("id")));
qry("eco.whats_new", "free-resources", "What's New: newly verified tools and resources, changed limits, discontinued services, new opportunities.", [], ({ store }) => eco.whatsNew(store));
cmd("eco.map_course", "free-resources", "Map a resource to a course topic (idempotent).", [P("courseId"), P("resourceId"), opt("topic"), opt("note", "text"), opt("idempotencyKey")], ({ store, actor, args }) => eco.mapToCourse(store, actor, { courseId: args.s("courseId"), resourceId: args.s("resourceId"), topic: args.so("topic"), note: args.so("note") }, args.so("idempotencyKey")));
qry("eco.course_resources", "free-resources", "Resources mapped to a course.", [P("courseId")], ({ store, actor, args }) => eco.courseResources(store, actor, args.s("courseId")));
qry("eco.recommend", "free-resources", "Verified free resources recommended for a course, with reasons.", [P("courseId"), opt("accessible", "boolean")], ({ store, actor, args }) => eco.recommendForCourse(store, actor, args.s("courseId"), { accessible: args.b("accessible") }));
cmd("eco.connect", "free-resources", "Admin: connect a service (key-vault reference only; states reflect what is actually possible).", [P("resourceId"), opt("credentialRef"), opt("scopes", "list"), opt("eligibilityConfirmed", "boolean"), opt("idempotencyKey")], ({ store, actor, args }) => eco.connect(store, actor, args.s("resourceId"), { credentialRef: args.so("credentialRef"), scopes: args.has("scopes") ? args.l("scopes") : [], eligibilityConfirmed: args.b("eligibilityConfirmed") }, args.so("idempotencyKey")));
qry("eco.connections", "free-resources", "Admin: integration connections and health (no secrets).", [], ({ store, actor }) => eco.listConnections(store, actor));
qry("eco.connection_health", "free-resources", "Admin: one connection's health history.", [P("id")], ({ store, actor, args }) => eco.connectionHealth(store, actor, args.s("id")));
cmd("eco.disconnect", "free-resources", "Admin: remove a connection.", [P("id")], ({ store, actor, args }) => eco.disconnect(store, actor, args.s("id")));
cmd("eco.live_schedule", "free-resources", "Schedule a live session on a verified provider; split into blocks within its verified free limit.", [P("courseId"), P("title"), P("providerId"), P("startsAt"), P("totalMinutes", "number"), opt("joinUrl"), opt("breakMinutes", "number")], ({ store, actor, args }) => eco.scheduleLiveSession(store, actor, { courseId: args.s("courseId"), title: args.s("title"), providerId: args.s("providerId"), startsAt: args.s("startsAt"), totalMinutes: args.n("totalMinutes"), joinUrl: args.so("joinUrl"), breakMinutes: args.has("breakMinutes") ? args.n("breakMinutes") : undefined }));
qry("eco.live_sessions", "free-resources", "Live sessions for my courses.", [opt("courseId")], ({ store, actor, args }) => eco.liveSessions(store, actor, args.so("courseId")));
/* 58 Career Connect */
qry("eco.opportunities", "career-connect", "Open internships, apprenticeships and entry-level roles (closed listings drop out).", [opt("q"), opt("type"), opt("remote")], ({ store, args }) => eco.listOpportunities(store, { q: args.so("q"), type: args.so("type"), remote: args.so("remote") }));
qry("eco.employers", "career-connect", "Employers with their relationship label.", [opt("relationship")], ({ store, actor, args }) => eco.listEmployers(store, actor, { relationship: args.so("relationship") }));
qry("eco.profile", "career-connect", "My career profile, visibility and evidence-backed skills.", [], ({ store, actor }) => eco.myProfile(store, actor));
cmd("eco.profile_save", "career-connect", "Save my career profile and choose what employers may see (off by default).", [opt("headline"), opt("statedSkills"), opt("interests"), opt("preferredLocations"), opt("remoteOk", "boolean"), opt("portfolioUrl"), opt("contactEmail"), opt("discoverable", "boolean"), opt("show_headline", "boolean"), opt("show_skills", "boolean"), opt("show_certificates", "boolean"), opt("show_portfolio", "boolean"), opt("show_contact", "boolean")], ({ store, actor, args }) => eco.saveProfile(store, actor, args.raw));
qry("eco.matches", "career-connect", "Opportunities that match my demonstrated and stated skills, with explanations.", [], ({ store, actor }) => eco.myMatches(store, actor));
cmd("eco.apply", "career-connect", "Apply (learner-initiated). Employer-posted roles receive only the fields you choose; external listings are recorded after you apply on the official site.", [P("opportunityId"), P("idempotencyKey"), opt("share", "list"), opt("note", "text")], ({ store, actor, args }) => eco.apply(store, actor, args.s("opportunityId"), { share: args.has("share") ? args.l("share") : [], note: args.so("note") }, args.s("idempotencyKey")));
qry("eco.applications", "career-connect", "My applications.", [], ({ store, actor }) => eco.myApplications(store, actor));
cmd("eco.withdraw", "career-connect", "Withdraw my application.", [P("id")], ({ store, actor, args }) => eco.withdraw(store, actor, args.s("id")));
qry("eco.contact_requests", "career-connect", "Employer contact requests waiting for my answer.", [], ({ store, actor }) => eco.myContactRequests(store, actor));
cmd("eco.answer_contact", "career-connect", "Accept or decline an employer's contact request.", [P("id"), P("accept", "boolean")], ({ store, actor, args }) => eco.answerContact(store, actor, args.s("id"), args.b("accept")));
cmd("eco.employer_register", "career-connect", "Register an organization. Automatic checks verify it (business email on the website's domain, https site); failures stay hidden for review.", [P("name"), P("website"), opt("contactEmail"), opt("industries", "list"), opt("locations", "list"), opt("about", "text")], ({ store, actor, args }) => eco.registerEmployer(store, actor, { name: args.s("name"), website: args.s("website"), contactEmail: args.so("contactEmail"), industries: args.has("industries") ? args.l("industries") : [], locations: args.has("locations") ? args.l("locations") : [], about: args.so("about") }));
cmd("eco.employer_verify", "career-connect", "Admin: verify or reject an employer.", [P("employerId"), P("decision", "string", true, { options: ["verified", "rejected"] }), opt("note", "text")], ({ store, actor, args }) => eco.verifyEmployer(store, actor, args.s("employerId"), args.s("decision") as "verified", args.so("note") ?? ""));
cmd("eco.employer_partner", "career-connect", "Admin: record an established partnership (required before the partner label).", [P("employerId"), P("note", "text")], ({ store, actor, args }) => eco.markPartner(store, actor, args.s("employerId"), args.s("note")));
qry("eco.employer_portal", "career-connect", "Employer portal: organization, opportunities, applications (shared fields only) and contact requests.", [], ({ store, actor }) => eco.employerPortal(store, actor));
cmd("eco.post_opportunity", "career-connect", "Verified employers: publish an opportunity.", [P("title"), P("type"), opt("description", "text"), opt("skills", "list"), opt("location"), opt("remote"), opt("workEligibility"), opt("compensation"), opt("applicationUrl"), opt("closesAt", "date")], ({ store, actor, args }) => eco.postOpportunity(store, actor, { ...args.raw, skills: args.has("skills") ? args.l("skills") : [] }));
cmd("eco.close_opportunity", "career-connect", "Close a filled or withdrawn position.", [P("id"), opt("reason")], ({ store, actor, args }) => eco.closeOpportunity(store, actor, args.s("id"), args.so("reason") ?? ""));
qry("eco.talent", "career-connect", "Verified employers: search learners who opted in (visible fields only).", [opt("skill"), opt("opportunityId")], ({ store, actor, args }) => eco.talentSearch(store, actor, { skill: args.so("skill"), opportunityId: args.so("opportunityId") }));
cmd("eco.request_contact", "career-connect", "Verified employers: ask a candidate for contact (they decide).", [P("ref"), P("message", "text"), opt("opportunityId")], ({ store, actor, args }) => eco.requestContact(store, actor, args.s("ref"), args.s("message"), args.so("opportunityId")));
cmd("eco.application_update", "career-connect", "Employers: update an application's status.", [P("id"), P("state", "string", true, { options: ["reviewing", "interview", "offer", "hired", "not_selected"] })], ({ store, actor, args }) => eco.updateApplication(store, actor, args.s("id"), args.s("state")));
cmd("eco.withdraw_consent", "career-connect", "Withdraw from Employer Connect: your profile becomes private and open contact requests are cancelled.", [], ({ store, actor }) => eco.withdrawConsent(store, actor));
qry("eco.flags", "career-connect", "Admin: postings hidden by automatic checks (fees, money requests, sensitive data, duplicates, expired).", [], ({ store, actor }) => eco.flaggedPostings(store, actor));
qry("eco.library_by_course", "free-resources", "Free courses and readings grouped by the Scholarion course they support (Recommended / Supplementary).", [], ({ store, actor }) => eco.libraryByCourse(store, actor));
qry("eco.changelog", "free-resources", "Public changelog of catalog changes.", [], ({ store }) => eco.whatsNew(store, 100));

// Tab 60 — Program Marketing & Campaigns.
qry("campaign.overview", "campaigns", "Campaign kit: schedule in 7 time zones, assets with Copy Checker flags, channels, audience and platform check.", [opt("campaign")], ({ store, actor, args }) => camp.campaignOverview(store, actor, args.so("campaign") ?? "genai-2027"));
cmd("campaign.settings", "campaigns", "Day 1 join details and community link (entered by the instructor, never generated).", [opt("campaign"), opt("day1JoinUrl"), opt("day1MeetingId"), opt("day1Passcode"), opt("whatsappLink")], ({ store, actor, args }) => camp.updateCampaignSettings(store, actor, args.so("campaign") ?? "genai-2027", { day1JoinUrl: args.has("day1JoinUrl") ? args.s("day1JoinUrl") : undefined, day1MeetingId: args.has("day1MeetingId") ? args.s("day1MeetingId") : undefined, day1Passcode: args.has("day1Passcode") ? args.s("day1Passcode") : undefined, whatsappLink: args.has("whatsappLink") ? args.s("whatsappLink") : undefined }));
cmd("campaign.send", "campaigns", "Send a campaign email to opted-in contacts (held until an email provider is configured).", [opt("campaign"), P("asset", "string", true, { options: ["email_1_announcement.html", "email_2_reminder.html", "email_3_last_chance.html"] })], ({ store, actor, args }) => camp.sendEmail(store, actor, args.so("campaign") ?? "genai-2027", args.s("asset")));
cmd("campaign.posted", "campaigns", "Record that a person posted the prepared copy on a channel (Scholarion never posts automatically).", [P("channelId"), opt("url")], ({ store, actor, args }) => camp.markPosted(store, actor, args.s("channelId"), args.so("url") ?? ""));
cmd("campaign.subscribe", "campaigns", "Opt in to program updates by email (consent required; unsubscribe any time).", [P("email"), opt("name"), opt("consent", "boolean"), opt("campaign")], ({ store, args }) => { const r = camp.subscribeContact(store, { email: args.s("email"), name: args.so("name"), consent: args.b("consent"), campaign: args.so("campaign") }); return { subscribed: true, email: r.email }; });
qry("eco.placements", "career-connect", "Staff: placement outcomes (kept separate from course completion).", [], ({ store, actor }) => eco.placementStats(store, actor));
/* 59 Auto-discovery */
qry("eco.automation", "discovery-automation", "Schedules, jobs, sources, verification exceptions and network mode.", [], ({ store, actor }) => eco.automationOverview(store, actor));
cmd("eco.schedule_save", "discovery-automation", "Create or edit a schedule (cron + IANA time zone + budget).", [opt("id"), opt("key"), opt("kind"), opt("cron"), opt("timeZone"), opt("enabled", "boolean"), opt("budget", "json")], ({ store, actor, args }) => eco.upsertSchedule(store, actor, { id: args.so("id"), key: args.so("key"), kind: args.so("kind"), cron: args.so("cron"), timeZone: args.so("timeZone"), enabled: args.has("enabled") ? args.b("enabled") : undefined, budget: args.has("budget") ? args.j("budget") : undefined }));
cmd("eco.schedule_pause", "discovery-automation", "Pause a schedule.", [P("id")], ({ store, actor, args }) => eco.setSchedulePaused(store, actor, args.s("id"), true));
cmd("eco.schedule_resume", "discovery-automation", "Resume a schedule.", [P("id")], ({ store, actor, args }) => eco.setSchedulePaused(store, actor, args.s("id"), false));
cmd("eco.run_now", "discovery-automation", "Run a schedule now (queued and worked immediately).", [P("id")], async ({ store, actor, args }) => {
  const j = eco.runNow(store, actor, args.s("id"));
  const worked = await eco.workJobs(store, 1);
  return { job: j.id, worked };
});
cmd("eco.tick", "discovery-automation", "Admin: plan and work due discovery jobs now.", [], async ({ store, actor }) => {
  if (!actor.roles.includes("admin")) throw new CampusError("forbidden", "Administrators only.", 403);
  return eco.ecoTick(store);
});
qry("eco.job", "discovery-automation", "A job with its candidates and checks.", [P("id")], ({ store, actor, args }) => eco.getJob(store, actor, args.s("id")));
cmd("eco.job_create", "discovery-automation", "Create a one-off discovery job (idempotent).", [P("kind"), opt("idempotencyKey")], ({ store, actor, args }) => eco.createJob(store, actor, args.s("kind"), args.so("idempotencyKey")));
cmd("eco.source_add", "discovery-automation", "Add a trusted source (official page, RSS/Atom feed, or a public Greenhouse job board).", [P("key"), P("name"), P("kind", "string", true, { options: ["official_page", "rss", "greenhouse", "lever", "usajobs", "adzuna"] }), P("url"), opt("purpose"), opt("provider"), opt("evidenceUrl"), opt("defaults", "json"), opt("subjects", "list"), opt("entryLevelOnly", "boolean")], ({ store, actor, args }) => eco.addSource(store, actor, { key: args.s("key"), name: args.s("name"), kind: args.s("kind"), url: args.s("url"), purpose: args.so("purpose"), provider: args.so("provider"), evidenceUrl: args.so("evidenceUrl"), defaults: args.has("defaults") ? args.j("defaults") : undefined, subjects: args.has("subjects") ? args.l("subjects") : [], entryLevelOnly: args.b("entryLevelOnly") }));
cmd("eco.source_toggle", "discovery-automation", "Enable or disable a source.", [P("id"), P("enabled", "boolean")], ({ store, actor, args }) => eco.setSourceEnabled(store, actor, args.s("id"), args.b("enabled")));
qry("eco.schemas", "discovery-automation", "The versioned Scholarion JSON Schemas (Draft 2020-12).", [], () => eco.SCHEMAS);
cmd("eco.validate", "discovery-automation", "Validate an Integration Definition (structure, formats and semantic rules).", [P("definition", "json")], ({ store, args }) => eco.validateDefinition(args.j("definition"), [...new Set(store.list(eco.T.sources, (x) => !!x.trusted).map((x) => String(x.host)))]));
qry("catalog.consolidation", "module-library", "Catalog consolidation report for programs #1–#38, with recorded product-owner decisions.", [], ({ store, actor }) => hub.consolidationReport(store, actor));
cmd("catalog.consolidation_submit", "module-library", "Submit the consolidation report for product-owner approval.", [], ({ store, actor }) => hub.submitConsolidation(store, actor));
cmd("catalog.consolidation_decide", "module-library", "Product owner: approve or request changes to a consolidation report.", [P("reportId"), P("decision", "string", true, { options: ["approved", "changes_requested"] }), opt("note", "text")], ({ store, actor, args }) => hub.decideConsolidation(store, actor, args.s("reportId"), args.s("decision") as "approved", args.so("note")));
cmd("policies.approve", "module-library", "Product owner: approve a refund, deferral or batch-change policy so it displays.", [P("policyId")], ({ store, actor, args }) => prog.approvePolicy(store, actor, args.s("policyId")));
cmd("policies.reopen", "module-library", "Product owner: send an approved policy back to draft for revision.", [P("policyId"), P("reason", "text")], ({ store, actor, args }) => prog.reopenPolicy(store, actor, args.s("policyId"), args.s("reason")));
cmd("commerce.batch_change", "commerce", "Move my seat to another batch (approved batch-change policy).", [P("orderId"), P("sectionId")], ({ store, actor, args }) => prog.requestBatchChange(store, actor, args.s("orderId"), args.s("sectionId")));
cmd("commerce.audit", "commerce", "Audit a self-paced offering for free (graded items locked).", [P("offeringId")], ({ store, actor, args }) => prog.enrollAudit(store, actor, args.s("offeringId")));
qry("programs.index", "program-studio", "Published Academy programs.", [], ({ store }) => prog.programIndex(store));
qry("programs.page", "program-studio", "Program website page data (from the catalog).", [P("slug")], ({ store, actor, args }) => prog.programPage(store, actor ?? null, args.s("slug")));
qry("programs.self_check_questions", "program-studio", "Prerequisite self-check questions.", [P("offeringId")], ({ store, args }) => prog.selfCheckQuestions(store, args.s("offeringId")));
cmd("programs.self_check", "program-studio", "Take the prerequisite self-check.", [P("offeringId"), P("answers", "json")], ({ store, actor, args }) => prog.selfCheck(store, actor ?? null, args.s("offeringId"), args.j<Record<string, string>>("answers")));
cmd("programs.inquire", "program-studio", "Team enrollment inquiry or advisor call request.", [P("offeringId"), P("kind", "string", true, { options: ["team", "advisor"] }), P("name"), P("email"), opt("organization"), opt("seats", "number"), opt("preferredTime"), opt("timeZone"), opt("message", "text")], ({ store, actor, args }) => prog.submitInquiry(store, actor ?? null, { offeringId: args.s("offeringId"), kind: args.s("kind") as "team", name: args.s("name"), email: args.s("email"), organization: args.so("organization"), seats: args.has("seats") ? args.n("seats") : undefined, preferredTime: args.so("preferredTime"), timeZone: args.so("timeZone"), message: args.so("message") }));
cmd("programs.apply", "program-studio", "Apply to a program (admission review, then seat reservation).", [P("offeringId"), opt("sectionId"), P("statement", "text"), opt("experience", "text")], ({ store, actor, args }) => prog.applyToProgram(store, actor, { offeringId: args.s("offeringId"), sectionId: args.so("sectionId"), statement: args.s("statement"), experience: args.so("experience") }));
cmd("programs.review", "program-studio", "Admit, deny or waitlist a program application.", [P("applicationId"), P("outcome", "string", true, { options: ["admit", "deny", "waitlist"] }), opt("note", "text")], ({ store, actor, args }) => prog.reviewProgramApplication(store, actor, args.s("applicationId"), args.s("outcome") as "admit", args.so("note")));
qry("programs.quality_gate", "program-studio", "Quality gate for a program's course shells.", [P("offeringId")], ({ store, actor, args }) => {
  requireTenant(store, actor, ["admin", "designer", "registrar"], "programs.gate");
  return prog.qualityGate(store, args.s("offeringId"));
});
cmd("programs.publish_shells", "program-studio", "Publish a program's course shells (after the quality gate).", [P("offeringId")], ({ store, actor, args }) => prog.publishProgramShells(store, actor, args.s("offeringId")));
qry("programs.design", "program-studio", "Program design package for #1–#11: course standard, alignment matrix with Bloom levels, workload, credential rules, career hooks and the extended quality gate.", [P("program")], ({ store, actor, args }) => design.designSummary(store, actor, args.s("program")));
cmd("programs.design_signoff", "program-studio", "Sign off a program design as instructional designer or subject-matter expert (one person can't sign both).", [P("program"), P("kind", "string", true, { options: ["designer", "sme"] }), P("note")], ({ store, actor, args }) => design.signOff(store, actor, args.s("program"), args.s("kind") as "designer" | "sme", args.s("note")));
cmd("graded.attach_link", "learning-area", "Submit a link to your work (Google Colab notebook, Codelab, GitHub repository or shared document) for an item.", [P("itemId"), P("url"), opt("note")], ({ store, actor, args }) => uploads.attachWork(store, actor, { itemId: args.s("itemId"), url: args.s("url"), note: args.so("note") }));
qry("graded.attachments", "learning-area", "Files and links uploaded for an item (yours; staff see everyone's).", [P("itemId")], ({ store, actor, args }) => uploads.attachmentsFor(store, actor, args.s("itemId")));
qry("submission.formats", "assessment", "File formats accepted for assignments, projects, labs and mini labs.", [], () => ({ formats: uploads.SUBMISSION_FORMATS, byKind: uploads.FORMATS_BY_KIND, links: "Google Colab, Codelab, GitHub, Kaggle or a shared document (https)" }));
// Tab 62 — CX & Live Sessions Hub.
qry("comms.connectors", "communications", "Connector hub: status, plan limits and last verification for each communications connector.", [], ({ store, actor }) => comms.connectorHub(store, actor));
qry("comms.segment_preview", "communications", "Preview how a class block splits under the 40-minute engine.", [P("totalMinutes", "number"), opt("kind"), opt("licensedHost", "boolean")], ({ args }) => comms.segmentPlan(args.n("totalMinutes"), { kind: (args.so("kind") as "class" | "one_to_one" | "office_hours" | undefined) ?? "class", licensedHost: args.b("licensedHost") }));
cmd("comms.plan", "communications", "Plan a live session: segments, pre-created meetings (simulated), Session Card and calendar entries.", [P("courseId"), P("title"), P("startsAt"), P("totalMinutes", "number"), opt("kind"), opt("platform"), opt("licensedHost", "boolean")], ({ store, actor, args }) => comms.planSession(store, actor, { courseId: args.s("courseId"), title: args.s("title"), startsAt: args.s("startsAt"), totalMinutes: args.n("totalMinutes"), kind: args.so("kind") as "class" | "one_to_one" | "office_hours" | undefined, platform: (args.so("platform") as "zoom" | "webex" | undefined) ?? "zoom", licensedHost: args.b("licensedHost") }));
qry("comms.card", "communications", "Session Card: every part's link, time and topic.", [P("sessionId")], ({ store, actor, args }) => comms.sessionCard(store, actor, args.s("sessionId")));
qry("comms.live", "communications", "Live monitor: current part, timer, warning and next link.", [P("sessionId")], ({ store, args }) => comms.liveState(store, args.s("sessionId")));
cmd("comms.tick", "communications", "Run the session automation now (reminders, 33-minute warnings, next links, recap drafts).", [], ({ store, actor }) => { if (!hasAny(actor, ["admin", "instructor"])) throw new CampusError("forbidden", "Staff only.", 403); return comms.tickSessions(store); });
cmd("comms.failover", "communications", "Move the remaining parts to the backup platform and broadcast new links.", [P("sessionId"), P("reason")], ({ store, actor, args }) => comms.failover(store, actor, args.s("sessionId"), args.s("reason")));
cmd("comms.regenerate", "communications", "Regenerate a leaked part link and rebroadcast it to enrolled learners.", [P("sessionId"), P("segment", "number")], ({ store, actor, args }) => comms.regenerateLink(store, actor, args.s("sessionId"), args.n("segment")));
cmd("comms.recap_approve", "communications", "Approve (and edit) a recap draft and post it to the course.", [P("recapId"), opt("text")], ({ store, actor, args }) => comms.approveRecap(store, actor, args.s("recapId"), args.so("text")));
cmd("comms.attendance_record", "communications", "Record a join/leave from the platform's participant report.", [P("sessionId"), P("segment", "number"), P("userId"), P("joinedAt"), P("leftAt")], ({ store, actor, args }) => comms.recordJoin(store, actor, { sessionId: args.s("sessionId"), segment: args.n("segment"), userId: args.s("userId"), joinedAt: args.s("joinedAt"), leftAt: args.s("leftAt") }));
qry("comms.attendance", "communications", "Reconcile attendance across parts per learner (partial is flagged, never penalized).", [P("sessionId")], ({ store, actor, args }) => comms.reconcile(store, actor, args.s("sessionId")));
cmd("comms.attendance_confirm", "communications", "Instructor confirms the reconciled attendance.", [P("sessionId")], ({ store, actor, args }) => comms.confirmAttendance(store, actor, args.s("sessionId")));
cmd("comms.recording_upload", "communications", "Upload a recording (local recording) with its transcript; captions are built for review.", [P("sessionId"), P("segment", "number"), P("fileName"), opt("transcript"), opt("consentNoticeShown", "boolean")], ({ store, actor, args }) => comms.uploadRecording(store, actor, { sessionId: args.s("sessionId"), segment: args.n("segment"), fileName: args.s("fileName"), transcript: args.so("transcript"), consentNoticeShown: args.b("consentNoticeShown") }));
cmd("comms.recording_publish", "communications", "Publish a captioned recording to the course after review.", [P("recordingId")], ({ store, actor, args }) => comms.publishRecording(store, actor, args.s("recordingId")));
cmd("comms.ask", "communications", "Ask the support assistant (join help, links, recordings, setup guides).", [P("question")], ({ store, actor, args }) => comms.supportAnswer(store, actor, args.s("question")));
qry("comms.inbox", "communications", "CX inbox: conversations, AI agent activity, escalations and SLAs.", [], ({ store, actor }) => comms.cxInbox(store, actor));
cmd("comms.resolve", "communications", "Reply to a conversation and mark it resolved once the learner confirms.", [P("conversationId"), P("reply"), opt("learnerConfirmed", "boolean")], ({ store, actor, args }) => comms.resolveConversation(store, actor, args.s("conversationId"), args.s("reply"), args.b("learnerConfirmed")));
cmd("comms.consent", "communications", "Opt in or out of a communication channel.", [P("channel", "string", true, { options: ["email", "sms", "whatsapp", "voice", "outbound_campaigns"] }), opt("optedIn", "boolean")], ({ store, actor, args }) => comms.setConsent(store, actor, args.s("channel") as "email", args.b("optedIn")));
qry("comms.genesys", "communications", "Genesys Cloud: status, activation checklist and module toggles (disabled until licensed).", [], ({ store, actor }) => { if (!hasAny(actor, ["admin"])) throw new CampusError("forbidden", "Administrators only.", 403); return comms.genesysStatus(store); });
cmd("comms.genesys_checklist", "communications", "Record a Genesys activation checklist item.", [P("key"), opt("done", "boolean")], ({ store, actor, args }) => comms.recordChecklist(store, actor, args.s("key"), args.b("done")));
cmd("comms.genesys_module", "communications", "Enable or disable one Genesys module (needs the checklist and its licence).", [P("key"), opt("enable", "boolean"), opt("licensed", "boolean")], ({ store, actor, args }) => comms.setModule(store, actor, args.s("key"), args.b("enable"), args.b("licensed")));
cmd("comms.genesys_mock", "communications", "Run the Genesys mock-mode test suite (no real API calls).", [], ({ store, actor }) => { if (!hasAny(actor, ["admin"])) throw new CampusError("forbidden", "Administrators only.", 403); return comms.genesysMockSuite(store); });
qry("comms.analytics", "communications", "Session analytics: attendees per part, rejoin rate, minutes attended.", [], ({ store, actor }) => comms.sessionAnalytics(store, actor));
qry("comms.audit", "communications", "Audit of agent actions, sends, connector changes and recording access.", [], ({ store, actor }) => comms.commsAudit(store, actor));
// Tab 61 — Curriculum & Course Intelligence.
qry("cci.dashboard", "curriculum-intelligence", "Catalog health: design gates, proposals awaiting review, freshness tickets, exchange packages.", [], ({ store, actor }) => cci.dashboard(store, actor));
qry("cci.graph", "curriculum-intelligence", "Curriculum knowledge graph summary (programs, competencies, assessments, skills, tools, sources).", [], ({ store, actor }) => cci.graph(store, actor));
cmd("cci.draft_program", "curriculum-intelligence", "Program Design Studio: AI-draft a program (outcomes, sequence, pathway placement, overlap report, workload, capstone, claims-checked catalog copy).", [P("title"), P("audience"), opt("level"), P("weeks", "number"), opt("delivery"), P("skills")], ({ store, actor, args }) => cci.draftProgram(store, actor, { title: args.s("title"), audience: args.s("audience"), level: args.so("level") ?? "intermediate", weeks: args.n("weeks"), delivery: args.so("delivery") ?? "live cohort", skills: args.s("skills").split(/[,;\n]/) }));
qry("cci.alignment", "curriculum-intelligence", "Alignment matrix and coverage heatmap for a program.", [P("program")], ({ store, actor, args }) => cci.alignment(store, actor, args.s("program")));
qry("cci.skills", "curriculum-intelligence", "Skills and roles map across programs.", [], ({ store, actor }) => cci.skillsMap(store, actor));
cmd("cci.load_framework", "curriculum-intelligence", "Load a framework pack exactly as published (name, official source, version, date, items, verifier).", [P("name"), P("source"), P("version"), P("publishedOn"), P("items"), P("verifiedBy")], ({ store, actor, args }) => cci.loadFrameworkPack(store, actor, { name: args.s("name"), source: args.s("source"), version: args.s("version"), publishedOn: args.s("publishedOn"), items: (typeof args.raw["items"] === "string" ? String(args.raw["items"]).split(/\n/).map((l) => l.trim()).filter(Boolean).map((l, i) => { const m = /^([^:|\t]+)[:|\t]\s*(.+)$/.exec(l); return m ? { id: m[1].trim(), text: m[2].trim() } : { id: `item-${i + 1}`, text: l }; }) : (args.raw["items"] as { id: string; text: string }[])), verifiedBy: args.s("verifiedBy") }));
qry("cci.evidence_pack", "curriculum-intelligence", "Crosswalk a program to a loaded framework pack (evidence for review, with gaps).", [P("program"), P("packId")], ({ store, actor, args }) => cci.evidencePack(store, actor, args.s("program"), args.s("packId")));
qry("cci.overlap", "curriculum-intelligence", "Overlap analyzer across all programs.", [opt("threshold", "number")], ({ store, actor, args }) => cci.overlapMatrix(store, actor, args.has("threshold") ? args.n("threshold") : 35));
qry("cci.course_health", "curriculum-intelligence", "Course health: completion, drop-off, mastery, alerts and an explainable score.", [P("courseId")], ({ store, actor, args }) => cci.courseHealth(store, actor, args.s("courseId")));
qry("cci.item_analysis", "curriculum-intelligence", "Assessment intelligence: item difficulty and discrimination, AI-use policy coverage.", [P("courseId")], ({ store, actor, args }) => cci.itemAnalysis(store, actor, args.s("courseId")));
cmd("cci.freshness_scan", "curriculum-intelligence", "Freshness Sentinel: open tickets for stale or unavailable tools with impact analysis.", [], ({ store, actor }) => cci.freshnessScan(store, actor));
qry("cci.accessibility", "curriculum-intelligence", "Accessibility audit (structure, alt text, color-only cues, captions).", [opt("courseId")], ({ store, actor, args }) => cci.accessibilityAudit(store, actor, args.so("courseId")));
cmd("cci.propose", "curriculum-intelligence", "Create an improvement proposal (AI DRAFT diff with rationale).", [P("target"), P("title"), P("rationale"), opt("expectedImpact")], ({ store, actor, args }) => cci.createProposal(store, actor, { target: args.s("target"), title: args.s("title"), rationale: args.s("rationale"), expectedImpact: args.so("expectedImpact") }));
cmd("cci.propose_from_signals", "curriculum-intelligence", "Turn alignment and freshness signals into AI-drafted proposals.", [], ({ store, actor }) => cci.proposeFromSignals(store, actor));
cmd("cci.advance", "curriculum-intelligence", "Approve a proposal to the next review stage, or return it for revision.", [P("proposalId"), P("action", "string", true, { options: ["approve", "return"] }), opt("note")], ({ store, actor, args }) => cci.advanceProposal(store, actor, args.s("proposalId"), args.s("action") as "approve" | "return", args.so("note") ?? ""));
cmd("cci.exchange_import", "curriculum-intelligence", "Import a curriculum package manifest (quarantine, scan, schema, licence, no learner data).", [P("manifest")], ({ store, actor, args }) => cci.importPackage(store, actor, args.s("manifest")));
cmd("cci.exchange_export", "curriculum-intelligence", "Export an Academy program as a curriculum package (needs an Exchange Approver).", [P("program"), opt("partnerLabel"), opt("keepScholarionBranding", "boolean"), opt("rebrandDecisionRef")], ({ store, actor, args }) => cci.exportPackage(store, actor, args.s("program"), { partnerLabel: args.so("partnerLabel") ?? "Partner institution", keepScholarionBranding: args.has("keepScholarionBranding") ? args.b("keepScholarionBranding") : true, rebrandDecisionRef: args.so("rebrandDecisionRef") }));
cmd("cci.exchange_approve", "curriculum-intelligence", "Approve an exchange package as the owning side's Exchange Approver.", [P("packageId"), opt("side")], ({ store, actor, args }) => cci.approvePackage(store, actor, args.s("packageId"), args.so("side") ?? "Scholarion Academy"));
qry("cci.exchange_audit", "curriculum-intelligence", "Exchange audit: packages, approvals and confirmation that no learner data crossed.", [], ({ store, actor }) => cci.exchangeAudit(store, actor));
// Academy plans (sandbox) and financial aid.
qry("plans.options", "commerce", "Enroll options for a course or program, each with what's included and excluded.", [P("offeringId")], ({ store, actor, args }) => plans.enrollOptions(store, args.s("offeringId"), actor?.id));
qry("plans.quote", "commerce", "Plan terms shown before you start: price, trial end, first charge, renewal date, cancellation path and refund terms.", [P("kind", "string", true, { options: ["plus_monthly", "plus_annual", "program_monthly"] }), opt("offeringId")], ({ store, actor, args }) => plans.quotePlan(store, args.s("kind") as plans.PlanKind, args.so("offeringId"), actor?.id));
qry("plans.settings_view", "commerce", "Current plan prices and policy settings (placeholders until the product owner sets them).", [], ({ store }) => plans.planSettings(store));
cmd("plans.settings", "commerce", "Set plan prices, trial length, refund window and financial-aid settings (sandbox placeholders).", [opt("programMonthly", "number"), opt("plusMonthly", "number"), opt("plusAnnual", "number"), opt("trialDays", "number"), opt("refundDays", "number"), opt("trialReminderDays", "number"), opt("renewalNoticeDays", "number"), opt("aidDecisionDays", "number"), opt("aidMaxPct", "number"), opt("currency")], ({ store, actor, args }) => plans.updatePlanSettings(store, actor, { programMonthly: args.raw["programMonthly"] as number, plusMonthly: args.raw["plusMonthly"] as number, plusAnnual: args.raw["plusAnnual"] as number, trialDays: args.raw["trialDays"] as number, refundDays: args.raw["refundDays"] as number, trialReminderDays: args.raw["trialReminderDays"] as number, renewalNoticeDays: args.raw["renewalNoticeDays"] as number, aidDecisionDays: args.raw["aidDecisionDays"] as number, aidMaxPct: args.raw["aidMaxPct"] as number, currency: args.so("currency") }));
cmd("plans.start", "commerce", "Start a plan (sandbox). Requires accepting the terms shown first.", [P("kind", "string", true, { options: ["plus_monthly", "plus_annual", "program_monthly"] }), opt("offeringId"), opt("acceptTerms", "boolean"), opt("sandboxCard")], ({ store, actor, args }) => plans.startSubscription(store, actor, { kind: args.s("kind") as plans.PlanKind, offeringId: args.so("offeringId"), acceptTerms: args.b("acceptTerms"), sandboxCard: args.so("sandboxCard") }));
cmd("plans.cancel", "commerce", "Cancel a subscription in one step; access continues to the end of the paid period.", [P("subscriptionId")], ({ store, actor, args }) => plans.cancelPlan(store, actor, args.s("subscriptionId")));
cmd("plans.pause", "commerce", "Pause a subscription for 1–3 months; progress is kept.", [P("subscriptionId"), opt("months", "number")], ({ store, actor, args }) => plans.pausePlan(store, actor, args.s("subscriptionId"), Number(args.raw["months"] ?? 1)));
cmd("plans.resume", "commerce", "Resume a paused or canceled subscription.", [P("subscriptionId")], ({ store, actor, args }) => plans.resumePlan(store, actor, args.s("subscriptionId")));
cmd("plans.switch", "commerce", "Switch Plus between monthly and annual.", [P("subscriptionId"), P("to", "string", true, { options: ["plus_monthly", "plus_annual"] })], ({ store, actor, args }) => plans.switchPlan(store, actor, args.s("subscriptionId"), args.s("to") as "plus_monthly" | "plus_annual"));
cmd("plans.refund", "commerce", "Request the annual money-back refund (inside the window) or see the policy.", [P("subscriptionId")], ({ store, actor, args }) => plans.refundPlan(store, actor, args.s("subscriptionId")));
qry("plans.mine", "commerce", "My subscriptions.", [], ({ store, actor }) => plans.mySubscriptions(store, actor));
cmd("plans.tick", "commerce", "Run the subscription lifecycle now (trial reminders, renewals, period ends).", [], ({ store, actor }) => { if (!hasAny(actor, ["admin"])) throw new CampusError("forbidden", "Administrators only.", 403); return plans.tickPlans(store); });
cmd("aid.apply", "commerce", "Apply for financial aid for a program.", [P("offeringId"), P("background"), P("need"), P("goals"), opt("commitment", "boolean"), opt("requestedPct", "number")], ({ store, actor, args }) => plans.applyForAid(store, actor, { offeringId: args.s("offeringId"), background: args.s("background"), need: args.s("need"), goals: args.s("goals"), commitment: args.b("commitment"), requestedPct: args.raw["requestedPct"] as number | undefined }));
qry("aid.queue", "commerce", "Financial aid review queue (a person decides; the summary is an extract only).", [], ({ store, actor }) => plans.aidQueue(store, actor));
cmd("aid.decide", "commerce", "Approve or deny a financial aid application.", [P("applicationId"), P("decision", "string", true, { options: ["approved", "denied"] }), opt("approvedPct", "number"), opt("note")], ({ store, actor, args }) => plans.decideAid(store, actor, args.s("applicationId"), args.s("decision") as "approved" | "denied", args.raw["approvedPct"] as number | undefined, args.so("note") ?? ""));
qry("aid.mine", "commerce", "My financial aid applications.", [], ({ store, actor }) => plans.myAid(store, actor));
qry("programs.status", "program-studio", "Design-package status for every program.", [], ({ store, actor }) => prog.studioOverview(store, actor));
qry("programs.progress", "program-studio", "My progress toward a program credential.", [P("offeringId")], ({ store, actor, args }) => prog.myProgramProgress(store, actor, args.s("offeringId")));
cmd("lab_keys.issue", "key-vault", "Get a learner API key for a lab (capped and expiring).", [P("assignmentId")], ({ store, actor, args }) => tut.issueLabKey(store, actor, args.s("assignmentId")));
cmd("lab_keys.set_cap", "key-vault", "Instructor: change a key's spend cap.", [P("keyId"), P("spendCapCents", "number")], ({ store, actor, args }) => tut.setKeyCap(store, actor, args.s("keyId"), args.n("spendCapCents")));
cmd("lab_keys.call", "key-vault", "Call the model proxy with a lab key (metered).", [P("key"), P("prompt", "text")], ({ store, args }) => tut.proxyModelCall(store, args.s("key"), args.s("prompt")));
qry("lab.notebook", "cloud-lab", "Starter or executed notebook (.ipynb) for a lab.", [P("templateId"), P("which", "string", true, { options: ["starter", "executed"] })], ({ store, actor, args }) => tut.labNotebook(store, actor, args.s("templateId"), args.s("which") as never));

/* 46–48 Control plane */
qry("connectors.list", "connectors", "Connectors and their honest status.", [], ({ store, actor }) => plat.connectorList(store, actor));
cmd("connectors.configure", "connectors", "Disable, simulate or connect a connector (consent + secret reference).", [P("key"), P("mode", "string", true, { options: ["disabled", "simulated", "connected"] }), opt("secretRef"), opt("consent", "boolean")], ({ store, actor, args }) => plat.configureConnector(store, actor, args.s("key"), { mode: args.s("mode") as never, secretRef: args.so("secretRef"), consent: args.b("consent") }));
qry("status.board", "status-board", "Capability status board.", [], ({ store }) => plat.capabilityBoard(store));
cmd("tenants.provision", "tenant-console", "Create a tenant from a template.", [P("name"), P("slug"), P("type", "string", true, { options: ["academy", "university", "school", "corporate"] }), P("region", "string", true, { options: ["us-east", "eu-west", "af-west", "ap-south"] }), P("tier", "string", true, { options: ["standard", "enterprise"] }), P("adminName"), P("adminEmail")], ({ actor, args }) => plat.provisionTenant(actor, { name: args.s("name"), slug: args.s("slug"), type: args.s("type") as never, region: args.s("region"), tier: args.s("tier") as never, adminName: args.s("adminName"), adminEmail: args.s("adminEmail") }));
cmd("tenants.limits", "tenant-console", "Set plan limits.", [P("tenantId"), P("limits", "json")], ({ actor, args }) => plat.setPlanLimits(actor, args.s("tenantId"), args.j("limits")));
cmd("tenants.offboard", "tenant-console", "Export and suspend a tenant.", [P("tenantId")], ({ actor, args }) => plat.offboardTenant(actor, args.s("tenantId")));
cmd("licenses.create", "tenant-console", "License a course from one tenant to another.", [P("sourceTenantId"), P("sourceCourseId"), P("targetTenantId"), opt("title")], ({ actor, args }) => plat.createLicense(actor, { sourceTenantId: args.s("sourceTenantId"), sourceCourseId: args.s("sourceCourseId"), targetTenantId: args.s("targetTenantId"), title: args.so("title") }));
cmd("licenses.sync", "tenant-console", "Sync licensed content (content only, idempotent).", [P("licenseId")], ({ actor, args }) => plat.syncLicense(actor, args.s("licenseId")));
qry("platform.metrics", "tenant-console", "De-identified cross-tenant metrics.", [], ({ actor }) => plat.platformMetrics(actor));

export const OPERATIONS: Record<string, Operation> = Object.fromEntries(OPS.map((o) => [o.name, o]));
export function operationsForTab(tab: string) {
  return OPS.filter((o) => o.tab === tab);
}
export function allOperations() {
  return OPS;
}
