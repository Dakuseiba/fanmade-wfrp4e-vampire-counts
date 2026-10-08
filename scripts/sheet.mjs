import {RANKS,feedingPeriod} from './ndm.mjs';
import {ID} from './rules.mjs';
import {sheetAction,data,meta,state,owned,en} from './main.mjs';
export const sheetIds={character:`${ID}.VampireCharacterSheet`,npc:`${ID}.VampireNPCSheet`,creature:`${ID}.VampireCreatureSheet`};

function groupedGiftRows(actor){
 const groups=new Map();
 for(const item of actor.items.filter(i=>meta(i).kind==='gift')){
  const specialization=String(meta(item).specialization||'').trim().toLowerCase();
  const key=`${en(item)}\u0000${specialization}`;
  const level=Math.max(1,Number(item.system.advances?.value)||1);
  let row=groups.get(key);
  if(!row){
   row={id:item.id,uuid:item.uuid,name:item.name,level:0,max:item.system.max?.value??item.system.Max,canAdvance:true};
   groups.set(key,row);
  }
  row.level+=level;
 }
 return [...groups.values()];
}
export function installSheets(){
 const base=type=>Object.values(CONFIG.Actor.sheetClasses[type]).find(x=>x.default&&x.id?.startsWith('wfrp4e'))?.cls||Object.values(CONFIG.Actor.sheetClasses[type]).find(x=>x.default)?.cls;
 const patched=new Set();for(const type of ['character','npc','creature']){const cls=base(type);if(patched.has(cls))continue;patched.add(cls);const original=cls.prototype._onDropItem;cls.prototype._onDropItem=async function(drop,event){
  const item=drop.uuid?await fromUuid(drop.uuid):null;if(item&&meta(item).kind==='gift'&&item.actor?.uuid!==this.actor.uuid){const current=this.actor.items.find(i=>meta(i).kind==='gift'&&en(i)===en(item)&&(meta(i).specialization||'')===(meta(item).specialization||''));if(current){const level=Number(current.system.advances.value)||1,max=Number(current.system.Max)||Infinity;if(level>=max){ui.notifications.warn(`${current.name}: osiągnięto maksymalny poziom.`);return;}return current.update({'system.advances.value':level+1},{skipExperienceChecks:true});}}
  return original.call(this,drop,event);
 };}
 const extend=Base=>class extends Base {
  static DEFAULT_OPTIONS={classes:['cc-vampire-sheet'],actions:{rest:function(){ui.notifications.info('Wampir nie odzyskuje Wounds przez zwykły odpoczynek. Użyj krwi albo odpowiedniej mocy.');}}};
  static PARTS={...Base.PARTS,vampire:{template:`modules/${ID}/templates/vampire.hbs`,scrollable:['']}};
  static TABS={...Base.TABS,vampire:{id:'vampire',group:'primary',label:'Vampire',icon:'fas fa-droplet'}};
  async _onDropCustom(data,event){if(data.custom==='wounds'&&Number(data.wounds)>0&&!data.ccUndeadHealing){ui.notifications.warn('Zwykłe leczenie nie działa na wampira. Leczenie działające na Undead rozlicz jego mocą albo ręcznie w Wounds.');return;}return super._onDropCustom(data,event);}
  async _preparePartContext(partId,context,options){
   context=await super._preparePartContext(partId,context,options);
   const vampire=!!this.actor.getFlag(ID,'vampire')||this.actor.system.details.species.value==='Vampire';
   if((partId==='talents'||partId==='main'&&this.actor.type==='creature')&&vampire){
    const hidden=new Set(this.actor.items.filter(i=>['gift','weakness'].includes(meta(i).kind)).map(i=>i.id));
    context={...context,items:{...context.items,
     talent:context.items.talent.filter(i=>!hidden.has(i.id||i._id)),
     trait:context.items.trait.filter(i=>!hidden.has(i.id||i._id))}};
    if(context.talents)context.talents=context.talents.filter(i=>!hidden.has(i.id||i._id));
    if(context.includedTraits)context.includedTraits=context.includedTraits.filter(i=>!hidden.has(i.id||i._id));
   }
   if(partId==='vampire'){
    const a=this.actor,c=await data();
    context.ccGifts=groupedGiftRows(a);
    context.ccWeaknesses=a.items.filter(i=>meta(i).kind==='weakness').map(i=>({id:i.id,uuid:i.uuid,name:i.name,suppressedBy:meta(i).suppressedBy}));
    context.ccForms=Object.entries({'Vampire Bat':'Bat Form','Doom Wolf':'Wolf Form','Vampire Familiar':'Familiar Form'}).filter(([,gift])=>owned(a,gift)).map(([name])=>({name,art:a.getFlag(ID,'formArt')?.[name]||''}));
    context.ccArtForms=[...context.ccForms,...['Ethereal Mist','Swarm Form (Type)'].filter(n=>owned(a,n)).map(name=>({name,art:a.getFlag(ID,'formArt')?.[name]||''})),...(owned(a,'Pass for Human')?[{name:'Pass for Human',art:a.getFlag(ID,'formArt')?.['Pass for Human']??a.getFlag(ID,'formPortraits')?.['Pass for Human']??'',human:true}]:[])];
    context.ccTransformed=!!(a.getFlag(ID,'transformation')||a.getFlag(ID,'spiritForm'));context.ccSpiritForms=['Ethereal Mist','Swarm Form (Type)'].map(n=>owned(a,n)).filter(Boolean).map(i=>({id:i.id,name:i.name}));
    context.ccShowForms=context.ccSpiritForms.length||context.ccForms.length||context.ccTransformed||!!owned(a,'Pass for Human');
    context.ccDawn=!!owned(a,'Defy the Dawn');context.ccDawnProtected=!!a.getFlag(ID,'dawnProtection');
    context.ccHuman=!!owned(a,'Pass for Human');
    context.ccHumanActive=!!a.getFlag(ID,'humanForm');
    context.ccHumanTokenArt=a.getFlag(ID,'humanTokenArt')!==false;
    context.ccRanks=RANKS.map(value=>({value,selected:value===(a.getFlag(ID,'vampireRank')||'Newborn')}));context.ccFeeding=feedingPeriod(a);
    context.ccDarkFate=!!owned(a,'Dark Fate');
   }return context;
  }
  async _onRender(context,options){
   await super._onRender(context,options);
   this.element.classList.toggle('cc-vampire-creature-sheet',this.actor.type==='creature');
   const section=this.element.querySelector('[data-tab="vampire"].tab');if(!section)return;
   const talents=this.element.querySelector('[data-tab="talents"].tab');
   if(talents){talents.querySelector('.cc-gift-development')?.remove();
    if(this.actor.getFlag(ID,'vampire')||this.actor.system.details.species.value==='Vampire'){
     const gifts=this.actor.items.filter(i=>meta(i).kind==='gift'),weaknesses=this.actor.items.filter(i=>meta(i).kind==='weakness');
     for(const [kind,list] of [['gifts',gifts],['weaknesses',weaknesses]]){const direction=this.actor.getFlag(ID,`sort-${kind}`);if(direction)list.sort((a,b)=>direction*a.name.localeCompare(b.name,'en'));}
     talents.insertAdjacentHTML('beforeend',await foundry.applications.handlebars.renderTemplate(`modules/${ID}/templates/gift-development.hbs`,{gifts,weaknesses}));
    }
   }
   const sunLabel=this.element.querySelector('.condition[data-key="cc-sun-poisoned"]>a');if(sunLabel&&!sunLabel.dataset.ccBound){sunLabel.dataset.ccBound='true';sunLabel.addEventListener('click',()=>game.modules.get(ID).api.sunlightDamageTest(this.actor).catch(e=>ui.notifications.error(e.message)));}
   section.querySelectorAll('input,select').forEach(e=>e.addEventListener('change',ev=>ev.stopPropagation()));
   const vampireRank=section.querySelector('[data-cc-rank]');if(vampireRank){vampireRank.disabled=!this.actor.isOwner;vampireRank.addEventListener('change',async()=>{try{await game.modules.get(ID).api.setVampireRank(this.actor,vampireRank.value);}catch(e){ui.notifications.error(e.message);}});}
   const humanArt=section.querySelector('[data-cc-human-token]');
   if(humanArt&&!humanArt.dataset.ccBound){humanArt.dataset.ccBound='true';humanArt.disabled=!this.actor.isOwner;
    humanArt.addEventListener('change',async()=>{
     humanArt.disabled=true;
     try{await game.modules.get(ID).api.setHumanTokenArt(this.actor,humanArt.checked);}
     catch(e){ui.notifications.error(e.message);}
     finally{this.render();}
    });
   }
   this.element.querySelectorAll('[data-cc-advance], .cc-gift-development [data-cc], [data-tab="vampire"].tab button').forEach(b=>{if(b.dataset.ccBound)return;b.dataset.ccBound='true';b.type='button';b.disabled=!this.actor.isOwner;if(b.dataset.action)return;b.addEventListener('click',async ev=>{
    ev.preventDefault();ev.stopPropagation();b.disabled=true;
    try{const api=game.modules.get(ID).api;
     if(b.dataset.cc?.startsWith('sort-'))await this.actor.setFlag(ID,b.dataset.cc,-(this.actor.getFlag(ID,b.dataset.cc)||-1));
     else if(b.dataset.cc==='end-dawn'){await this.actor.setFlag(ID,'dawnProtection',false);await api.syncNature(this.actor);}
     else if(b.dataset.cc==='gift-library')await game.packs.get(ID+'.gifts').render(true);
     else if(b.dataset.cc==='choose-weaknesses')await api.chooseWeaknesses(this.actor);
     else if(b.dataset.cc==='browse-art'){
      const input=b.closest('.form-fields').querySelector('input');
      const Picker=foundry.applications.apps.FilePicker.implementation;
      new Picker({type:'image',current:input.value,callback:path=>{input.value=path;}}).browse();
     }
     else if(b.dataset.cc==='save-art'){
      const row=b.closest('.cc-form-art'),path=row.querySelector('[data-art-path]').value.trim();
      const art={...(this.actor.getFlag(ID,'formArt')||{})};if(path||row.dataset.form==='Pass for Human')art[row.dataset.form]=path;else delete art[row.dataset.form];
      await this.actor.setFlag(ID,'formArt',art);ui.notifications.info('Zapisano wygląd formy.');
     }
     else if(b.dataset.ccAdvance){
      const item=this.actor.items.get(b.dataset.ccAdvance),c=await data(),gift=c.gifts.find(i=>en(i)===en(item));
      if(!gift)throw Error('Nie odnaleziono daru w bibliotece.');
      await api.buyGift(this.actor,gift._id,{specialization:meta(item).specialization||''});
     }
     else if(b.dataset.ccItem)await api.activate(this.actor.items.get(b.dataset.ccItem),{});
     else if(b.dataset.cc==='sync')await api.syncTraits(this.actor);
     else if(b.dataset.cc==='reset')await api.resetUses(this.actor);
     else if(b.dataset.act)await sheetAction(this.actor,section,b.dataset.act,b.dataset);
    }catch(e){ui.notifications.error(e.message);console.error('Complete Counts',e);}finally{b.disabled=false;if(b.dataset.cc!=='browse-art')this.render();}
   });});
  }
 };
 class VampireCharacterSheet extends extend(base('character')){}
 class VampireNPCSheet extends extend(base('npc')){}
 class VampireCreatureSheet extends extend(base('creature')){
  static PARTS={...super.PARTS,talents:{template:'systems/wfrp4e/templates/sheets/actor/tabs/actor-talents.hbs',scrollable:['']}};
  static TABS={...super.TABS,talents:{id:'talents',group:'primary',label:'Talents'}};
 }
 for(const [type,cls] of [['character',VampireCharacterSheet],['npc',VampireNPCSheet],['creature',VampireCreatureSheet]])foundry.applications.apps.DocumentSheetConfig.registerSheet(CONFIG.Actor.documentClass,ID,cls,{types:[type],makeDefault:false,label:'Complete Counts — Vampire'});
 restrictConditionSheets();
}

// Compulsion can affect anyone; keep the other CC conditions exclusive to vampire sheets.
function restrictConditionSheets(){
 const vampireSheet=sheet=>sheet.options?.classes?.includes('cc-vampire-sheet');
 const vampireOnly=id=>String(id||'').startsWith('cc-')&&id!=='cc-compulsion';
 const custom=e=>vampireOnly(e?.conditionId)||[...(e?.statuses||[])].some(vampireOnly);
 const visited=new Set();
 for(const document of [CONFIG.Actor,CONFIG.Item])for(const choices of Object.values(document.sheetClasses))for(const {cls} of Object.values(choices)){
  for(let proto=cls?.prototype;proto;proto=Object.getPrototypeOf(proto)){
   if(visited.has(proto))continue;visited.add(proto);
   if(Object.hasOwn(proto,'_getConditionData')){
    const original=proto._getConditionData;
    proto._getConditionData=function(...args){const conditions=original.apply(this,args);return vampireSheet(this)?conditions:conditions?.filter(e=>!custom(e));};
   }
   if(Object.hasOwn(proto,'_prepareEffectsContext')){
    const original=proto._prepareEffectsContext;
    proto._prepareEffectsContext=function(context,...args){
     const clean=value=>{if(!vampireSheet(this))for(const [key,list] of Object.entries((value||context)?.effects||{}))if(Array.isArray(list))(value||context).effects[key]=list.filter(e=>!custom(e));return value;};
     const result=original.call(this,context,...args);return result?.then?result.then(clean):clean(result);
    };
   }
  }
 }
}
