import {ID} from './rules.mjs';
import {data,en,meta,rank,ensure,esc,fresh,test,result,report} from './main.mjs';

export async function resolveCompulsion(effect,mode){
 const a=effect.parent;ensure(a);if(!meta(effect).compulsion)return;
 mode??=await foundry.applications.api.DialogV2.wait({window:{title:effect.name},content:effect.description,buttons:[{action:'done',label:'Polecenie wykonane'},{action:'expired',label:'Polecenie wygasło'}],rejectClose:false});if(!mode)return;
 await a.addCondition('fatigued',mode==='done'?1:Math.max(1,Number(meta(effect).stacks)||1));
 if(mode==='done'&&a.system.status.resolve&&a.system.status.resilience)await a.update({'system.status.resolve.value':Math.min(a.system.status.resilience.value,a.system.status.resolve.value+1)});
 await effect.delete();
}

const selected=()=>[...new Map([...game.user.targets,...(canvas.tokens?.controlled||[])].filter(t=>t.actor).map(t=>[t.actor.uuid,t.actor])).values()];
export async function bait(item,opts={}){
 const roll=await test(item.actor,'Leadership');if(!roll||!result(roll).success)return;
 const message=await report(item.actor,'Bait','<p>Wybierz tokeny podległych Undead w promieniu 12 jardów, następnie kliknij Apply. Premia dotyczy następnego Opposed Test.</p><button type="button" data-cc-bait>Apply</button>');
 await message.setFlag(ID,'bait',{source:item.actor.uuid,rank:rank(item.actor,'Bait'),applied:[]});
}
export async function auraControl(item,opts={}){
 const a=item.actor;ensure(a);const ruler=en(item)==='Ruler of the Night',key=ruler?'undeadAllies':'minions',auraFlag=ruler?'rulerAura':'deathlessAura';
 // Preserve the old defaults: Ruler starts disabled, Deathless Minions starts enabled.
 const auraEnabled=ruler?a.getFlag(ID,auraFlag)===true:a.getFlag(ID,auraFlag)!==false;
 const action=opts.mode||await foundry.applications.api.DialogV2.wait({window:{title:en(item)},content:`<p>Wskaż Undead jako targety, aby przypisać je do tej aury.</p><p><strong>Aura:</strong> ${auraEnabled?'aktywna':'nieaktywna'}.</p>`,buttons:[{action:'add',label:'Przypisz wybrane Undead'},{action:'remove',label:'Odłącz wybrane Undead'},{action:'toggle',label:auraEnabled?'Wyłącz aurę':'Włącz aurę'}],rejectClose:false});
 if(!action)return;
 if(action==='toggle')await a.setFlag(ID,auraFlag,!auraEnabled);
 else {const actors=opts.targets||[...new Map([...game.user.targets].filter(t=>t.actor).map(t=>[t.actor.uuid,t.actor])).values()];if(!actors.length)throw Error('Wskaż przynajmniej jeden target Undead.');if(actors.some(x=>!x.items.some(i=>en(i)==='Undead')))throw Error('Każdy wybrany cel musi mieć Undead.');const members=new Set(a.getFlag(ID,key)||[]);for(const x of actors)action==='add'?members.add(x.uuid):members.delete(x.uuid);await a.setFlag(ID,key,[...members]);}
 await game.modules.get(ID).api.refreshAuras();ui.notifications.info('Zaktualizowano aurę i przypisane Undead.');
}
export async function scrollGift(item,opts={}){
 const a=item.actor;ensure(a);const c=await data(),spells=[...c.spells];
 for(const p of game.packs.filter(p=>p.documentName==='Item'&&p.metadata.packageName==='wfrp4e-core')){const index=await p.getIndex({fields:['type','system.lore.value']});for(const row of index.filter(i=>i.type==='spell'&&['death','necromancy'].includes(i.system?.lore?.value))){if(!spells.some(s=>en(s)===row.name)){const doc=await p.getDocument(row._id);spells.push(doc.toObject());}}}
 spells.sort((x,y)=>x.name.localeCompare(y.name,'en'));
 const choice=opts.spell||await foundry.applications.api.DialogV2.prompt({window:{title:'Nehekharan Scroll — wybierz zaklęcie'},position:{width:520},content:`<label>Zaklęcie<select name="spell" size="12" style="height:320px;width:100%">${spells.map((s,i)=>`<option value="${i}">${esc(s.name)}</option>`).join('')}</select></label>`,ok:{label:'Dodaj zwój',callback:(_e,b)=>b.form.elements.spell.value},rejectClose:false});
 if(choice===null||choice===undefined||choice==='')return;
 const source=spells.find(s=>s._id===choice||s.name===choice)||spells[Number(choice)];if(!source)throw Error('Nie znaleziono zaklęcia.');
 const spellName=en(source),existing=a.items.find(i=>meta(i).scrollGift===item.id&&meta(i).scrollSpell===spellName);if(existing){ui.notifications.info('Ten zwój znajduje się już w ekwipunku.');return;}
 const [scroll]=await a.createEmbeddedDocuments('Item',[{name:`Nehekharan Scroll (${spellName})`,type:'trapping',img:source.img,system:{trappingType:{value:'booksAndDocuments'},quantity:{value:1},description:{value:`<p>Zwój zawierający ${esc(spellName)}. Dopóki go posiadasz, możesz korzystać z zapisanego na nim zaklęcia.</p>`}},flags:{[ID]:{scrollGift:item.id,scrollSpell:spellName}}}],{skipExperienceChecks:true});
 if(!scroll)throw Error('Nie udało się utworzyć zwoju w Trappings.');
 const spell=fresh(source);spell.name=`(Nehekharan Scroll) ${spellName}`;spell.system.memorized={value:false};spell.flags={...spell.flags,[ID]:{...meta(spell),en:spellName,sourceScroll:scroll.id}};
 try{await a.createEmbeddedDocuments('Item',[spell],{skipExperienceChecks:true});await item.update({name:`Nehekharan Scroll (${spellName})`,[`flags.${ID}.specialization`]:spellName});}catch(e){await scroll.delete();throw e;}
}
export async function storm(item,opts={}){
 const a=item.actor;ensure(a);if(!canvas.ready)throw Error('Otwórz scenę, aby umieścić Summon Storm.');
 const hours=Math.max(1,a.system.characteristics.wp.bonus),units=String(canvas.scene.grid.units).toLowerCase(),radius=1760*(/^(m|meter|metre|metr)/.test(units)?0.9144:/^(ft|feet|foot|stop)/.test(units)?3:1);
 const doc=new CONFIG.MeasuredTemplate.documentClass({t:'circle',user:game.user.id,distance:radius,direction:0,x:0,y:0,fillColor:'#40364f',flags:{[ID]:{stormSource:a.uuid,expires:game.time.worldTime+hours*3600}}},{parent:canvas.scene});
 if(opts.position){doc.updateSource(opts.position);await canvas.scene.createEmbeddedDocuments('MeasuredTemplate',[doc.toObject()]);}
 else await new warhammer.apps.AreaTemplate(doc).drawPreview();
 await report(a,'Summon Storm',`<p>Obszar: promień 1 mili (1760 jardów). Czas trwania: ${hours} godzin. Środek obszaru określa znacznik na scenie. Testy ataków Ranged i Perception: −10. Lot jest niemożliwy. Chmury osłaniają przed Sunlight; usunięcie znacznika kończy burzę.</p>`);
}
export async function refreshStorms(){
 if(!canvas.ready||game.users.activeGM?.id!==game.user.id)return;
 const templates=canvas.scene.templates.filter(t=>meta(t).stormSource),active=[];
 for(const t of templates){const a=await fromUuid(meta(t).stormSource);if(meta(t).expires<=game.time.worldTime||!a||a.hasCondition('dead'))await t.delete();else active.push(t);}
 const tokens=canvas.tokens.placeables.filter(t=>t.actor),actors=new Map([...game.actors.filter(a=>a.effects.some(e=>meta(e).stormArea)),...tokens.map(t=>t.actor)].map(a=>[a.uuid,a]));
 for(const a of actors.values()){
  const affected=tokens.some(t=>t.actor.uuid===a.uuid&&active.some(d=>Math.hypot(t.center.x-d.x,t.center.y-d.y)/canvas.grid.size*canvas.scene.grid.distance<=d.distance));
  const old=a.effects.filter(e=>meta(e).stormArea);if(!affected){if(old.length)await a.deleteEmbeddedDocuments('ActiveEffect',old.map(e=>e.id));continue;}if(old.length)continue;
  await a.createEmbeddedDocuments('ActiveEffect',[{name:'Summon Storm',img:`modules/${ID}/assets/blood.svg`,flags:{[ID]:{stormArea:true}},system:{transferData:{type:'document',documentType:'Actor'},scriptData:[{label:'Summon Storm',trigger:'dialog',script:'if(args.weapon?.isRanged||args.item?.isRanged||args.skill?.name==="Perception")args.fields.modifier-=10;',options:{activateScript:'return true;'}}]}}]);
 }
}
export function cleanDescription(old,canonical,baselines,name){
 const stripLegacy=s=>name==='Blessed Weapons'?s.replace(/^<p class="cc-magical-weapons-rule">[\s\S]*?<\/p>/,''):s;
 const text=stripLegacy(old),baseline=baselines.map(stripLegacy).filter(Boolean).sort((a,b)=>b.length-a.length).find(s=>text.startsWith(s));
 // Match known module text only; keep personal additions and custom descriptions.
 return baseline!==undefined?canonical+text.slice(baseline.length):text.replace(/<details>\s*<summary>Tekst źródłowy[\s\S]*?<\/details>/g,'');
}
let migrationRun=Promise.resolve();
export function migrateRefinements(){return migrationRun=migrationRun.catch(()=>{}).then(migrateState);}
async function migrateState(){
 if(game.users.activeGM?.id!==game.user.id)return;
 const c=await data(),actors=new Map([...game.actors,...game.scenes.contents.flatMap(s=>s.tokens.map(t=>t.actor).filter(Boolean))].map(a=>[a.uuid,a]));
 const items=[...game.items,...[...actors.values()].flatMap(a=>[...a.items])];
 for(const item of items){
  const kind=meta(item).kind,category={gift:'gifts',weakness:'weaknesses',spell:'spells'}[kind],revision=kind==='gift'?'2.3.2':kind==='spell'?'2.3.3-native2':'2.3.3-native';
  if(!category||meta(item).revision===revision)continue;
  const source=c[category].find(i=>en(i)===en(item));if(!source)continue;
  const old=item.system.description.value,baselines=[c.migration230?.[en(item)]?.description,c.migration231?.[en(item)]?.description,c.migration232?.[en(item)]?.description].filter(s=>typeof s==='string');
  const description=cleanDescription(old,source.system.description.value,baselines,en(item));
  const obsolete=new Set([...(c.migration230?.[en(item)]?.effects||[]),...(c.migration231?.[en(item)]?.effects||[]),...(c.migration233?.[en(item)]?.effects||[])]),kept=new Set(source.effects.map(e=>e._id));
  const ids=item.effects.filter(e=>obsolete.has(e.id)&&!kept.has(e.id)).map(e=>e.id);if(ids.length)await item.deleteEmbeddedDocuments('ActiveEffect',ids,{render:false,ccMigration:true});
  if(kind==='spell')for(const raw of source.effects){const existing=item.effects.get(raw._id);if(existing)await existing.update(raw,{render:false,ccMigration:true});else await item.createEmbeddedDocuments('ActiveEffect',[raw],{render:false,ccMigration:true,keepId:true});}
  if(kind==='spell')for(const [key,values] of Object.entries(c.nativeSpellFields233?.[en(item)]||{}))if(item.system[key].value===values.old.value)await item.update({[`system.${key}.value`]:values.new.value},{render:false,ccMigration:true});
  if(kind==='spell'&&en(item)==='Curse of Years')await item.update({'system.overcast':source.system.overcast},{render:false,ccMigration:true});
  await item.update({'system.description.value':description,[`flags.${ID}.revision`]:revision},{render:false,ccMigration:true,skipExperienceChecks:true});
 }
 for(const a of actors.values()){
  const obsolete=a.effects.filter(e=>e.flags[ID]&&!e.changes.length&&e.system.scriptData.every(s=>!s.script?.trim())&&(
   e.name==='Hellish Vigour'&&meta(e).rerollMelee||e.name==='Curse of Years'&&meta(e).aged||
   e.name==='Life in Death'&&(meta(e).lifeInDeath||meta(e).possessionSource)||e.name==='Slave to Wraiths'&&meta(e).possessionSource||
   e.name==='Wraithly Shroud'&&meta(e).invisible||e.name==='Spirit Stalk'&&meta(e).spiritStalk));
  for(const e of obsolete.filter(e=>meta(e).spiritStalk)){const end=Number(e.duration.startTime)+Number(e.duration.seconds),items=a.items.filter(i=>en(i)==='Ethereal'&&meta(i).coreUuid&&meta(i).expires===end);if(items.length)await a.deleteEmbeddedDocuments('Item',items.map(i=>i.id));}
  if(obsolete.length)await a.deleteEmbeddedDocuments('ActiveEffect',obsolete.map(e=>e.id),{render:false,ccMigration:true});
  if(a.getFlag(ID,'barrierInvited')!==undefined)await a.unsetFlag(ID,'barrierInvited');
 }
 for(const a of actors.values())for(const e of a.effects.filter(e=>e.statuses.has('cc-compulsion'))){const level=Math.max(1,Number(e.conditionValue)||Number(meta(e).stacks)||1),command=meta(e).commandText||'Polecenie';await e.update({name:`Compulsion — ${command} (${level})`,statuses:[],duration:{seconds:3600,startTime:e.duration.startTime??game.time.worldTime},'system.condition':{value:null,numbered:false},[`flags.${ID}.compulsion`]:true,[`flags.${ID}.stacks`]:level,'system.scriptData':[{label:'Compulsion — rozstrzygnij',trigger:'manual',script:`return game.modules.get('${ID}').api.resolveCompulsion(this.effect);`,options:{}},{label:`Compulsion — ${command}`,trigger:'dialog',script:`args.fields.modifier-=${10*level};`,options:{activateScript:'return false;'}}]});}
 for(const journal of game.journal){const sourceId=meta(journal).sourceId||journal._stats.compendiumSource?.split('.').at(-1),source=c.journals.find(j=>j._id===sourceId);if(!source||meta(journal).archivedLayout)continue;
  for(const page of source.pages){const existing=journal.pages.get(page._id)||journal.pages.find(p=>p.name===page.name);if(!existing){await journal.createEmbeddedDocuments('JournalEntryPage',[fresh(page)]);continue;}
   const before=c.journalBaseline230?.[source._id]?.[page._id];if(before!==undefined&&existing.text.content===before&&before!==page.text.content)await existing.update({'text.content':page.text.content});
  }
 }
}
export function installRefinements(){
 Hooks.once('ready',()=>{game.modules.get(ID).api.resolveCompulsion=resolveCompulsion;});
 Hooks.once('ready',()=>migrateRefinements().catch(e=>ui.notifications.error(`Complete Counts: ${e.message}`)));
 Hooks.on('renderChatMessageHTML',(message,html)=>{
  html.addEventListener('click',async event=>{
   const link=event.target.closest('[data-action="clickTable"][data-table^="crit"]');if(!link)return;
   const opposed=message.system?.opposedTest,roll=message.system?.test,attacker=opposed?.attacker||roll?.actor;
   const victims=opposed?.defender?[opposed.defender]:(roll?.targetTokens||[]).map(t=>t.actor).filter(Boolean);
   const defender=victims.length===1?victims[0]:selected().length===1?selected()[0]:null;
   const piercing=attacker&&rank(attacker,'Piercing Strike'),mass=defender&&rank(defender,'Monstrous Mass');if(!piercing&&!mass)return;
   event.preventDefault();event.stopImmediatePropagation();
   try{const rolls=await Promise.all([new Roll('1d100').evaluate(),new Roll('1d100').evaluate()]);let value=mass?Math.min(...rolls.map(r=>r.total)):Math.max(...rolls.map(r=>r.total));
    if(mass&&piercing){const decision=await foundry.applications.api.DialogV2.prompt({window:{title:'Piercing Strike / Monstrous Mass'},content:`<p>Oba dary wpływają na ten Critical Wound. Ustal wynik z GM.</p><select name="roll">${rolls.map(r=>`<option value="${r.total}">${r.total}</option>`).join('')}</select>`,ok:{label:'Zastosuj',callback:(_e,b)=>Number(b.form.elements.roll.value)},rejectClose:false});if(decision===null)return;value=decision;}
    await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor:attacker||defender}),rolls,content:`<p>${piercing?'Piercing Strike':''}${piercing&&mass?' / ':''}${mass?'Monstrous Mass':''}: ${rolls.map(r=>r.total).join(' / ')}. Wybrano <strong>${value}</strong>.</p>`});
    const content=await game.wfrp4e.tables.formatChatRoll(link.dataset.table,{lookup:Math.max(1,value+(Number(link.dataset.modifier)||0)),hideDSN:true,messageId:message.id});if(content)await ChatMessage.create({content,speaker:ChatMessage.getSpeaker({actor:attacker||defender})});
   }catch(e){ui.notifications.error(e.message);}
  },true);
 });
 let stormQueue=Promise.resolve();for(const h of ['canvasReady','createToken','updateToken','deleteToken','createMeasuredTemplate','updateMeasuredTemplate','deleteMeasuredTemplate','updateWorldTime','createActiveEffect','deleteActiveEffect'])Hooks.on(h,()=>{stormQueue=stormQueue.then(refreshStorms).catch(e=>console.error('Complete Counts storm',e));});
 Hooks.on('renderChatMessageHTML',(message,html)=>{const button=html.querySelector('[data-cc-bait]');if(!button)return;button.addEventListener('click',async()=>{button.disabled=true;try{
  const info=message.getFlag(ID,'bait');if(!info)throw Error('Nie znaleziono udanego rzutu Bait.');const source=await fromUuid(info.source);ensure(source);const actors=selected();if(!actors.length)throw Error('Przed Apply wybierz tokeny Undead na scenie.');
  const origins=canvas.tokens.placeables.filter(t=>t.actor?.uuid===source.uuid),units=String(canvas.scene.grid.units).toLowerCase(),range=12*(/^(m|meter|metre|metr)/.test(units)?0.9144:/^(ft|feet|foot|stop)/.test(units)?3:1);
  for(const a of actors){ensure(a);if(!a.items.some(i=>en(i)==='Undead'))throw Error(`${a.name}: cel wymaga Undead.`);if(!canvas.tokens.placeables.some(t=>t.actor?.uuid===a.uuid&&origins.some(o=>Math.hypot(t.center.x-o.center.x,t.center.y-o.center.y)/canvas.grid.size*canvas.scene.grid.distance<=range)))throw Error(`${a.name}: poza zasięgiem Bait (12 jardów).`);}
  const applied=new Set(info.applied||[]);for(const a of actors){if(applied.has(a.uuid))continue;await a.createEmbeddedDocuments('ActiveEffect',[{name:'Bait',img:`modules/${ID}/assets/blood.svg`,flags:{[ID]:{baitMessage:message.id}},system:{transferData:{type:'document',documentType:'Actor'},scriptData:[{label:'Bait — następny Opposed Test',trigger:'dialog',script:`args.fields.modifier+=${10*info.rank};`,options:{activateScript:'return !!args.weapon || args.item?.type===\'weapon\' || !!args.item?.system?.rollable?.damage || !!this.actor.flags.oppose;',submissionScript:'this.effect.delete();'}}]}}]);applied.add(a.uuid);}
  await message.setFlag(ID,'bait',{...info,applied:[...applied]});ui.notifications.info('Bait zastosowano do wybranych Undead.');
 }catch(e){ui.notifications.error(e.message);}finally{button.disabled=false;}});});
 Hooks.on('deleteItem',async(item,_opts,user)=>{if(user!==game.user.id||!item.actor||!meta(item).scrollSpell)return;const ids=item.actor.items.filter(i=>meta(i).sourceScroll===item.id).map(i=>i.id);if(ids.length)await item.actor.deleteEmbeddedDocuments('Item',ids);});
 Hooks.on('updateItem',async(item,changes,_opts,user)=>{if(user!==game.user.id||en(item)!=='Diseased (Type)'||!meta(item).specialization)return;const name=`Diseased (${meta(item).specialization})`;if(item.name!==name)await item.update({name});});
 Hooks.on('createItem',async(item,_opts,user)=>{if(user!==game.user.id||!item.actor||en(item)!=='Diseased (Type)')return;let disease=meta(item).specialization||item.name.match(/^Diseased \((?!Type\))(.+)\)$/)?.[1];if(!disease)disease=await foundry.applications.api.DialogV2.prompt({window:{title:'Diseased — choroba'},content:'<label>Choroba<input name="disease" value="Scurvy Madness"></label>',ok:{label:'Wybierz',callback:(_e,b)=>b.form.elements.disease.value.trim()},rejectClose:false});if(disease)await item.update({name:`Diseased (${disease})`,[`flags.${ID}.specialization`]:disease});});
}
