import { createMapping } from "../_service";
export async function POST(request:Request){try{return Response.json(await createMapping(request),{status:201});}catch(e:any){return Response.json({error:e.message},{status:e.message?.includes("permission")?403:400});}}
