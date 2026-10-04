import {desc} from "drizzle-orm";
import {getDb} from "../../../db";
import {connectorWebhooks,integrationEvents} from "../../../db/schema";

export async function GET(){
  try{
    const db=getDb(),[hooks,events]=await Promise.all([db.select().from(connectorWebhooks).orderBy(desc(connectorWebhooks.createdAt)).limit(50),db.select().from(integrationEvents).orderBy(desc(integrationEvents.id)).limit(100)]);
    return Response.json({webhooks:hooks.map(x=>({...x,token:x.token.slice(0,6)+"••••••••"})),events,connectors:[
      {id:"whatsapp",name:"WhatsApp Business",state:"Authorization required",capabilities:["Two-way messaging","Conversation history","Smart routing","Human handoff"]},
      {id:"google",name:"Google Workspace",state:"Authorization required",capabilities:["Calendar events","Gmail meeting actions","Reminders","Daily summaries"]},
      {id:"slack",name:"Slack",state:"Authorization required",capabilities:["Slash commands","Meeting notifications","AI summaries","Recording links"]},
      {id:"zoom",name:"Zoom Meetings & Phone",state:"Admin approval required",capabilities:["Meetings","Zoom Phone","Smart Embed","Call events"]},
      {id:"front",name:"Front",state:"Authorization required",capabilities:["Omnichannel inbox","Transcripts","Assignments","Analytics"]},
      {id:"webhook",name:"Incoming Webhooks",state:"Ready",capabilities:["Channel posts","Verification tokens","External alerts","Chatbot API"]}
    ]});
  }catch{return Response.json({error:"Integration data is temporarily unavailable"},{status:503})}
}
