import { deleteMapping } from "../../_service";
export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){try{const {id}=await params;return Response.json(await deleteMapping(request,id));}catch(e:any){return Response.json({error:e.message},{status:e.message?.includes("permission")?403:400});}}
