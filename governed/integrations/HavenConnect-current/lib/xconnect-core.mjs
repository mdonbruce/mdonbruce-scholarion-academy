export const identityTypes=new Set(["extension","virtual","cloud","department","queue","IVR","AI","meeting_bridge"]);
export function makeIdentity(tenantSlug,type,number){
 if(!/^[a-z0-9-]{2,64}$/.test(tenantSlug)||!identityTypes.has(type)||!/^\d{4,12}$/.test(String(number)))throw new Error("Invalid identity input");
 const raw=String(number),displayNumber=type==="virtual"?`XC-${raw.slice(0,3)}-${raw.slice(3,6)}-${raw.slice(6)}`:raw;
 return {canonicalId:`hcx:${tenantSlug}:${type}:${raw}`,displayNumber};
}
export const validE164=value=>!/^\+990/.test(String(value))&&/^\+[1-9]\d{7,14}$/.test(String(value));
export const connectedEntryPoint=entry=>entry?.verificationStatus==="Verified"&&entry?.provisioningStatus==="Connected";
