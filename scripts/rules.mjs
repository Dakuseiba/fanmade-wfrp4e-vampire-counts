/** Pure, deterministic rules. No Foundry globals, document writes or dice here. */
export const ID = 'wfrp4e-complete-counts-pl';
export const KEYS = ['ws','bs','s','t','i','ag','dex','int','wp','fel'];
export const integer = (v, min=0, max=10000) => {
  const n=Number(v); if (!Number.isInteger(n)||n<min||n>max) throw new Error(`Wymagana liczba całkowita od ${min} do ${max}.`); return n;
};
export function feeding(input, blood) {
  blood=integer(blood,1,10000); const s=structuredClone(input);
  let left=blood; const spent={};
  const spend=(key,n)=>{const used=Math.min(left,n);left-=used;spent[key]=used;return used;};
  s.credit=(s.credit||0)+blood;
  if(s.wounds===0 && s.unconscious && left) {spend('unconscious',1);s.unconscious=false;}
  if(left && s.stunned) s.stunned-=spend('stunned',s.stunned);
  for(const k of ['bleeding','fatigued']) if(left) s[k]-=spend(k,s[k]||0);
  if(left) s.wounds+=spend('wounds',Math.max(0,s.max-s.wounds));
  // A complete feed must restore health and cover all Hungry levels, minimum 3 blood.
  const satiated=s.wounds>=s.max && left>=(s.hungry||0) && s.credit>=3;
  if(satiated) {spend('hungry',s.hungry||0);s.hungry=0;s.ravenous=false;s.intervals=0;s.credit=0;}
  return {state:s,spent,left,satiated};
}
export function hungerDue(intervals,toughnessBonus,sated=false) {
  const mult=sated?2:1, first=Math.max(1,toughnessBonus)*mult;
  return intervals>=first && (intervals-first)%mult===0;
}
export function hungerResult(hungry,{success,fumble}) {
  const next=integer(hungry)+(success?0:1);
  return {hungry:next,ravenous:next>=5 || (hungry>0 && fumble),frenzy:hungry>0&&fumble};
}
export function sunlight(current,minutes,overcast=false,remainder=0) {
  minutes=integer(minutes,1); const step=overcast?60:1,total=minutes+remainder;
  const added=Math.floor(total/step);return {value:current+added,added,remainder:total%step,broken:current<5&&current+added>=5};
}
export function shelter(current,minutes,remainder=0) {
  minutes=Number(minutes);if(!Number.isFinite(minutes)||minutes<0)throw Error('Czas pobytu musi być nieujemną liczbą.');
  const total=minutes+remainder,removed=Math.min(current,Math.floor((total+1e-9)/10));
  return {value:Math.max(0,current-removed),removed,remainder:current>removed?total%10:0};
}
export function transformValues(own,form,{familiar=false,bat=false}={}) {
  return Object.fromEntries(KEYS.map(k=>[k, familiar&&['i','int','wp','fel'].includes(k) ? own[k] : ['bs','dex'].includes(k) ? form[k] : k==='i'&&bat ? own[k]+20 : Math.max(own[k],form[k])]));
}
export function giftCost(rank,inCareer=true) {return 100*(integer(rank,0,100)+1)*(inCareer?1:2);}
export function giftLimit(ordinaryTalents,preferredLevels=1) {return Math.max(3,ordinaryTalents+Math.max(0,preferredLevels-1));}
export function allowedGift(en,owned,weaknessCount=6) {
  const conflicts={'Defy the Dawn':['Silvered Blood','Unhallowed Soul'],'Silvered Blood':['Defy the Dawn'],'Unhallowed Soul':['Defy the Dawn'],'Diseased (Type)':['Resistance (Disease)']};
  if((conflicts[en]||[]).some(x=>owned.includes(x)))return 'Dar wyklucza się z już posiadanym talentem.';
  const removers=['Aethyric Cipher','Persistent Image','Unhallowed Soul','Waterwalker'];
  if(removers.includes(en)&&!owned.includes(en)&&weaknessCount<=4)return 'Nie można ograniczyć liczby słabości poniżej czterech.';
  return null;
}
