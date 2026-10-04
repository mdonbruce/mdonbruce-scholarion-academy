import { and, asc, desc, eq, gte, isNull, or } from "drizzle-orm";
import { getDb } from "../../../../db";
import { communicationIdentities, externalEntryPoints, identityAssignments, identityEntryPointMappings, numberAuditEvents, xconnectIdempotency, xconnectNumberRanges, xconnectRoutingRules, xconnectTenants } from "../../../../db/schema";
import { config } from "../../communications/_lib";

const identityTypes = new Set(["extension","virtual","cloud","department","queue","IVR","AI","meeting_bridge"]);
const targetTypes = new Set(["user","department","queue","ring_group","IVR","AI_agent","meeting_room","voicemail"]);
const entryTypes = new Set(["pstn","sip_uri","sip_trunk","whatsapp_business","carrier_resource","BYOC"]);
const finalStatuses = new Set(["active","suspended"]);
export const clean = (value: unknown, max=160) => String(value ?? "").trim().slice(0,max);
const json = (value: unknown) => JSON.stringify(value ?? {});

export function context(request: Request, mutation=false) {
  const email=clean(request.headers.get("oai-authenticated-user-email"),180).toLowerCase(), actorId=clean(request.headers.get("oai-authenticated-user-id"),180);
  const admins=(config().HAVEN_XCONNECT_ADMIN_EMAILS||"").toLowerCase().split(",").map(x=>x.trim()).filter(Boolean);
  const staff=email.endsWith("@oakhavensuites.com")||admins.includes(email);
  if(!staff||!actorId) throw new Error("Sign in with an authorized Oak Haven account");
  if(mutation&&!admins.includes(email)) throw new Error("XConnect number-management permission is required");
  return {email,actorId,tenantId:"tenant_oak_haven",tenantSlug:"oak-haven",role:admins.includes(email)?"Superadmin":"Viewer"};
}

export async function bootstrap(request: Request, mutation=false) {
  const ctx=context(request,mutation), db=getDb();
  await db.insert(xconnectTenants).values({id:ctx.tenantId,name:"Oak Haven Lodging & Suites",slug:ctx.tenantSlug,status:"active"}).onConflictDoNothing();
  const defaults=[
    ["range_staff","extension",2000,3999,""],["range_department","department",7000,7999,""],["range_ai","AI",9000,9099,""],["range_meeting","meeting_bridge",9100,9199,""],["range_virtual","virtual",800000001,899999999,"XC"],
  ] as const;
  for(const [id,numberType,rangeStart,rangeEnd,prefix] of defaults) await db.insert(xconnectNumberRanges).values({id,tenantId:ctx.tenantId,numberType,rangeStart,rangeEnd,prefix,status:"active"}).onConflictDoNothing();
  return ctx;
}

export async function rateLimit(ctx: ReturnType<typeof context>) {
  const since=new Date(Date.now()-60000), rows=await getDb().select({id:numberAuditEvents.id}).from(numberAuditEvents).where(and(eq(numberAuditEvents.tenantId,ctx.tenantId),eq(numberAuditEvents.actorId,ctx.actorId),gte(numberAuditEvents.createdAt,since))).limit(31);
  if(rows.length>=30) throw new Error("Rate limit exceeded; wait before trying again");
}

export function key(request: Request) { const value=clean(request.headers.get("idempotency-key"),100); if(!/^[A-Za-z0-9:_-]{8,100}$/.test(value)) throw new Error("A valid Idempotency-Key header is required"); return value; }

async function claim(ctx:ReturnType<typeof context>,idempotencyKey:string,operation:string){
  const db=getDb(), id=crypto.randomUUID();
  try{await db.insert(xconnectIdempotency).values({id,tenantId:ctx.tenantId,idempotencyKey,operation});return {id,replay:null as any};}
  catch{const [prior]=await db.select().from(xconnectIdempotency).where(and(eq(xconnectIdempotency.tenantId,ctx.tenantId),eq(xconnectIdempotency.idempotencyKey,idempotencyKey))).limit(1);if(prior?.responseBody)return {id:prior.id,replay:JSON.parse(prior.responseBody)};throw new Error("This request is already being processed");}
}
async function complete(claimId:string,response:any){await getDb().update(xconnectIdempotency).set({resourceId:response?.item?.id||response?.id||null,responseBody:json(response)}).where(eq(xconnectIdempotency.id,claimId));return response;}
async function audit(ctx:ReturnType<typeof context>,identityId:string|null,action:string,previous:any,next:any,correlationId:string){await getDb().insert(numberAuditEvents).values({id:crypto.randomUUID(),tenantId:ctx.tenantId,identityId,action,actorId:ctx.actorId,previousValues:json(previous),newValues:json(next),correlationId});}

export async function inventory(request:Request){
  const ctx=await bootstrap(request),db=getDb();
  const [identities,assignments,entryPoints,mappings,routes,ranges,auditEvents]=await Promise.all([
    db.select().from(communicationIdentities).where(eq(communicationIdentities.tenantId,ctx.tenantId)).orderBy(asc(communicationIdentities.displayNumber)),
    db.select().from(identityAssignments).where(eq(identityAssignments.tenantId,ctx.tenantId)).orderBy(desc(identityAssignments.createdAt)),
    db.select().from(externalEntryPoints).where(eq(externalEntryPoints.tenantId,ctx.tenantId)).orderBy(desc(externalEntryPoints.updatedAt)),
    db.select().from(identityEntryPointMappings).where(eq(identityEntryPointMappings.tenantId,ctx.tenantId)),
    db.select().from(xconnectRoutingRules).where(eq(xconnectRoutingRules.tenantId,ctx.tenantId)).orderBy(asc(xconnectRoutingRules.priority)),
    db.select().from(xconnectNumberRanges).where(eq(xconnectNumberRanges.tenantId,ctx.tenantId)).orderBy(asc(xconnectNumberRanges.rangeStart)),
    db.select().from(numberAuditEvents).where(eq(numberAuditEvents.tenantId,ctx.tenantId)).orderBy(desc(numberAuditEvents.createdAt)).limit(250),
  ]);
  const providers=[
    {category:"PSTN / Nigerian carrier",provider:config().HAVEN_NIGERIAN_CARRIER_NAME||null,status:config().HAVEN_SIP_GATEWAY_URI?"Testing":"Awaiting Credentials"},
    {category:"SIP / BYOC",provider:config().HAVEN_VOICE_PROVIDER_NAME||null,status:config().HAVEN_COMMUNICATIONS_GATEWAY_URL?"Testing":"Not Configured"},
    {category:"WhatsApp Business Calling",provider:"Meta WhatsApp Business Platform",status:config().HAVEN_WHATSAPP_GATEWAY_URL?"Testing":"Awaiting Verification"},
    {category:"OpenAI Realtime API",provider:"OpenAI",status:config().OPENAI_API_KEY&&config().HAVEN_AI_VOICE_URL?"Testing":"Awaiting Credentials"},
    {category:"WebRTC / video",provider:config().HAVEN_WEBRTC_PROVIDER_NAME||"HavenConnect internal WebRTC",status:config().HAVEN_TURN_URL?"Testing":"Provisioning"},
    {category:"Recording / storage",provider:config().HAVEN_RECORDING_PROVIDER_NAME||null,status:config().HAVEN_RECORDING_PROVIDER_URL?"Testing":"Not Configured"},
  ];
  return {viewer:{email:ctx.email,role:ctx.role,tenant:"Oak Haven Lodging & Suites"},identities,assignments,entryPoints,mappings,routes,ranges,auditEvents,providers,lastUpdated:new Date().toISOString(),syncStatus:"Live"};
}

export async function allocate(request:Request,reserve=false){
  const ctx=await bootstrap(request,true);await rateLimit(ctx);const idem=key(request),claimed=await claim(ctx,idem,reserve?"reserve":"allocate");if(claimed.replay)return claimed.replay;
  const body=await request.json() as any,type=clean(body.type,30),db=getDb();if(!identityTypes.has(type))throw new Error("Unsupported XConnect identity type");
  const ranges=await db.select().from(xconnectNumberRanges).where(and(eq(xconnectNumberRanges.tenantId,ctx.tenantId),eq(xconnectNumberRanges.numberType,type),eq(xconnectNumberRanges.status,"active"))).orderBy(asc(xconnectNumberRanges.rangeStart));if(!ranges.length)throw new Error("No authorized range exists for this identity type");
  const desired=Number(body.desired_number)||0;
  for(const range of ranges){const first=desired||range.rangeStart,last=desired||range.rangeEnd;if(first<range.rangeStart||last>range.rangeEnd)continue;for(let number=first;number<=last&&number<first+2000;number++){
    const raw=String(number),canonicalId=`hcx:${ctx.tenantSlug}:${type}:${raw}`,displayNumber=type==="virtual"?`XC-${raw.slice(0,3)}-${raw.slice(3,6)}-${raw.slice(6)}`:raw,item={id:crypto.randomUUID(),tenantId:ctx.tenantId,canonicalId,displayNumber,type,status:reserve?"reserved":"allocated",version:1};
    try{await db.insert(communicationIdentities).values(item);await audit(ctx,item.id,reserve?"reserved":"allocated",{},item,idem);return complete(claimed.id,{item});}catch(error:any){if(!String(error.message||"").toLowerCase().includes("unique"))throw error;if(desired)throw new Error("Requested identity is not available");}
  }}throw new Error("Authorized range is exhausted");
}

export async function mutateIdentity(request:Request,action:"assign"|"unassign"|"release"|"activate"|"suspend"){
  const ctx=await bootstrap(request,true);await rateLimit(ctx);const idem=key(request),claimed=await claim(ctx,idem,action);if(claimed.replay)return claimed.replay;const body=await request.json() as any,db=getDb();
  const [identity]=await db.select().from(communicationIdentities).where(and(eq(communicationIdentities.tenantId,ctx.tenantId),eq(communicationIdentities.id,clean(body.identity_id)))).limit(1);if(!identity)throw new Error("Identity not found in this tenant");
  if(action==="assign") {const targetType=clean(body.target_type,30),targetId=clean(body.target_id);if(!targetTypes.has(targetType)||!targetId)throw new Error("Valid assignment target is required");const item={id:crypto.randomUUID(),tenantId:ctx.tenantId,communicationIdentityId:identity.id,targetType,targetId,status:"active",createdBy:ctx.email};await db.insert(identityAssignments).values(item);await db.update(communicationIdentities).set({status:"active",version:identity.version+1,updatedAt:new Date()}).where(eq(communicationIdentities.id,identity.id));await audit(ctx,identity.id,"assigned",identity,item,idem);return complete(claimed.id,{item});}
  if(action==="unassign") {await db.update(identityAssignments).set({status:"ended",effectiveUntil:new Date(),updatedAt:new Date()}).where(and(eq(identityAssignments.tenantId,ctx.tenantId),eq(identityAssignments.communicationIdentityId,identity.id),eq(identityAssignments.status,"active")));const next={...identity,status:"allocated",version:identity.version+1};await db.update(communicationIdentities).set({status:next.status,version:next.version,updatedAt:new Date()}).where(eq(communicationIdentities.id,identity.id));await audit(ctx,identity.id,"unassigned",identity,next,idem);return complete(claimed.id,{item:next});}
  if(action==="release") {const refs=await Promise.all([db.select().from(identityAssignments).where(and(eq(identityAssignments.tenantId,ctx.tenantId),eq(identityAssignments.communicationIdentityId,identity.id),eq(identityAssignments.status,"active"))).limit(1),db.select().from(identityEntryPointMappings).where(and(eq(identityEntryPointMappings.tenantId,ctx.tenantId),eq(identityEntryPointMappings.communicationIdentityId,identity.id),or(eq(identityEntryPointMappings.status,"Connected"),eq(identityEntryPointMappings.status,"Testing")))).limit(1),db.select().from(xconnectRoutingRules).where(and(eq(xconnectRoutingRules.tenantId,ctx.tenantId),eq(xconnectRoutingRules.communicationIdentityId,identity.id),or(eq(xconnectRoutingRules.status,"active"),eq(xconnectRoutingRules.status,"Testing")))).limit(1)]);if(refs.some(x=>x.length))throw new Error("Remove active assignments, mappings, and routes before release");const next={...identity,status:"quarantined",quarantineUntil:new Date(Date.now()+Number(config().HAVEN_XCONNECT_QUARANTINE_DAYS||30)*86400000),version:identity.version+1};await db.update(communicationIdentities).set({status:next.status,quarantineUntil:next.quarantineUntil,version:next.version,updatedAt:new Date()}).where(eq(communicationIdentities.id,identity.id));await audit(ctx,identity.id,"released_to_quarantine",identity,{...next,reason:clean(body.reason,500)},idem);return complete(claimed.id,{item:next});}
  const nextStatus=action==="activate"?"active":"suspended";if(!finalStatuses.has(nextStatus))throw new Error("Invalid status");const next={...identity,status:nextStatus,version:identity.version+1};await db.update(communicationIdentities).set({status:nextStatus,version:next.version,updatedAt:new Date()}).where(eq(communicationIdentities.id,identity.id));await audit(ctx,identity.id,action,identity,next,idem);return complete(claimed.id,{item:next});
}

export async function registerEntryPoint(request:Request){const ctx=await bootstrap(request,true);await rateLimit(ctx);const idem=key(request),claimed=await claim(ctx,idem,"register_entry_point");if(claimed.replay)return claimed.replay;const b=await request.json() as any,type=clean(b.entry_point_type,40),provider=clean(b.provider_id),resource=clean(b.provider_resource_id),address=clean(b.address);if(!entryTypes.has(type)||!provider||!resource||!address)throw new Error("Provider, resource ID, type, and verified address are required");if(type==="pstn"&&!/^\+[1-9]\d{7,14}$/.test(address))throw new Error("PSTN addresses must be real E.164 numbers supplied by the provider");const item={id:crypto.randomUUID(),tenantId:ctx.tenantId,providerId:provider,providerResourceId:resource,entryPointType:type,address,countryCode:clean(b.country_code,3).toUpperCase(),capabilities:json(Array.isArray(b.capabilities)?b.capabilities:[]),verificationStatus:"Awaiting Verification",provisioningStatus:"Provisioning",inboundEnabled:false,outboundEnabled:false};await getDb().insert(externalEntryPoints).values(item);await audit(ctx,null,"entry_point_registered",{},item,idem);return complete(claimed.id,{item});}

export async function verifyEntryPoint(request:Request){const ctx=await bootstrap(request,true);await rateLimit(ctx);const idem=key(request),claimed=await claim(ctx,idem,"verify_entry_point");if(claimed.replay)return claimed.replay;const b=await request.json() as any,db=getDb(),id=clean(b.entry_point_id);const [prior]=await db.select().from(externalEntryPoints).where(and(eq(externalEntryPoints.tenantId,ctx.tenantId),eq(externalEntryPoints.id,id))).limit(1);if(!prior)throw new Error("Entry point not found in this tenant");if(b.test_result!=="passed"||!clean(b.provider_test_id))throw new Error("Provider verification requires a passed end-to-end test and provider test ID");const next={...prior,verificationStatus:"Verified",provisioningStatus:"Connected",inboundEnabled:Boolean(b.inbound_enabled),outboundEnabled:Boolean(b.outbound_enabled),updatedAt:new Date()};await db.update(externalEntryPoints).set(next).where(eq(externalEntryPoints.id,id));await audit(ctx,null,"entry_point_verified",prior,{...next,providerTestId:clean(b.provider_test_id)},idem);return complete(claimed.id,{item:next});}

export async function createMapping(request:Request){const ctx=await bootstrap(request,true);await rateLimit(ctx);const idem=key(request),claimed=await claim(ctx,idem,"create_mapping");if(claimed.replay)return claimed.replay;const b=await request.json() as any,db=getDb(),identityId=clean(b.identity_id),entryPointId=clean(b.entry_point_id),direction=["inbound","outbound","both"].includes(b.direction)?b.direction:"both";const [[identity],[entry]]=await Promise.all([db.select().from(communicationIdentities).where(and(eq(communicationIdentities.tenantId,ctx.tenantId),eq(communicationIdentities.id,identityId))).limit(1),db.select().from(externalEntryPoints).where(and(eq(externalEntryPoints.tenantId,ctx.tenantId),eq(externalEntryPoints.id,entryPointId))).limit(1)]);if(!identity||!entry)throw new Error("Identity and entry point must belong to this tenant");if(entry.verificationStatus!=="Verified"||entry.provisioningStatus!=="Connected")throw new Error("Only a verified, connected entry point may be mapped");const item={id:crypto.randomUUID(),tenantId:ctx.tenantId,communicationIdentityId:identity.id,externalEntryPointId:entry.id,direction,priority:Math.max(1,Math.min(999,Number(b.priority)||100)),status:"Testing"};await db.insert(identityEntryPointMappings).values(item);await audit(ctx,identity.id,"entry_point_mapped",{},item,idem);return complete(claimed.id,{item});}

export async function deleteMapping(request:Request,id:string){const ctx=await bootstrap(request,true);await rateLimit(ctx);const idem=key(request),claimed=await claim(ctx,idem,"delete_mapping");if(claimed.replay)return claimed.replay;const db=getDb(),[prior]=await db.select().from(identityEntryPointMappings).where(and(eq(identityEntryPointMappings.tenantId,ctx.tenantId),eq(identityEntryPointMappings.id,id))).limit(1);if(!prior)throw new Error("Mapping not found in this tenant");await db.delete(identityEntryPointMappings).where(eq(identityEntryPointMappings.id,prior.id));await audit(ctx,prior.communicationIdentityId,"entry_point_unmapped",prior,{},idem);return complete(claimed.id,{deleted:true,id});}

export async function resolveRoute(request:Request){const ctx=await bootstrap(request),url=new URL(request.url),value=clean(url.searchParams.get("identity")),db=getDb();const [identity]=await db.select().from(communicationIdentities).where(and(eq(communicationIdentities.tenantId,ctx.tenantId),or(eq(communicationIdentities.id,value),eq(communicationIdentities.canonicalId,value),eq(communicationIdentities.displayNumber,value)))).limit(1);if(!identity||!["active","allocated"].includes(identity.status))throw new Error("Active identity not found in this tenant");const [assignment,routes,mappings]=await Promise.all([db.select().from(identityAssignments).where(and(eq(identityAssignments.tenantId,ctx.tenantId),eq(identityAssignments.communicationIdentityId,identity.id),eq(identityAssignments.status,"active"))).limit(1),db.select().from(xconnectRoutingRules).where(and(eq(xconnectRoutingRules.tenantId,ctx.tenantId),eq(xconnectRoutingRules.communicationIdentityId,identity.id),eq(xconnectRoutingRules.status,"active"))).orderBy(asc(xconnectRoutingRules.priority)),db.select().from(identityEntryPointMappings).where(and(eq(identityEntryPointMappings.tenantId,ctx.tenantId),eq(identityEntryPointMappings.communicationIdentityId,identity.id),eq(identityEntryPointMappings.status,"Connected"))).orderBy(asc(identityEntryPointMappings.priority))]);return {identity,assignment:assignment[0]||null,route:routes[0]||null,mapping:mappings[0]||null,resolvedAt:new Date().toISOString()};}

export async function listAudit(request:Request){const ctx=await bootstrap(request);return {items:await getDb().select().from(numberAuditEvents).where(eq(numberAuditEvents.tenantId,ctx.tenantId)).orderBy(desc(numberAuditEvents.createdAt)).limit(500)};}
