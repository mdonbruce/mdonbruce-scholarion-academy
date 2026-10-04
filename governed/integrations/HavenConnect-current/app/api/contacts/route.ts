import {desc,like} from "drizzle-orm";
import {getDb} from "../../../db";
import {contacts} from "../../../db/schema";

const clean=(value:unknown)=>String(value??"").trim();

export async function GET(){
  try{return Response.json({items:await getDb().select().from(contacts).where(like(contacts.email,"%@oakhavensuites.com")).orderBy(desc(contacts.id)).limit(250)})}
  catch{return Response.json({error:"Contacts are temporarily unavailable"},{status:503})}
}

export async function POST(request:Request){
  const payload=await request.json().catch(()=>({}));
  if(!clean(payload.name)||!clean(payload.phone))return Response.json({error:"Name and phone number are required"},{status:400});
  if(!clean(payload.email).toLowerCase().endsWith("@oakhavensuites.com"))return Response.json({error:"Only verified @oakhavensuites.com staff accounts may be added"},{status:400});
  try{
    const[item]=await getDb().insert(contacts).values({name:clean(payload.name),phone:clean(payload.phone),email:clean(payload.email),contactType:clean(payload.contactType)||"Customer",department:clean(payload.department)||"Guest Services",preferredChannel:clean(payload.preferredChannel)||"WhatsApp",notes:clean(payload.notes)}).returning();
    return Response.json({item},{status:201});
  }catch{return Response.json({error:"The contact could not be saved"},{status:503})}
}
