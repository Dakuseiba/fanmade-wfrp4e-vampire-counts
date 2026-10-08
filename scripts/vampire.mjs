import {nativeSpellPrepare,nativeSpellItems,nativeSpellHeal,nativeBloodBite,nativeSpiritChain,installNativeSpells} from './native-spells.mjs';
import {installRefinements,bait,scrollGift,auraControl,storm} from './refinements.mjs';
import {syncNature,suppressedBy,compulsion,finishBloodKiss} from './ndm.mjs';
import {ID,KEYS} from './rules.mjs';
import {data,sourceItem,skillItem,en,meta,rank,owned,ensure,copy,esc,report,setCondition,test,result,state,feed,sun,sleepDialog,specDefault,fresh,transform,revert} from './main.mjs';
import {sheetIds} from './sheet.mjs';
const PATH=`modules/${ID}`,timers=new Map(),syncing=new Set();
const traitMap={'Ravening Beast':'Frenzy','Belligerent':'Belligerent','Bloody Fury':'Fury','Chill Presence':'Chill Grasp','Cold-blooded':'Cold Blooded','Corrosive Blood':'Corrosive Blood',"Devil's Cry":'Ghostly Howl','Stench':'Distracting','Undying':'Die Hard','Unholy Regeneration':'Regenerate','Vomit':'Vomit','Wallcrawler':'Wallcrawler','Slow Death':'Infected'};
const aliases={'Claw':'Weapon','Regeneration':'Regenerate','Cold-blooded':'Cold Blooded','Tongue Attack':'Tongue Attack (Range)'};
async function coreTrait(name,spec){
 const c=await data(),raw=c.coreTraits[aliases[name]||name];if(!raw)throw Error(`Brak cechy Core Rulebook: ${name}`);
 const t=fresh(raw);if(spec!==undefined)t.system.specification={value:String(spec)};
 t.flags={...t.flags,[ID]:{en:name,coreUuid:raw._stats.compendiumSource}};return t;
}
function schedule(a){if(!a?.isOwner||a.pack||!a.items.some(i=>meta(i).kind==='gift'||meta(i).generated))return;clearTimeout(timers.get(a.uuid));timers.set(a.uuid,setTimeout(()=>syncTraits(a).catch(e=>ui.notifications.error(e.message)),150));}
export async function syncTraits(a){
 ensure(a);if(syncing.has(a.uuid))return;syncing.add(a.uuid);
 try{
  const wanted=new Map();for(const [g,t] of Object.entries(traitMap))if(rank(a,g))wanted.set(t,{spec:undefined,gift:g});
  if(rank(a,'Wings'))wanted.set('Flight',{spec:2*a.system.details.move.value,gift:'Wings'});
  if(rank(a,'Venomous Bile'))wanted.set('Venom',{spec:['Challenging','Difficult','Hard'][Math.min(3,rank(a,'Venomous Bile'))-1],gift:'Venomous Bile'});
  if(rank(a,'Monstrous Mass')>=2)wanted.set('Painless',{gift:'Monstrous Mass'});
  if(rank(a,'Walking Death')&&!a.getFlag(ID,'humanForm'))wanted.set('Terror',{spec:rank(a,'Walking Death'),gift:'Walking Death'});
  if(rank(a,'Tongue Attack'))wanted.set('Tongue Attack',{spec:rank(a,'Tongue Attack'),gift:'Tongue Attack'});
  if(rank(a,'Diseased (Type)'))wanted.set('Disease',{spec:meta(owned(a,'Diseased (Type)')).specialization||'Scurvy Madness',gift:'Diseased (Type)'});
  for(const t of a.items.filter(i=>meta(i).generated))if(!wanted.has(en(t)))await t.delete();
  for(const [name,options] of wanted){
   let t=a.items.find(i=>en(i)===name&&meta(i).generated);if(!t&&a.items.some(i=>i.type==='trait'&&en(i)===name))continue;
   const raw=await coreTrait(name,options.spec);raw.flags[ID]={...raw.flags[ID],generated:true,fromGift:options.gift};
   if(options.gift==='Slow Death')for(const e of raw.effects)for(const s of e.system.scriptData){const match=s.script.match(/\[Script\.([A-Za-z0-9]+)\]/);const code=match?game.wfrp4e.config.effectScripts[match[1]]:s.script;if(s.trigger==='applyDamage')s.script=`if(!['Bite','Claw'].includes(args.sourceItem?.flags?.['${ID}']?.en||args.sourceItem?.name))return;\n${code}`;}
   if(name==='Tongue Attack'){
    const range=a.system.characteristics.bs.bonus+rank(a,'Tongue Attack')-1;
    raw.name=`Tongue Attack (${range})`;raw.system.rollable={...raw.system.rollable,value:true,damage:true,rollCharacteristic:'bs',bonusCharacteristic:'s',attackType:'ranged',skill:''};
    raw.system.description.value='<p><strong>Atak językiem.</strong> Obrażenia: BS + poziom daru; zasięg: BUS + poziom − 1 jardów.</p>'+raw.system.description.value;
   }
   if(!t)await a.createEmbeddedDocuments('Item',[raw],{ccSync:true,skipExperienceChecks:true,skipSpecialisationChoice:true});
   else if(t.name!==raw.name||String(t.system.specification.value)!==String(raw.system.specification.value))await t.update({name:raw.name,'system.specification.value':raw.system.specification.value});
  }
  await syncNature(a);
  const fate=rank(a,'Dark Fate');if(fate){const old=a.getFlag(ID,'darkFate')||{fate:0,fortune:0,purchased:0};if(fate>(old.purchased||0)){const gain=fate-(old.purchased||0);await a.setFlag(ID,'darkFate',{fate:old.fate+gain,fortune:old.fortune+gain,purchased:fate});}}
 }finally{syncing.delete(a.uuid);clearTimeout(auraTimer);auraTimer=setTimeout(refreshAuras,350);}
}
function weaknessFields(c,b){const typical=(b.typicalWeaknesses||b.weaknesses).slice(0,5);return `<fieldset data-cc-weakness-fields><legend>Słabości</legend><p>Blood Thirst oraz pięć różnych słabości; Sunlight jest opcjonalne. Za losowanie premię PD rozlicz ręcznie.</p><select name="weaknessMode" aria-label="Sposób wyboru słabości"><option value="line">Typowe dla rodu</option><option value="manual">Własny wybór</option><option value="random">Losuj według tabeli</option></select><div data-cc-weakness-mode="line"><ul>${typical.map(n=>`<li>${esc(n)}</li>`).join('')}</ul></div><div data-cc-weakness-mode="manual" hidden style="display:none">${[0,1,2,3,4].map(k=>`<label>Słabość ${k+1}<select name="weakness${k}" disabled>${c.weaknesses.map(w=>`<option value="${esc(en(w))}" ${en(w)===typical[k]?'selected':''}>${esc(en(w))}</option>`).join('')}</select></label>`).join('')}</div><p data-cc-weakness-mode="random" hidden style="display:none">Zostanie wylosowanych pięć różnych słabości.</p></fieldset>`;}
function bindWeaknessFields(app){
 const root=app.element instanceof HTMLElement?app.element:app.element?.[0];
 for(const fields of root?.querySelectorAll('[data-cc-weakness-fields]')||[]){
  const mode=fields.querySelector('[name="weaknessMode"]');if(mode.dataset.ccBound)continue;mode.dataset.ccBound='true';
  const refresh=()=>{for(const section of fields.querySelectorAll('[data-cc-weakness-mode]')){const visible=section.dataset.ccWeaknessMode===mode.value;section.hidden=!visible;section.style.display=visible?'':'none';for(const input of section.querySelectorAll('select'))input.disabled=!visible;}app.setPosition({height:'auto'});};
  mode.addEventListener('change',refresh);refresh();
 }
}
async function selectWeaknesses(b,choices){
 const c=await data(),mode=choices.weaknessMode||'line';let names;
 if(mode==='line')names=[...(b.typicalWeaknesses||b.weaknesses)].slice(0,5);
 else if(mode==='manual')names=[...(choices.weaknesses||[0,1,2,3,4].map(k=>choices['weakness'+k]))];
else if(mode==='random'){
 names=[];
 //const table=c.tables.find(t=>t.name.startsWith('Losowa słabość'));
const table = game.tables.find(t =>
    t.name.startsWith('Losowa słabość')
);
 console.group('[VAMPIRE] Losowanie słabości');

const pool = [];

for (const result of table.results) {
    const text =
        result.text ??
        result.name ??
        result.description ??
        '';

    const weakness = c.weaknesses.find(w =>
        text.endsWith('(' + en(w) + ')')
    );

    if (!weakness) continue;

    const min = result.range[0];
    const max = result.range[1];
    const weight = max - min + 1;

    // Jeżeli ta sama słabość występuje w kilku zakresach,
    // sumujemy jej wagę.
    const existing = pool.find(x => x.name === weakness.name);

    if (existing)
        existing.weight += weight;
    else
        pool.push({
            name: weakness.name,
            weight
        });
}

if (pool.length < 5) {
    throw new Error(
        `Tabela "${table.name}" zawiera tylko ${pool.length} różnych słabości.`
    );
}

console.group('[VAMPIRE] Losowanie słabości');

names = [];

for (let i = 0; i < 5; i++) {

    const totalWeight = pool.reduce(
        (sum, entry) => sum + entry.weight,
        0
    );

    const roll = await new Roll(`1d${totalWeight}`).evaluate();

    let cursor = roll.total;
    let selectedIndex = -1;

    for (let j = 0; j < pool.length; j++) {
        cursor -= pool[j].weight;

        if (cursor <= 0) {
            selectedIndex = j;
            break;
        }
    }

    const selected = pool[selectedIndex];

    console.log(
        `[VAMPIRE] Rzut ${i + 1}: 1d${totalWeight} = ${roll.total} → ${selected.name} (waga ${selected.weight})`
    );

    names.push(selected.name);

    // Usuwamy wylosowaną słabość,
    // więc nie może wypaść drugi raz.
    pool.splice(selectedIndex, 1);
}

console.log('[VAMPIRE] Finalne słabości:', names);
console.groupEnd();

 console.log('[VAMPIRE] Finalne słabości:', names);
 console.groupEnd();

}else throw Error('Nieprawidłowy tryb wyboru słabości.');
 if(names?.length!==5||new Set(names).size!==5||names.some(n=>!c.weaknesses.some(w=>en(w)===n)))throw Error('Wybierz pięć różnych słabości.');return names;
}
async function chooseWeaknesses(a){ensure(a);const c=await data(),line=c.bloodlines.find(b=>b.en===a.getFlag(ID,'bloodline'))||c.bloodlines[0];const answer=await foundry.applications.api.DialogV2.prompt({window:{title:'Wybór słabości'},content:weaknessFields(c,line),ok:{label:'Zastąp słabości',callback:(_e,b)=>Object.fromEntries(new FormData(b.form))},rejectClose:false});if(!answer)return;const names=await selectWeaknesses(line,answer);const old=a.items.filter(i=>meta(i).kind==='weakness');const create=names.filter(n=>!old.some(i=>en(i)===n)).map(n=>fresh(c.weaknesses.find(i=>en(i)===n)));if(create.length)await a.createEmbeddedDocuments('Item',create);const remove=old.filter(i=>!names.includes(en(i))).map(i=>i.id);if(remove.length)await a.deleteEmbeddedDocuments('Item',remove);}
async function applyBloodline(template,a,choices={}){
 ensure(a);if(a.getFlag(ID,'vampire')){if(a.getFlag(ID,'templateId')===template.id)return;throw Error('Postać ma już ród krwi. Usuń poprzedni template przed zastosowaniem innego.');}
 const c=await data(),b=c.bloodlines.find(x=>x.en===meta(template).en);if(!b)throw Error('Nieznany ród.');
 //if(a.type==='character'&&!/^(human|człowiek)$/i.test(a.system.details.species.value)&&!game.settings.get(ID,'allowNonHumanVampires'))throw Error('Vampire PC wymaga Species Human. Wyjątek homebrew może włączyć MG w ustawieniach.');
 const providedChoices=choices;
 const lineTalents=b.en==='Independent'?[...b.talents.slice(0,3),'Random Talent','Random Talent']:b.talents;
 if(!choices.gift){choices=await foundry.applications.api.DialogV2.prompt({window:{title:b.en+' — Blood Kiss'},position:{width:610},content:`<p>Wybierz dar i pięć talentów rodu. Modyfikatory template’u nakładają się na aktualny profil; rozwinięcia i wyposażenie pozostają. Dla nowej postaci zacznij od profilu człowieka. Dla Independent wpisz dwa talenty wylosowane według podręcznika podstawowego.</p><label>Blood Gift<select name="gift">${b.gifts.filter(n=>!['Natural Necromancer',b.en==='Necrarch'?'Walking Death':b.en==='Strigoi'?'Bloody Fury':'Pass for Human'].includes(n)).map(n=>`<option>${esc(n)}</option>`).join('')}</select></label>${weaknessFields(c,b)}${lineTalents.map((n,i)=>`<label>${esc(n)}<input name="talent${i}" value="${n==='Random Talent'?'':esc(specDefault(n.split(' or ')[0]))}"></label>`).join('')}`,ok:{label:'Zastosuj ród',callback:(_e,button)=>Object.fromEntries(new FormData(button.form))},rejectClose:false});if(!choices){await template.delete({ccCancel:true});return;}}
 choices={...providedChoices,...choices};
 if(!b.gifts.includes(choices.gift))throw Error('Nieprawidłowy dar rodu.');
 const innate=['Natural Necromancer',b.en==='Necrarch'?'Walking Death':b.en==='Strigoi'?'Bloody Fury':'Pass for Human'];if(innate.includes(choices.gift))throw Error('Ten dar otrzymujesz już automatycznie. Wybierz inny dar rodu.');
 const additions=[];
 for(let i=0;i<5;i++){const n=choices['talent'+i]||specDefault(lineTalents[i].split(' or ')[0]);const t=await sourceItem(n,'talent');if(!t)throw Error(`Brak talentu ${n} w Core Rulebook. Uzupełnij go przed konwersją.`);if(!a.items.some(x=>x.type==='talent'&&x.name===t.name))additions.push(t);}
 for(const name of ['Bite','Claw','Dark Vision','Fear','Painless','Undead','Vampiric'])if(!a.items.some(i=>i.type==='trait'&&en(i)===name)){
  const t=await coreTrait(name,['Bite','Claw'].includes(name)?3:name==='Fear'?1:undefined);if(name==='Claw')t.name='Claw';additions.push(t);
 }
 if(['Necrarch','Strigoi'].includes(b.en)){const t=await coreTrait('Animosity',b.en==='Necrarch'?'The Living':'Other Bloodlines');additions.push(t);}
 for(const name of new Set(['Natural Necromancer',b.en==='Necrarch'?'Walking Death':b.en==='Strigoi'?'Bloody Fury':'Pass for Human',choices.gift]))if(!owned(a,name))additions.push(fresh(c.gifts.find(i=>en(i)===name)));
 for(const name of await selectWeaknesses(b,choices))if(!owned(a,name))additions.push(fresh(c.weaknesses.find(i=>en(i)===name)));
 const skills=[...new Set(['Dodge','Intimidate','Language (Classical)','Melee (Basic)','Perception','Stealth (Urban)',...b.skills.map(specDefault)])];
 for(const name of skills)if(!a.items.some(i=>i.type==='skill'&&i.name===name))additions.push(await skillItem(name));
 const snapshot={species:copy(a.system.details.species),move:a.system.details.move.value,status:Object.fromEntries(['fate','fortune','resilience','resolve'].filter(k=>a.system.status[k]).map(k=>[k,copy(a.system.status[k])])),sheet:a.getFlag('core','sheetClass')||'',flags:copy(a.flags[ID]||{}),initials:Object.fromEntries(KEYS.map(k=>[k,a._source.system.characteristics[k].initial])),removed:[]};
 const swaps={'Doomed':null,'Holy Hatred':'Hatred (Cultists)','Holy Visions':'Sixth Sense','Pure Soul':'Strong-minded'};
 for(const i of a.items){const n=en(i);if(Object.hasOwn(swaps,n)||/^(Bless|Invoke)(\s|\(|$)/.test(n)){snapshot.removed.push(i.toObject());const replacement=Object.hasOwn(swaps,n)?swaps[n]:n.startsWith('Bless')?'Petty Magic':'Arcane Magic (Necromancy)';if(replacement){const t=await sourceItem(replacement,'talent');if(!t)throw Error('Brak talentu '+replacement);additions.push(t);}}}
 await template.setFlag(ID,'snapshot',snapshot);
 for(const i of additions){delete i._id;i.flags={...i.flags,wfrp4e:{...i.flags?.wfrp4e,fromTemplate:template.id},[ID]:{...meta(i),templateSource:template.id}};}
 const update={'system.details.species.value':'Vampire','system.details.species.subspecies':b.en,'system.details.move.value':6,[`flags.${ID}.vampire`]:true,[`flags.${ID}.bloodline`]:b.en,[`flags.${ID}.bloodThirst`]:true,[`flags.${ID}.vampireRank`]:choices.vampireRank||'Newborn',[`flags.${ID}.templateId`]:template.id,[`flags.${ID}.state`]:{age:1,intervals:0,preferredLevels:1},'flags.core.sheetClass':sheetIds[a.type]};
 for(const [k,v] of Object.entries({fate:0,fortune:0,resilience:4,resolve:4}))if(a.system.status[k])update[`system.status.${k}.value`]=v;
 if(a.type==='character')update[`flags.${ID}.pools`]={species:240,career:400,speciesSkills:skills,careerSkills:a.items.find(i=>i.type==='career'&&i.system.current.value)?.system.skills||[]};
 await a.update(update,{skipExperienceChecks:true});
 if(snapshot.removed.length)await a.deleteEmbeddedDocuments('Item',snapshot.removed.map(i=>i._id),{skipExperienceChecks:true});
 await a.createEmbeddedDocuments('Item',additions,{skipExperienceChecks:true,skipSpecialisationChoice:true,ccTemplate:true});
 await template.setFlag(ID,'initialDelta',Object.fromEntries(KEYS.map(k=>[k,a._source.system.characteristics[k].initial-snapshot.initials[k]])));
 await syncTraits(a);await template.setFlag(ID,'applied',true);await finishBloodKiss(a,choices);await a.sheet.close();a._sheet=null;a.sheet.render(true);
 await report(a,'Blood Kiss',`<p>Ród ${esc(b.en)}. Dodano cechy Core Rulebook, talenty, dary i słabości. Wampiryzm obsługujesz w zakładce Vampire. Wybór nowej profesji i wydanie 400 PD pozostają na karcie rozwoju.</p>`);
}
async function undoBloodline(t,a){
 const snap=t.getFlag(ID,'snapshot');if(!snap)return;
 const ids=a.items.filter(i=>meta(i).templateSource===t.id).map(i=>i.id);if(ids.length)await a.deleteEmbeddedDocuments('Item',ids,{ccTemplate:true});
 const update={'system.details.species':snap.species,'system.details.move.value':snap.move,'flags.core.sheetClass':snap.sheet,[`flags.-=${ID}`]:null};for(const [k,v] of Object.entries(snap.status))update[`system.status.${k}`]=v;
 for(const [k,v] of Object.entries(t.getFlag(ID,'initialDelta')||{}))if(v)update[`system.characteristics.${k}.initial`]=a._source.system.characteristics[k].initial-v;
 await a.update(update,{skipExperienceChecks:true});if(Object.keys(snap.flags).length)await a.update({[`flags.${ID}`]:snap.flags});await syncTraits(a);await a.sheet.close();a._sheet=null;
 if(snap.removed?.length)await a.createEmbeddedDocuments('Item',snap.removed.map(fresh),{skipExperienceChecks:true,skipSpecialisationChoice:true});
}
export function installVampires(){
 installRefinements();
 installNativeSpells();
 const cfg=game.wfrp4e.config;
 Hooks.on('renderDialogV2',bindWeaknessFields);
 game.settings.register(ID,'allowNonHumanVampires',{name:'Vampire PC spoza Human (homebrew)',scope:'world',config:true,type:Boolean,default:false});
 game.settings.register(ID,'minimumFourWeaknesses',{name:'Co najmniej cztery aktywne słabości przy zakupie darów',scope:'world',config:true,type:Boolean,default:false});
 for(const [key,label] of Object.entries({silver:'Silver',gromril:'Gromril',ithilmar:'Ithilmar'})){
  cfg.weaponQualities[key]??=label;
  cfg.qualityDescriptions[key]??='Complete Counts: zaleta rozpoznawana przez odpowiednią słabość wampira.';
 }
 for(const hook of ['createItem','updateItem','deleteItem'])Hooks.on(hook,(doc,...args)=>{if(args.at(-2)?.ccMigration)return;clearTimeout(auraTimer);auraTimer=setTimeout(refreshAuras,350);});
 game.settings.registerMenu(ID,'upgrade',{name:'Complete Counts — aktualizacja aktora',label:'Aktualizuj aktora CC',hint:'Uzupełnia efekty, angielskie nazwy, Species i kartę istniejącego aktora.',icon:'fas fa-droplet',restricted:true,type:class extends foundry.applications.api.ApplicationV2{render(){foundry.applications.api.DialogV2.prompt({window:{title:'Complete Counts — aktualizacja'},content:`<p>Wybierz aktora do aktualizacji. Zachowasz jego profil, ekwipunek i rozwinięcia. Aktualizacja uzupełni efekty i opisy pozycji CC.</p><select name="actor">${game.actors.filter(a=>a.flags[ID]).map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select>`,ok:{label:'Aktualizuj',callback:async(_e,b)=>upgradeActor(game.actors.get(b.form.elements.actor.value))},rejectClose:false});return this;}}});
 const model=CONFIG.Item.dataModels.template,apply=model.prototype.apply,undo=model.prototype.undo;
 model.prototype.apply=async function(a){if(meta(this.parent).kind!=='bloodlineTemplate')return apply.call(this,a);try{return await applyBloodline(this.parent,a,meta(this.parent).choices||{});}catch(e){ui.notifications.error(e.message);console.error(e);if(a.items.has(this.parent.id))await this.parent.delete({ccCancel:true});}};
 model.prototype.undo=async function(a){if(meta(this.parent).kind!=='bloodlineTemplate')return undo.call(this,a);return undoBloodline(this.parent,a);};
 Hooks.on('preCreateItem',(i)=>{if(meta(i).kind==='bloodlineTemplate'&&i.parent?.items.some(x=>meta(x).kind==='bloodlineTemplate')){ui.notifications.warn('Na karcie może być tylko jeden template rodu.');return false;}});
 for(const hook of ['createItem','updateItem','deleteItem'])Hooks.on(hook,(i,...args)=>{if(args.at(-2)?.ccMigration)return;if(args.at(-1)===game.user.id&&i.actor&&['gift','weakness','bloodlineTemplate'].includes(meta(i).kind))schedule(i.actor);});
 Hooks.on('updateActor',(a,changes,_options,user)=>{if(user===game.user.id&&Object.keys(foundry.utils.flattenObject(changes)).some(k=>k.startsWith('system.characteristics.')||k==='system.details.move.value'))schedule(a);});
 Hooks.on('createActor',(a,_options,user)=>{if(user===game.user.id)schedule(a);});
 Hooks.on('preCreateItem',i=>{if(i.type==='critical'&&i.actor&&rank(i.actor,'Wound Resistant')){const wounds=Number(i.system.wounds.value);if(Number.isFinite(wounds)&&wounds>0)i.updateSource({'system.wounds.value':Math.max(1,wounds-2)});}});
 Hooks.on('deleteActiveEffect',async e=>{if(!e.parent?.isOwner)return;const ids=meta(e).restoreConditions;if(ids?.length)await e.parent.updateEmbeddedDocuments('ActiveEffect',ids.filter(id=>e.parent.effects.has(id)).map(id=>({_id:id,disabled:false})));const items=meta(e).cleanupItems;if(items?.length)await e.parent.deleteEmbeddedDocuments('Item',items.filter(id=>e.parent.items.has(id)));});
 for(const hook of ['updateWorldTime','updateCombat'])Hooks.on(hook,expire);
 for(const hook of ['createActiveEffect','deleteActiveEffect'])Hooks.on(hook,e=>{if(e.parent?.documentName==='Actor'&&(e.statuses.has('unconscious')||e.statuses.has('dead'))){expire();clearTimeout(auraTimer);auraTimer=setTimeout(refreshAuras,350);}});
 for(const hook of ['canvasReady','updateToken','createToken','deleteToken','updateActor','deleteActor'])Hooks.on(hook,()=>{clearTimeout(auraTimer);auraTimer=setTimeout(refreshAuras,350);});
 Hooks.once('ready',()=>{
  Object.assign(game.modules.get(ID).api,{activate,chooseWeaknesses,selectWeaknesses,syncTraits,applyBloodline,resetUses,passive,nativeSpellPrepare,nativeSpellItems,nativeSpellHeal,nativeBloodBite,nativeSpiritChain,coreTrait,healTarget:heal,refreshAuras,expire,upgradeActor});
  const skillProto=CONFIG.Item.dataModels.skill.prototype,cost=Object.getOwnPropertyDescriptor(skillProto,'cost');
  if(cost?.get)Object.defineProperty(skillProto,'cost',{configurable:true,get(){const base=cost.get.call(this),a=this.parent.actor,n=this.parent.name;const career=a?.items.find(i=>i.type==='career'&&i.system.current.value);return a&&rank(a,'Night Witch')&&['Language (Magick)','Channelling (Dhar)'].includes(n)&&career?Math.max(0,base-(career._source.system.skills?.includes(n)?5:0)):base;}});
  const proto=game.wfrp4e.rolls.TestWFRP.prototype,miscasts=proto._handleMiscasts;
  proto._handleMiscasts=function(count){const a=this.actor,spell=this.item;const dhar=spell?.system.wind?.value==='dhar'||['necromancy','dhar'].includes(spell?.system.lore?.value);if(spell?.type==='spell'&&!dhar&&this.result.roll%11===0&&a?.effects.some(e=>e.name==='Wellspring of Dhar — aura'&&!e.disabled))count=Math.max(1,count);const knows=a?.items.some(i=>i.type==='talent'&&/Arcane Magic.*Necromancy/.test(i.name));if(knows&&rank(a,'Natural Necromancer')&&this.succeeded&&this.result.roll%11===0&&(spell?.system.wind?.value==='dhar'||spell?.system.lore?.value?.includes('necromancy')))count=Math.max(0,count-1);return miscasts.call(this,count);};
  const actorProto=CONFIG.Actor.documentClass.prototype,dispel=actorProto.setupDispel;
  actorProto.setupDispel=async function(cast){const t=await dispel.call(this,cast);if(t&&cast.actor&&rank(cast.actor,'Dark Acolyte')&&cast.item?.system.lore?.value?.includes('necromancy')){t.preData.slBonus=(t.preData.slBonus||0)-3;t.context.appendTitle=(t.context.appendTitle||'')+' — Dark Acolyte (−3 SL)';}return t;};
 });
}
async function resetUses(a){ensure(a);await a.setFlag(ID,'uses',{});for(const t of game.actors){const effects=t.effects.filter(e=>meta(e).untilDawn===a.uuid),items=t.items.filter(i=>meta(i).untilDawn===a.uuid);if(!t.isOwner&&(effects.length||items.length))continue;if(effects.length)await t.deleteEmbeddedDocuments('ActiveEffect',effects.map(e=>e.id));if(items.length)await t.deleteEmbeddedDocuments('Item',items.map(i=>i.id));}await report(a,'Świt / nowy dzień','<p>Odnowiono dzienne moce i zakończono efekty tego wampira oznaczone jako trwające do świtu. MG wykonuje tę czynność także dla celów poza twoją kontrolą.</p>');}
const targets=opts=>[...new Map((opts?.targets||[...game.user.targets].map(t=>t.actor)).filter(Boolean).map(a=>[a.uuid,a])).values()];
function requireTargets(opts){const ts=targets(opts);if(!ts.length)throw Error('Zaznacz przynajmniej jeden cel na scenie.');return ts;}
async function choose(title,options){return foundry.applications.api.DialogV2.wait({window:{title},content:'<p>Wybierz zastosowanie reguły.</p>',buttons:options.map(([action,label])=>({action,label})),rejectClose:false});}
async function number(title,value=1){return foundry.applications.api.DialogV2.prompt({window:{title},content:`<input name="number" type="number" min="0" value="${value}">`,ok:{label:'Zastosuj',callback:(_e,b)=>Math.max(0,Number(b.form.elements.number.value)||0)},rejectClose:false});}
async function condition(a,id,n=1){ensure(a);return a.addCondition(id,n);}
async function heal(a,n){ensure(a);return a.update({'system.status.wounds.value':Math.min(a.system.status.wounds.max,a.system.status.wounds.value+n)});}
async function loss(a,n){ensure(a);return a.update({'system.status.wounds.value':Math.max(0,a.system.status.wounds.value-n)});}
async function advantage(a,n){ensure(a);if(a.system.status.advantage)return a.update({'system.status.advantage.value':Math.max(0,a.system.status.advantage.value+n)});}
function scriptEffect(name,trigger,script,{rounds,seconds,flags={},description='',origin=null}={}){if(rounds&&!game.combat)seconds??=rounds*10;return {name,img:`${PATH}/assets/blood.svg`,...(origin?{origin}:{}),...(description?{description}:{}),duration:{...(rounds?{rounds,startRound:game.combat?.round,startTurn:game.combat?.turn,combat:game.combat?.id}:{}),...(seconds?{seconds,startTime:game.time.worldTime}:{})},flags:{[ID]:flags},system:{transferData:{type:'document',documentType:'Actor'},scriptData:[{label:name,trigger,script,options:trigger==='dialog'?{activateScript:'return true;'}:{}}]}};}
async function timed(a,name,{modifier,SL,rounds,seconds,changes,script,trigger='dialog',flags}={}){
 ensure(a);const e=scriptEffect(name,trigger,script??`args.fields.${SL!==undefined?'slBonus':'modifier'} += ${SL??modifier??0};`,{rounds,seconds,flags});if(changes)e.changes=changes;if(script==='')e.system.scriptData=[];const old=a.effects.find(x=>x.name===name&&x.flags[ID]);if(old){await old.update(e);return old;}return (await a.createEmbeddedDocuments('ActiveEffect',[e]))[0];
}
async function opposed(a,skill,defSkill,opts){const ts=requireTargets(opts),at=await test(a,skill);if(!at)return [];const out=[];for(const t of ts){ensure(t);const dt=await test(t,defSkill);if(dt)out.push({target:t,SL:result(at).SL-result(dt).SL,won:result(at).SL>result(dt).SL||(result(at).SL===result(dt).SL&&at.result.target>dt.result.target)});}return out;}
async function rule(item,extra=''){return report(item.actor,item.name,extra+item.system.description.value);}
async function tempTrait(a,name,spec,seconds){const t=await coreTrait(name,spec);t.flags[ID].expires=game.time.worldTime+seconds;return a.createEmbeddedDocuments('Item',[t]);}
async function armouredFlesh(item,opts={}){
 const a=ensure(item.actor),maximum=rank(a,'Armoured Flesh');
 const locations={head:'Głowa',body:'Korpus',lArm:'Lewa ręka',rArm:'Prawa ręka',lLeg:'Lewa noga',rLeg:'Prawa noga'};
 if(!maximum)throw Error('Brak aktywnego Armoured Flesh.');
 let answer=opts;
 if(!opts.mode){
  const damage=a.getFlag(ID,'armourDamage')||{};
  const content=`<p>Armoured Flesh: ${maximum} PP na lokalizację. Zmiany dotyczą wyłącznie pancerza z daru.</p><table><thead><tr><th>Lokalizacja</th><th>Uszkodzone PP</th><th>Pozostałe PP</th></tr></thead><tbody>${Object.entries(locations).map(([key,label])=>{const n=Math.min(maximum,Math.max(0,Number(damage[key])||0));return `<tr><td>${label}</td><td>${n}</td><td>${maximum-n}</td></tr>`;}).join('')}</tbody></table><div class="form-group"><label>Lokalizacja</label><select name="location">${Object.entries(locations).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select></div><div class="form-group"><label>Liczba PP</label><input name="points" type="number" min="1" max="${maximum}" step="1" value="1" required></div><p>Naprawa: 5 Ran wypitej krwi za 1 PP. Krew przeznaczoną na naprawę rozlicz osobno — nie używaj jej ponownie do leczenia lub karmienia. Cofnięcie służy korekcie pomyłki, bez kosztu krwi.</p>`;
  answer=await foundry.applications.api.DialogV2.wait({window:{title:'Armoured Flesh — pancerz'},content,buttons:[['damage','Uszkodź'],['undo','Cofnij uszkodzenie'],['repair','Napraw krwią']].map(([action,label])=>({action,label,callback:(_event,b)=>({mode:action,location:b.form.elements.location.value,points:Number(b.form.elements.points.value)})})),rejectClose:false});
  if(!answer)return;
 }
 const {mode,location}=answer,points=Number(answer.points);
 if(!['damage','undo','repair'].includes(mode)||!Object.hasOwn(locations,location))throw Error('Wybierz działanie i lokalizację Armoured Flesh.');
 if(!Number.isSafeInteger(points)||points<1)throw Error('Liczba PP musi być dodatnią liczbą całkowitą.');
 const damage=copy(a.getFlag(ID,'armourDamage')||{}),before=Math.min(maximum,Math.max(0,Number(damage[location])||0));
 const after=mode==='damage'?Math.min(maximum,before+points):Math.max(0,before-points),changed=Math.abs(after-before);
 if(!changed){ui.notifications.info(mode==='damage'?'Armoured Flesh w tej lokalizacji jest już całkowicie uszkodzone.':'Armoured Flesh w tej lokalizacji nie ma uszkodzeń.');return;}
 await a.setFlag(ID,'armourDamage',{...damage,[location]:after});
 await report(a,'Armoured Flesh',`<p>${locations[location]}: ${mode==='damage'?'uszkodzono':mode==='repair'?'naprawiono':'cofnięto uszkodzenie'} ${changed} PP. Pozostało ${maximum-after}/${maximum} PP z daru.</p>${mode==='repair'?`<p>Koszt: ${changed*5} Ran wypitej krwi, do rozliczenia osobno.</p>`:''}`);
 return {location,damage:after,remaining:maximum-after,bloodCost:mode==='repair'?changed*5:0};
}
export async function activate(item,opts={}){try{return await activateInternal(item,opts);}catch(error){ui.notifications.error(error.message||String(error));return false;}}
async function activateInternal(item,opts={}){
 if(!item?.actor)throw Error('Użyj mocy z karty postaci.');const a=ensure(item.actor),name=en(item),r=rank(a,name)||1,wp=a.system.characteristics.wp.bonus;
 if(meta(item).kind==='spell'){const cast=await a.setupCast(item);if(cast)return cast.roll();return;}
 if(meta(item).kind==='weakness')return weakness(item,opts);
 if(traitMap[name]&&name!=='Ravening Beast'||['Wings','Tongue Attack','Venomous Bile','Diseased (Type)'].includes(name)){await syncTraits(a);return rule(item,'<p>Cecha wraz z efektami Core Rulebook jest na karcie Combat/Traits.</p>');}
 if(name==='Quicksilver'){await syncNature(a);return rule(item,'<p>Ataki bronią wręcz korzystają z Fast. Kolejność rozstrzygaj zgodnie z zasadami Fast.</p>');}
 if(name==='Walking as the Wind'){const tokens=a.getActiveTokens();const on=!a.getFlag(ID,'hovering');await a.setFlag(ID,'hovering',on);for(const token of tokens){if(on)await token.document.setFlag(ID,'groundElevation',token.document.elevation);await token.document.update({elevation:on?token.document.elevation+2:token.document.getFlag(ID,'groundElevation')??0});}return rule(item);}
 if(name==='Parasite'){const blood=opts.blood??await number('Ile Ran krwi / pokarmu przyjęto?',3);if(blood)return feed(a,blood);return;}
 if(name==='Noble Descent')return rule(item,`<p>Zasięg dowodzenia: ${200+100*(r-1)} jardów. Limit sług: ${a.system.characteristics.wp.value+(rank(a,'Dark Majesty')?30:0)}.</p>`);
 if(name==='Scent Blood'){const token=a.getActiveTokens()[0];if(!token)throw Error('Umieść wampira na aktywnej scenie.');const scents=(canvas.tokens.placeables||[]).filter(t=>t.actor&&t.id!==token.id&&!t.actor.items.some(i=>en(i)==='Undead')).map(t=>({t,d:Math.hypot(t.center.x-token.center.x,t.center.y-token.center.y)/canvas.grid.size*canvas.scene.grid.distance})).filter(x=>x.d<=16);return rule(item,`<p>Źródła świeżej krwi w promieniu 16 jardów: ${scents.length}. ${scents.map(x=>`${x.t.visible?esc(x.t.name):'Ukryte źródło'}: ${Math.round(x.d*10)/10} jardów`).join('; ')}. MG wyklucza istoty bez krwi.</p>`);}
 if(name==='Vanguard'){if(!a.mount?.items.some(i=>en(i)==='Stride'))throw Error('Vanguard wymaga wierzchowca z cechą Stride.');return rule(item,`<p>Darmowy Bieg przed pierwszą turą: do ${a.mount.system.details.move.run} jardów. Przesuń żeton wierzchowca po wybranej trasie.</p>`);}
 if(name==='Vagabond Knight')return rule(item,'<p>Podstawowy system nie odejmuje Przewagi automatycznie za samą przewagę liczebną. Zachowaj ją; zwykłe modyfikatory przeciwników nadal działają.</p>');
 if(['Bat Form','Wolf Form','Familiar Form'].includes(name))return a.getFlag(ID,'transformation')?revert(a):transform(a,{'Bat Form':'Vampire Bat','Wolf Form':'Doom Wolf','Familiar Form':'Vampire Familiar'}[name]);
 if(name==='Pass for Human')return game.modules.get(ID).api.toggleHuman(a);
 if(name==='Defy the Dawn'){const t=await test(a,'Endurance');if(t){await a.setFlag(ID,'dawnProtection',result(t).success);await syncNature(a);}return;}
 if(name==='Revenant'){if(a.system.status.wounds.value>0)throw Error('Revenant działa przy 0 Żywotności.');const t=await test(a,'Endurance');if(t&&result(t).success){await heal(a,1);await setCondition(a,'unconscious',0);}return;}
 if(name==='Glamour'){const mode=opts.mode||await choose(name,[['beauty','Piękno: Ogłada +10'],['ugly','Odraza: Zastraszanie +10'],['features','Rysy: Aktorstwo +10']]);if(!mode)return;return timed(a,name,{seconds:wp*60,changes:mode==='beauty'?[{key:'system.characteristics.fel.modifier',mode:2,value:'10'}]:[],script:mode==='beauty'?'':`if(args.skill?.name?.includes(${JSON.stringify(mode==='ugly'?'Intimidate':'Entertain')}))args.fields.modifier+=10;`});}
 if(name==='Ethereal Mist'||name==='Swarm Form (Type)')return game.modules.get(ID).api.toggleSpiritForm(item);
 if(name==='Walking Death'){await syncTraits(a);return;}
 if(['Domination','Mind Flayer','Transfixing Gaze','Psychic Drain','Corrupted Innocence'].includes(name)){
  
  if(name==='Psychic Drain'){
   const origin=a.getActiveTokens()[0],selected=requireTargets(opts);if(!origin)throw Error('Umieść wampira na scenie.');
   const living=selected.filter(t=>t.uuid!==a.uuid&&!t.items.some(i=>en(i)==='Undead')&&!t.hasCondition('dead')&&t.getActiveTokens().some(token=>Math.hypot(token.center.x-origin.center.x,token.center.y-origin.center.y)/canvas.grid.size*canvas.scene.grid.distance<=8));
   if(!living.length)throw Error('Zaznacz żywe cele w promieniu 8 jardów.');
   if(!opts.confirmed){const ok=await foundry.applications.api.DialogV2.confirm({window:{title:'Psychic Drain'},content:`<p>Cele w promieniu 8 jardów: ${living.map(t=>esc(t.name)).join(', ')}. Rozstrzygnąć testy przeciwstawne?</p>`});if(!ok)return;}
   opts={...opts,targets:living};
  }
  const skill=name==='Mind Flayer'?'Intimidate':['Transfixing Gaze','Corrupted Innocence'].includes(name)?'Charm':'Cool';
  for(const x of await opposed(a,skill,'Cool',opts))if(x.won){
   if(name==='Domination'){const command=opts.commandText??await foundry.applications.api.DialogV2.prompt({window:{title:'Compulsion — polecenie'},content:'<textarea name=command></textarea>',ok:{label:'Zapisz',callback:(_e,b)=>b.form.elements.command.value},rejectClose:false});if(command!==null)await compulsion(x.target,a,Math.max(1,x.SL),command||'Polecenie ustalone przy stole.');}
   if(name==='Mind Flayer')await condition(x.target,x.SL>=6?'broken':'fatigued',x.SL>=6?1:1+Math.floor(x.SL/2));
   if(name==='Corrupted Innocence'){const e=await timed(x.target,'Corrupted Innocence',{script:'',flags:{source:a.uuid,protectedTarget:a.uuid,SL:x.SL}});await e.update({description:`<p>Nie możesz skrzywdzić ${esc(a.name)} po przegranym przeciwstawnym Cool/Charm. GM rozstrzyga nową próbę oporu. Nie zmienia to kontroli nad twoją postacią.</p>`});}
   if(name==='Transfixing Gaze')await timed(x.target,'Helpless — Transfixing Gaze',{rounds:1,script:'',flags:{helpless:true}});
   if(name==='Psychic Drain'){const n=1+Math.floor(x.SL/2);await loss(x.target,n);await feed(a,n);}
  }return;
 }
 if(name==='Blademaster'){for(const t of requireTargets(opts))await timed(t,name,{rounds:1,changes:[{key:'system.status.advantage.value',mode:5,value:'0'}],script:''});return;}
 if(name==='Bait')return bait(item,opts);
 if(['Deathless Minions','Ruler of the Night'].includes(name))return auraControl(item,opts);
 if(name==='Hornblower'){for(const ally of new Map([a,...targets(opts)].map(x=>[x.uuid,x])).values())await advantage(ally,1);return rule(item,'<p>Dodano Przewagę. Pierwsze zadęcie: Strach +1 do końca walki.</p>');}
 if(name==='Martial Honour'){const mode=opts.mode||await choose(name,[['accept','Przyjmuję wyzwanie'],['refuse','Odmawiam']]);if(mode){if(mode==='accept')await advantage(a,1);await a.update({'system.status.resolve.value':Math.max(0,Math.min(a.system.status.resilience.value,a.system.status.resolve.value+(mode==='accept'?1:-1)))});}return;}
 if(name==='Blood Burst'){for(const t of requireTargets(opts)){const roll=await test(t,'Dodge');if(roll&&!result(roll).success)await timed(t,name,{rounds:2,script:'if(args.weapon||args.item?.type==="trait")args.fields.modifier-=20;'});}return;}
 if(name==='Waterwalker'){if(r<2)await test(a,'Cool');return;}
 if(name==='Ravening Beast'){await syncTraits(a);const e=owned(a,'Frenzy')?.effects.contents[0];if(!e)throw Error('Brak efektu Frenzy.');await e.update({disabled:!e.disabled});return rule(item,`<p>Frenzy: ${e.disabled?'wyłączony':'aktywny'}.</p>`);}
 if(name==='Monstrous Glory'){for(const t of requireTargets(opts)){const roll=await test(t,'Cool');if(roll&&!result(roll).success)await condition(t,'broken');}return;}
 if(name==='Deathless Vigour'){const adv=a.system.status.advantage.value;if(adv<1)throw Error('Potrzebujesz co najmniej 1 Przewagi.');const previous=new Set(meta(a.effects.find(e=>e.name===name)).restoreConditions||[]),effects=a.effects.filter(e=>e.isCondition&&(!e.disabled||previous.has(e.id)));await a.update({'system.status.advantage.value':0});await a.updateEmbeddedDocuments('ActiveEffect',effects.map(e=>({_id:e.id,disabled:true})));return timed(a,name,{rounds:1,trigger:'applyDamage',script:`if(args.sourceItem?.isMelee)args.totalWoundLoss+=${effects.reduce((sum,e)=>sum+Math.max(1,Number(e.conditionValue)||1),0)};`,flags:{restoreConditions:effects.map(e=>e.id)}});}
 if(['Summon Ghouls','Summon Wolves','Summon Vermin'].includes(name)){const t=await test(a,'Leadership');if(!t||!result(t).success)return;const count=Math.max(0,Number(result(t).SL)||0);if(name==='Summon Vermin')return report(a,name,`<p>Rój przybywa natychmiast. Dodaj Swarm i +${Math.floor(count/2)} Wounds. Czas trwania: ${wp} rund. Umieść wybrany token roju na scenie.</p>`);return report(a,name,`<p>Liczba przywołanych: ${count}${name==='Summon Wolves'?` Wolves lub ${Math.floor(count/2)} Dire Wolves`: ' Ghouls'}. Przybycie po ${Math.max(1,Math.ceil((result(t).roll%10)/2))} rundach. Czas trwania: ${wp} godzin. Umieść odpowiednie tokeny na scenie.</p>`);}
 if(name==='Summon Storm')return storm(item,opts);

 if(name==='Armoured Flesh')return armouredFlesh(item,opts);
 if(['Aethyric Cipher','Beastly Whisper','Dark Majesty','Deathsight'].includes(name)){await test(a,['Beastly Whisper','Dark Majesty'].includes(name)?'Leadership':name==='Deathsight'?'Charm':'Cool');return rule(item);}
 if(name==='Dark Fate')return rule(item,'<p>Punkty Mrocznego Losu wydajesz i odnawiasz w sekcji Dark Fate zakładki Vampire.</p>');
 if(name==='Malformed'){const p=game.packs.get(ID+'.tables'),idx=await p.getIndex(),row=idx.find(t=>t.name==='Vampiric Physical Degeneration');if(row)return (await p.getDocument(row._id)).sheet.render(true);return rule(item);}
 if(name==='Nehekharan Scroll (Spell)')return scrollGift(item,opts);
 if(name==='Host'){for(const t of requireTargets(opts))await game.wfrp4e.utility.postFear(3,a.name);return;}


 return rule(item,'<p>Efekt stały lub kontekstowy jest dostępny na karcie i w oknach testów. Poniżej pełna reguła.</p>');
}
async function weakness(item,opts){
 const a=item.actor,n=en(item);if(['Barriers','No Reflection','Daemonsroot and Witchbane','Religious Symbols','Sawdust and Embalming Fluid','Gromril and Ithilmar'].includes(n))return;const suppression=suppressedBy(a,n);if(suppression)return rule(item,`<p>${esc(suppression)} neutralizuje ${esc(n)}.</p>`);
 if(n==='Sunlight'){const minutes=opts.minutes??await number('Minuty w słońcu',1);if(minutes===null)return;return sun(a,minutes,opts.overcast||false);}
 if(n==='Soil Sleeper'){const mode=opts.mode||await choose(n,[['soil','Dzień bez ojczystej ziemi'],['full','Pełny dzień snu z ojczystą ziemią']]);if(!mode)return;const current=state(a);if(mode==='soil'){await condition(a,'fatigued');await a.setFlag(ID,'state',{...current,protectedFatigue:(current.protectedFatigue||0)+1});}else if(mode==='full'){await setCondition(a,'fatigued',Math.max(0,(a.hasCondition('fatigued')?.conditionValue||0)-(current.protectedFatigue||0)));await a.setFlag(ID,'state',{...current,protectedFatigue:0});}return;}
 if(n==='Garlic'){await refreshAuras();return rule(item,'<p>Aura działa automatycznie: Garlic lub Czosnek w ekwipunku dowolnej postaci w promieniu 6 jardów nakłada −20 do testów. MG musi być połączony ze sceną.</p>');}
 if(n==='Stakes'){const old=a.getFlag(ID,'staked');if(!old){await a.setFlag(ID,'stakeUnconsciousAdded',!a.hasCondition('unconscious'));await setCondition(a,'unconscious',1);}else if(a.getFlag(ID,'stakeUnconsciousAdded'))await setCondition(a,'unconscious',0);await a.setFlag(ID,'staked',!old);return;}
 if(n === 'Counting'){  for(const e of a.effects.filter(e => meta(e).counting)){await e.delete();}const roll = await new Roll('1d10').evaluate();await roll.toMessage({speaker: ChatMessage.getSpeaker({actor:a}),flavor: 'Counting: minuty'});const effect = await timed(a, 'Counting', {seconds: roll.total * 60,script: 'args.fields.modifier+=20;',flags: {counting: true,countingDistracted: true}});const scripts = copy(effect.system.scriptData);scripts[0].options = {targeter: true,hideScript: "return args.item?.attackType !== 'melee';",activateScript: "return args.item?.attackType === 'melee';"};await effect.update({'system.scriptData': scripts});return;}
 if(n==='Running Water'){
  const mode=opts.mode||await choose(n,[['enter','Kontakt: +1 Ablaze'],['leave','Po wyjściu: −1 Ablaze'],['fear','Fear (3)']]);
  if(mode==='enter'){const gift=rank(a,'Waterwalker');if(gift>=2)return; if(gift){const t=await test(a,'Cool');if(t&&result(t).success)return;}return condition(a,'ablaze');}
  if(mode==='leave')return setCondition(a,'ablaze',Math.max(0,(a.hasCondition('ablaze')?.conditionValue||0)-1));
  if(mode==='fear')return game.wfrp4e.utility.postFear(3,'Running Water');return;
 }
if(n==='Silver'){
  if(owned(a,'Silvered Blood'))
    return rule(item,'<p>Silvered Blood neutralizuje Silver.</p>');

  return timed(a,'Silver',{
    trigger:'startTurn',
	seconds:1,
    script:`
      this.actor.applyBasicDamage(1, {damageType : game.wfrp4e.config.DAMAGE_TYPE.IGNORE_ALL});
    `,
    flags:{silver:true}
  });
}
 if(n==='Blessed Weapons'){const mode=opts.mode||await choose(n,[['touch','Dotyk symbolu: 1 Rana'],['water','Woda święcona: 1k10 obrażeń']]);if(mode==='touch'){const before=a.system.status.wounds.value;await loss(a,1);await report(a,n,`<p>Dotyk poświęconego przedmiotu: 1 Rana, bez redukcji. Rany: ${before} → ${a.system.status.wounds.value}.</p>`);return;}if(mode==='water'){const r=await new Roll('1d10').evaluate();await r.toMessage({speaker:ChatMessage.getSpeaker({actor:a}),flavor:n});return a.applyBasicDamage(r.total);}return;}
 if(n==='Tears'){
  const selected=requireTargets(opts);if(selected.length!==1)throw Error('Tears: wskaż jedną osobę.');const target=selected[0],threshold=Number(target.system.characteristics.fel.bonus),t=await test(a,'Cool');if(!t)return;
  const progress=copy(a.getFlag(ID,'tearsTests')||{}),key=target.uuid.replaceAll('.','_'),value=Math.max(0,(progress[key]||0)+Number(result(t).SL));if(value>threshold)delete progress[key];else progress[key]=value;
  if(value>threshold)await a.update({[`flags.${ID}.tearsTests.-=${key}`]:null});else await a.setFlag(ID,'tearsTests',progress);await report(a,n,`<p>${esc(target.name)}: ${value} SL / wymagane więcej niż ${threshold}. ${value>threshold?'Opór przełamany.':'Potrzebny dalszy test.'}</p>`);return;
 }
 if(n==='Warpstone'){
  const mode=opts.mode||await choose(n,[['approach','Podejście: Cool'],['hour','Godzina ekspozycji: wylosuj zmianę'],['choose','Godzina ekspozycji: wybierz zmianę']]);if(mode==='approach')return test(a,'Cool');
  if(mode==='hour'||mode==='choose'){
   const c=await data(),g=a.items.filter(i=>meta(i).kind==='gift'),w=a.items.filter(i=>meta(i).kind==='weakness');
   const newG=c.gifts.filter(i=>!owned(a,en(i))),newW=c.weaknesses.filter(i=>!owned(a,en(i)));
   if([g,w,newG,newW].some(list=>!list.length))throw Error('Brak darów lub słabości dostępnych do zamiany.');
   while(true){
    const draw=async(list,label)=>{const roll=await new Roll(`1d${list.length}`).evaluate(),item=list[roll.total-1];await roll.toMessage({speaker:ChatMessage.getSpeaker({actor:a}),flavor:`Warpstone — ${label}: ${esc(item.name)}`});return item;};
    let oldG,oldW,ng,nw;
    if(mode==='choose'){
     const lists={oldG:g,oldW:w,ng:newG,nw:newW},labels={oldG:'Zastępowany dar',oldW:'Zastępowana słabość',ng:'Nowy dar',nw:'Nowa słabość'};
     const selected=await foundry.applications.api.DialogV2.prompt({window:{title:'Warpstone — wybierz zmianę'},content:Object.entries(lists).map(([key,list])=>`<label>${labels[key]}<select name="${key}">${list.map((i,n)=>`<option value="${n}">${esc(i.name)}</option>`).join('')}</select></label>`).join(''),ok:{label:'Podgląd',callback:(_e,b)=>Object.fromEntries(new FormData(b.form))},rejectClose:false});if(!selected)return;
     ({oldG,oldW,ng,nw}=Object.fromEntries(Object.entries(lists).map(([key,list])=>[key,list[Number(selected[key])]])));
    }else{oldG=await draw(g,'zastępowany dar');oldW=await draw(w,'zastępowana słabość');ng=await draw(newG,'nowy dar');nw=await draw(newW,'nowa słabość');}

    const preview=`<p>Dar: ${esc(oldG.name)} → <strong>${esc(ng.name)}</strong><br>Słabość: ${esc(oldW.name)} → <strong>${esc(nw.name)}</strong></p>`;
    await report(a,'Warpstone — propozycja zmiany',preview+'<p>Wynik oczekuje na akceptację. Możesz przerzucić albo anulować.</p>');
    const decision=await foundry.applications.api.DialogV2.wait({window:{title:'Warpstone — trwała zmiana'},content:preview,buttons:[{action:'accept',label:'Zastosuj'},{action:'reroll',label:'Przerzuć'},{action:'cancel',label:'Anuluj'}],rejectClose:false});
    if(decision==='reroll')continue;
    if(decision==='accept'){await a.createEmbeddedDocuments('Item',[fresh(ng),fresh(nw)],{skipExperienceChecks:true});await a.deleteEmbeddedDocuments('Item',[oldG.id,oldW.id]);await report(a,'Warpstone — zastosowano',preview);}
    else await report(a,'Warpstone — anulowano','<p>Nie zmieniono darów ani słabości.</p>');
    return;
   }
  }return;
 }
}
export function passive(item,trigger,args,context){
 // WFRP4e 9.5.x can run source-item damage scripts with context.actor === null.
 // Prefer the owning/source actor when available; spell scripts such as Wind of Death
 // do not require a talent rank, so safely fall back to rank 1 when no owner exists.
 const a=context?.actor??item?.actor??args?.attacker??args?.sourceActor??args?.sourceItem?.actor??null,n=en(item),r=a?(rank(a,n)||1):1;
 if(meta(item).kind==='weakness'&&(!a||suppressedBy(a,n)))return;
 if(trigger==='dialog'){
  const skill=args.skill?.name||args.item?.name||args.data?.skill?.name||'';
  const optional={'Aethyric Cipher':['Cool'], 'Beastly Whisper':['Leadership'],'Blademaster':['Melee'],'Blood-Sated':['Cool'],'Dark Majesty':['Leadership'],'Deathsight':['Charm','Leadership'],'Martial Honour':['Cool'],'Quickblood':['Dodge']};
  if(optional[n]?.some(k=>skill.includes(k)))args.fields.successBonus=(args.fields.successBonus||0)+r;
  if(n==='Mastery over Death'&&skill.includes('Language'))args.fields.slBonus+=2;

  if(n==='Indefatigable')args.fields.modifier+=10*Math.min(r,a.hasCondition('fatigued')?.conditionValue||0);
  if(n==='Predator of the Night'){const skills=a.items.filter(i=>i.type==='skill'&&i.name.startsWith('Stealth'));const stealth=Math.max(...skills.map(i=>i.system.total.value),a.system.characteristics.ag.value);const normal=args.skill?.system?.total?.value||a.system.characteristics.ws.value;args.fields.modifier+=stealth-normal;}
 }
 if(trigger==='APCalc'&&n==='Armoured Flesh')a.status.addArmour(r,{source:context.effect,damage:a.getFlag(ID,'armourDamage')||{}});
 if(trigger==='preTakeDamage'){
  const source=args.sourceItem,qualities=source?.properties?.qualities||{},text=(source?.name||'')+' '+(source?.system.material?.value||''),has=key=>Boolean(qualities[key]||source?.system.qualities?.value?.some(q=>String(q.name).toLowerCase()===key)||new RegExp(key,'i').test(text)),env=a.getFlag(ID,'damageContext')||'';
  if(n==='Gromril and Ithilmar'&&(has('gromril')||has('ithilmar')))args.applyTB=false;
  if(n==='Tough Hide'&&(has('pummelling')||args.weaponProperties?.qualities?.pummelling))args.modifiers.other.push({label:n,value:-a.system.characteristics.t.bonus});
  if(n==='Fire Retardant'&&(env==='fire'||qualities.flaming))args.modifiers.other.push({label:n,value:-a.system.characteristics.t.bonus});
  const magical=Boolean(source?.system?.isMagical||qualities.magical||source?.properties?.unusedQualities?.magical||source?.system.qualities?.value?.some(q=>String(q.name).toLowerCase()==='magical'));
  const enhanced=n==='Silver'&&!owned(a,'Silvered Blood')&&has('silver')||n==='Blessed Weapons'&&magical;
  if(enhanced&&!args.ccDamaging&&!qualities.damaging&&!args.opposedTest?.result?.damaging&&args.sourceTest){args.ccDamaging=true;const units=Number(args.sourceTest.result.roll)%10||10;const breakdown=args.opposedTest?.result?.breakdown;const bonus=Math.max(0,units-Number(breakdown?.opposedSL??args.sourceTest.result.SL))*(Number(breakdown?.multiplier)||1);args.totalWoundLoss+=bonus;args.extraMessages.push(`${n}: Damaging +${bonus}`);}
 }
 if(trigger==='preApplyDamage'){
  if(['Wind of Death','Withering Wave'].includes(n)){args.applyAP=false;args.applyTB=false;}
  if(n==='Gaze of Nagash'||n==='Malediction of Nagash'||n==='Wind of Death')if(args.actor?.items?.some(i=>en(i)==='Undead'))args.abort='This spell only affects living creatures.';
  if(n==='Spirit Stealer'&&args.applyAP&&args.AP?.layers){const light=args.AP.layers.filter(l=>!l.metal).reduce((sum,l)=>sum+l.value,0);if(light)args.modifiers.other.push({label:'Spirit Stealer: light armour ignored',value:light});}
  if(n==='Furious Charge'&&args.sourceTest?.preData?.charging){
   const q=args.sourceItem?.properties?.qualities||{};let bonus=0;
   if(q.damaging)bonus=Math.max(0,Math.floor(Number(args.sourceTest.result.SL)/2));
   else if(!args.ccDamaging&&!args.opposedTest?.result?.damaging){args.ccDamaging=true;const br=args.opposedTest?.result?.breakdown;bonus=Math.max(0,(Number(args.sourceTest.result.roll)%10||10)-Number(br?.opposedSL??args.sourceTest.result.SL))*(Number(br?.multiplier)||1);}
   if(bonus){args.totalWoundLoss+=bonus;args.extraMessages.push('Furious Charge: +'+bonus);}
  }
 }
 if(trigger==='applyDamage'){
  if(n==='Terrible Blows'&&args.sourceItem?.isMelee)args.totalWoundLoss=Math.max(1+r,args.totalWoundLoss);
  const id={'Gaze of Nagash':'stunned','Shadowblood':'ablaze','Wind of Death':'broken','Malediction of Nagash':'fatigued'}[n];
  if(id&&args.totalWoundLoss>0&&!(args.ward>0&&args.wardRoll>=args.ward))return (async()=>{await args.actor.addCondition(id);if(n==='Malediction of Nagash')await heal(a,1);})();
  if(n==='Spirit Stealer'){const warded=args.ward>0&&args.wardRoll>=args.ward;if(meta(item).chainSecondary){if(args.modifiers.minimumOne)args.totalWoundLoss=0;}else if(!args.abort&&!warded)args.totalWoundLoss=Math.max(1,Number(args.totalWoundLoss)||0);}
 }
 if(trigger==='calculateSize'&&n==='Iron Sinews'&&!a.getFlag(ID,'humanForm')){const sizes=['tiny','ltl','sml','avg','lrg','enor','mnst'];const ix=sizes.indexOf(args.size);args.size=sizes[Math.min(6,Math.max(0,ix)+r)];}
 if(trigger==='startCombat'&&n==='Ageless Cunning')return advantage(a,r);
 // Quicksilver uses native Fast through Vampire Nature; no initiative override.
 if(trigger==='prepareData'&&n==='Night Witch')for(const career of a.items.filter(i=>i.type==='career'))for(const name of ['Language (Magick)','Channelling (Dhar)'])if(!career.system.skills.includes(name))career.system.skills.push(name);
 if(trigger==='preRollCastTest'&&n==='Summon Ancients'&&['Raise the Dead','Reanimate','Spell of Awakening','Summon Mount','Raise Mount'].includes(args.test.item?.name))args.test.preData.slBonus=(args.test.preData.slBonus||0)+2*r;
}
let auraTimer,auraRun=null,auraAgain=false;
async function expire(){
 if(!game.user.isGM||game.users.activeGM?.id!==game.user.id)return;
 const actors=new Map(game.actors.map(a=>[a.uuid,a]));for(const t of canvas.tokens?.placeables||[])actors.set(t.actor.uuid,t.actor);
 for(const a of actors.values()){
  const effects=a.effects.filter(e=>e.flags[ID]&&(e.duration.seconds&&game.time.worldTime>=e.duration.startTime+e.duration.seconds||e.duration.rounds&&game.combat?.id===e.duration.combat&&game.combat.round>=e.duration.startRound+e.duration.rounds));
  for(const e of effects.filter(e=>meta(e).compulsion))await a.addCondition('fatigued',Math.max(1,Number(meta(e).stacks)||1));
  if(effects.length)await a.deleteEmbeddedDocuments('ActiveEffect',effects.map(e=>e.id));
  const items=a.items.filter(i=>meta(i).expires&&game.time.worldTime>=meta(i).expires);if(items.length)await a.deleteEmbeddedDocuments('Item',items.map(i=>i.id));
 }
}
async function upgradeActor(a){
 ensure(a);const c=await data();if(!a.flags[ID])throw Error('Ten aktor nie jest oznaczony jako zawartość Complete Counts.');
 for(const item of [...a.items]){
  let src;const kind=meta(item).kind;
  if(['gift','spell','weakness','career'].includes(kind))src=c[{gift:'gifts',spell:'spells',weakness:'weaknesses',career:'careers'}[kind]].find(i=>en(i)===en(item));
  else if(kind==='baseTrait')src=c.coreTraits[aliases[en(item)]||en(item)]||await sourceItem(en(item),item.type==='trait'?'talent':item.type);
  if(!src)continue;
  if(item.type!==src.type){const d=fresh(src);d.flags={...d.flags,[ID]:{...meta(item),coreUuid:src._stats?.compendiumSource}};await a.createEmbeddedDocuments('Item',[d],{skipExperienceChecks:true,skipSpecialisationChoice:true});await item.delete();continue;}
  await item.update({name:src.name,'system.description.value':src.system.description.value,[`flags.${ID}`]:{...meta(item),...meta(src),version:2},...(src._stats?.compendiumSource?{'_stats.compendiumSource':src._stats.compendiumSource}:{})},{skipExperienceChecks:true});
  for(const raw of src.effects||[]){const existing=item.effects.get(raw._id);if(existing)await existing.update(raw);else await item.createEmbeddedDocuments('ActiveEffect',[copy(raw)]);}
 }
 const original=c.actors.find(x=>x._id===meta(a).sourceId||en(x)===meta(a).en),update={};
 if(a.getFlag(ID,'vampire')){update['system.details.species.value']='Vampire';update['system.details.species.subspecies']=a.getFlag(ID,'bloodline')||'';update['flags.core.sheetClass']=sheetIds[a.type];}
 else if(original)update['system.details.species']=copy(original.system.details.species);
 update[`flags.${ID}.version`]=2;await a.update(update,{skipExperienceChecks:true});await syncTraits(a);await a.sheet.close();a._sheet=null;await a.sheet.render(true);await report(a,'Complete Counts 2', '<p>Uzupełniono nazwy, opisy, efekty i ustawienia karty. Profil i nabyte rozwinięcia zachowano.</p>');
}
async function refreshAuras(){
 if(auraRun){auraAgain=true;return auraRun;}
 auraRun=(async()=>{do{auraAgain=false;await refreshAuraState();}while(auraAgain);})().finally(()=>{auraRun=null;});
 return auraRun;
}
async function refreshAuraState(){
 if(!canvas.ready||!game.user.isGM||game.users.activeGM?.id!==game.user.id)return;
 const tokens=canvas.tokens.placeables.filter(t=>t.actor),desired=new Map(),desiredActors=new Map();
 const units=String(canvas.scene.grid.units).toLowerCase(),unitScale=/^(m|meter|metre|metr)/.test(units)?0.9144:/^(ft|feet|foot|stop)/.test(units)?3:1;
 const addDesired=(a,key,data)=>{if(!desired.has(a.uuid))desired.set(a.uuid,new Map());desired.get(a.uuid).set(key,data);desiredActors.set(a.uuid,a);};
 const inRange=(src,dst,radius)=>Math.hypot(dst.center.x-src.center.x,dst.center.y-src.center.y)/canvas.grid.size*canvas.scene.grid.distance<=radius*unitScale;
 const knownActors=new Map([...game.actors,...tokens.map(t=>t.actor)].map(a=>[a.uuid,a]));
 const tokensByActor=new Map();for(const t of tokens){if(!tokensByActor.has(t.actor.uuid))tokensByActor.set(t.actor.uuid,[]);tokensByActor.get(t.actor.uuid).push(t);}
 await refreshGarlic(tokens);

 // Deathless Minions and Ruler of the Night stay visible on assigned Undead as Temporary Effects.
 // Leaving the aura or switching it off disables the effect instead of deleting it.
 for(const srcActor of knownActors.values()){for(const name of ['Deathless Minions','Ruler of the Night']){
  const r=rank(srcActor,name);if(!r)continue;
  const ruler=name==='Ruler of the Night',memberKey=ruler?'undeadAllies':'minions',auraFlag=ruler?'rulerAura':'deathlessAura';
  const enabled=!srcActor.hasCondition('dead')&&!srcActor.hasCondition('unconscious')&&(ruler?srcActor.getFlag(ID,auraFlag)===true:srcActor.getFlag(ID,auraFlag)!==false);
  const radius=ruler?srcActor.system.characteristics.wp.bonus:12,srcTokens=tokensByActor.get(srcActor.uuid)||[];
  for(const uuid of srcActor.getFlag(ID,memberKey)||[]){
   let dstActor=knownActors.get(uuid);if(!dstActor){try{const doc=await fromUuid(uuid);dstActor=doc?.documentName==='Actor'?doc:doc?.actor;}catch{}if(dstActor)knownActors.set(dstActor.uuid,dstActor);}
   if(!dstActor||!dstActor.items.some(i=>en(i)==='Undead'))continue;
   const dstTokens=tokensByActor.get(dstActor.uuid)||[],active=enabled&&srcTokens.some(src=>dstTokens.some(dst=>inRange(src,dst,radius)));
   const key=srcActor.uuid+':'+name;addDesired(dstActor,key,{name,rank:r,active,persistent:true,sourceName:srcActor.name,sourceUuid:srcActor.uuid});
  }
 }}

 // Wellspring of Dhar remains an ordinary proximity aura.
 for(const src of tokens){const r=rank(src.actor,'Wellspring of Dhar');if(!r||src.actor.hasCondition('dead')||src.actor.hasCondition('unconscious'))continue;const radius=src.actor.system.characteristics.wp.value;
  for(const dst of tokens)if(inRange(src,dst,radius)){const key=src.actor.uuid+':Wellspring of Dhar';addDesired(dst.actor,key,{name:'Wellspring of Dhar',rank:r,active:true,persistent:false,sourceName:src.actor.name});}
 }

 const actors=new Map([...game.actors.filter(a=>a.effects.some(e=>meta(e).auraSource)),...tokens.map(t=>t.actor),...desiredActors.values()].map(a=>[a.uuid,a]));
 for(const [uuid,a] of actors){const want=desired.get(uuid)||new Map();for(const e of a.effects.filter(e=>meta(e).auraSource))if(!want.has(meta(e).auraSource))await e.delete();
  for(const [key,d] of want){
   const revision=d.persistent?'2.3.5-native-source':'2.3.5',old=a.effects.find(e=>meta(e).auraSource===key);
   const effectName=`${d.name} — aura`;
   if(old&&meta(old).auraRank===d.rank&&meta(old).auraRevision===revision&&meta(old).auraSourceName===d.sourceName&&old.name===effectName&&(!d.persistent||old.origin===d.sourceUuid)){if(old.disabled===d.active)await old.update({disabled:!d.active});continue;}
   let trigger='dialog',script=`if(args.skill?.name?.includes('Language')&&(['necromancy','dhar'].includes(args.spell?.system?.lore?.value??args.item?.system?.lore?.value)||(args.spell??args.item)?.system?.wind?.value==='dhar'))args.fields.slBonus+=${d.rank};`;
   if(d.name==='Deathless Minions'){trigger='prePrepareItems';script='for(const i of this.actor.items.filter(i=>(i.flags?.["wfrp4e-complete-counts-pl"]?.en||i.name)==="Unstable"))i.system.disabled=true;';}
   if(d.name==='Ruler of the Night'){trigger='preTakeDamage';script=`if(args.sourceItem?.type!=='spell'&&!args.sourceItem?.system?.isMagical&&!args.sourceItem?.properties?.qualities?.magical)args.ward=args.ward?Math.min(args.ward,${10-d.rank}):${10-d.rank};`;}
   if(old)await old.delete();
   const description=d.persistent?`<p><strong>Źródło aury:</strong> ${esc(d.sourceName)}</p><p>Ten Undead jest przypisany do aury <strong>${esc(d.name)}</strong> należącej do ${esc(d.sourceName)}. Efekt włącza się i wyłącza automatycznie zależnie od przełącznika aury, stanu źródła i zasięgu.</p>`:'';
   const effect=scriptEffect(effectName,trigger,script,{...(d.persistent?{seconds:31536000000,origin:d.sourceUuid}:{}),description,flags:{auraSource:key,auraRank:d.rank,auraRevision:revision,auraPersistent:d.persistent,auraSourceName:d.sourceName}});effect.disabled=!d.active;
   await a.createEmbeddedDocuments('ActiveEffect',[effect]);
  }
 }
}

async function refreshGarlic(tokens){
 const carriers=tokens.filter(t=>t.actor.items.some(i=>meta(i).kind!=='weakness'&&/^(garlic|czosnek)(?:\s*\(|$)/i.test(en(i))&&Number(i.system.quantity?.value??1)>0));
 const units=String(canvas.scene.grid.units).toLowerCase(),radius=/^(m|meter|metre|metr)/.test(units)?5.4864:/^(ft|feet|foot|stop)/.test(units)?18:6;
 const actors=new Map(tokens.map(t=>[t.actor.uuid,t.actor]));
 for(const a of game.actors)if(a.effects.some(e=>meta(e).garlicAura||meta(e).toggle==='Garlic'))actors.set(a.uuid,a);
 for(const [uuid,a] of actors){
  const susceptible=a.items.some(i=>meta(i).kind==='weakness'&&en(i)==='Garlic'&&!i.system.disabled);
  const affected=susceptible&&tokens.some(t=>t.actor.uuid===uuid&&carriers.some(src=>Math.hypot((t.document.x-src.document.x)/canvas.grid.size+(t.document.width-src.document.width)/2,(t.document.y-src.document.y)/canvas.grid.size+(t.document.height-src.document.height)/2)*canvas.scene.grid.distance<=radius));
  const old=a.effects.filter(e=>meta(e).garlicAura||meta(e).toggle==='Garlic');
  for(const e of old)if(!affected||!meta(e).garlicAura)await e.delete();
  if(affected&&!old.some(e=>meta(e).garlicAura))await timed(a,'Garlic — aura',{modifier:-20,flags:{garlicAura:true}});
 }
}
