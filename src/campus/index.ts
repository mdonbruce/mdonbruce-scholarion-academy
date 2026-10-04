/**
 * Scholarion Campus: multi-tenant SIS + LMS + ERP layer.
 * Importing this module registers every hook and outbox consumer.
 */
export * as core from "./core";
export * as iam from "./iam";
export * as entity from "./entity";
export * as permissions from "./permissions";
export * as registry from "./registry";
export * as curriculum from "./services/curriculum";
export * as files from "./services/files";
export * as sis from "./services/sis";
export * as grading from "./services/grading";
export * as assessment from "./services/assessment";
export * as collaboration from "./services/collaboration";
export * as calendar from "./services/calendar";
export * as success from "./services/success";
export * as ai from "./services/ai";
export * as lti from "./services/lti";
export * as integration from "./services/integration";
export * as admin from "./services/admin";
export * as ops from "./services/ops";
export * as content from "./services/content";
export * as dashboard from "./services/dashboard";
export * as people from "./services/people";
export * as desk from "./services/desk";
export * as seed from "./seed";
export * as claims from "./services/claims";
export * as academy from "./services/academy";
export * as tutor from "./services/tutor";
export * as proctor from "./services/proctor";
export * as platform from "./services/platform";
