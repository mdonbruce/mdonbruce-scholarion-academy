(function(root){
const passing=new Set(['A+','A','A-','B+','B','B-','C+','C']);
function eligibility(program,grades){if(!program||program.status!=='approved'||!Array.isArray(program.requiredCourses)||!program.requiredCourses.length)return {eligible:false,reasons:['Required course list is TBC. Registrar approval is required.']};const reasons=[];for(const course of program.requiredCourses){const g=grades.find(x=>x.course===course&&x.final===true);if(!g)reasons.push(course+': final course grade missing');else if(!passing.has(g.grade))reasons.push(course+': C or better required');}return {eligible:!reasons.length,reasons};}
const api={eligibility,passing:[...passing]};if(typeof module!=='undefined')module.exports=api;else root.CredentialRules=api;
})(globalThis);
