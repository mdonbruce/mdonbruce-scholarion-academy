import { inventory } from "./_service";
export async function GET(request:Request){try{return Response.json(await inventory(request));}catch(e:any){return Response.json({error:e.message||"XConnect is unavailable"},{status:401});}}
