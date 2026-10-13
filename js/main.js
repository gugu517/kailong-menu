(() => {
  'use strict';
  const C = window.MenuCore, base = window.APP_DATA;
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const escape = value => String(value ?? '').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const key = 'kailong-menu-v2';
  let state=C.defaultState(base), storageOK=true, category='all', query='', onlySelected=false, browsingSet=null, replacing=null, photoDraft=null, importMode='menu', noticeTimer, persistTimer;
  let bannerMessage='', printPrepared=false, recoveryRaw=null, originalRaw=null;
  try {
    const saved=localStorage.getItem(key);originalRaw=saved;
    if (saved) state=C.restoreState(JSON.parse(saved),base);
    else {
      const legacy=localStorage.getItem('selectedDishes');
      if (legacy) {
        const parsed=JSON.parse(legacy);
        if (!Array.isArray(parsed)) throw new Error('旧菜单格式无效');
        state.menu=C.normalizeMenu({ids:parsed.map(d=>d?.id)},state.catalog,base.sets);
        if (state.menu.ids.length) bannerMessage='已恢复旧版菜单。请导出一份备份，保存您的搭配。';
      }
    }
  } catch(error) {recoveryRaw=originalRaw;bannerMessage='本地数据无法读取，已载入默认资料。建议先在“数据备份”中导出原始存储，再继续操作。';storageOK=false;}
  function announce(message) {
    $('#toast').textContent=message;$('#toast').hidden=false;
    clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('#toast').hidden=true,3400);
  }
  function showBanner(message) {$('#storage-banner').textContent=message;$('#storage-banner').hidden=!message;}
  if (bannerMessage) showBanner(bannerMessage);
  function persist() {
    clearTimeout(persistTimer);
    try {localStorage.setItem(key,JSON.stringify(state));storageOK=true;$('#save-status').textContent='已自动保存 · 当前浏览器';if(recoveryRaw) showBanner('当前菜单已保存；损坏的原始存储暂保留在内存中，可通过“数据备份”导出后再关闭页面。');}
    catch(error) {storageOK=false;$('#save-status').textContent='当前更改仅保留在内存中，请导出备份';showBanner('浏览器存储不可用或空间不足。当前仍可选菜和打印，请导出完整备份后再关闭页面。');}
  }
  function persistSoon() {clearTimeout(persistTimer);persistTimer=setTimeout(persist,250);}
  function lookup(id) {return state.catalog.find(d=>d.id===id);}
  function categoryName(id) {return base.categories.find(c=>c.id===id)?.name || '';}
  function name(id) {return lookup(id)?.name || base.dishes.find(d=>d.id===id)?.name || id;}
  function open(dialog) {if (!dialog.open) dialog.showModal();}
  $$('dialog').forEach(dialog=>{
    dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom) dialog.close();}});
    dialog.querySelectorAll('[data-close]').forEach(btn=>btn.addEventListener('click',()=>dialog.close()));
  });
  function confirmAction(title,message,choices) {
    const dialog=$('#confirm-dialog');
    $('#confirm-title').textContent=title;$('#confirm-message').textContent=message;
    $('#confirm-actions').replaceChildren();
    return new Promise(resolve=>{
      let resolved=false;
      const onClose=()=>{if(!resolved){resolved=true;resolve(null);}dialog.removeEventListener('close',onClose);};
      dialog.addEventListener('close',onClose);
      for (const choice of choices) {
        const button=document.createElement('button');button.className='btn '+(choice.primary?'primary':'secondary');button.textContent=choice.label;
        button.addEventListener('click',()=>{resolved=true;dialog.close();resolve(choice.value);});
        $('#confirm-actions').append(button);
      }
      open(dialog);
    });
  }
  function renderBrand() {
    $$('[data-restaurant]').forEach(el=>el.textContent=state.config.restaurant);
    $$('[data-phone]').forEach(el=>el.textContent=state.config.phone || '请联系餐厅');
    $$('[data-slogan]').forEach(el=>el.textContent=state.config.slogan);
    $('#contact-link').href='tel:'+state.config.phone.replace(/[^\d+]/g,'');
    document.title=state.config.restaurant+' · 宴席菜单';
    $('#catalog-total').textContent=state.catalog.length+' 道佳肴';
  }
  function renderSets() {
    $('#sets-grid').innerHTML=base.sets.map((s,i)=>`<article class="set-card"><span class="set-label">宴席搭配 · ${String(i+1).padStart(2,'0')}</span><h3>${escape(s.name)}</h3><p>${escape(s.description)} · ${s.dishes.length} 道</p><div class="set-card-bottom"><div class="set-price"><small>¥</small>${s.price}</div><button data-browse-set="${s.id}">查看套餐 ↗</button></div></article>`).join('');
  }
  function renderTabs() {
    const tabs=[{id:'all',name:'全部'},...base.categories];
    $('#category-tabs').innerHTML=tabs.map(cat=>`<button data-category="${cat.id}" aria-pressed="${category===cat.id && !browsingSet}">${cat.name}<span>${cat.id==='all'?state.catalog.length:state.catalog.filter(d=>d.category===cat.id).length}</span></button>`).join('');
  }
  function imageMarkup(d,kind='card') {
    if(!d.image) return kind==='paper' ? '<div class="paper-placeholder">实拍待补充</div>' : '<div class="dish-placeholder"><span aria-hidden="true">席</span><small>实拍待补充</small></div>';
    return `<img class="${kind==='paper'?'':'dish-photo'}" src="${escape(d.image)}" alt="${escape(d.name)}" ${kind==='card'?'loading="lazy" decoding="async" width="320" height="240"':''}>`;
  }
  function guardImages(container) {
    container.querySelectorAll('img').forEach(img=>img.addEventListener('error',()=>{
      const div=document.createElement('div');div.className=container.id==='dishes-grid'?'dish-placeholder':'paper-placeholder';div.textContent='照片暂不可用';img.replaceWith(div);
    },{once:true}));
  }
  function renderCatalog() {
    renderTabs();
    const set=base.sets.find(s=>s.id===browsingSet);
    $('#package-view').hidden=!set;
    if(set) {
      const missing=set.dishes.filter(id=>!lookup(id));
      $('#package-view').innerHTML=`<h3>${escape(set.name)} · ¥${set.price}</h3><p>${escape(set.description)}${missing.length?' · '+missing.length+' 道菜已从本地资料移除，价格需重新确认。':' · 原套餐标价；调整菜品后价格请向餐厅确认。'}</p><button class="btn primary" data-apply-set="${set.id}">选用这套菜单</button><button class="btn secondary" id="leave-set">返回全部菜品</button>`;
    }
    $('#replace-banner').hidden=!replacing;
    if(replacing) $('#replace-banner').innerHTML=`<span>正在替换「${escape(name(replacing))}」，请选择一道未选菜品。</span><button id="cancel-replace" class="text-btn">取消</button>`;
    const normalized=query.toLocaleLowerCase();
    const dishes=state.catalog.filter(d=>(set?set.dishes.includes(d.id):(category==='all'||d.category===category)) && (!onlySelected||state.menu.ids.includes(d.id)) && (!normalized||[d.name,d.festiveName,d.description,d.originalName].join(' ').toLocaleLowerCase().includes(normalized)));
    $('#results-count').textContent=dishes.length+' 道菜品';
    $('#selected-filter').setAttribute('aria-pressed',String(onlySelected));
    $('#catalog-empty').hidden=!!dishes.length;
    $('#dishes-grid').innerHTML=dishes.map(d=>{
      const selected=state.menu.ids.includes(d.id);
      return `<article class="dish-card ${selected?'selected':''}">${imageMarkup(d)}${d.image&&d.reviewNote?'<span class="photo-review" title="'+escape(d.reviewNote)+'">资料待核对</span>':''}<div class="dish-info"><div class="dish-category">${categoryName(d.category)}</div><h3>${escape(d.name)}</h3>${d.festiveName?`<div class="alias">喜庆别名 · ${escape(d.festiveName)}</div>`:''}<p>${escape(d.description)}</p><button class="dish-choice" data-toggle="${d.id}" aria-pressed="${selected}" aria-label="${replacing?'替换为':selected?'移除':'选择'}${escape(d.name)}">${replacing?'换成这道菜':selected?'✓ 已加入这一席':'+ 加入菜单'}</button></div></article>`;
    }).join('');
    guardImages($('#dishes-grid'));
  }
  function renderSelection() {
    const ids=state.menu.ids;
    $('#selected-count').textContent=ids.length;$('#mobile-count').textContent=ids.length;
    const groups=C.groupDishes(ids,state.catalog);
    $('#selected-summary').textContent=base.categories.filter(c=>groups[c.id].length).map(c=>c.name+' '+groups[c.id].length).join(' · ') || '为这一席，挑选第一道佳肴';
    $('#selected-dishes').innerHTML=ids.length ? ids.map((id,i)=>{
      const d=lookup(id);
      return `<div class="selected-item"><span class="selected-index">${String(i+1).padStart(2,'0')}</span><div class="selected-text"><strong>${escape(d.name)}</strong><small>${categoryName(d.category)}${d.reviewNote?' · 资料待确认':''}</small></div><button data-replace="${id}" aria-label="替换${escape(d.name)}">换</button><button data-remove="${id}" aria-label="移除${escape(d.name)}">×</button></div>`;
    }).join('') : '<div class="selected-empty"><span aria-hidden="true">席</span><p>点击菜品下方的“加入菜单”，<br>或从上方选择一套宴席搭配。</p></div>';
    const diff=C.packageDiff(state.menu,base.sets,state.catalog);
    $('#set-status').hidden=!diff;
    if(diff) $('#set-status').innerHTML=`<strong>${escape(diff.set.name)}</strong>${diff.modified?'已调整 · 原套餐 ¥'+diff.set.price+'，现价请向餐厅确认':'原套餐标价 ¥'+diff.set.price+' · 实际价格请向餐厅确认'}${diff.modified?`<details><summary>查看与原套餐的差异</summary>${diff.added.length?'<p>新增：'+escape(diff.added.map(name).join('、'))+'</p>':''}${diff.removed.length?'<p>移除：'+escape(diff.removed.map(name).join('、'))+'</p>':''}</details>`:''}`;
    if(!storageOK) $('#save-status').textContent='请导出备份后再关闭页面';
  }
  function syncEvent() {
    for(const field of ['title','date','tables','note']) $('#event-'+field).value=state.menu.event[field];
  }
  function commit(message) {renderCatalog();renderSelection();persist();if(message) announce(message);}
  function restoreFocus(id) {requestAnimationFrame(()=>$(`[data-toggle="${id}"]`)?.focus({preventScroll:true}));}
  async function applySet(id) {
    const set=base.sets.find(s=>s.id===id);if(!set)return;
    let mode='replace';
    if(state.menu.ids.length) mode=await confirmAction('如何使用这套菜单？','当前已选 '+state.menu.ids.length+' 道菜。您可以替换当前菜单，或在现有菜单中追加套餐菜品。',[{label:'取消',value:null},{label:'追加菜品',value:'append'},{label:'替换当前菜单',value:'replace',primary:true}]);
    if(!mode)return;
    state.menu=C.applyPackage(state.menu,set,state.catalog,mode);replacing=null;
    commit('已选用「'+set.name+'」，您可以继续调整菜品。');
  }
  $('#sets-grid').addEventListener('click',event=>{const button=event.target.closest('[data-browse-set]');if(!button)return;browsingSet=button.dataset.browseSet;replacing=null;query='';$('#search').value='';onlySelected=false;renderCatalog();$('#catalog').scrollIntoView({behavior:'smooth'});});
  $('#category-tabs').addEventListener('click',event=>{const button=event.target.closest('[data-category]');if(!button)return;category=button.dataset.category;browsingSet=null;renderCatalog();$(`[data-category="${category}"]`)?.focus({preventScroll:true});});
  $('#package-view').addEventListener('click',event=>{const btn=event.target.closest('[data-apply-set]');if(btn)applySet(btn.dataset.applySet);if(event.target.closest('#leave-set')){browsingSet=null;category='all';renderCatalog();}});
  $('#search').addEventListener('input',event=>{query=event.target.value;renderCatalog();});
  $('#selected-filter').addEventListener('click',()=>{onlySelected=!onlySelected;renderCatalog();});
  $('#reset-filter').addEventListener('click',()=>{query='';category='all';browsingSet=null;onlySelected=false;$('#search').value='';renderCatalog();});
  $('#dishes-grid').addEventListener('click',event=>{
    const button=event.target.closest('[data-toggle]');if(!button)return;const id=button.dataset.toggle;
    try {
      if(replacing) {state.menu.ids=C.replace(state.menu.ids,replacing,id);replacing=null;commit('已替换菜品；套餐调整后的价格请向餐厅确认。');}
      else {state.menu.ids=C.toggle(state.menu.ids,id);commit();}
      restoreFocus(id);
    } catch(error){announce(error.message);}
  });
  $('#selected-dishes').addEventListener('click',event=>{
    const remove=event.target.closest('[data-remove]'),replace=event.target.closest('[data-replace]');
    if(remove){state.menu.ids=state.menu.ids.filter(id=>id!==remove.dataset.remove);if(replacing===remove.dataset.remove)replacing=null;commit('已移除菜品。');}
    if(replace){replacing=replace.dataset.replace;category=lookup(replacing).category;browsingSet=null;query='';onlySelected=false;$('#search').value='';renderCatalog();$('#catalog').scrollIntoView({behavior:'smooth'});}
  });
  $('#replace-banner').addEventListener('click',event=>{if(event.target.closest('#cancel-replace')){replacing=null;renderCatalog();}});
  $('#clear-selection').addEventListener('click',async()=>{
    if(!state.menu.ids.length)return;
    const yes=await confirmAction('清空这一席？','将移除当前已选菜品，宴席信息会保留。',[{label:'保留菜单',value:false},{label:'清空菜品',value:true,primary:true}]);
    if(yes){state.menu.ids=[];state.menu.setId=null;replacing=null;commit('已清空选择。');}
  });
  for(const field of ['title','date','tables','note']) $('#event-'+field).addEventListener('input',()=>{state.menu.event=C.normalizeEvent(Object.fromEntries(['title','date','tables','note'].map(k=>[k,$('#event-'+k).value])));persistSoon();});
  $('#view-selected').addEventListener('click',()=>$('#selection-panel').scrollIntoView({behavior:'smooth'}));
  function paperHTML() {
    const {event,style,useAlias}=state.menu, config=state.config;
    const dishName=d=>useAlias&&d.festiveName?d.festiveName:d.name;
    const selected=state.menu.ids.map(lookup).filter(Boolean);
    const diff=C.packageDiff(state.menu,base.sets,state.catalog);
    const header=`<header class="paper-head">${style==='festive'?'<div class="festive-mark" aria-hidden="true">囍</div>':'<p class="paper-kicker">KAILONG · BANQUET MENU</p>'}<h1 class="paper-title">${escape(config.restaurant)}</h1><p class="paper-subtitle">${escape(event.title||'宴席菜单')}</p><div class="paper-meta">${event.date?'<span>'+escape(event.date.replaceAll('-',' / '))+'</span>':''}${event.tables?'<span>'+event.tables+' 桌</span>':''}<span>${selected.length} 道佳肴</span></div>${diff?'<p class="paper-set-note">'+escape(diff.set.name)+(diff.modified?' · 已调整，价格请向餐厅确认':' · 原套餐标价 ¥'+diff.set.price)+'</p>':''}</header>`;
    const body=style==='illustrated'?`<div class="paper-grid">${selected.map(d=>`<article class="paper-card">${imageMarkup(d,'paper')}<h3>${escape(dishName(d))}</h3><small>${categoryName(d.category)}${d.reviewNote?' · 资料待确认':''}</small></article>`).join('')}</div>`:base.categories.map(cat=>{
      const dishes=C.groupDishes(state.menu.ids,state.catalog)[cat.id];
      return dishes.length?`<section class="paper-section"><h3>${cat.name}</h3><div class="paper-list">${dishes.map(d=>'<p>'+escape(dishName(d))+'</p>').join('')}</div></section>`:'';
    }).join('');
    const footer=`${event.note?'<div class="paper-note">备注：'+escape(event.note)+'</div>':''}<footer class="paper-footer">${escape(style==='festive'?config.blessing:config.slogan)}${config.phone?'<br>宴席咨询 · '+escape(config.phone):''}</footer>`;
    return `<article class="menu-paper ${style==='festive'?'paper-festive':''}">${header}${body}${footer}</article>`;
  }
  function renderPreview() {
    $('#preview-paper').innerHTML=paperHTML();guardImages($('#preview-paper'));
    $$('[data-style]').forEach(btn=>btn.setAttribute('aria-pressed',String(state.menu.style===btn.dataset.style)));
    $('#use-alias').checked=state.menu.useAlias;
  }
  function preview() {if(!state.menu.ids.length){announce('请先选择至少一道菜品。');return;}renderPreview();open($('#preview-dialog'));}
  $('#preview-btn').addEventListener('click',preview);$('#mobile-preview').addEventListener('click',preview);
  $$('[data-style]').forEach(btn=>btn.addEventListener('click',()=>{state.menu.style=btn.dataset.style;renderPreview();persist();}));
  $('#use-alias').addEventListener('change',event=>{state.menu.useAlias=event.target.checked;renderPreview();persist();});
  $('#print-btn').addEventListener('click',async()=>{
    if(!state.menu.ids.length)return;
    const button=$('#print-btn');button.disabled=true;button.textContent='正在准备照片…';
    $('#print-root').innerHTML=paperHTML();
    let failed=false;
    await Promise.all([...$('#print-root').querySelectorAll('img')].map(img=>new Promise(resolve=>{
      let done=false,timer;
      const finish=(ok)=>{if(done)return;done=true;clearTimeout(timer);if(!ok){failed=true;const div=document.createElement('div');div.className='paper-placeholder';div.textContent='照片暂不可用';img.replaceWith(div);}resolve();};
      if(img.complete){finish(img.naturalWidth>0);return;}
      img.addEventListener('load',()=>finish(true),{once:true});img.addEventListener('error',()=>finish(false),{once:true});timer=setTimeout(()=>finish(false),8000);
    })));
    if(failed) announce('部分照片未加载，打印版已使用提示文字。');
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    printPrepared=true;
    try{window.print();}finally{printPrepared=false;button.disabled=false;button.textContent='打印 / 保存 PDF';}
  });
  window.addEventListener('beforeprint',()=>{if(!printPrepared) $('#print-root').innerHTML=state.menu.ids.length?paperHTML():'';});
  window.addEventListener('afterprint',()=>{printPrepared=false;$('#print-root').replaceChildren();});
  function download(filename,value) {
    const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json;charset=utf-8'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),15000);
  }
  function filename(prefix) {const d=new Date();const stamp=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('');return prefix+'-'+stamp+'.json';}
  $('#export-menu').addEventListener('click',()=>{if(!state.menu.ids.length){announce('请先选择菜品再导出。');return;}download(filename('凯隆宴席菜单'),{type:'kailong-menu',version:2,menu:state.menu,dishNames:state.menu.ids.map(name)});announce('已导出菜单。自定义菜品迁移请使用完整备份。');});
  function chooseImport(mode){importMode=mode;$('#import-file').value='';$('#import-file').click();}
  $('#import-menu').addEventListener('click',()=>chooseImport('menu'));
  $('#backup-btn').addEventListener('click',()=>{
    const body=$('#backup-dialog .form-body');
    const old=$('#raw-backup');if(old)old.remove();
    if(!storageOK || recoveryRaw){const button=document.createElement('button');button.id='raw-backup';button.className='btn secondary full';button.textContent='导出原始存储（用于恢复）';button.addEventListener('click',()=>{try{download(filename('原始存储'),{raw:recoveryRaw ?? localStorage.getItem(key),legacy:localStorage.getItem('selectedDishes')});}catch{announce('浏览器拒绝访问本地存储。');}});body.prepend(button);}
    open($('#backup-dialog'));
  });
  $('#export-backup').addEventListener('click',()=>{download(filename('凯隆完整备份'),{type:'kailong-backup',...state});announce('已导出完整备份。');});
  $('#import-backup').addEventListener('click',()=>chooseImport('backup'));
  $('#import-file').addEventListener('change',async event=>{
    const file=event.target.files[0];if(!file)return;
    try{
      if(file.size>20*1024*1024)throw new Error('文件超过 20 MB，请检查是否为本项目备份。');
      const value=JSON.parse(await file.text());
      if(importMode==='backup'){
        if(value.type!=='kailong-backup')throw new Error('请选择完整备份文件。');
        const restored=C.restoreState(value,base);
        const yes=await confirmAction('导入完整备份？','将替换当前菜品资料、餐厅设置和菜单。建议先导出当前备份。',[{label:'取消',value:false},{label:'导入并替换',value:true,primary:true}]);
        if(!yes)return;state=restored;
      } else {
        const result=C.parseMenuImport(value,state,base);
        const yes=await confirmAction('导入菜单？','将替换当前已选菜单和宴席信息。'+(result.unknown.length?'其中 '+result.unknown.length+' 道菜不在本地资料中，将跳过；如需完整恢复请导入完整备份。':''),[{label:'取消',value:false},{label:'导入菜单',value:true,primary:true}]);
        if(!yes)return;state.menu=result.menu;
      }
      replacing=null;browsingSet=null;category='all';syncEvent();renderBrand();commit('导入成功。');if($('#manage-dialog').open)renderManager();
    }catch(error){announce('导入失败：'+error.message);}
  });
  $('#reset-data').addEventListener('click',async()=>{
    const yes=await confirmAction('恢复默认资料？','将撤销本地菜品和餐厅设置的修改。当前菜单中自定义菜品也会被移除。此操作无法自动撤销，请先备份。',[{label:'取消',value:false},{label:'恢复默认',value:true,primary:true}]);
    if(!yes)return;const oldMenu=state.menu;state=C.defaultState(base);state.menu=C.normalizeMenu(oldMenu,state.catalog,base.sets);renderBrand();syncEvent();replacing=null;commit('已恢复默认资料。');if($('#manage-dialog').open)renderManager();
  });
  function renderManager() {
    const search=$('#manager-search').value.trim().toLocaleLowerCase(),review=$('#review-filter').checked;
    const dishes=state.catalog.filter(d=>(!search||[d.id,d.name,d.originalName].join(' ').toLocaleLowerCase().includes(search)) && (!review||d.reviewNote));
    $('#manager-list').innerHTML=dishes.map(d=>`<div class="manager-row">${d.image?'<img src="'+escape(d.image)+'" alt="" loading="lazy">':''}<div class="manager-text"><h3>${escape(d.name)}</h3><p>${categoryName(d.category)} · ${d.id}${d.festiveName?' · '+escape(d.festiveName):''}</p>${d.reviewNote?'<p class="review-note">'+escape(d.reviewNote)+'</p>':''}</div><button data-edit="${d.id}">编辑</button><button class="danger" data-delete="${d.id}">删除</button></div>`).join('') || '<p class="muted">没有符合条件的菜品。</p>';
    guardImages($('#manager-list'));
  }
  $('#manage-btn').addEventListener('click',()=>{renderManager();open($('#manage-dialog'));});
  $('#manager-search').addEventListener('input',renderManager);$('#review-filter').addEventListener('change',renderManager);
  function editDish(id) {
    const d=lookup(id);
    $('#dish-form').reset();photoDraft=null;$('#edit-error').textContent='';$('#save-dish').disabled=false;
    $('#edit-title').textContent=d?'编辑菜品':'新增菜品';$('#dish-id').value=d?.id||'';
    $('#dish-name').value=d?.name||'';$('#dish-category').value=d?.category||'hot';$('#dish-alias').value=d?.festiveName||'';$('#dish-description').value=d?.description||'';$('#dish-review').value=d?.reviewNote||'';$('#dish-hide-photo').checked=d?!d.image:false;
    $('#edit-photo-preview').hidden=!d?.sourceImage;
    if(d?.sourceImage) $('#edit-photo-preview').src=d.sourceImage;else $('#edit-photo-preview').removeAttribute('src');
    open($('#edit-dialog'));
  }
  $('#dish-category').innerHTML=base.categories.map(cat=>`<option value="${cat.id}">${cat.name}</option>`).join('');
  $('#add-dish').addEventListener('click',()=>editDish(null));
  $('#manager-list').addEventListener('click',async event=>{
    const edit=event.target.closest('[data-edit]'),del=event.target.closest('[data-delete]');
    if(edit) editDish(edit.dataset.edit);
    if(del){const id=del.dataset.delete;if(state.catalog.length<=1){announce('请至少保留一道菜品。');return;}
      const yes=await confirmAction('删除「'+name(id)+'」？','将从本地资料及当前菜单中移除。原套餐包含这道菜时，会提示缺少菜品。',[{label:'取消',value:false},{label:'删除菜品',value:true,primary:true}]);
      if(yes){state.catalog=state.catalog.filter(d=>d.id!==id);state.menu.ids=state.menu.ids.filter(value=>value!==id);if(replacing===id)replacing=null;renderBrand();commit('已删除本地菜品。');renderManager();}
    }
  });
  $('#dish-photo').addEventListener('change',async event=>{
    const file=event.target.files[0];if(!file)return;const button=$('#save-dish');button.disabled=true;$('#edit-error').textContent='';
    try{
      if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>15*1024*1024) throw new Error('请选择 15 MB 以内的 JPEG、PNG 或 WebP 图片。');
      const url=URL.createObjectURL(file);
      try {
        const img=new Image();img.src=url;await img.decode();
        const ratio=Math.min(1,800/img.width,800/img.height);const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*ratio));canvas.height=Math.max(1,Math.round(img.height*ratio));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
        photoDraft=canvas.toDataURL('image/jpeg',.82);
        if(!C.safeImage(photoDraft))throw new Error('图片压缩后仍过大，请选择更小的图片。');
        $('#edit-photo-preview').src=photoDraft;$('#edit-photo-preview').hidden=false;$('#dish-hide-photo').checked=false;
      } finally {URL.revokeObjectURL(url);}
    }catch(error){photoDraft=null;$('#edit-error').textContent=error.message;}
    finally{button.disabled=false;}
  });
  $('#dish-form').addEventListener('submit',event=>{
    event.preventDefault();if($('#save-dish').disabled)return;
    try{
      if(!$('#dish-id').value && state.catalog.length>=500) throw new Error('菜品已达到 500 道上限。');
      const id=$('#dish-id').value || ('custom_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,6));const old=lookup(id);
      const sourceImage=photoDraft ?? old?.sourceImage ?? '';
      const d=C.validateCatalog([{id,name:$('#dish-name').value,category:$('#dish-category').value,festiveName:$('#dish-alias').value,description:$('#dish-description').value,reviewNote:$('#dish-review').value,image:$('#dish-hide-photo').checked?'':sourceImage,sourceImage,originalName:old?.originalName||$('#dish-name').value}])[0];
      state.catalog=old?state.catalog.map(item=>item.id===id?d:item):[...state.catalog,d];
      $('#edit-dialog').close();renderBrand();commit('菜品已保存。');renderManager();
    }catch(error){$('#edit-error').textContent=error.message;}
  });
  $('#settings-btn').addEventListener('click',()=>{for(const field of ['restaurant','slogan','phone','blessing']) $('#restaurant-'+(field==='restaurant'?'name':field)).value=state.config[field];open($('#settings-dialog'));});
  $('#settings-form').addEventListener('submit',event=>{event.preventDefault();state.config=C.normalizeConfig({restaurant:$('#restaurant-name').value,slogan:$('#restaurant-slogan').value,phone:$('#restaurant-phone').value,blessing:$('#restaurant-blessing').value},base.config);renderBrand();persist();$('#settings-dialog').close();announce('餐厅设置已保存。');});
  window.addEventListener('storage',event=>{if(event.key===key) showBanner('另一个页面修改了菜单。请先导出当前菜单，再刷新以载入最新数据。');});
  window.addEventListener('pagehide',()=>{if(persistTimer) persist();});
  renderBrand();renderSets();renderCatalog();renderSelection();syncEvent();
})();
