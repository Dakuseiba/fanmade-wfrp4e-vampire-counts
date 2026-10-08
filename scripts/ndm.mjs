import {ID} from './rules.mjs';
import {ensure,owned,rank,meta,en,copy,esc,report,test,result,setCondition,data,fresh,formTokens} from './main.mjs';
export const RANKS=['Newborn','Thrall','Count','Lord'];
export function feedingPeriod(a){const rankName=a.getFlag(ID,'vampireRank')||'Newborn';return {rank:rankName,amount:Math.max(1,a.system.characteristics.t.bonus)*(owned(a,'Blood-Sated')?2:1),unit:{Newborn:'godzin',Thrall:'dni',Count:'tygodni',Lord:'miesięcy'}[rankName]||'godzin'};}
export function suppressedBy(a,name){const map={'No Reflection':'Persistent Image',Silver:'Silvered Blood','Religious Symbols':'Unhallowed Soul','Daemonsroot and Witchbane':'Aethyric Cipher'};if(name==='Running Water'&&rank(a,'Waterwalker')>=2)return 'Waterwalker';if(name==='Sunlight'&&owned(a,'Defy the Dawn')&&a.getFlag(ID,'dawnProtection'))return 'Defy the Dawn';return map[name]&&owned(a,map[name])?map[name]:null;}
export function stormShelter(a){return a.effects.some(e=>meta(e).stormArea&&!e.disabled);}
export async function syncNature(a){
 const natureEffects = a.effects.filter(e => meta(e).nature);

 // Jeśli actor nie jest już wampirem,
 // Vampire Nature nie powinno istnieć.
 if(!a.getFlag(ID,'vampire')){
  if(natureEffects.length)
   await a.deleteEmbeddedDocuments(
    'ActiveEffect',
    natureEffects.map(e => e.id)
   );

  return;
 }

 if(!a.getFlag(ID,'bloodThirst'))
  await a.setFlag(ID,'bloodThirst',true);

 if(a.getFlag(ID,'blockStandardRecovery')!==true)
  await a.setFlag(ID,'blockStandardRecovery',true);

 const scripts=[
  {
   label:'Vampire Nature',
   trigger:'prepareItem',
   script:`const i=args.item,a=this.actor,id='${ID}';const owned=n=>a.items.some(x=>(x.flags[id]?.en||x.name)===n);if(owned('Quicksilver')&&i.type==='weapon'&&i.isMelee&&!i.system.qualities.value.some(q=>q.name==='fast'))i.system.qualities.value.push({name:'fast'});if((a.getFlag(id,'transformation')||a.getFlag(id,'spiritForm'))&&['weapon','armour'].includes(i.type)&&i.system.equipped)i.system.equipped.value=false;if(a.getFlag(id,'humanForm')&&i.type==='trait'&&['Fear','Terror','Flight','Bite','Claw'].includes(i.flags[id]?.en||i.name))i.system.disabled=true;`,
   options:{}
  },
  {
   label:'Pass for Human',
   trigger:'calculateSize',
   script:`if(this.actor.getFlag('${ID}','humanForm'))args.size='avg';`,
   options:{}
  }
 ];

 const old = natureEffects[0];

 if(old){
  if(
   JSON.stringify(old.system.scriptData.map(s=>s.script)) !==
   JSON.stringify(scripts.map(s=>s.script))
  )
   await old.update({'system.scriptData':scripts});
 }
 else {
  await a.createEmbeddedDocuments('ActiveEffect',[{
   name:'Vampire Nature',
   img:`modules/${ID}/assets/blood.svg`,
   flags:{
    [ID]:{
     nature:true
    }
   },
   system:{
    transferData:{
     type:'document',
     documentType:'Actor'
    },
    scriptData:scripts
   }
  }]);
 }

 for(const w of a.items.filter(i=>meta(i).kind==='weakness')){
  const value=suppressedBy(a,en(w));

  if((meta(w).suppressedBy||null)!==value)
   await w.setFlag(ID,'suppressedBy',value);
 }
}
export async function setVampireRank(a,value){ensure(a);if(!RANKS.includes(value))throw Error('Nieprawidłowa ranga.');await a.setFlag(ID,'vampireRank',value);}
export async function compulsion(a,source,stacks,command){
 ensure(a);stacks=Math.max(1,Number(stacks)||1);
 return (await a.createEmbeddedDocuments('ActiveEffect',[{name:`Compulsion — ${command} (${stacks})`,img:`modules/${ID}/assets/blood.svg`,description:`<p>${esc(command)}</p><p>Źródło: ${esc(source.name)}. Poziom: ${stacks}. Testy sprzeczne z tym poleceniem: −${10*stacks}.</p>`,duration:{seconds:3600,startTime:game.time.worldTime},flags:{[ID]:{commandText:command,source:source.uuid,stacks,compulsion:true}},system:{transferData:{type:'document',documentType:'Actor'},scriptData:[{label:'Compulsion — rozstrzygnij',trigger:'manual',script:`return game.modules.get('${ID}').api.resolveCompulsion(this.effect);`,options:{}},{label:`Compulsion — ${command}`,trigger:'dialog',script:`args.fields.modifier-=${10*stacks};`,options:{activateScript:'return false;'}}]}}]))[0];
}
export async function bloodKiss(source,target,{mode='Willing',bloodline,gift,...choices}={}){
 ensure(source);ensure(target);if(source.system.status.wounds.value<1)throw Error('Sire musi mieć krew do przekazania.');if(!source.getFlag(ID,'vampire'))throw Error('Blood Kiss wymaga wampira jako sire.');if(!['Willing','Forced'].includes(mode))throw Error('Wybierz Willing lub Forced.');if(mode==='Forced'&&target.system.status.wounds.value>0)throw Error('Forced Blood Kiss wymaga celu przy 0 Wounds.');if(target.getFlag(ID,'vampire'))throw Error('Cel jest już wampirem.');
 const c=await data(),line=bloodline||source.getFlag(ID,'bloodline'),raw=c.templates.find(t=>meta(t).en===line);if(!raw)throw Error('Wybierz ród krwi.');
 const t=fresh(raw);t.flags[ID].choices={...choices,gift,ritualSource:source.uuid,ritualMode:mode,ritualWasDying:target.system.status.wounds.value===0};
 return target.createEmbeddedDocuments('Item',[t]);
}
export async function finishBloodKiss(target,choices){
 if(!choices.ritualSource)return;
 const source=await fromUuid(choices.ritualSource);if(!source)throw Error('Nie odnaleziono sire.');ensure(source);
 await target.setFlag(ID,'sire',source.uuid);await target.setFlag(ID,'bloodKissMode',choices.ritualMode);
 await source.update({'system.status.wounds.value':Math.max(0,source.system.status.wounds.value-1)});
 const shock=await test(target,'Cool');let delay='Gorączkowa przemiana; przebieg ustala GM.';
 if(choices.ritualWasDying){await target.update({'system.status.wounds.value':0});await setCondition(target,'unconscious',1);const r=await new Roll('1d10').evaluate();await r.toMessage({speaker:ChatMessage.getSpeaker({actor:target}),flavor:'Blood Kiss — dni do przebudzenia'});delay=`Przebudzenie po ${r.total} dniach; czas rozliczany ręcznie.`;}
 await report(target,'Blood Kiss',`<p>${choices.ritualMode}: wymiana krwi z ${esc(source.name)}. Sire oddał 1 Wound krwi. ${delay} ${shock&&!result(shock).success?'Nieudany test Cool: psychiczną konsekwencję ustala GM.':''}</p>`);
 await target.setFlag(ID,'bloodKissResolved',true);
}

Hooks.once('ready',()=>Object.assign(game.modules.get(ID).api,{hungerCheck,wakeVampire,wightCritical,toggleSpiritForm,revertSpirit,feedingPeriod,setVampireRank,bloodKiss,syncNature,suppressedBy,stormShelter}));

Hooks.on('renderChatMessageHTML',(message,html)=>{const t=message.system?.test;if(!t?.actor?.getFlag(ID,'vampire')||!t.options?.rest)return;html.querySelectorAll('[data-action="applyHealing"]').forEach(b=>{b.addEventListener('click',ev=>{ev.preventDefault();ev.stopImmediatePropagation();ui.notifications.warn('Blood Thirst: zwykły odpoczynek nie leczy wampira.');},true);});});

export async function revertSpirit(a){
 ensure(a);const s=a.getFlag(ID,'spiritForm');if(!s)return;
 await a.unsetFlag(ID,'spiritForm');
 if(s.changed){await a.update({prototypeToken:{texture:{src:s.token},ring:{subject:{texture:s.ring}}}});for(const t of formTokens(a)){const old=s.tokens.find(x=>x.uuid===t.uuid);await t.update({texture:{src:old?.src||s.token},ring:{subject:{texture:old?.ring||''}}},{animate:false});}}
 const effects=a.effects.filter(e=>meta(e).spiritForm).map(e=>e.id);if(effects.length)await a.deleteEmbeddedDocuments('ActiveEffect',effects);
 const items=a.items.filter(i=>meta(i).spiritForm).map(i=>i.id);if(items.length)await a.deleteEmbeddedDocuments('Item',items);
}
export async function toggleSpiritForm(item){
 const a=ensure(item.actor),name=en(item);if(a.getFlag(ID,'spiritForm'))return revertSpirit(a);
 if(a.getFlag(ID,'transformation')||a.getFlag(ID,'humanForm'))throw Error('Najpierw zakończ obecną przemianę.');
 const art=a.getFlag(ID,'formArt')?.[name],tokens=formTokens(a);if(tokens.some(t=>!t.isOwner))throw Error('Zmianę tokenów wykonuje właściciel lub GM.');
 await a.setFlag(ID,'spiritForm',{name,changed:!!art,token:a.prototypeToken.texture.src,ring:a.prototypeToken.ring?.subject?.texture||'',tokens:tokens.map(t=>({uuid:t.uuid,src:t.texture.src,ring:t.ring?.subject?.texture||''}))});
 if(art){await a.update({prototypeToken:{texture:{src:art},...(a.prototypeToken.ring?.enabled?{ring:{subject:{texture:art}}}:{})}});for(const t of tokens)await t.update({texture:{src:art},...(t.ring?.enabled?{ring:{subject:{texture:art}}}:{})},{animate:false});}
 if(name==='Ethereal Mist'){const t=await game.modules.get(ID).api.coreTrait('Ethereal');t.flags[ID].spiritForm=true;await a.createEmbeddedDocuments('Item',[t]);}
 await a.createEmbeddedDocuments('ActiveEffect',[{name,img:`modules/${ID}/assets/beast.svg`,flags:{[ID]:{spiritForm:true}},system:{transferData:{type:'document',documentType:'Actor'},scriptData:name==='Ethereal Mist'?[]:[{label:name,trigger:'preTakeDamage',script:"args.abort='Swarm Form: cannot be harmed.';",options:{}}]}}]);
 await report(a,name,'<p>Wyposażenie jest wchłonięte i nie może być używane. Powrót odtwarza wyposażenie i wygląd tokenu. Swarm Form nie pozwala atakować; czas trwania rozlicz ręcznie.</p>');
}
Hooks.on('deleteActiveEffect',e=>{if(meta(e).spiritForm&&e.parent?.isOwner&&e.parent.getFlag(ID,'spiritForm'))revertSpirit(e.parent).catch(err=>ui.notifications.error(err.message));});

export async function hungerCheck(a){
 ensure(a);const t=await test(a,'Cool');if(!t)return;const before=a.hasCondition('cc-hungry')?.conditionValue||0,n=before+(result(t).success?0:1);await setCondition(a,'cc-hungry',n);if(n>=5||(before>0&&result(t).fumble))await setCondition(a,'cc-ravenous',1);await report(a,'Hunger Check',`<p>Hungry: ${n}. Termin kolejnego testu rozlicz ręcznie według Vampire Rank.</p>`);
}
export async function wakeVampire(a,{mode}={}){
 ensure(a);mode??=await foundry.applications.api.DialogV2.wait({window:{title:'Wake Vampire'},buttons:[{action:'wake',label:'Obudź w dzień'},{action:'resist',label:`Test po ${a.system.characteristics.wp.bonus} minutach` }],rejectClose:false});if(!mode)return;
 if(mode==='wake'){await a.addCondition('fatigued',1);await setCondition(a,'unconscious',0);await a.setFlag(ID,'dayAwake',true);return report(a,'Wake Vampire',`<p>Przebudzenie daje Fatigued. Pierwszy test Endurance po ${a.system.characteristics.wp.bonus} minutach na jawie rozlicz ręcznie.</p>`);}
 if(mode==='resist'){const t=await test(a,'Endurance');if(!t)return;if(!result(t).success){await setCondition(a,'unconscious',1);await a.setFlag(ID,'dayAwake',false);}return;}
 throw Error('Wybierz przebudzenie albo test po upływie czasu.');
}

export async function wightCritical(a){
 ensure(a);if(a.system.details.species.value!=='Wight')throw Error('Pełna moc Wight Blade wymaga Wight.');
 const loc=await foundry.applications.api.DialogV2.prompt({window:{title:'Wight Blade — Critical'},content:'<select name=loc><option value=head>Head</option><option value=body>Body</option><option value=arm>Arm</option><option value=leg>Leg</option></select>',ok:{label:'Rzuć',callback:(_e,b)=>b.form.elements.loc.value},rejectClose:false});if(!loc)return;
 const rolls=await Promise.all([new Roll('1d100').evaluate(),new Roll('1d100').evaluate()]);for(const r of rolls)await r.toMessage({speaker:ChatMessage.getSpeaker({actor:a}),flavor:'Wight Blade — Critical'});
 const chosen=Math.max(...rolls.map(r=>r.total)),table=await game.wfrp4e.tables.rollTable('crit'+loc,{lookup:chosen,hideDSN:true});return report(a,'Wight Blade',`<p>Wybrano wyższy wynik: ${chosen}.</p>${table?.result||''}`);
}
