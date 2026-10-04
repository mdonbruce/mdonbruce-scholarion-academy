import {eq} from "drizzle-orm";
import {getDb} from "../../../../db";
import {connectorWebhooks,integrationEvents,messages} from "../../../../db/schema";
const clean=(v:unknown)=>String(v??"").trim();
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
  const{id}=await context.params,db=getDb(),[hook]=await db.select().from(connectorWebhooks).where(eq(connectorWebhooks.id,id)).limit(1);if(!hook||!hook.active)return Response.json({error:"Webhook not found"},{status:404});
  const supplied=clean(request.headers.get("x-haven-token")||request.headers.get("authorization")?.replace(/^Bearer\s+/i,""));if(supplied!==hook.token)return Response.json({error:"Invalid verification token"},{status:401});
  const p=await request.json().catch(()=>({})),body=clean(p.text||p.message||p.body).slice(0,4000);if(!body)return Response.json({error:"Message text is required"},{status:400});const provider=clean(p.provider)||"Incoming Webhook",author=clean(p.name||p.contactName||p.author)||provider;
  try{const[event]=await db.insert(integrationEvents).values({provider,eventType:clean(p.eventType)||"message",contactName:author,contactPhone:clean(p.phone||p.contactPhone),channel:hook.channel,summary:body,status:"Routed"}).returning();await db.insert(messages).values({channel:hook.channel,author,body:`[${provider}] ${body}`});return Response.json({ok:true,eventId:event.id,channel:hook.channel})}catch{return Response.json({error:"Message could not be routed"},{status:503})}
}
