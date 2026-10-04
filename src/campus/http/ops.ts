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
import * as plat from "../services/platform";
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
