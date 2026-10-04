import {desc} from "drizzle-orm";
import {getDb} from "../../../db";
import {connectorWebhooks} from "../../../db/schema";
const clean=(v:unknown)=>String(v??"").trim();
export async function GET(){try{const items=await getDb().select().from(connectorWebhooks).orderBy(desc(connectorWebhooks.createdAt)).limit(50);return Response.json({items:items.map(x=>({...x,token:x.token.slice(0,6)+"••••••••"}))})}catch{return Response.json({error:"Webhooks are temporarily unavailable"},{status:503})}}
export async function POST(request:Request){const p=await request.json().catch(()=>({})),name=clean(p.name).slice(0,80),channel=clean(p.channel).slice(0,60)||"General";if(!name)return Response.json({error:"Webhook name is required"},{status:400});const item={id:crypto.randomUUID(),name,channel,token:crypto.randomUUID().replaceAll("-","")+crypto.randomUUID().slice(0,8),active:true};try{await getDb().insert(connectorWebhooks).values(item);return Response.json({item:{...item,endpoint:`/api/hooks/${item.id}`}}, {status:201})}catch{return Response.json({error:"Webhook could not be created"},{status:503})}}
