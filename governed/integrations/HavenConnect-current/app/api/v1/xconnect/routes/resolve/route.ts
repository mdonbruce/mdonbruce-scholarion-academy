import { resolveRoute } from "../../_service";
export async function GET(request:Request){try{return Response.json(await resolveRoute(request));}catch(e:any){return Response.json({error:e.message},{status:404});}}
