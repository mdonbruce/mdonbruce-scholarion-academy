import { inventory } from "../_service";
export async function GET(request:Request){try{const data=await inventory(request);return Response.json({items:data.identities,lastUpdated:data.lastUpdated});}catch(e:any){return Response.json({error:e.message},{status:401});}}
