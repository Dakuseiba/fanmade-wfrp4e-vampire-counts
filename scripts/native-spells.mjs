import {ID} from './rules.mjs';
import {en,meta,data,fresh,ensure,feed,esc} from './main.mjs';
import {compulsion} from './ndm.mjs';

const has=(a,n)=>a.items.some(i=>en(i)===n);
const isGhoul=a=>/ghoul/i.test(a.system.details.species.value)||/ghoul/i.test(a.name);
const blocked=(message)=>{ui.notifications.warn(message);return false;};

// The native applyEffect workflow runs this on the owner of the receiving actor.
export async function nativeSpellPrepare(effect){
 const a=effect.actor,caster=effect.sourceActor,n=meta(effect).spellKey;
 if(!a||!caster)return blocked('Nie znaleziono celu lub źródła zaklęcia.');
 if(['Corpse Flesh',"Nehekhara's Insistence",'Wraithly Shroud'].includes(n)&&!has(a,'Undead'))return blocked(`${n}: cel wymaga Undead.`);
 if(['Invocation of Nehek','Undead Unguent'].includes(n)&&!has(a,'Undead')&&!isGhoul(a))return blocked(`${n}: cel wymaga Undead lub Ghoul.`);
 if(n==='Control Wraith'&&(!has(a,'Undead')||!has(a,'Ethereal')))return blocked('Control Wraith: cel wymaga Undead i Ethereal.');
 const wp=caster.system.characteristics.wp.bonus;
 if(n==='Curse of Years'){
  const age=String(a.system.details.age?.value??'').trim();if(!age||!Number.isFinite(Number(age)))return blocked('Curse of Years: wpisz liczbowy Age celu.');
  const years=Number(effect.sourceTest?.result?.overcast?.usage?.other?.current)||20,species=a.system.details.species.value.toLowerCase();
  await a.update({'system.details.age.value':String(Number(age)+Math.ceil(years*(species.includes('halfling')?1.5:/elf|dwarf/.test(species)?2:1)))});return false;
 }
 if(n==='Control Wraith'){
  const command=await foundry.applications.api.DialogV2.prompt({window:{title:'Control Wraith'},content:'<label>Polecenie <input name="command" required></label>',ok:{label:'Zastosuj',callback:(_e,b)=>b.form.elements.command.value.trim()},rejectClose:false});if(!command)return false;
  const e=await compulsion(a,caster,1,command);await e.update({'duration.seconds':null,[`flags.${ID}.untilDawn`]:caster.uuid});return false;
 }
 if(n==='Rain of Blood'){
  if(!has(a,'Vampiric'))return blocked('Rain of Blood: cel wymaga Vampiric.');
  if(a.getFlag(ID,'vampire'))await feed(a,999);else await a.modifyWounds(a.system.status.wounds.max);return false;
 }
 if(n==='Violating Wisdom'){
  const dead=fromUuidSync(meta(effect).knowledgeSource);if(!dead)return blocked('Violating Wisdom: wskaż zmarłego jako cel.');
  const values=Object.fromEntries(dead.items.filter(i=>i.type==='skill'&&/^(Lore|Language)/.test(i.name)).map(i=>[i.name,Number(i.system.total.value)]));
  effect.updateSource({[`flags.${ID}.knowledgeValues`]:values});
 }
 if(n==='Fountains of Blood'&&a.system.status.wounds.value<a.system.status.wounds.max)await a.addCondition('bleeding'); return true;
 // Reapplying a maintained spell replaces its managed effect and its dependent items.
 const previous=a.effects.filter(e=>meta(e).nativeSpell&&e.name===effect.name);
 if(previous.length)await a.deleteEmbeddedDocuments('ActiveEffect',previous.map(e=>e.id));
 if(n==='Invigorating Vitae'||n==='Invocation of Nehek')await a.modifyWounds(wp);
 if(n==='Undead Unguent'){
  const healed=Math.max(0,Math.min(wp,a.system.status.wounds.max-a.system.status.wounds.value));if(!healed)return false;
  await a.modifyWounds(healed);effect.updateSource({'duration.rounds':null,'duration.seconds':healed*3600});
 }
 if(n==='Ride through the Night')effect.updateSource({[`flags.${ID}.untilDawn`]:caster.uuid});
 return true;
}

export async function nativeSpellItems(effect){
 if(effect.parent?.documentName!=='Actor'||effect.system.transferData.type!=='document')return;
 const a=effect.actor,n=meta(effect).spellKey,c=await data();let raw;
 const trait={"Nehekhara's Insistence":'Regenerate','Wraithly Shroud':'Ethereal','Ride through the Night':'Ethereal'}[n];
 if(trait){if(a.items.some(i=>en(i)===trait&&!i.getFlag('wfrp4e','fromEffect')))return;raw=fresh(c.coreTraits[trait]);}
 if(n==="Vanhel's Danse Macabre"){
  const gift=meta(effect).gift;if(has(a,gift))return;raw=fresh(c.gifts.find(i=>en(i)===gift));
 }
 if(raw)return a.createEmbeddedDocuments('Item',[raw],{fromEffect:effect.id,skipExperienceChecks:true,skipSpecialisationChoice:true});
 if(n==='Violating Wisdom'){
  const dead=fromUuidSync(meta(effect).knowledgeSource);if(!dead)return;
  const skills=dead.items.filter(i=>i.type==='skill'&&Object.hasOwn(meta(effect).knowledgeValues||{},i.name)&&!a.items.some(o=>o.type==='skill'&&o.name===i.name)).map(i=>{const d=fresh(i.toObject());d.effects=[];d.system.advances.value=0;return d;});
  if(skills.length)await a.createEmbeddedDocuments('Item',skills,{fromEffect:effect.id,skipExperienceChecks:true});
 }
}

export async function nativeSpellHeal(effect){
 const caster=effect.sourceActor;if(caster)await effect.actor.modifyWounds(caster.system.characteristics.wp.bonus);
}

export async function nativeBloodBite(effect,args){
 const source=args.sourceItem,attacker=args.attacker||source?.actor;
 if(!/^Bite(?:$|[ (])/.test(source?en(source):'')||!attacker||!has(attacker,'Vampiric')||args.totalWoundLoss<=0||args.abort||(args.ward>0&&args.wardRoll>=args.ward))return;
 const levels=effect.actor.hasCondition('bleeding')?.conditionValue||0;if(levels)await attacker.modifyWounds(levels);
}

const SPIRIT_CHAIN='spiritStealerChain';
const spiritLocks=new Set();
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function spiritSecondary(item){
 const raw=fresh(item.toObject());
 raw.flags??={};raw.flags[ID]={...(raw.flags[ID]||{}),chainSecondary:true};
 return new CONFIG.Item.documentClass(raw,{parent:item.actor});
}
function spiritCard(target,wounds,damage,jump){
 return `<div class="cc-spirit-stealer"><h3>Spirit Stealer</h3><p><strong>${esc(target.name)}</strong> ${wounds>0?`otrzymał ${wounds} Wounds.`:'został trafiony.'}</p><p>Następny skok: <strong>${damage} Damage</strong>.</p><p>Wybierz dokładnie jeden kolejny cel, a następnie kliknij przycisk.</p><button type="button" data-cc-spirit-stealer><i class="fas fa-bolt"></i> Spirit Stealer — skok ${jump}</button></div>`;
}
async function spiritMessage(item,target,wounds,damage,visited){
 if(damage<=0||wounds<=0)return;
 const state={sourceItemUuid:item.uuid,casterUuid:item.actor?.uuid,currentTargetUuid:target.uuid,visited:[...visited],damage,jump:visited.length+1,status:'waiting'};
 return ChatMessage.create({speaker:ChatMessage.getSpeaker({actor:item.actor}),content:spiritCard(target,wounds,damage,state.jump),flags:{[ID]:{[SPIRIT_CHAIN]:state}}});
}
async function spiritEnd(caster,target,reason){
 return ChatMessage.create({speaker:ChatMessage.getSpeaker({actor:caster}),content:`<div class="cc-spirit-stealer"><h3>Spirit Stealer</h3><p>${target?`Łańcuch kończy się na <strong>${esc(target.name)}</strong>. `:''}${esc(reason)}</p></div>`});
}

export async function nativeSpiritChainNext(message){
 const state=message.getFlag(ID,SPIRIT_CHAIN);if(!state||state.status!=='waiting')return;
 if(spiritLocks.has(message.id))return;spiritLocks.add(message.id);
 try{
  const targets=[...game.user.targets];if(targets.length!==1)throw Error('Spirit Stealer: wybierz dokładnie jeden kolejny target.');
  const token=targets[0],target=token.actor;if(!target)throw Error('Spirit Stealer: wybrany token nie ma aktora.');
  if(state.visited.includes(target.uuid))throw Error('Spirit Stealer: ten cel został już trafiony przez ten łańcuch.');
  if(!target.isOwner)throw Error('Spirit Stealer: nie masz uprawnień do rozliczenia obrażeń tego celu. Dalszy skok musi wykonać MG.');
  const item=await fromUuid(state.sourceItemUuid);if(!item?.actor)throw Error('Spirit Stealer: nie znaleziono źródłowego zaklęcia.');
  if(state.casterUuid&&item.actor.uuid!==state.casterUuid)throw Error('Spirit Stealer: źródło łańcucha nie zgadza się z czarującym.');
  const damage=Number(state.damage);if(!Number.isFinite(damage)||damage<=0){await message.setFlag(ID,SPIRIT_CHAIN,{...state,status:'resolved'});return spiritEnd(item.actor,null,'Damage spadł do 0.');}
  await message.setFlag(ID,SPIRIT_CHAIN,{...state,status:'resolving'});
  const before=Number(target.system.status.wounds.value)||0,secondary=spiritSecondary(item);
  await target.applyDamage(damage,{sourceItem:secondary,loc:'body',createMessage:true});
  for(let i=0;i<40&&Number(target.system.status.wounds.value)===before;i++)await wait(25);
  const after=Number(target.system.status.wounds.value)||0,wounds=Math.max(0,before-after),visited=[...state.visited,target.uuid];
  await message.setFlag(ID,SPIRIT_CHAIN,{...state,status:'resolved',resolvedTargetUuid:target.uuid,wounds});
  if(wounds<=0)return spiritEnd(item.actor,target,'Pocisk nie zadał żadnych Wounds.');
  const nextDamage=damage-1;if(nextDamage<=0)return spiritEnd(item.actor,target,'Damage spadł do 0.');
  return spiritMessage(item,target,wounds,nextDamage,visited);
 }catch(error){
  const current=message.getFlag(ID,SPIRIT_CHAIN);if(current?.status==='resolving')await message.setFlag(ID,SPIRIT_CHAIN,{...state,status:'waiting'}).catch(()=>{});
  throw error;
 }finally{spiritLocks.delete(message.id);}
}

// Pierwsze trafienie rozlicza normalny przycisk Apply Damage WFRP. Ten trigger
// tylko otwiera łańcuch; kolejne trafienia przechodzą przez actor.applyDamage().
export async function nativeSpiritChain(item,args){
 if(meta(item).chainSecondary||args.abort||(args.ward>0&&args.wardRoll>=args.ward))return;
 if(!args.actor)return;const wounds=Math.max(1,Number(args.totalWoundLoss)||0);args.totalWoundLoss=wounds;
 const current=Number(args.modifiers?.ccSpiritDamage),damage=(Number.isFinite(current)?current:12)-1;if(damage<=0)return;
 // applyDamage scripts run before the Actor wound update; defer the chat card so
 // the normal WFRP damage application finishes first.
 setTimeout(()=>spiritMessage(item,args.actor,wounds,damage,[args.actor.uuid]).catch(error=>console.error('Spirit Stealer',error)),50);
}

export function installNativeSpells(){
 Hooks.on('renderChatMessageHTML',(message,html)=>{
  const button=html.querySelector('[data-cc-spirit-stealer]');if(!button)return;
  const state=message.getFlag(ID,SPIRIT_CHAIN);
  if(!state||state.status!=='waiting'){button.disabled=true;button.innerHTML='<i class="fas fa-check"></i> Spirit Stealer — rozliczono';return;}
  if(message.author?.id!==game.user.id&&!game.user.isGM){button.disabled=true;button.title='Kolejny skok rozlicza autor wiadomości lub MG.';return;}
  button.addEventListener('click',async event=>{event.preventDefault();event.stopPropagation();button.disabled=true;try{await nativeSpiritChainNext(message);}catch(error){ui.notifications.error(error.message);console.error('Spirit Stealer',error);button.disabled=false;}});
 });
}
