import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
export const messages = sqliteTable("messages", { id: integer("id").primaryKey({autoIncrement:true}), channel:text("channel").notNull().default("General"), author:text("author").notNull(), body:text("body").notNull(), createdAt:integer("created_at",{mode:"timestamp"}).notNull().$defaultFn(()=>new Date()) });
export const tasks = sqliteTable("tasks", { id:integer("id").primaryKey({autoIncrement:true}), title:text("title").notNull(), assignee:text("assignee").notNull(), priority:text("priority").notNull().default("Normal"), due:text("due").notNull(), status:text("status").notNull().default("To do"), createdAt:integer("created_at",{mode:"timestamp"}).notNull().$defaultFn(()=>new Date()) });
export const shifts = sqliteTable("shifts", { id:integer("id").primaryKey({autoIncrement:true}), employee:text("employee").notNull(), department:text("department").notNull(), date:text("date").notNull(), start:text("start_time").notNull(), end:text("end_time").notNull() });
export const notes = sqliteTable("notes", { id:integer("id").primaryKey({autoIncrement:true}), title:text("title").notNull(), content:text("content").notNull(), author:text("author").notNull(), createdAt:integer("created_at",{mode:"timestamp"}).notNull().$defaultFn(()=>new Date()) });
export const files = sqliteTable("files", { id:integer("id").primaryKey({autoIncrement:true}), name:text("name").notNull(), key:text("object_key").notNull().unique(), type:text("content_type").notNull(), size:integer("size").notNull(), uploader:text("uploader").notNull(), createdAt:integer("created_at",{mode:"timestamp"}).notNull().$defaultFn(()=>new Date()) });
export const announcements = sqliteTable("announcements", { id:integer("id").primaryKey({autoIncrement:true}), title:text("title").notNull(), body:text("body").notNull(), category:text("category").notNull().default("Announcement"), status:text("status").notNull().default("Published"), publishDate:text("publish_date").notNull(), author:text("author").notNull(), createdAt:integer("created_at",{mode:"timestamp"}).notNull().$defaultFn(()=>new Date()) });
export const queueCalls = sqliteTable("queue_calls", { id:integer("id").primaryKey({autoIncrement:true}), caller:text("caller").notNull(), phone:text("phone").notNull(), queue:text("queue_name").notNull(), type:text("call_type").notNull().default("VoIP"), direction:text("direction").notNull().default("Incoming"), status:text("status").notNull().default("Waiting"), agent:text("agent").notNull().default("Unassigned"), createdAt:integer("created_at",{mode:"timestamp"}).notNull().$defaultFn(()=>new Date()) });
export const contacts = sqliteTable("contacts", { id:integer("id").primaryKey({autoIncrement:true}), name:text("name").notNull(), phone:text("phone").notNull(), email:text("email").notNull().default(""), contactType:text("contact_type").notNull().default("Customer"), department:text("department").notNull().default("Guest Services"), preferredChannel:text("preferred_channel").notNull().default("WhatsApp"), notes:text("notes").notNull().default(""), createdAt:integer("created_at",{mode:"timestamp"}).notNull().$defaultFn(()=>new Date()) });
export const connectorWebhooks = sqliteTable("connector_webhooks", { id:text("id").primaryKey(), name:text("name").notNull(), channel:text("channel").notNull(), token:text("verification_token").notNull(), active:integer("active",{mode:"boolean"}).notNull().default(true), createdAt:integer("created_at",{mode:"timestamp"}).notNull().$defaultFn(()=>new Date()) });
export const integrationEvents = sqliteTable("integration_events", { id:integer("id").primaryKey({autoIncrement:true}), provider:text("provider").notNull(), eventType:text("event_type").notNull(), contactName:text("contact_name").notNull().default(""), contactPhone:text("contact_phone").notNull().default(""), channel:text("channel").notNull().default("General"), summary:text("summary").notNull(), status:text("status").notNull().default("Received"), createdAt:integer("created_at",{mode:"timestamp"}).notNull().$defaultFn(()=>new Date()) });
export const agentActions = sqliteTable("agent_actions", { id:integer("id").primaryKey({autoIncrement:true}), agent:text("agent").notNull(), provider:text("provider").notNull(), actionType:text("action_type").notNull(), title:text("title").notNull(), details:text("details").notNull().default(""), requestedBy:text("requested_by").notNull().default("Oak Haven Staff"), status:text("status").notNull().default("Pending approval"), createdAt:integer("created_at",{mode:"timestamp"}).notNull().$defaultFn(()=>new Date()) });
export const havenNumbers = sqliteTable("haven_numbers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  virtualNumber: text("virtual_number").notNull(),
  extension: text("extension").notNull(),
  label: text("label").notNull(),
  category: text("category").notNull(),
  tenant: text("tenant").notNull().default("Oak Haven"),
  routeType: text("route_type").notNull(),
  routeTarget: text("route_target").notNull(),
  edgeAlias: text("edge_alias").notNull().default("internal"),
  status: text("status").notNull().default("Active"),
  expiresAt: integer("expires_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  virtualNumberIdx: uniqueIndex("haven_numbers_virtual_number_unique").on(table.virtualNumber),
  extensionIdx: uniqueIndex("haven_numbers_extension_unique").on(table.extension),
}));
export const rtcCalls = sqliteTable("rtc_calls", {
  id: text("id").primaryKey(),
  fromExtension: text("from_extension").notNull(),
  toExtension: text("to_extension").notNull(),
  offer: text("offer").notNull(),
  answer: text("answer").notNull().default(""),
  status: text("status").notNull().default("Ringing"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  incomingIdx: index("idx_rtc_calls_destination_status").on(table.toExtension, table.status),
}));
export const numberAllocations = sqliteTable("number_allocations", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  number: text("number").notNull(),
  type: text("type").notNull(),
  status: text("status").notNull().default("allocated"),
  realEntryPointId: text("real_entry_point_id"),
  assignedTo: text("assigned_to"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  tenantNumberUnique: uniqueIndex("number_allocations_tenant_number_unique").on(table.tenantId, table.number),
  tenantStatusIdx: index("idx_number_allocations_tenant_status").on(table.tenantId, table.status),
  entryPointIdx: index("idx_number_allocations_entry_point").on(table.realEntryPointId),
}));

export const meetingRecords = sqliteTable("meeting_records", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  purpose: text("purpose").notNull().default(""),
  organizer: text("organizer").notNull(),
  startAt: text("start_at").notNull(),
  endAt: text("end_at").notNull(),
  lifecycle: text("lifecycle").notNull().default("Pre-Meeting"),
  roomId: text("room_id"),
  agenda: text("agenda").notNull().default("[]"),
  attendees: text("attendees").notNull().default("[]"),
  consentStatus: text("consent_status").notNull().default("Not requested"),
  recordingStatus: text("recording_status").notNull().default("Off"),
  transcriptStatus: text("transcript_status").notNull().default("Off"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const meetingAgentProposals = sqliteTable("meeting_agent_proposals", {
  id: text("id").primaryKey(),
  meetingId: text("meeting_id").notNull(),
  agent: text("agent").notNull(),
  actionType: text("action_type").notNull(),
  title: text("title").notNull(),
  details: text("details").notNull().default(""),
  proposedOwner: text("proposed_owner").notNull().default(""),
  proposedDeadline: text("proposed_deadline").notNull().default(""),
  source: text("source").notNull().default(""),
  destination: text("destination").notNull().default("HavenConnect"),
  status: text("status").notNull().default("Proposed"),
  externalId: text("external_id"),
  decidedBy: text("decided_by"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  meetingStatusIdx: index("idx_meeting_agent_proposals_meeting_status").on(table.meetingId, table.status),
}));

export const meetingRooms = sqliteTable("meeting_rooms", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  roomEmail: text("room_email").notNull().unique(),
  building: text("building").notNull(),
  floor: text("floor").notNull(),
  location: text("location").notNull(),
  roomType: text("room_type").notNull(),
  capacity: integer("capacity").notNull(),
  accessible: integer("accessible", { mode: "boolean" }).notNull().default(true),
  equipment: text("equipment").notNull().default("[]"),
  supportedProviders: text("supported_providers").notNull().default("[]"),
  operatingStatus: text("operating_status").notNull().default("Unknown"),
  maintenanceStatus: text("maintenance_status").notNull().default("Assessment required"),
  bookingWindowDays: integer("booking_window_days").notNull().default(90),
  maxDurationMinutes: integer("max_duration_minutes").notNull().default(240),
  externalMeetingPolicy: text("external_meeting_policy").notNull().default("Approval required"),
  lastCheckIn: text("last_check_in"),
  softwareVersion: text("software_version"),
  lastRestart: text("last_restart"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const roomBookings = sqliteTable("room_bookings", {
  id: text("id").primaryKey(),
  roomId: text("room_id").notNull(),
  meetingId: text("meeting_id"),
  title: text("title").notNull(),
  organizer: text("organizer").notNull(),
  startAt: text("start_at").notNull(),
  endAt: text("end_at").notNull(),
  status: text("status").notNull().default("Confirmed"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  roomTimeIdx: index("idx_room_bookings_room_time").on(table.roomId, table.startAt, table.endAt),
}));

export const roomReservationSlots = sqliteTable("room_reservation_slots", {
  id: text("id").primaryKey(),
  roomId: text("room_id").notNull(),
  bookingId: text("booking_id").notNull(),
  slot: text("slot").notNull(),
}, (table) => ({
  roomSlotUnique: uniqueIndex("room_reservation_slots_room_slot_unique").on(table.roomId, table.slot),
}));

export const meetingAudit = sqliteTable("meeting_audit", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  meetingId: text("meeting_id").notNull().default("workspace"),
  actor: text("actor").notNull(),
  eventType: text("event_type").notNull(),
  detail: text("detail").notNull(),
  consequential: integer("consequential", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const voiceStaffProfiles = sqliteTable("voice_staff_profiles", {
  id: text("id").primaryKey(),
  employeeName: text("employee_name").notNull(),
  jobTitle: text("job_title").notNull(),
  department: text("department").notNull(),
  workEmail: text("work_email").notNull().unique(),
  extension: text("extension").notNull().unique(),
  presence: text("presence").notNull().default("Offline"),
  queueMembership: text("queue_membership").notNull().default("[]"),
  callPermissions: text("call_permissions").notNull().default("[]"),
  availability: text("availability").notNull().default("Unavailable"),
  assignedProperty: text("assigned_property").notNull().default("Oak Haven Lodging & Suites"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => ({ departmentPresenceIdx: index("idx_voice_staff_department_presence").on(table.department, table.presence) }));

export const voiceQueues = sqliteTable("voice_queues", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  strategy: text("strategy").notNull(),
  skills: text("skills").notNull().default("[]"),
  overflowQueue: text("overflow_queue"),
  afterHoursTarget: text("after_hours_target").notNull().default("Voicemail"),
  serviceLevelSeconds: integer("service_level_seconds").notNull().default(30),
  status: text("status").notNull().default("Disabled"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const voiceEvents = sqliteTable("voice_events", {
  id: text("id").primaryKey(),
  callId: text("call_id").notNull(),
  direction: text("direction").notNull(),
  channel: text("channel").notNull(),
  queue: text("queue").notNull().default(""),
  staffEmail: text("staff_email").notNull().default(""),
  remoteParty: text("remote_party").notNull().default(""),
  eventType: text("event_type").notNull(),
  status: text("status").notNull(),
  durationSeconds: integer("duration_seconds"),
  waitSeconds: integer("wait_seconds"),
  consentEvidence: text("consent_evidence").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => ({ callTimeIdx: index("idx_voice_events_call_time").on(table.callId, table.createdAt), queueTimeIdx: index("idx_voice_events_queue_time").on(table.queue, table.createdAt) }));

export const ivrFlowVersions = sqliteTable("ivr_flow_versions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  version: integer("version").notNull(),
  greeting: text("greeting").notNull(),
  menu: text("menu").notNull().default("[]"),
  businessHours: text("business_hours").notNull().default("{}"),
  status: text("status").notNull().default("Draft"),
  approvedBy: text("approved_by"),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => ({ nameVersionUnique: uniqueIndex("ivr_flow_versions_name_version_unique").on(table.name, table.version) }));

export const voiceRecordings = sqliteTable("voice_recordings", {
  id: text("id").primaryKey(),
  callId: text("call_id").notNull(),
  objectKey: text("object_key"),
  status: text("status").notNull().default("Awaiting Provider"),
  consentStatus: text("consent_status").notNull(),
  retentionPolicy: text("retention_policy").notNull(),
  legalHold: integer("legal_hold", { mode: "boolean" }).notNull().default(false),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const xconnectTenants = sqliteTable("xconnect_tenants", {
  id: text("id").primaryKey(), name: text("name").notNull(), slug: text("slug").notNull(), status: text("status").notNull().default("active"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()), updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => ({ slugUnique: uniqueIndex("xconnect_tenants_slug_unique").on(table.slug) }));

export const xconnectNumberRanges = sqliteTable("xconnect_number_ranges", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull().references(() => xconnectTenants.id), numberType: text("number_type").notNull(),
  rangeStart: integer("range_start").notNull(), rangeEnd: integer("range_end").notNull(), prefix: text("prefix").notNull().default(""), status: text("status").notNull().default("active"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()), updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => ({ tenantRangeUnique: uniqueIndex("xconnect_ranges_tenant_type_bounds_unique").on(table.tenantId, table.numberType, table.rangeStart, table.rangeEnd), tenantTypeIdx: index("idx_xconnect_ranges_tenant_type").on(table.tenantId, table.numberType, table.status) }));

export const communicationIdentities = sqliteTable("communication_identities", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull().references(() => xconnectTenants.id), canonicalId: text("canonical_id").notNull(), displayNumber: text("display_number").notNull(),
  type: text("type").notNull(), status: text("status").notNull().default("free"), version: integer("version").notNull().default(1), quarantineUntil: integer("quarantine_until", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()), updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => ({ canonicalUnique: uniqueIndex("communication_identities_tenant_canonical_unique").on(table.tenantId, table.canonicalId), displayUnique: uniqueIndex("communication_identities_tenant_display_unique").on(table.tenantId, table.displayNumber), tenantStatusIdx: index("idx_communication_identities_tenant_status").on(table.tenantId, table.type, table.status) }));

export const identityAssignments = sqliteTable("identity_assignments", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull().references(() => xconnectTenants.id), communicationIdentityId: text("communication_identity_id").notNull().references(() => communicationIdentities.id),
  targetType: text("target_type").notNull(), targetId: text("target_id").notNull(), effectiveFrom: integer("effective_from", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()), effectiveUntil: integer("effective_until", { mode: "timestamp" }),
  status: text("status").notNull().default("active"), createdBy: text("created_by").notNull(), createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()), updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => ({ activeIdentityUnique: uniqueIndex("identity_assignments_active_identity_unique").on(table.tenantId, table.communicationIdentityId).where(sql`${table.status} = 'active'`), tenantTargetIdx: index("idx_identity_assignments_tenant_target").on(table.tenantId, table.targetType, table.targetId) }));

export const externalEntryPoints = sqliteTable("external_entry_points", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull().references(() => xconnectTenants.id), providerId: text("provider_id").notNull(), providerResourceId: text("provider_resource_id").notNull(), entryPointType: text("entry_point_type").notNull(), address: text("address").notNull(), countryCode: text("country_code").notNull(), capabilities: text("capabilities").notNull().default("[]"), verificationStatus: text("verification_status").notNull().default("Awaiting Verification"), provisioningStatus: text("provisioning_status").notNull().default("Not Configured"), inboundEnabled: integer("inbound_enabled", { mode: "boolean" }).notNull().default(false), outboundEnabled: integer("outbound_enabled", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()), updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => ({ providerResourceUnique: uniqueIndex("external_entry_points_tenant_provider_resource_unique").on(table.tenantId, table.providerId, table.providerResourceId), addressUnique: uniqueIndex("external_entry_points_tenant_address_unique").on(table.tenantId, table.address), tenantStatusIdx: index("idx_external_entry_points_tenant_status").on(table.tenantId, table.verificationStatus, table.provisioningStatus) }));

export const identityEntryPointMappings = sqliteTable("identity_entry_point_mappings", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull().references(() => xconnectTenants.id), communicationIdentityId: text("communication_identity_id").notNull().references(() => communicationIdentities.id), externalEntryPointId: text("external_entry_point_id").notNull().references(() => externalEntryPoints.id), direction: text("direction").notNull(), priority: integer("priority").notNull().default(100), effectiveFrom: integer("effective_from", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()), effectiveUntil: integer("effective_until", { mode: "timestamp" }), status: text("status").notNull().default("Testing"), createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()), updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => ({ mappingUnique: uniqueIndex("identity_entry_point_mappings_tenant_pair_direction_unique").on(table.tenantId, table.communicationIdentityId, table.externalEntryPointId, table.direction), routeIdx: index("idx_identity_entry_point_mappings_route").on(table.tenantId, table.communicationIdentityId, table.direction, table.status) }));

export const xconnectRoutingRules = sqliteTable("xconnect_routing_rules", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull().references(() => xconnectTenants.id), communicationIdentityId: text("communication_identity_id").notNull().references(() => communicationIdentities.id), priority: integer("priority").notNull().default(100), conditions: text("conditions").notNull().default("{}"), destinationType: text("destination_type").notNull(), destinationId: text("destination_id").notNull(), fallbackDestinationType: text("fallback_destination_type"), fallbackDestinationId: text("fallback_destination_id"), scheduleId: text("schedule_id"), status: text("status").notNull().default("Testing"), createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()), updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => ({ tenantIdentityPriorityUnique: uniqueIndex("xconnect_routing_rules_tenant_identity_priority_unique").on(table.tenantId, table.communicationIdentityId, table.priority), resolveIdx: index("idx_xconnect_routing_rules_resolve").on(table.tenantId, table.communicationIdentityId, table.status, table.priority) }));

export const numberAuditEvents = sqliteTable("number_audit_events", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull().references(() => xconnectTenants.id), identityId: text("identity_id"), action: text("action").notNull(), actorId: text("actor_id").notNull(), previousValues: text("previous_values").notNull().default("{}"), newValues: text("new_values").notNull().default("{}"), correlationId: text("correlation_id").notNull(), createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => ({ tenantTimeIdx: index("idx_number_audit_events_tenant_time").on(table.tenantId, table.createdAt), correlationIdx: index("idx_number_audit_events_correlation").on(table.tenantId, table.correlationId) }));

export const xconnectIdempotency = sqliteTable("xconnect_idempotency", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull().references(() => xconnectTenants.id), idempotencyKey: text("idempotency_key").notNull(), operation: text("operation").notNull(), resourceId: text("resource_id"), responseBody: text("response_body"), createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => ({ tenantKeyUnique: uniqueIndex("xconnect_idempotency_tenant_key_unique").on(table.tenantId, table.idempotencyKey), tenantTimeIdx: index("idx_xconnect_idempotency_tenant_time").on(table.tenantId, table.createdAt) }));

export const cxRecords = sqliteTable("cx_records", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  tenantId: text("tenant_id").notNull().default("oak-haven"),
  payload: text("payload").notNull(),
  version: integer("version").notNull().default(1),
  updatedBy: text("updated_by").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
}, table => ({ kindTenantIdx: index("idx_cx_records_kind_tenant").on(table.kind, table.tenantId, table.updatedAt) }));

export const cxEvents = sqliteTable("cx_events", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().default("oak-haven"),
  sessionId: text("session_id").notNull(),
  contextId: text("context_id"),
  channel: text("channel").notNull(),
  eventType: text("event_type").notNull(),
  actor: text("actor").notNull(),
  details: text("details").notNull(),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
}, table => ({ sessionTimeIdx: index("idx_cx_events_session_time").on(table.sessionId, table.createdAt), typeTimeIdx: index("idx_cx_events_type_time").on(table.eventType, table.createdAt) }));

export const protectedTenants = sqliteTable("protected_tenants", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  environment: text("environment").notNull(),
  customDomain: text("custom_domain"),
  domainToken: text("domain_token"),
  domainStatus: text("domain_status").notNull().default("Not configured"),
  primaryRegion: text("primary_region").notNull().default(""),
  isolationMode: text("isolation_mode").notNull().default(""),
  identityRealm: text("identity_realm").notNull().default(""),
  secretRef: text("secret_ref").notNull().default(""),
  kmsRef: text("kms_ref").notNull().default(""),
  status: text("status").notNull().default("Draft"),
  version: integer("version").notNull().default(1),
  updatedBy: text("updated_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
}, table => ({ slugEnv: uniqueIndex("protected_tenants_slug_environment_unique").on(table.slug, table.environment), domain: uniqueIndex("protected_tenants_domain_unique").on(table.customDomain) }));

export const tenantChanges = sqliteTable("tenant_changes", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull().references(() => protectedTenants.id),
  proposed: text("proposed").notNull(), reason: text("reason").notNull(), classification: text("classification").notNull(),
  status: text("status").notNull().default("Pending"), baseVersion: integer("base_version").notNull(),
  submittedBy: text("submitted_by").notNull(), reviewedBy: text("reviewed_by"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`), reviewedAt: text("reviewed_at"),
}, table => ({ tenantStatus: index("idx_tenant_changes_tenant_status").on(table.tenantId, table.status) }));

export const tenantValidations = sqliteTable("tenant_validations", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull().references(() => protectedTenants.id),
  domain: text("domain").notNull(), status: text("status").notNull(),
  evidence: text("evidence").notNull(), durationMs: integer("duration_ms").notNull(),
  checkedAt: text("checked_at").notNull().default(sql`(datetime('now'))`),
}, table => ({ tenantTime: index("idx_tenant_validations_tenant_time").on(table.tenantId, table.checkedAt) }));

export const tenantAudit = sqliteTable("tenant_audit", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull().references(() => protectedTenants.id),
  action: text("action").notNull(), actor: text("actor").notNull(), details: text("details").notNull(),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
}, table => ({ tenantTime: index("idx_tenant_audit_tenant_time").on(table.tenantId, table.createdAt) }));

export const tenantOutbox = sqliteTable("tenant_outbox", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull().references(() => protectedTenants.id),
  eventType: text("event_type").notNull(), payload: text("payload").notNull(),
  status: text("status").notNull().default("Queued"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
}, table => ({ tenantTime: index("idx_tenant_outbox_tenant_time").on(table.tenantId, table.createdAt) }));
