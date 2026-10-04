(function(root){
'use strict';
function dueDate(start,week){if(!/^\d{4}-\d{2}-\d{2}$/.test(start))throw Error('Choose a start date');const d=new Date(start+'T12:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==start)throw Error('Invalid start date');d.setUTCDate(d.getUTCDate()+7*Math.max(1,week)-1);return d.toISOString().slice(0,10);}
function submit(previous,text,now){if(typeof text!=='string'||!text.trim()||text.length>20000)throw Error('Enter 1–20,000 characters');return [...previous,{id:crypto.randomUUID(),number:previous.length+1,text:text.trim(),submittedAt:now}];}
function grade(previous,attempt,score,feedback,now){if(!attempt)throw Error('No submission to grade');if(!Number.isFinite(score)||score<0||score>100)throw Error('Score must be 0–100');if(!feedback.trim())throw Error('Feedback is required');return {score,feedback:feedback.trim(),attemptId:attempt.id,posted:false,updatedAt:now,history:[...(previous?.history||[]),{score,feedback:feedback.trim(),attemptId:attempt.id,at:now}]};}
function visibleGrade(review,attempt){return review?.posted&&review.attemptId===attempt?.id?review:null;}
function average(scores){const valid=scores.filter(n=>Number.isFinite(n)&&n>=0&&n<=100);return valid.length?valid.reduce((a,b)=>a+b,0)/valid.length:null;}
const api={dueDate,submit,grade,visibleGrade,average};if(typeof module!=='undefined')module.exports=api;else root.CourseWork=api;
})(globalThis);
