import {suppressedBy,stormShelter} from './ndm.mjs';
import {ID,KEYS,integer,feeding,hungerDue,hungerResult,sunlight,shelter,transformValues,giftCost,giftLimit,allowedGift} from './rules.mjs';
const PATH=`modules/${ID}`;
let contentPromise, panelInstance;
const itemSources=new Map();
const copy=x=>foundry.utils.deepClone(x);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const data=()=>contentPromise??=fetch(`${PATH}/data/content.json`).then(r=>{if(!r.ok)throw Error('Nie udało się odczytać zawartości modułu.');return r.json();});
const meta=x=>x?.flags?.[ID]||{};
const en=x=>meta(x).en||x.name;
const owned=(a,n)=>a.items.find(i=>en(i)===n||i.name===n);
const rank=(a,n)=>a?.items?a.items.filter(i=>i.type==='talent'&&en(i)===n).reduce((v,i)=>v+(i.system.advances?.value||1),0):0;
const cv=(a,id)=>a.effects.find(e=>e.statuses.has(id))?.system.condition?.value||0;
const has=(a,id)=>a.effects.some(e=>e.statuses.has(id));
const state=a=>copy(a.getFlag(ID,'state')||{});
const ensure=a=>{if(!a?.isOwner)throw Error('Wybierz postać, do której masz uprawnienia właściciela.');return a;};
const assertVampire=a=>{ensure(a);if(!a.getFlag(ID,'vampire'))throw Error('Najpierw utwórz wampira lub wykonaj konwersję.');return a;};
const lock=new Set();
async function exclusive(a,fn){ensure(a);if(lock.has(a.uuid))throw Error('Poprzednia operacja na tej postaci jeszcze trwa.');lock.add(a.uuid);try{return await fn();}finally{lock.delete(a.uuid);}}
async function report(a,title,body){return ChatMessage.create({speaker:ChatMessage.getSpeaker({actor:a}),content:`<h3>${esc(title)}</h3>${body}`,whisper:game.settings.get(ID,'privateChat')?ChatMessage.getWhisperRecipients('GM').map(u=>u.id).concat(game.user.id):[]});}
async function setCondition(a,id,value){
  value=Math.max(0,Number(value)||0);const existing=a.effects.find(e=>e.statuses.has(id));
  if(!value){if(existing)await existing.delete();return;}
  if(existing){if(existing.system.condition?.numbered)await existing.update({'system.condition.value':value});return;}
  await a.addCondition(id,value);
}
async function test(a,skill,modifier=0){
  const key={Cool:'Cool',Endurance:'Endurance',Leadership:'Leadership',Intuition:'Intuition',Dodge:'Dodge',Charm:'Charm',Intimidate:'Intimidate'}[skill]||skill;
  const localized=game.i18n.localize(`NAME.${key}`);
  const found=a.items.find(i=>i.type==='skill'&&[skill,localized].includes(i.name));
  const t=found?await a.setupSkill(found,{skipTargets:true,fields:{difficulty:'challenging',modifier},appendTitle:' — Complete Counts'}):await a.setupCharacteristic(({Cool:'wp',Endurance:'t',Leadership:'fel',Intuition:'i',Dodge:'ag',Charm:'fel',Intimidate:'s'})[skill]||'wp',{skipTargets:true,fields:{difficulty:'challenging',modifier},appendTitle:` — ${skill} (brak umiejętności)`});
  if(!t) return null;await t.roll();return t;
}
function result(t){return {success:t.succeeded??t.result.outcome==='success',fumble:!!t.result.fumble,SL:Number(t.result.SL)||0,roll:Number(t.result.roll)||0};}
async function sourceItem(name,type){
  const norm=s=>s.toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
  const cacheKey=type+':'+name;if(itemSources.has(cacheKey))return copy(itemSources.get(cacheKey));
  const base=name.replace(/\s*\([^)]*\)\s*$/,'');
  const aliases={'Regeneration':'Regenerate','Ghastly Howl':'Ghostly Howl','Cold-blooded':'Cold Blooded','Tongue Attack':'Tongue Attack (Range)','Immunity to Psychology':'Immunity (Psychology)'};
  const localized=game.i18n.localize('NAME.'+(aliases[base]||base).replaceAll(' ',''));
  for(const p of game.packs.filter(p=>p.documentName==='Item'&&p.metadata.packageName!==ID).sort((a,b)=>Number(b.metadata.packageName==='wfrp4e-core')-Number(a.metadata.packageName==='wfrp4e-core'))){
    if(!p.visible&&!game.user.isGM)continue;
    const index=await p.getIndex();const found=index.find(i=>i.type===type&&norm(i.name)===norm(name))||index.find(i=>i.type===type&&norm(i.name)===norm(base))||index.find(i=>i.type===type&&norm(i.name)===norm(aliases[name]||''))||index.find(i=>i.type===type&&norm(i.name)===norm(localized));
    if(found){const obj=(await p.getDocument(found._id)).toObject();delete obj._id;delete obj.folder;delete obj.ownership;if(name!==base&&norm(found.name)===norm(base)){obj.name=name;if(obj.system.specification)obj.system.specification.value=name.match(/\(([^)]*)\)/)?.[1]||'';}itemSources.set(cacheKey,copy(obj));return obj;}
  }return null;
}
const skillChars={Athletics:'ag','Animal Care':'int','Charm Animal':'wp',Charm:'fel',Cool:'wp',Dodge:'ag',Endurance:'t',Entertain:'fel',Gossip:'fel',Haggle:'fel',Intimidate:'s',Intuition:'i',Leadership:'fel',Language:'int',Lore:'int',Melee:'ws',Perception:'i',Stealth:'ag',Channelling:'wp',Climb:'s',Track:'i',Navigation:'i','Outdoor Survival':'int','Sleight of Hand':'dex',Ride:'ag',Ranged:'bs',Gamble:'int',Evaluate:'int',Drive:'ag',Research:'int','Set Trap':'dex',Trade:'dex'};
async function skillItem(name,advances=0){
  const orig=await sourceItem(name,'skill');
  if(orig){orig.system.advances.value=advances;return orig;}
  const base=name.split(' (')[0];return {name,type:'skill',img:`${PATH}/assets/blood.svg`,system:{characteristic:{value:skillChars[base]||'int'},advanced:{value:['Language','Lore','Channelling','Ride','Trade','Ranged','Research','Set Trap','Sleight of Hand'].includes(base)?'adv':'bsc'},grouped:{value:name.includes('(')?'isSpec':'noSpec'},advances:{value:advances},description:{value:'Umiejętność wymieniona w Complete Counts. Specjalizacje „Any” wybierz zgodnie z podręcznikiem.'}}};
}
async function enrichTrait(item){
  const original=await sourceItem(en(item),'trait');if(!original)return item;
  const out=foundry.utils.mergeObject(original,item,{inplace:false});out.effects=original.effects||[];
  out.name=original.name;
  // Preserve printed total damage: core traits often add Strength automatically.
  if(item.system.rollable?.damage)out.system.rollable=copy(item.system.rollable);
  return out;
}
async function enrichActor(obj){
 for(const pack of game.packs.filter(p=>p.documentName==='Actor'&&p.metadata.packageName==='wfrp4e-core')){
  const index=await pack.getIndex(),row=index.find(i=>i.name===en(obj)||i.name===en(obj)+'s');if(!row)continue;
  const base=(await pack.getDocument(row._id)).toObject(),merged=foundry.utils.mergeObject(base,copy(obj),{inplace:false});
  merged.flags={...merged.flags,[ID]:{...meta(merged),baseActor:`Compendium.${pack.collection}.Actor.${row._id}`}};return merged;
 }return copy(obj);
}
const fresh=obj=>{obj=copy(obj);delete obj._id;delete obj.folder;delete obj.ownership;return obj;};
const specDefault=s=>({'Stealth':'Stealth (Urban)','Channelling':'Channelling (Dhar)','Language (Any)':'Language (Classical)','Lore (Any)':'Lore (History)','Melee (Any)':'Melee (Basic)','Entertain (Any)':'Entertain (Act)','Ranged (Any)':'Ranged (Bow)','Acute Sense (Any)':'Acute Sense (Hearing)','Strider (Any)':'Strider (Forests)','Savant (Any)':'Savant (Magic)','Hatred (Any)':'Hatred (Chaos)','Arcane Magic (Any)':'Arcane Magic (Necromancy)'}[s]||s);
async function importDocuments(kind){
  if(!game.user.isGM)throw Error('Import całych kompendiów wykonuje MG.');
  const c=await data(),map={gifts:['Item','Dary krwi'],spells:['Item','Zaklęcia'],weaknesses:['Item','Słabości'],careers:['Item','Profesje'],actors:['Actor','Bestiariusz'],tables:['RollTable','Tabele'],journals:['JournalEntry','Podręcznik']};
  const [type,label]=map[kind];const cls=getDocumentClass(type);const collection=game.collections.get(type);
  let folder=game.folders.find(f=>f.type===type&&f.getFlag(ID,'category')===kind);
  if(!folder)folder=await Folder.create({name:`Complete Counts — ${label}`,type,color:'#842c42',flags:{[ID]:{category:kind}}});
  let count=0;
  for(const source of c[kind]){
    if(collection.some(d=>d.getFlag(ID,'sourceId')===source._id))continue;
    let obj=kind==='actors'?await enrichActor(source):copy(source);obj=fresh(obj);obj.folder=folder.id;obj.flags[ID].sourceId=source._id;
    await cls.create(obj);count++;
  }
  ui.notifications.info(`Complete Counts: dodano ${count} dokumentów (${label}). Istniejące wpisy zachowano.`);
}
async function makeVampire({name,bloodline,career,gift,allocation,skillAdvances,talents,careerTalent,careerAdvances,careerSkills,specializations={},random=false}){
  if(!game.user.can('ACTOR_CREATE'))throw Error('Brak uprawnienia tworzenia postaci.');
  const c=await data(),b=c.bloodlines.find(b=>b.en===bloodline),car=c.careers.find(x=>x._id===career);
  if(!b||!car||!b.gifts.includes(gift))throw Error('Wybierz linię, profesję i dar z listy linii.');
  const rolls=random?await Promise.all(KEYS.map(async()=>{const r=await new Roll('2d10').evaluate();return r.total;})):allocation;
  if(rolls.length!==10||(!random&&(rolls.reduce((a,b)=>a+b,0)!==100||rolls.some(n=>n<4||n>18))))throw Error('Rozdziel dokładnie 100 punktów: 4–18 na każdą cechę.');
  const speciesSkills=['Dodge','Intimidate','Language (Any)','Melee (Basic)','Perception','Stealth',...b.skills];
  if(skillAdvances.length!==6||skillAdvances.some(x=>!speciesSkills.includes(x)))throw Error('Wybierz po trzy umiejętności do rozwinięcia o 5 i o 3.');
  if(new Set(skillAdvances.slice(0,3)).size!==3||new Set(skillAdvances.slice(3)).size!==3)throw Error('W każdej trójce wybierz różne umiejętności; trójki mogą się pokrywać.');
  if(careerAdvances.length!==5||careerAdvances.some(k=>!car.system.characteristics[k]))throw Error('Rozdziel 5 rozwinięć między cechy pierwszego poziomu profesji.');
  if(Object.values(careerSkills).reduce((a,b)=>a+integer(b,0,10),0)!==40)throw Error('Rozdziel 40 rozwinięć umiejętności profesji, maksymalnie 10 na jedną.');
  if(!car.system.talents.includes(careerTalent))throw Error('Wybierz talent profesji.');
  const chosen=[];for(const t of talents){if(/\(Any\)|Random Talents/i.test(t))throw Error('Zastąp „Any” i losowe talenty konkretnymi wyborami.');const src=await sourceItem(t,'talent');if(!src)throw Error(`Brak talentu „${t}” w dostępnych kompendiach. Wybierz konkretną specjalizację lub zaimportuj podręcznik podstawowy.`);chosen.push(src);}
  if(chosen.length!==5)throw Error('Wybierz pięć talentów linii krwi.');
  const actualCareerTalent=specializations[careerTalent]||careerTalent;
  if(/\(Any\)/i.test(actualCareerTalent))throw Error(`Wybierz specjalizację talentu ${careerTalent}.`);
  const ct=await sourceItem(actualCareerTalent,'talent');if(!ct)throw Error(`Brak talentu profesji ${actualCareerTalent}. Wczytaj bibliotekę podstawową.`);chosen.push(ct);
  const gi=[...new Set(['Natural Necromancer',b.en==='Necrarch'?'Walking Death':b.en==='Strigoi'?'Bloody Fury':'Pass for Human',gift])];
  chosen.push(...gi.map(g=>fresh(c.gifts.find(x=>en(x)===g))),...(b.typicalWeaknesses||b.weaknesses).slice(0,5).map(w=>fresh(c.weaknesses.find(x=>en(x)===w))));
  const totals={};skillAdvances.forEach((s,i)=>totals[s]=(totals[s]||0)+(i<3?5:3));for(const [s,v] of Object.entries(careerSkills))totals[s]=(totals[s]||0)+Number(v);
  const resolvedTotals={};for(const s of new Set([...speciesSkills,...car.system.skills])){const actual=specializations[s]||s;if(/\(Any\)/i.test(actual))throw Error(`Wybierz specjalizację: ${s}.`);resolvedTotals[actual]=(resolvedTotals[actual]||0)+(totals[s]||0);}
  for(const [s,v] of Object.entries(resolvedTotals))chosen.push(await skillItem(s,v));
  chosen.push({...fresh(car),system:{...copy(car.system),skills:car.system.skills.map(s=>specializations[s]||s),current:{value:true}}});
  for(const n of ['Bite','Claw','Dark Vision','Fear','Painless','Undead','Vampiric']){
    let t=await sourceItem(n==='Claw'?'Weapon':n,'trait');
    t=t||{name:n,type:'trait',img:`${PATH}/assets/blood.svg`,system:{description:{value:'Cecha początkowa wampira, Complete Counts s. 7.'}}};t.flags={...t.flags,[ID]:{kind:'baseTrait',en:n}};
    if(['Bite','Claw'].includes(n)){t.name=n==='Claw'?'Claw':t.name;t.system.specification={value:'3'};t.system.rollable={value:true,damage:true,rollCharacteristic:'ws',bonusCharacteristic:'s',attackType:'melee',skill:n==='Claw'?'Melee (Brawling)':''};}
    if(n==='Fear')t.system.specification={value:'1'};chosen.push(t);
  }
  if(['Necrarch','Strigoi'].includes(b.en)){const n=b.en==='Necrarch'?'Animosity (The Living)':'Animosity (Other Bloodlines)';const t=await sourceItem(n,'psychology')||await sourceItem(n,'trait')||{name:n,type:'trait',system:{description:{value:'Niechęć przyznana przez linię krwi, Complete Counts s. 6.'}}};chosen.push(t);}
  const trappings=[...b.trappings,...car.system.trappings];for(const t of trappings){const src=await sourceItem(t,'trapping')||await sourceItem(t,'weapon')||await sourceItem(t,'armour');if(src)chosen.push(src);}
  const obj={name:name||'Młody wampir',type:'character',img:`${PATH}/assets/blood.svg`,system:{characteristics:Object.fromEntries(KEYS.map((k,i)=>[k,{initial:b.bases[i]+rolls[i],advances:careerAdvances.filter(x=>x===k).length}])),details:{species:{value:'human'},move:{value:6},experience:{total:random?50:0,spent:0},biography:{value:`<p>Wampir: ${esc(b.pl)}. Complete Counts, s. 2–14.</p><p>Wyposażenie do sprawdzenia: ${esc(trappings.join(', '))}. Nierozpoznane wpisy (np. słudzy i majątki) są zobowiązaniami fabularnymi.</p>`}},status:{fate:{value:0},fortune:{value:0},resilience:{value:4},resolve:{value:4}}},items:chosen,flags:{[ID]:{vampire:true,bloodline:b.en,bloodThirst:true,vampireRank:'Newborn',state:{age:1,intervals:0,credit:0,preferredLevels:1}}},prototypeToken:{actorLink:true,texture:{src:`${PATH}/assets/blood.svg`}}};
  const a=await Actor.create(obj);await a.update({'system.status.wounds.value':a.system.status.wounds.max});await syncPassive(a);a.sheet.render(true);return a;
}
async function feed(a,blood,{donor=null}={}){assertVampire(a);return exclusive(a,async()=>{
  blood=integer(blood,1);if(donor){ensure(donor);if(donor.uuid===a.uuid)throw Error('Nie można karmić się własną krwią.');if(donor.system.status.wounds.value<blood)throw Error('Dawca nie ma tylu Ran.');}
  let healthyMax=a.system.status.wounds.max;
  if(cv(a,'cc-hungry')&&a.system.autoCalc.wounds){const preview=a.toObject();delete preview._id;preview.effects=preview.effects.filter(e=>!e.statuses?.includes('cc-hungry'));const model=new CONFIG.Actor.documentClass(preview);healthyMax=model.system.computeWounds();}
  const s=state(a),before={wounds:Math.min(healthyMax,a.system.status.wounds.value+(s.healingReserve||0)),max:healthyMax,unconscious:has(a,'unconscious'),stunned:cv(a,'stunned'),bleeding:cv(a,'bleeding'),fatigued:Math.max(0,cv(a,'fatigued')-(s.protectedFatigue||0)),hungry:cv(a,'cc-hungry'),ravenous:has(a,'cc-ravenous'),credit:s.credit||0,intervals:s.intervals||0};
  const r=feeding(before,blood);
  if(donor)await donor.update({'system.status.wounds.value':donor.system.status.wounds.value-blood});
  // Direct condition adjustment avoids ordinary mortal fatigue on resolving Bleeding.
  for(const [k,id] of Object.entries({unconscious:'unconscious',stunned:'stunned',bleeding:'bleeding',fatigued:'fatigued',hungry:'cc-hungry',ravenous:'cc-ravenous'}))await setCondition(a,id,k==='fatigued'?r.state[k]+(s.protectedFatigue||0):Number(r.state[k]));
  const nowMax=a.system.autoCalc.wounds?a.system.computeWounds():a.system.status.wounds.max;
  await a.update({'system.status.wounds.max':nowMax,'system.status.wounds.value':Math.min(nowMax,r.state.wounds),[`flags.${ID}.state`]:{...s,credit:r.state.credit,intervals:r.state.intervals,healingReserve:Math.max(0,r.state.wounds-nowMax)}});
  await report(a,'Karmienie',`<p>Wypito ${blood} Ran krwi${donor?` od ${esc(donor.name)}`:''}. ${r.satiated?'Głód został zaspokojony.':'To nie był jeszcze pełny posiłek.'}</p><p>Żywotność: ${r.state.wounds}/${r.state.max}; Głód: ${r.state.hungry}. Nadwyżka: ${r.left}. Odtwarzanie kończyn i pancerza rozlicza MG osobno.</p>`);return r;
});}
async function interval(a){return report(a,'Głód','<p>Wiek i interwały rozliczacie ręcznie. Stany zmieniaj w Effects.</p>');}
async function sun(a,minutes,overcast=false){assertVampire(a);return exclusive(a,async()=>{
  if(suppressedBy(a,'Sunlight')||stormShelter(a))return report(a,'Sunlight','<p>Ochrona przed Sunlight jest aktywna.</p>');
  if(!owned(a,'Sunlight'))return report(a,'Sunlight','<p>Postać nie ma słabości Sunlight.</p>');
  const s=state(a),r=sunlight(cv(a,'cc-sun-poisoned'),minutes,overcast,s[overcast?'cloudRemainder':'sunRemainder']||0);
  await setCondition(a,'cc-sun-poisoned',r.value);if(r.broken)await a.addCondition('broken');
  await a.setFlag(ID,'state',{...s,[overcast?'cloudRemainder':'sunRemainder']:r.remainder,shadeRemainder:0});
  await report(a,'Światło słoneczne',`<p>Dodano ${r.added} Zatruć słonecznych. Łącznie: ${r.value}. Stan zadaje obrażenia jak Zatrucie. Po każdym otrzymaniu obrażeń wykonaj przycisk „Obrażenia słoneczne: test”, aby rozstrzygnąć Podpalenie. Najpierw rozstrzygnij Wbrew świtowi, jeśli posiadasz dar.</p>`);
});}
async function shade(a,minutes){assertVampire(a);return exclusive(a,async()=>{const s=state(a),r=shelter(cv(a,'cc-sun-poisoned'),Number(minutes),s.shadeRemainder||0);await setCondition(a,'cc-sun-poisoned',r.value);await a.setFlag(ID,'state',{...s,inShelter:false,shadeRemainder:r.remainder,sunRemainder:0,cloudRemainder:0});await report(a,'Schronienie',`<p>Rozliczono ${Number(minutes)} minut. Usunięto ${r.removed} poziomów Zatrucia słonecznego; pozostało ${r.value}. Do kolejnego poziomu zachowano ${r.remainder} minut.</p>`);});}
async function leaveShelter(a){ensure(a);await a.setFlag(ID,'state',{...state(a),inShelter:false});}
async function shelterTick(){} // Retained only for compatibility; shelter is manual.
async function sunlightDamageTest(a){assertVampire(a);const t=await test(a,'Endurance');if(t&&!result(t).success)await a.addCondition('ablaze');}
async function buyGift(a,giftId,{inCareer=true,specialization=''}={}){assertVampire(a);return exclusive(a,async()=>{
  const c=await data(),g=c.gifts.find(g=>g._id===giftId);if(!g)throw Error('Nieznany dar.');const n=en(g),r=rank(a,n),s=state(a);
  const max=g.system.max.value;const cap=/^\d+$/.test(max)?Number(max):a.system.characteristics[max]?.bonus||1;
  if(n==='Nehekharan Scroll (Spell)'||n==='Swarm Form (Type)'||n==='Diseased (Type)'){if(!specialization.trim())throw Error('Podaj zaklęcie, rodzaj roju albo chorobę w polu specjalizacji.');}
  const existing=a.items.find(i=>i.type==='talent'&&en(i)===n&&(!specialization||String(meta(i).specialization||'').trim().toLowerCase()===specialization.trim().toLowerCase()));const current=existing?.system.advances.value||0;
  if(current>=cap)throw Error('Osiągnięto limit tego daru.');
  if(n==='Iron Sinews'&&a.type==='character'&&current>=1&&!game.user.isGM){const required=current===1?'Count':'Lord',ranks=['Newborn','Thrall','Count','Lord'];if(ranks.indexOf(a.getFlag(ID,'vampireRank')||'Newborn')<ranks.indexOf(required))throw Error(`Ten poziom Iron Sinews wymaga ${required} albo zakupu zatwierdzonego przez GM.`);}
  const error=allowedGift(n,a.items.map(en),game.settings.get(ID,'minimumFourWeaknesses')?effectiveWeaknesses(a):99);if(error)throw Error(error);
  if(a.type!=='character'){
    if(existing)await existing.update({'system.advances.value':current+1},{skipExperienceChecks:true});
    else{const d=fresh(g);if(specialization){d.name+=` — ${specialization}`;d.flags[ID].specialization=specialization;}await a.createEmbeddedDocuments('Item',[d],{skipExperienceChecks:true});}
    await syncPassive(a);return report(a,'Blood Gift',`<p>${esc(g.name)} dodany do NPC bez wydawania PD.</p>`);
  }
  const talents=a.items.filter(i=>i.type==='talent'&&!['gift','weakness'].includes(meta(i).kind)).reduce((v,i)=>v+i.system.advances.value,0),total=a.items.filter(i=>meta(i).kind==='gift').reduce((v,i)=>v+i.system.advances.value,0);
  if(total>=giftLimit(talents,s.preferredLevels||1))throw Error('Limit darów względem talentów i preferowanych poziomów profesji został osiągnięty.');
  const career=a.items.find(i=>i.type==='career'&&i.system.current.value),listed=meta(career).gifts||c.alternatives.find(x=>x.en===meta(career).group&&x.level===career.system.level.value)?.gifts||[];
  const actualInCareer=listed.includes(n);const cost=giftCost(current,actualInCareer);
  const xp=a.system.details.experience;if(xp.total-xp.spent<cost)throw Error(`Brak PD. Koszt: ${cost}.`);
  if(existing)await existing.update({'system.advances.value':current+1},{skipExperienceChecks:true});else{const d=fresh(g);if(specialization){d.name+=` — ${specialization}`;d.flags[ID].specialization=specialization;}await a.createEmbeddedDocuments('Item',[d],{skipExperienceChecks:true});}
  await a.update({'system.details.experience.spent':xp.spent+cost,'system.details.experience.log':a.system.addToExpLog(cost,`Complete Counts: ${g.name}`,xp.spent+cost,xp.total)},{skipExperienceChecks:true});
  // syncTraits adds newly purchased Dark Fate points once.
  await syncPassive(a);await report(a,'Zakup daru',`<p>${esc(g.name)}: ${cost} PD. ${actualInCareer?'Dar bieżącej profesji.':'Dar spoza bieżącej profesji — podwójny koszt.'}</p>`);
});}
function effectiveWeaknesses(a){return a.items.filter(i=>meta(i).kind==='weakness'&&!suppressedBy(a,en(i))).length;}
const traitGifts={'Belligerent':'Belligerent','Bloody Fury':'Fury','Chill Presence':'Chill Grasp','Cold-blooded':'Cold-blooded','Corrosive Blood':'Corrosive Blood',"Devil's Cry":'Ghostly Howl','Slow Death':'Infected','Stench':'Distracting','Undying':'Die Hard','Unholy Regeneration':'Regeneration','Vomit':'Vomit','Walking as the Wind':'Hoverer','Wallcrawler':'Wallcrawler'};
async function syncPassive(a){
  return game.modules.get(ID).api.syncTraits(a);
}
async function legacySyncPassive(a){
  ensure(a);const c=await data();let wanted=[];
  if(rank(a,'Dark Fate')&&!a.getFlag(ID,'darkFate'))await a.setFlag(ID,'darkFate',{fate:rank(a,'Dark Fate'),fortune:rank(a,'Dark Fate')});
  for(const [gift,trait] of Object.entries(traitGifts))if(owned(a,gift))wanted.push([trait,'']);
  if(owned(a,'Wings'))wanted.push(['Flight',String(2*a.system.details.move.value)]);
  if(owned(a,'Armoured Flesh'))wanted.push(['Armour',String(rank(a,'Armoured Flesh'))]);
  if(owned(a,'Venomous Bile'))wanted.push(['Venom',['Challenging','Difficult','Hard'][rank(a,'Venomous Bile')-1]]);
  if(rank(a,'Monstrous Mass')>=2)wanted.push(['Painless','']);
  const managed=a.items.filter(i=>meta(i).generated);for(const i of managed){if(!wanted.some(([n])=>n===en(i)))await i.delete();}
  for(const [n,v] of wanted){const ex=owned(a,n);if(ex){if(meta(ex).generated&&ex.system.specification.value!==v)await ex.update({'system.specification.value':v});continue;}let t=await sourceItem(n,'trait')||{name:n,type:'trait',system:{description:{value:'Cecha przyznana przez dar krwi. Pełne zasady w podręczniku podstawowym.'}}};t.flags={...t.flags,[ID]:{en:n,generated:true}};t.system.specification={value:v};await a.createEmbeddedDocuments('Item',[t]);}
}
function formTokens(a){if(a.isToken)return a.token?[a.token]:[];return game.scenes.contents.flatMap(s=>s.tokens.contents.filter(t=>t.actorId===a.id&&t.actorLink));}
async function transform(a,formName){assertVampire(a);return exclusive(a,async()=>{
  if(a.getFlag(ID,'humanForm')||a.getFlag(ID,'spiritForm'))throw Error('Najpierw zakończ obecną przemianę.');
  const stored=a.getFlag(ID,'transformation');if(stored)throw Error('Najpierw wróć do poprzedniej postaci.');
  const c=await data(),form=c.actors.find(x=>en(x)===formName);if(!form)throw Error('Nieznana postać.');
  const required={'Doom Wolf':'Wolf Form','Vampire Bat':'Bat Form','Vampire Familiar':'Familiar Form'}[formName];if(!owned(a,required))throw Error(`Brak daru ${required}.`);
  const own=Object.fromEntries(KEYS.map(k=>[k,a.system.characteristics[k].value])),base=Object.fromEntries(KEYS.map(k=>[k,form.system.characteristics[k].initial]));
  const values=transformValues(own,base,{familiar:formName==='Vampire Familiar',bat:formName==='Vampire Bat'});
  const changes=KEYS.map(k=>({key:`system.characteristics.${k}.modifier`,mode:2,value:String(values[k]-own[k]),priority:25}));
  changes.push({key:'system.details.move.value',mode:5,value:String(form.system.details.move.value),priority:25});
  const tokens=formTokens(a),art=a.getFlag(ID,'formArt')?.[formName]||form.prototypeToken?.texture?.src||form.img;
  if(tokens.some(t=>!t.isOwner))throw Error('Nie masz uprawnień do zmiany wszystkich tokenów tej postaci. Przemianę wykonuje MG.');
  await a.setFlag(ID,'transformation',{form:formName,token:a.prototypeToken.texture.src,ring:a.prototypeToken.ring?.subject?.texture||'',tokens:tokens.map(t=>({uuid:t.uuid,src:t.texture.src,ring:t.ring?.subject?.texture||''})),started:game.time.worldTime});
  await a.createEmbeddedDocuments('ActiveEffect',[{name:`Przemiana: ${form.name}`,img:`${PATH}/assets/beast.svg`,changes,flags:{[ID]:{transformation:true}},system:{transferData:{type:'document',documentType:'Actor'},scriptData:[]}}]);
  const its=[];for(const t of form.items){if(['Bestial'].includes(en(t))||owned(a,en(t)))continue;const d=fresh(await enrichTrait(t));d.flags[ID].transformation=true;its.push(d);}if(its.length)await a.createEmbeddedDocuments('Item',its);
  await a.update({prototypeToken:{texture:{src:art},...(a.prototypeToken.ring?.enabled?{ring:{subject:{texture:art}}}:{})}});for(const t of tokens)await t.update({texture:{src:art},...(t.ring?.enabled?{ring:{subject:{texture:art}}}:{})},{animate:false});await report(a,'Przemiana',`<p>${esc(form.name)}. Umiejętności i talenty zachowane; ograniczenia anatomii ocenia MG. Rany i wyposażenie pozostają na karcie. Przemiana nie usuwa zawartości ekwipunku.</p>`);
});}
async function revert(a){assertVampire(a);if(a.getFlag(ID,'spiritForm'))return game.modules.get(ID).api.revertSpirit(a);return exclusive(a,async()=>{const s=a.getFlag(ID,'transformation');if(!s)return;const effects=a.effects.filter(e=>meta(e).transformation).map(e=>e.id),items=a.items.filter(i=>meta(i).transformation).map(i=>i.id);if(effects.length)await a.deleteEmbeddedDocuments('ActiveEffect',effects);if(items.length)await a.deleteEmbeddedDocuments('Item',items);await a.update({prototypeToken:{texture:{src:s.token},...(s.ring!==undefined?{ring:{subject:{texture:s.ring}}}:{})}});for(const t of formTokens(a)){const saved=s.tokens?.find(x=>x.uuid===t.uuid);await t.update({texture:{src:saved?.src||s.token},...(saved?.ring!==undefined?{ring:{subject:{texture:saved.ring}}}:{})},{animate:false});}await a.unsetFlag(ID,'transformation');});}
async function applyHumanArt(a){
 if(a.getFlag(ID,'humanTokenArt')===false||a.getFlag(ID,'humanAppearance'))return;
 const tokenArt=a.getFlag(ID,'formArt')?.['Pass for Human']??a.getFlag(ID,'formPortraits')?.['Pass for Human'];if(!tokenArt)return;
 const tokens=formTokens(a);if(tokens.some(t=>!t.isOwner))throw Error('Zmianę tokenów wykonuje ich właściciel lub MG.');
 await a.setFlag(ID,'humanAppearance',{token:a.prototypeToken.texture.src,ring:a.prototypeToken.ring?.subject?.texture||'',tokens:tokens.map(t=>({uuid:t.uuid,src:t.texture.src,ring:t.ring?.subject?.texture||''}))});
 
 if(tokenArt){await a.update({prototypeToken:{texture:{src:tokenArt},...(a.prototypeToken.ring?.enabled?{ring:{subject:{texture:tokenArt}}}:{})}});for(const t of tokens)await t.update({texture:{src:tokenArt},...(t.ring?.enabled?{ring:{subject:{texture:tokenArt}}}:{})},{animate:false});}
}
async function restoreHumanArt(a){const s=a.getFlag(ID,'humanAppearance');if(!s)return;await a.update({prototypeToken:{texture:{src:s.token},ring:{subject:{texture:s.ring}}}});for(const t of formTokens(a)){const old=s.tokens.find(x=>x.uuid===t.uuid);await t.update({texture:{src:old?.src||s.token},ring:{subject:{texture:old?.ring||''}}},{animate:false});}await a.unsetFlag(ID,'humanAppearance');}
async function setHumanTokenArt(a,enabled){
 ensure(a);assertVampire(a);
 if(!owned(a,'Pass for Human'))throw Error('Brak daru Pass for Human.');
 return exclusive(a,async()=>{
  await a.setFlag(ID,'humanTokenArt',!!enabled);
  if(a.getFlag(ID,'humanForm')){
   if(enabled)await applyHumanArt(a);else await restoreHumanArt(a);
  }
 });
}
async function toggleHuman(a){if(a.getFlag(ID,'transformation')||a.getFlag(ID,'spiritForm'))throw Error('Najpierw zakończ przemianę w istotę.');assertVampire(a);if(!owned(a,'Pass for Human'))throw Error('Brak daru Udawanie człowieka.');const s=a.getFlag(ID,'humanForm');if(s){for(const [id,disabled] of Object.entries(s))if(a.items.has(id))await a.items.get(id).update({'system.disabled':disabled});await restoreHumanArt(a);await a.unsetFlag(ID,'humanForm');}else{await applyHumanArt(a);const saved={};for(const t of a.items.filter(i=>['Fear','Terror'].includes(en(i)))){saved[t.id]=t.system.disabled;await t.update({'system.disabled':true});}await a.setFlag(ID,'humanForm',saved);}await report(a,'Ludzka powierzchowność',`<p>${s?'Przywrócono':'Ukryto'} Strach i Grozę. Wygląd, pazury i rozmiar przedstaw zgodnie z opisem daru.</p>`);}
async function alternateCareer(a,alternate,level){ensure(a);const c=await data(),entry=c.alternatives.find(x=>x.en===alternate&&x.level===Number(level));if(!entry)throw Error('Brak wariantu w źródle.');const base=alternate.replace(/^Vampire /,'');let original=null;
  for(const p of game.packs.filter(p=>p.documentName==='Item'&&p.metadata.packageName!==ID).sort((a,b)=>Number(b.metadata.packageName==='wfrp4e-core')-Number(a.metadata.packageName==='wfrp4e-core'))){const docs=await p.getIndex({fields:['system.careergroup.value','system.level.value']});const row=docs.find(x=>x.type==='career'&&x.system?.careergroup?.value===base&&x.system?.level?.value===Number(level));if(row){original=(await p.getDocument(row._id)).toObject();break;}}
  if(!original)throw Error(`Nie znaleziono ${base}, poziom ${level}, w posiadanych kompendiach. Zaimportuj właściwą profesję z podręcznika.`);
  original=fresh(original);original.name=`Vampire ${original.name}`;original.flags={...original.flags,[ID]:{en:alternate,group:alternate,gifts:entry.gifts,kind:'career'}};
  const swaps={Pray:'Channelling (Dhar)','Lore (Theology)':'Language (Magick)','Bless (Divine Lore)':'Petty Magic','Invoke (Divine Lore)':'Arcane Magic (Necromancy)','Holy Hatred':'Hatred (Cultists)','Holy Visions':'Sixth Sense','Pure Soul':'Strong-minded','Etiquette (Cultists)':'Cat-tongued','Savant (Theology)':'Savant (Necromancy)'};
  for(const k of ['skills','talents'])original.system[k]=original.system[k].map(x=>swaps[x]||x);original.system.current.value=false;await a.createEmbeddedDocuments('Item',[original]);
}
function registerConditions(){
 const cfg=game.wfrp4e.config;
 const descriptions={
  'cc-hungry':'<h3>Hungry</h3><p>Każdy poziom daje −10 do Willpower (Siła Woli) i Fellowship (Ogłada). Resolve nie usuwa tego stanu. Przy pięciu poziomach otrzymujesz Ravenous.</p><p>Karmienie usuwa Hungry po odzyskaniu Ran; Ravenous usuwa się na końcu.</p>',
  'cc-ravenous':'<h3>Ravenous</h3><p>Działa jak Frenzy: +1 do Strength Bonus, dodatkowy Melee Test jako akcja darmowa raz na rundę oraz odporność na pozostałą Psychologię. Premia nie kumuluje się z aktywnym Frenzy.</p><p>Zbliżasz się do żywej ofiary i atakujesz; nie uciekasz ani nie wycofujesz się. Ofiarą może być również sojusznik. Pijesz do zaspokojenia głodu. Ravenous usuwa się jako ostatni stan podczas karmienia.</p>',
  'cc-compulsion':'<h3>Compulsion</h3><p>Każdy poziom daje −10 do testów niesłużących wykonaniu polecenia. Wykonanie zadania usuwa Compulsion, daje jeden Fatigued i przywraca jeden Resolve.</p><p>Po godzinie niewykonane polecenie wygasa, powodując po jednym Fatigued za poziom Compulsion. Polecenia samobójcze lub skrajnie szkodliwe pozwalają na dodatkowy opór według decyzji MG.</p>',
  'cc-sun-poisoned':'<h3>Sun-Poisoned</h3><p>Zatrucie wywołane słabością Sunlight. Każdy poziom daje −10 do testów i utratę 1 Rany na końcu rundy, bez redukcji przez pancerz i Toughness Bonus.</p><p>Po obrażeniach słonecznych wykonaj Challenging (+0) Endurance Test — porażka daje Ablaze. Każde pełne 10 minut schronienia usuwa jeden poziom. Czas pobytu wpisujesz ręcznie.</p><p>Kliknij nazwę, aby wykonać test Endurance. Lewy klik licznika zwiększa poziom, prawy go zmniejsza.</p>'
 };
 const defs=[['cc-hungry','Hungry',true],['cc-ravenous','Ravenous',false],['cc-sun-poisoned','Sun-Poisoned',true]];
 for(const [id,name,numbered] of defs){
  cfg.conditions[id]=name;cfg.conditionDescriptions[id]=descriptions[id];
  let e=id==='cc-sun-poisoned'?copy(cfg.statusEffects.find(x=>x.id==='poisoned')):{img:`${PATH}/assets/blood.svg`,system:{transferData:{type:'document',documentType:'Actor'},scriptData:[]}};
  e.id=id;e.name=name;e.statuses=[id];e.description=descriptions[id];e.system.condition={...e.system.condition,value:numbered?1:null,numbered};e.flags={...e.flags,[ID]:{condition:true}};
  if(id==='cc-hungry')e.system.scriptData=[{label:name,trigger:'prePrepareData',script:'const n=this.effect.conditionValue||0; args.actor.system.characteristics.wp.modifier-=10*n; args.actor.system.characteristics.fel.modifier-=10*n;'}];
  if(id==='cc-ravenous'){
   const coreFrenzy=cfg.effectScripts['91S2GnBFYFbxmOCK'];
   if(!coreFrenzy)throw Error('Brak skryptu Frenzy w systemie WFRP4e.');
   e.system.scriptData=[{label:'Ravenous — Frenzy',trigger:'computeCharacteristics',script:`const core=game.wfrp4e.config.effectScripts['91S2GnBFYFbxmOCK'];
const candidates=[...this.actor.effects,...this.actor.items.contents.flatMap(i=>i.system.disabled?[]:i.effects.contents)];
const already=candidates.some(e=>e.uuid!==this.effect.uuid&&!e._source.disabled&&e._source.system?.scriptData?.some(s=>s.trigger==='computeCharacteristics'&&(s.script===('[Script.'+'91S2GnBFYFbxmOCK]')||s.script===core)));
if(!already){${coreFrenzy}}`}];
  }
  if(id==='cc-compulsion')e.system.scriptData=[{label:name,trigger:'dialog',script:'args.fields.modifier-=10*(this.effect.conditionValue||1);',options:{activateScript:'return false;'}}];
  for(const list of new Set([cfg.statusEffects,CONFIG.statusEffects])){const old=list.findIndex(x=>x.id===id);if(old>=0)list.splice(old,1);const dead=list.findIndex(x=>x.id==='dead');list.splice(dead<0?list.length:dead,0,copy(e));}
 }
}
let migration204;
function migrate204(){return migration204??=(migrateActors204().finally(()=>{migration204=null;}));}
async function migrateActors204(){
 if(!game.user.isGM||game.users.activeGM?.id!==game.user.id)return;
 const actors=new Map(game.actors.map(a=>[a.uuid,a]));for(const scene of game.scenes)for(const t of scene.tokens)if(t.actor)actors.set(t.actor.uuid,t.actor);
 const spellIcon='modules/wfrp4e-core/icons/spells/necromancy.png';
 const itemUpdate=i=>{
  const update={_id:i.id};
  if(i.type==='spell'&&meta(i).kind==='spell'&&i.img!==spellIcon)update.img=spellIcon;
  if(i.type==='weapon'&&i.system.qualities.value.some(q=>q.name==='blessed')){
   const qualities=copy(i.system.qualities.value).filter(q=>q.name!=='blessed');if(!qualities.some(q=>q.name==='magical'))qualities.push({name:'magical'});update['system.qualities.value']=qualities;
  }
  return Object.keys(update).length>1?update:null;
 };
 const worldUpdates=game.items.map(itemUpdate).filter(Boolean);if(worldUpdates.length)await Item.updateDocuments(worldUpdates);
 for(const a of actors.values()){
  const updates=a.items.map(itemUpdate).filter(Boolean);if(updates.length)await a.updateEmbeddedDocuments('Item',updates);
  if(a.getFlag(ID,'vampire'))await game.modules.get(ID).api.syncNature?.(a);
  const ids=a.items.filter(i=>i.flags[ID]&&['Age',"Night's Curse"].includes(en(i))).map(i=>i.id);if(ids.length)await a.deleteEmbeddedDocuments('Item',ids);
  for(const e of a.effects){const id=[...e.statuses].find(x=>x.startsWith('cc-'));const def=game.wfrp4e.config.statusEffects.find(x=>x.id===id);if(!def)continue;const value=e.system.condition.value??e.getFlag('wfrp4e','value')??1;
   if(e.name!==def.name||e.system.condition.numbered!==def.system.condition.numbered)await e.update({name:def.name,'system.condition.numbered':def.system.condition.numbered,'system.condition.value':def.system.condition.numbered?Math.max(1,Number(value)||1):null});
   if(id==='cc-ravenous'&&JSON.stringify(e.system.scriptData.map(s=>s.script))!==JSON.stringify(def.system.scriptData.map(s=>s.script)))await e.update({'system.scriptData':copy(def.system.scriptData),description:def.description});
  }
 }
}
async function updateJournals(){
 if(!game.user.isGM||game.users.activeGM?.id!==game.user.id)return;
 const c=await data();
 const sourceId=journal=>journal.getFlag(ID,'sourceId')||((journal._stats?.compendiumSource||'').startsWith(`Compendium.${ID}.journals.`)?journal._stats.compendiumSource.split('.').at(-1):null);
 const previous=game.journal.filter(j=>c.journalReorganization?.legacy[sourceId(j)]&&!j.getFlag(ID,'archivedLayout'));
 if(!previous.length)return;
 let folder=game.folders.find(f=>f.type==='JournalEntry'&&f.getFlag(ID,'category')==='journals');
 if(!folder)folder=await Folder.create({name:'Complete Counts — Podręcznik',type:'JournalEntry',color:'#842c42',sorting:'m',flags:{[ID]:{category:'journals'}}});
 // Create the replacement books before moving any existing document. Original IDs,
 // permissions and handwritten notes remain intact in the archive.
 for(const source of c.journals){
  if(game.journal.some(j=>sourceId(j)===source._id))continue;
  const obj=fresh(source);obj.folder=folder.id;obj.flags[ID].sourceId=source._id;
  await JournalEntry.create(obj);
 }
 let archive=game.folders.find(f=>f.type==='JournalEntry'&&f.getFlag(ID,'category')==='journal-archive');
 if(!archive)archive=await Folder.create({name:'Archiwum — poprzedni układ',type:'JournalEntry',folder:folder.id,color:'#605650',flags:{[ID]:{category:'journal-archive'}}});
 await JournalEntry.updateDocuments(previous.map(j=>({_id:j.id,folder:archive.id,[`flags.${ID}.archivedLayout`]:'2.2.0'})));
 ui.notifications.info('Complete Counts: dzienniki uporządkowano w trzy księgi. Poprzednie wpisy i własne notatki zachowano w archiwum.');
}
Hooks.once('init',()=>{
  game.modules.get(ID).api={passive};
  game.settings.register(ID,'privateChat',{name:'Wyniki tylko dla MG i wykonującego',hint:'Dotyczy komunikatów modułu; widoczność rzutów testowych ustala system.',scope:'world',config:true,type:Boolean,default:true});
});
Hooks.once('ready',()=>{
  if(game.system.id!=='wfrp4e')return;
  registerConditions();migrate204().then(updateJournals).catch(e=>console.error('Complete Counts migration',e));Object.assign(game.modules.get(ID).api,{openPanel,data,makeVampire,feed,interval,sun,shade,leaveShelter,shelterTick,migrate204,updateJournals,sunlightDamageTest,buyGift,transform,revert,toggleHuman,setHumanTokenArt,syncPassive,importDocuments,alternateCareer,convertComplete,advanceFromPool});
  if(game.system.version!=='9.5.2'||Number(game.release.generation)!==13)ui.notifications.warn('Complete Counts przygotowano dla Foundry 13 i wfrp4e 9.5.2. Inna wersja wymaga sprawdzenia.');
});
const vampireBleedingScript=`const a=this.actor;const n=this.effect.conditionValue;await a.update({'system.status.wounds.value':Math.max(0,a.system.status.wounds.value-n)});let msg='<p>Krwawienie: utrata '+n+' Żywotności.</p>';if(a.system.status.wounds.value===0){const e=a.hasCondition('bleeding');if(e)await e.delete();if(!a.hasCondition('unconscious'))await a.addCondition('unconscious');msg+='<p>Wampir wykrwawił się: Nieprzytomność zamiast śmierci.</p>';}if(args.suppressMessage)return {speaker:ChatMessage.getSpeaker({actor:a}),content:msg};return this.script.message(msg);`;
Hooks.on('preCreateActiveEffect',(effect)=>{
  const a=effect.parent;if(a?.documentName!=='Actor'||!a.getFlag(ID,'vampire')||!effect.statuses.has('bleeding'))return;
  const scripts=effect.system.scriptData.map(s=>typeof s.toObject==='function'?s.toObject():copy(s));
  for(const script of scripts)if(script.trigger==='manual')script.script=vampireBleedingScript;
  effect.updateSource({'system.scriptData':scripts,[`flags.${ID}.vampireBleeding`]:true});
});
Hooks.on('preCreateItem',(item)=>{
  if(meta(item).kind!=='spell'||!item.parent)return;
  const cfg=game.wfrp4e.config,updates={};
  for(const field of ['range','target','duration']){
    let value=item.system[field].value;
    for(const [en,k] of [['Willpower','wp'],['Intelligence','int'],['Strength','s'],['Toughness','t']])value=value.replaceAll(en+' Bonus',cfg.characteristicsBonus[k]).replaceAll(en,cfg.characteristics[k]);
    updates[`system.${field}.value`]=value;
  }item.updateSource(updates);
});
export function openPanel(actor){const a=actor||canvas.tokens?.controlled?.[0]?.actor||game.user.character;if(a)return a.sheet.render(true);return ui.notifications.info('Otwórz kartę postaci i zakładkę Vampire.');}

class CountsPanel extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS={id:'complete-counts-panel',tag:'div',window:{title:'Complete Counts · Władcy nocy',resizable:true},position:{width:850,height:740}};
  tab='play';actorId=null;bloodline='Blood Dragon';career=null;
  get actor(){return game.actors.get(this.actorId)||canvas.tokens?.controlled?.[0]?.actor||game.user.character;}
  async _renderHTML(){const c=await data(),a=this.actor;this.actorId=a?.id||null;const tabs={play:'Przy stole',create:'Nowy wampir',gifts:'Dary i profesje',library:'Biblioteka',guide:'Pomoc'};
    return `<section class="cc-panel"><header class="cc-hero"><h2>Władcy nocy</h2><small>Complete Counts · Foundry VTT 13 · WFRP4e 9.5.2</small></header><nav>${Object.entries(tabs).map(([k,v])=>`<button data-tab="${k}" class="${this.tab===k?'active':''}">${v}</button>`).join('')}</nav><label>Postać</label><select name="actor"><option value="">Wybierz postać</option>${game.actors.filter(x=>x.isOwner).map(x=>`<option value="${x.id}" ${x.id===a?.id?'selected':''}>${esc(x.name)}</option>`).join('')}</select>${await this.body(c,a)}</section>`;
  }
  _replaceHTML(result,content){content.innerHTML=result;}
  async _onRender(context,options){await super._onRender(context,options);const root=this.element;
    root.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{this.tab=b.dataset.tab;this.render(true);}));
    root.querySelector('[name=actor]').addEventListener('change',e=>{this.actorId=e.target.value;this.render(true);});
    root.querySelector('[name=bloodline]')?.addEventListener('change',e=>{this.bloodline=e.target.value;this.render(true);});
    root.querySelector('[name=career]')?.addEventListener('change',e=>{this.career=e.target.value;this.render(true);});
    root.querySelectorAll('[data-act]').forEach(b=>b.addEventListener('click',async()=>{b.disabled=true;try{await this.action(b.dataset.act,b.dataset);this.render(true);}catch(e){console.error(`${ID} |`,e);ui.notifications.error(e.message);}finally{b.disabled=false;}}));
  }
  value(name){return this.element.querySelector(`[name="${name}"]`)?.value;}
  check(name){return !!this.element.querySelector(`[name="${name}"]`)?.checked;}
  optionHTML(list,selected){return list.map(x=>`<option value="${esc(typeof x==='string'?x:x[0])}" ${(typeof x==='string'?x:x[0])===selected?'selected':''}>${esc(typeof x==='string'?x:x[1])}</option>`).join('');}
  async body(c,a){
    if(this.tab==='library')return `<p>Kompendia są dostępne od razu w zakładce Kompendiów Foundry. Import do świata jest opcjonalny i pomija wcześniej zaimportowane wpisy.</p><div class="grid">${[['gifts','Dary krwi'],['spells','Zaklęcia'],['careers','Profesje'],['weaknesses','Słabości'],['actors','Bestiariusz'],['tables','Tabele'],['journals','Podręcznik']].map(([k,n])=>`<div class="card"><h3>${n} · ${c[k].length}</h3><button data-act="pack" data-kind="${k}">Otwórz kompendium</button> <button data-act="import" data-kind="${k}">Importuj do świata</button></div>`).join('')}</div>`;
    if(this.tab==='guide')return `<h3>Jak zacząć</h3><ol><li>Przeczytaj kompendium „Podręcznik”, zwłaszcza rozstrzygnięcia niejasności.</li><li>Włącz posiadany podręcznik podstawowy WFRP4, by kreator mógł pobrać standardowe talenty i cechy.</li><li>Utwórz wampira, wybierając linię, profesję i rozwinięcia. Dary oraz zaklęcia przeciągaj z kompendiów.</li><li>Przy stole wybierz postać, a potem rozliczaj karmienie i czas przyciskami.</li></ol><p>Interwały czasu wprowadza prowadzący: moduł nie zgaduje świtu ani czasu spędzonego we śnie. Przed karmieniem rozstrzygnij atak i podaj faktycznie wypite Rany po redukcji; panel nie zadaje ponownie obrażeń ofierze.</p><p>Testy przeciwstawne, zasięg, dostępność przywoływanych istot i rozstrzygnięcia fabularne należą do MG. Opisy wyraźnie określają reguły. Automatyzacje są narzędziami wspierającymi rozgrywkę.</p><div class="actions"><button data-act="pack" data-kind="journals">Podręcznik i errata</button><button data-act="diagnostic">Sprawdź środowisko</button></div><p><a href="${PATH}/assets/Complete-Counts-source.pdf" target="_blank" rel="noopener">Oryginalny PDF (EN)</a> · <a href="${PATH}/README.html" target="_blank" rel="noopener">Instrukcja instalacji i zakres automatyzacji</a></p>`;
    if(this.tab==='create'){
      const b=c.bloodlines.find(x=>x.en===this.bloodline),cs=c.careers.filter(x=>x.system.level.value===1),car=cs.find(x=>x._id===this.career)||cs[0];this.career=car._id;
      const skills=['Dodge','Intimidate','Language (Any)','Melee (Basic)','Perception','Stealth',...b.skills]; const specNames=[...new Set([...skills,...car.system.skills,...car.system.talents])].filter(s=>s.includes('(Any)')||['Stealth','Channelling'].includes(s));
      return `<h3>Nowy wampir · komplet tworzenia</h3><p>Wiek 2, trzy dary początkowe, sześć słabości, pięć talentów linii i talent profesji. Specjalizacje i wybory „Any” zastąp nazwą konkretnego talentu z biblioteki. Kreator wymaga kompletnych wyborów; niczego nie zastępuje pustymi talentami.</p><label>Imię</label><input name="name" value="Młody wampir"><div class="grid"><div><label>Linia krwi</label><select name="bloodline">${this.optionHTML(c.bloodlines.map(x=>[x.en,x.pl]),b.en)}</select></div><div><label>Profesja specjalna (poziom 1)</label><select name="career">${this.optionHTML(cs.map(x=>[x._id,x.name]),car._id)}</select></div></div><label>Wybrany dar linii</label><select name="gift">${this.optionHTML(b.gifts.map(x=>[x,c.gifts.find(g=>en(g)===x)?.name||x]))}</select><h3>Cechy</h3><label><input type="checkbox" name="random"> Rzuć po 2k10 w kolejności (+50 PD) zamiast przydziału 100 punktów</label><div class="grid">${KEYS.map((k,i)=>`<label>${['WW','US','S','Odp','I','Zw','Zr','Int','SW','Ogd'][i]} · baza ${b.bases[i]}<input type="number" name="char-${k}" min="4" max="18" value="10"></label>`).join('')}</div><h3>Rozwinięcia gatunkowe</h3><div class="grid">${[0,1,2,3,4,5].map(i=>`<label>Umiejętność +${i<3?5:3}<select name="skill-${i}">${this.optionHTML(skills,skills[i])}</select></label>`).join('')}</div><h3>Specjalizacje</h3><p>Podaj pełne angielskie nazwy wybranych specjalizacji; podpowiedzi można zmienić.</p>${specNames.map((s,i)=>`<label>${esc(s)}<input name="spec-${i}" data-spec="${esc(s)}" value="${esc(specDefault(s))}"></label>`).join('')}<h3>Pięć talentów linii</h3><p class="muted">Lista: ${esc(b.talents.join('; '))}. Nazwy muszą odpowiadać posiadanym kompendiom. Dla Niezależnych wybierz także dwa wylosowane talenty.</p>${[0,1,2,3,4].map((i)=>`<input name="talent-${i}" aria-label="Talent ${i+1}" value="${esc(specDefault((b.talents[i]||'').split(' or ')[0]))}">`).join('')}<h3>Rozwinięcia profesji</h3><div class="grid">${[0,1,2,3,4].map(i=>`<label>+1 do cechy<select name="cadv-${i}">${this.optionHTML(KEYS.filter(k=>car.system.characteristics[k]))}</select></label>`).join('')}</div><p>40 rozwinięć umiejętności, maks. 10 na jedną:</p><div class="grid">${car.system.skills.map((s,i)=>`<label>${esc(s)}<input name="cskill-${i}" type="number" min="0" max="10" value="${i<4?10:0}"></label>`).join('')}</div><label>Talent profesji</label><select name="careerTalent">${this.optionHTML(car.system.talents)}</select><div class="actions"><button class="primary" data-act="create">Utwórz kompletną postać</button></div><p class="muted">Dodatkowe warianty profesji podstawowych możesz później dodać w zakładce Dary i profesje. Opcjonalne życie śmiertelnika opisano w podręczniku; nie jest dodawane automatycznie.</p>`;
    }
    if(!a)return '<p class="notice">Wybierz postać powyżej albo przejdź do tworzenia nowego wampira.</p>';
    if(this.tab==='gifts')return `<h3>Dary i profesje</h3>${a.getFlag(ID,'pools')?`<div class="card"><h3>PD po Krwawym Pocałunku</h3><p>Gatunek i linia: ${a.getFlag(ID,'pools').species} PD · Profesja: ${a.getFlag(ID,'pools').career} PD (w ciągu miesiąca).</p><select name="poolType"><option value="species">Gatunek / linia</option><option value="career">Profesja</option></select><select name="poolSkill">${this.optionHTML(a.items.filter(i=>i.type==='skill').map(i=>[i.id,i.name]))}</select><button data-act="pool">Kup +1 z wybranej puli</button></div>`:''}<label>Dar</label><select name="purchase">${this.optionHTML(c.gifts.map(g=>[g._id,g.name]))}</select><label>Specjalizacja (zaklęcie / rój / choroba, jeżeli wymagana)</label><input name="specialization"><div class="actions"><button data-act="buy">Kup za PD</button><button data-act="sync">Odśwież cechy z darów</button></div><p>Koszt i limit wyliczane z bieżącej profesji oraz posiadanych talentów. Zakupy przez zwykłą kartę Foundry nie przechodzą walidacji tej zakładki.</p><label>Liczba rozpoczętych poziomów preferowanych profesji</label><input name="preferredLevels" type="number" min="1" max="20" value="${state(a).preferredLevels||1}"><button data-act="preferred">Zapisz po zatwierdzeniu awansu</button><h3>Wariant profesji podstawowej</h3><select name="alternate">${this.optionHTML([...new Set(c.alternatives.map(x=>x.en))])}</select><label>Poziom</label><select name="altLevel">${this.optionHTML(['1','2','3','4'])}</select><button data-act="alternate">Dodaj wariant z posiadanej biblioteki</button><p>Nowy wpis nie staje się automatycznie bieżącą profesją i nie wydaje PD za zmianę profesji.</p>`;
    const s=state(a);
    return `<h3>${esc(a.name)}</h3>${!a.getFlag(ID,'vampire')?'<p class="notice">To nie jest jeszcze postać oznaczona jako wampir tego modułu. Konwersja istniejącej postaci: użyj dziennika „Przemiana istniejącego bohatera” i przycisku poniżej.</p><button data-act="conversion">Rozpocznij konwersję na kopii</button>':''}<div>${[['Rany',`${a.system.status?.wounds?.value}/${a.system.status?.wounds?.max}`],['Głód',cv(a,'cc-hungry')],['Wygłodniały',has(a,'cc-ravenous')?'tak':'nie'],['Zatrucie słoneczne',cv(a,'cc-sun-poisoned')],['Interwały',s.intervals||0]].map(([k,v])=>`<span class="badge">${k}: ${v}</span>`).join('')}</div><div class="grid"><div class="card"><h3>Krew i głód</h3><label>Rany rzeczywiście wypitej krwi</label><input name="blood" type="number" min="1" value="3"><div class="actions"><button data-act="feed">Rozlicz karmienie</button><button data-act="interval">Minął jeden interwał</button></div><label>Wiek (1–5)</label><select name="age">${this.optionHTML(['1','2','3','4','5'],String(s.age||2))}</select><button data-act="age">Zapisz wiek</button><p class="muted">Nie doliczaj dziennego snu. Każdy interwał rozstrzygaj oddzielnie.</p></div><div class="card"><h3>Słońce i schronienie</h3><label>Minuty</label><input name="minutes" type="number" min="1" value="1"><label><input name="overcast" type="checkbox"> Co najmniej 80% zachmurzenia</label><div class="actions"><button data-act="sun">Ekspozycja</button><button data-act="shade">Pobyt w schronieniu</button><button data-act="sunDamage">Obrażenia słoneczne: test</button><button data-act="dawn">Wbrew świtowi: test</button></div></div><div class="card"><h3>Przemiany</h3><select name="form">${this.optionHTML([['Vampire Bat','Nietoperz'],['Doom Wolf','Wilk zagłady'],['Vampire Familiar','Chowaniec']])}</select><div class="actions"><button data-act="transform">Przemień</button><button data-act="revert">Powrót</button><button data-act="human">Ludzka powierzchowność</button></div></div><div class="card"><h3>Przymus i inne reguły</h3><label>Poziomy Przymusu</label><input name="compulsion" type="number" min="0" value="${cv(a,'cc-compulsion')}"><div class="actions"><button data-act="compulsion">Ustaw Przymus</button><button data-act="compulsionDone">Rozkaz wykonany</button><button data-act="compulsionFail">Minęła godzina</button><button data-act="sleep">Sen i zmęczenie</button></div><p class="muted">Przy testach sprzecznych z rozkazem zaznacz modyfikator Przymusu w oknie testu.</p></div></div>${owned(a,'Dark Fate')?`<h3>Mroczny los</h3><p>Przeznaczenie: ${a.getFlag(ID,'darkFate')?.fate??rank(a,'Dark Fate')} · Szczęście: ${a.getFlag(ID,'darkFate')?.fortune??rank(a,'Dark Fate')}</p><div class="actions"><button data-act="darkFate">Wydaj Mroczne Przeznaczenie</button><button data-act="darkFortune">Wydaj Mroczne Szczęście</button><button data-act="darkRefresh">Odnowienie Szczęścia na sesję</button></div>`:''}<h3>Posiadane dary</h3><div class="cc-list">${a.items.filter(i=>meta(i).kind==='gift').map(i=>`<button data-act="gift" data-id="${i.id}">${esc(i.name)}</button>`).join('')||'Brak darów z tego modułu.'}</div>`;
  }
  async action(act,d){const a=this.actor,c=await data();
    if(act==='pack')return game.packs.get(`${ID}.${d.kind}`)?.render(true);
    if(act==='import')return importDocuments(d.kind);
    if(act==='diagnostic')return foundry.applications.api.DialogV2.prompt({window:{title:'Środowisko'},content:`<p>Foundry ${game.version}; wfrp4e ${game.system.version}; warhammer-lib ${game.modules.get('warhammer-lib')?.version||'brak'}.</p><p>Kompendia modułu: ${game.packs.filter(p=>p.metadata.packageName===ID).length}. Dary: ${c.gifts.length}; zaklęcia: ${c.spells.length}; profesje: ${c.careers.length}; bestiariusz: ${c.actors.length}.</p>`,ok:{label:'Zamknij'}});
    if(act==='create'){const car=c.careers.find(x=>x._id===this.value('career'));const a=await makeVampire({name:this.value('name'),bloodline:this.value('bloodline'),career:car._id,gift:this.value('gift'),allocation:KEYS.map(k=>integer(this.value(`char-${k}`),4,18)),random:this.check('random'),skillAdvances:[0,1,2,3,4,5].map(i=>this.value(`skill-${i}`)),talents:[0,1,2,3,4].map(i=>this.value(`talent-${i}`)),careerTalent:this.value('careerTalent'),specializations:Object.fromEntries([...this.element.querySelectorAll('[data-spec]')].map(e=>[e.dataset.spec,e.value.trim()])),careerAdvances:[0,1,2,3,4].map(i=>this.value(`cadv-${i}`)),careerSkills:Object.fromEntries(car.system.skills.map((s,i)=>[s,integer(this.value(`cskill-${i}`),0,10)]))});this.actorId=a.id;this.tab='play';return;}
    if(act==='feed')return feed(a,Number(this.value('blood')));
    if(act==='interval')return interval(a);
    if(act==='sun')return sun(a,Number(this.value('minutes')),this.check('overcast'));
    if(act==='shade')return shade(a,Number(this.value('shelterMinutes')));
    if(act==='leaveShelter')return leaveShelter(a);
    if(act==='sunDamage')return sunlightDamageTest(a);
    if(act==='dawn'){assertVampire(a);if(!owned(a,'Defy the Dawn'))throw Error('Nie posiadasz daru Wbrew świtowi.');const s=state(a),t=await test(a,'Endurance',-10*(s.dawnTests||0));if(t){await a.setFlag(ID,'state',{...s,dawnTests:(s.dawnTests||0)+1});await report(a,'Wbrew świtowi',`<p>${result(t).success?'Odporność udana: pomiń ekspozycję tej godziny.':'Porażka: rozlicz zwykłą ekspozycję.'}</p>`);}return;}
    if(act==='age'){assertVampire(a);const n=integer(this.value('age'),1,5);return a.setFlag(ID,'state',{...state(a),age:n});}
    if(act==='preferred'){assertVampire(a);return a.setFlag(ID,'state',{...state(a),preferredLevels:integer(this.value('preferredLevels'),1,20)});}
    if(act==='buy')return buyGift(a,this.value('purchase'),{specialization:this.value('specialization')});
    if(act==='sync')return syncPassive(a);
    if(act==='alternate')return alternateCareer(a,this.value('alternate'),this.value('altLevel'));
    if(act==='transform')return transform(a,this.value('form'));
    if(act==='revert')return revert(a);
    if(act==='human')return toggleHuman(a);
    if(act==='compulsion'){ensure(a);return setCondition(a,'cc-compulsion',integer(this.value('compulsion')));}
    if(act==='compulsionDone'||act==='compulsionFail'){ensure(a);const n=cv(a,'cc-compulsion');if(!n)return;await setCondition(a,'cc-compulsion',0);await a.addCondition('fatigued',act==='compulsionDone'?1:n);if(act==='compulsionDone'&&a.system.status.resolve)await a.update({'system.status.resolve.value':Math.min(a.system.status.resilience.value,a.system.status.resolve.value+1)});return;}
    if(act==='sleep')return sleepDialog(a);
    if(act==='conversion')return conversion(a);
    if(act==='pool')return advanceFromPool(a,this.value('poolSkill'),this.value('poolType'));
    if(act==='darkFate'||act==='darkFortune'||act==='darkRefresh'){assertVampire(a);if(!owned(a,'Dark Fate'))throw Error('Nie posiadasz Mrocznego losu.');const points=copy(a.getFlag(ID,'darkFate')||{fate:rank(a,'Dark Fate'),fortune:rank(a,'Dark Fate')});if(act==='darkRefresh')points.fortune=rank(a,'Dark Fate');else{const key=act==='darkFate'?'fate':'fortune';if(!points[key])throw Error('Brak punktów.');points[key]--;}await a.setFlag(ID,'darkFate',points);return report(a,'Mroczny los',`<p>Pozostało: ${points.fate} Mrocznego Przeznaczenia i ${points.fortune} Mrocznego Szczęścia. Efekt wydania (np. przerzut) rozpatrz jak zwykły odpowiednik.</p>`);}
    if(act==='gift')return game.modules.get(ID).api.activate(a.items.get(d.id),{});
    if(act==='legacyGift'){const i=a.items.get(d.id);if(en(i)==='Revenant'&&a.system.status.wounds.value===0){const t=await test(a,'Endurance');if(t&&result(t).success){await a.update({'system.status.wounds.value':1});await setCondition(a,'unconscious',0);}return;}await i.sheet.render(true);return report(a,i.name,i.system.description.value);}
  }
}
async function sleepDialog(a){assertVampire(a);const ok=await foundry.applications.api.DialogV2.wait({window:{title:'Sen wampira'},content:'<p>Wybierz przebieg odpoczynku. Pełny sen z ziemią usuwa tylko zmęczenie oznaczone przez moduł jako pochodzące z braku ziemi. Dzienne przebudzenie i zbyt krótki sen rozlicz osobno.</p>',buttons:[{action:'full',label:'Pełny dzień z ziemią'},{action:'soil',label:'Sen bez ojczystej ziemi'},{action:'wake',label:'Przebudzenie za dnia'},{action:'short',label:'Sen krótszy niż 8 h'}],rejectClose:false});if(!ok)return;const s=state(a);if(ok==='full'){await setCondition(a,'fatigued',Math.max(0,cv(a,'fatigued')-(s.protectedFatigue||0)));await a.setFlag(ID,'state',{...s,protectedFatigue:0,dawnTests:0});}else{await a.addCondition('fatigued');if(ok==='soil')await a.setFlag(ID,'state',{...s,protectedFatigue:(s.protectedFatigue||0)+1});}await report(a,'Sen',`<p>Rozliczono: ${esc(ok)}. Czuwanie po świcie wymaga co godzinę Odporności (+0), maksymalnie BSW/2 godzin. Po przebudzeniu za dnia testuj ponownie co BSW minut.</p>`);}

async function conversion(a){
  ensure(a);if(a.getFlag(ID,'vampire'))throw Error('Postać już jest wampirem.');const c=await data();
  const line=await foundry.applications.api.DialogV2.prompt({window:{title:'Krwawy Pocałunek — wybór linii'},content:`<p>Konwersja utworzy nową kopię postaci. Wybierz linię stwórcy albo Niezależnych.</p><select name="line">${c.bloodlines.map(b=>`<option>${esc(b.en)}</option>`).join('')}</select>`,ok:{label:'Dalej',callback:(_e,b)=>b.form.elements.line.value},rejectClose:false});
  if(!line)return;const b=c.bloodlines.find(x=>x.en===line),careers=c.careers.filter(x=>x.system.level.value===1);
  const choice=await foundry.applications.api.DialogV2.prompt({window:{title:'Konwersja — dary, talenty i profesja'},position:{width:650},content:`<p>Zachowujesz nabyte talenty poza Doomed i zakazanymi talentami religijnymi. Zgodnie z jawnym rozstrzygnięciem niejasności PDF otrzymasz pięć talentów linii. Standardowe talenty wymagają biblioteki podstawowej.</p><label>Profesja startowa</label><select name="career">${careers.map(x=>`<option value="${x._id}">${esc(x.name)}</option>`).join('')}</select><label>Dar linii</label><select name="gift">${b.gifts.map(g=>`<option>${esc(g)}</option>`).join('')}</select><p>Talenty linii: ${esc(b.talents.join('; '))}</p>${[0,1,2,3,4].map(i=>`<label>Talent ${i+1}<input name="talent${i}" value="${esc(specDefault((b.talents[i]||'').split(' or ')[0]))}"></label>`).join('')}`,ok:{label:'Dalej',callback:(_e,button)=>Object.fromEntries(new FormData(button.form))},rejectClose:false});
  if(!choice)return;const car=careers.find(x=>x._id===choice.career);
  const allocation=await foundry.applications.api.DialogV2.prompt({window:{title:'Przebudzenie — rozwinięcia profesji'},position:{width:600},content:`<p>Wybierz pięć rozwinięć cech (można powtarzać) i talent pierwszego poziomu. Pule 240 i 400 PD zostaną zapisane oddzielnie do wydania na właściwe umiejętności.</p>${[0,1,2,3,4].map(i=>`<label>+1 do cechy<select name="advance${i}">${KEYS.filter(k=>car.system.characteristics[k]).map(k=>`<option>${k}</option>`).join('')}</select></label>`).join('')}<label>Talent profesji</label><select name="careerTalent">${car.system.talents.map(t=>`<option>${esc(t)}</option>`).join('')}</select>`,ok:{label:'Utwórz wampira',callback:(_e,button)=>Object.fromEntries(new FormData(button.form))},rejectClose:false});
  if(!allocation)return;
  return convertComplete(a,{bloodline:line,career:car._id,gift:choice.gift,talents:[0,1,2,3,4].map(i=>choice['talent'+i]),careerTalent:specDefault(allocation.careerTalent),careerAdvances:[0,1,2,3,4].map(i=>allocation['advance'+i])});
}
async function convertComplete(a,{bloodline,career,gift,talents,careerTalent,careerAdvances}){
  ensure(a);if(a.getFlag(ID,'vampire'))throw Error('Postać już jest wampirem.');
  const c=await data(),b=c.bloodlines.find(x=>x.en===bloodline),car=c.careers.find(x=>x._id===career);
  if(!b||!car||!b.gifts.includes(gift)||careerAdvances.length!==5||careerAdvances.some(k=>!car.system.characteristics[k]))throw Error('Nieprawidłowe wybory konwersji.');
  if(talents.length!==5)throw Error('Wybierz pięć talentów linii.');
  const add=[];for(const n of [...talents,careerTalent]){if(/\(Any\)|Random Talents/i.test(n))throw Error(`Wybierz konkretny talent: ${n}.`);const t=await sourceItem(n,'talent');if(!t)throw Error(`Brak talentu w bibliotece: ${n}.`);add.push(t);}
  const obj=a.toObject();delete obj._id;obj.name+=' — wampir';
  const forbidden=['Doomed','Holy Hatred','Holy Visions','Pure Soul'];obj.items=obj.items.filter(i=>!forbidden.includes(en(i))&&!/^(Bless|Invoke)(\s|$)/.test(en(i)));
  const swaps={'Pray':'Channelling (Dhar)','Lore (Theology)':'Language (Magick)','Holy Hatred':'Hatred (Cultists)','Holy Visions':'Sixth Sense','Pure Soul':'Strong-minded'};
  for(const i of a.items){const n=en(i);if(swaps[n]){if(i.type==='skill'){const existing=obj.items.find(x=>x._id===i.id);if(existing)existing.name=swaps[n];}else{const t=await sourceItem(swaps[n],'talent');if(t)add.push(t);}}if(/^(Bless|Invoke)(\s|$)/.test(n)){const t=await sourceItem(n.startsWith('Bless')?'Petty Magic':'Arcane Magic (Necromancy)','talent');if(t)add.push(t);}}
  KEYS.forEach((k,i)=>obj.system.characteristics[k].initial+=b.bases[i]-20);
  for(const k of careerAdvances)obj.system.characteristics[k].advances++;
  if(['Necrarch','Strigoi'].includes(b.en)){const cap=b.en==='Necrarch'?25:30,ch=obj.system.characteristics.fel;ch.initial=Math.min(ch.initial,cap-(ch.advances||0)-(ch.modifier||0));}
  Object.assign(obj.system.status,{fate:{value:0},fortune:{value:0},resilience:{value:4},resolve:{value:4}});obj.system.details.move.value=6;
  for(const g of new Set(['Natural Necromancer',b.en==='Necrarch'?'Walking Death':b.en==='Strigoi'?'Bloody Fury':'Pass for Human',gift]))add.push(fresh(c.gifts.find(x=>en(x)===g)));
  add.push(...(b.typicalWeaknesses||b.weaknesses).slice(0,5).map(w=>fresh(c.weaknesses.find(x=>en(x)===w))));
  for(const n of ['Bite','Claw','Dark Vision','Fear','Painless','Undead','Vampiric']){
    if(obj.items.some(i=>en(i)===n))continue;
    let t=await sourceItem(n==='Claw'?'Weapon':n,'trait')||{name:n,type:'trait',system:{}};t.flags={...t.flags,[ID]:{en:n,kind:'baseTrait'}};
    if(['Bite','Claw'].includes(n)){t.name=n==='Claw'?'Claw':t.name;t.system.specification={value:'3'};t.system.rollable={value:true,damage:true,rollCharacteristic:'ws',bonusCharacteristic:'s',attackType:'melee',skill:n==='Claw'?'Melee (Brawling)':''};}
    if(n==='Fear')t.system.specification={value:'1'};add.push(t);
  }
  if(['Necrarch','Strigoi'].includes(b.en)){const n=b.en==='Necrarch'?'Animosity (The Living)':'Animosity (Other Bloodlines)';add.push(await sourceItem(n,'trait')||{name:n,type:'trait',system:{description:{value:'Niechęć wynikająca z linii krwi.'}}});}
  const speciesSkills=[...new Set(['Dodge','Intimidate','Language (Classical)','Melee (Basic)','Perception','Stealth (Urban)',...b.skills.map(specDefault)])],careerSkills=car.system.skills.map(specDefault);
  for(const n of new Set([...speciesSkills,...careerSkills]))if(!obj.items.some(i=>i.type==='skill'&&i.name===n))add.push(await skillItem(n));
  for(const i of obj.items)if(i.type==='career')i.system.current.value=false;
  const careerData=fresh(car);careerData.system.current.value=true;careerData.system.skills=careerSkills;add.push(careerData);
  obj.items.push(...add);obj.flags={...obj.flags,[ID]:{vampire:true,bloodline:b.en,bloodThirst:true,vampireRank:'Newborn',state:{age:1,intervals:0,preferredLevels:1},pools:{species:240,career:400,speciesSkills,careerSkills},convertedFrom:a.uuid}};
  obj.system.details.biography.value=(obj.system.details.biography.value||'')+`<h2>Krwawy Pocałunek</h2><p>Linia ${esc(b.pl)}. Konwersja na podstawie Complete Counts s. 13–14. Osobne pule: 240 PD na umiejętności gatunku/linii, 400 PD na umiejętności nowej profesji w ciągu miesiąca. Przyjęto pięć talentów linii i pełną listę dziewięciu cech. Specjalizacje umiejętności „Any” dobrano domyślnie; można je zmienić z MG.</p>`;
  const out=await Actor.create(obj);await out.update({'system.status.wounds.max':out.system.computeWounds(),'system.status.wounds.value':out.system.computeWounds()});await syncPassive(out);out.sheet.render(true);if(panelInstance)panelInstance.actorId=out.id;
  await report(out,'Krwawy Pocałunek',`<p>Gotowa kopia: ${esc(out.name)}. Oryginał zachowano. Pule 240/400 PD wydajesz w panelu Dary i profesje. Jeśli rozgrywasz przebudzenie po 1k10 dniach, dodaj Wygłodniałego i po jednym Głodzie za każdą noc.</p>`);return out;
}
async function advanceFromPool(a,skillId,pool){assertVampire(a);return exclusive(a,async()=>{
  const p=copy(a.getFlag(ID,'pools')),skill=a.items.get(skillId);if(!p||!['species','career'].includes(pool)||skill?.type!=='skill')throw Error('Brak puli lub umiejętności.');
  if(!p[pool+'Skills'].includes(skill.name))throw Error('Ta umiejętność nie należy do wybranej puli.');
  const cost=Number(skill.system.cost);if(!Number.isFinite(cost)||cost<0||p[pool]<cost)throw Error(`Za mało PD w puli. Koszt: ${cost}.`);
  await skill.update({'system.advances.value':skill.system.advances.value+1},{skipExperienceChecks:true});p[pool]-=cost;await a.setFlag(ID,'pools',p);await report(a,'Rozwój po przemianie',`<p>${esc(skill.name)} +1 za ${cost} PD z puli ${pool==='species'?'gatunku/linii':'profesji'}. Pozostało ${p[pool]} PD.</p>`);
});}
export {data,sourceItem,skillItem,en,meta,rank,owned,ensure,assertVampire,copy,esc,report,setCondition,test,result,state,feed,interval,sun,shade,sleepDialog,specDefault,fresh,transform,revert,formTokens};
export async function sheetContent(actor,tab='play'){
 const ctl=Object.create(CountsPanel.prototype);Object.defineProperty(ctl,'actor',{value:actor});ctl.tab=tab;
 return ctl.body(await data(),actor);
}
export async function sheetAction(actor,element,act,d={}){
 const ctl=Object.create(CountsPanel.prototype);Object.defineProperties(ctl,{actor:{value:actor},element:{value:element}});
 return ctl.action(act,d);
}
import {installVampires,passive} from './vampire.mjs';
import {installSheets} from './sheet.mjs';
Hooks.once('setup',installVampires);
Hooks.once('ready',installSheets);
