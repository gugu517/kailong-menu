const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const C=require(path.join(root,'js/core.js'));
const ctx={window:{}};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'js/dishes.js'),'utf8'),ctx);
const base=JSON.parse(JSON.stringify(ctx.window.APP_DATA));
test('73 dishes and all package references retain valid resources',()=>{
 assert.equal(base.dishes.length,73);assert.equal(C.validateCatalog(base.dishes).length,73);
 assert.equal(new Set(base.dishes.map(d=>d.id)).size,73);
 for(const d of base.dishes) for(const image of [d.image,d.sourceImage].filter(Boolean))assert.ok(fs.existsSync(path.join(root,image)),image);
 for(const s of base.sets){assert.equal(s.dishes.length,14);for(const id of s.dishes)assert.ok(base.dishes.some(d=>d.id===id));}
});
test('package add is unique and replaces or appends explicitly',()=>{
 let menu=C.defaultState(base).menu;menu.ids=['c1','h2'];
 const append=C.applyPackage(menu,base.sets[0],base.dishes,'append');assert.equal(append.ids.length,15);assert.equal(append.ids[0],'c1');
 const replace=C.applyPackage(menu,base.sets[0],base.dishes,'replace');assert.equal(replace.ids.length,14);assert.equal(replace.setId,'set1');assert.equal(C.packageDiff(replace,base.sets,base.dishes).modified,false);
});
test('remove, replace and clear from package never depend on visible category',()=>{
 let menu=C.applyPackage(C.defaultState(base).menu,base.sets[0],base.dishes,'replace');
 menu.ids=C.toggle(menu.ids,'h2');assert.equal(menu.ids.length,13);assert.ok(C.packageDiff(menu,base.sets,base.dishes).removed.includes('h2'));
 menu.ids=C.replace(menu.ids,'h6','h24');assert.ok(menu.ids.includes('h24'));assert.ok(!menu.ids.includes('h6'));assert.equal(menu.ids.length,13);
 assert.throws(()=>C.replace(menu.ids,'h24','h21'),/已经/);assert.throws(()=>C.replace(menu.ids,'unknown','h1'),/不在/);
 menu.ids=[];assert.equal(C.packageDiff(menu,base.sets,base.dishes).removed.length,14);
});
test('restore stores IDs and resolves updated dish data',()=>{
 let state=C.defaultState(base);state.menu.ids=['h21','h21','removed'];state.catalog.find(d=>d.id==='h21').name='扇贝新版';
 const restored=C.restoreState(JSON.parse(JSON.stringify(state)),base);assert.deepEqual(restored.menu.ids,['h21']);assert.equal(C.groupDishes(restored.menu.ids,restored.catalog).hot[0].name,'扇贝新版');
});
test('custom dishes and embedded photo survive a full backup roundtrip',()=>{
 let state=C.defaultState(base);state.catalog.push({id:'custom_test',category:'hot',name:'测试菜',image:'data:image/jpeg;base64,AA==',description:'说明'});state.menu.ids=['custom_test'];state.config.restaurant='测试餐厅';
 const result=C.restoreState(JSON.parse(JSON.stringify(state)),base);assert.deepEqual(result.menu.ids,['custom_test']);assert.equal(result.catalog.at(-1).image,'data:image/jpeg;base64,AA==');assert.equal(result.config.restaurant,'测试餐厅');
});
test('dish deletion makes package modified and lists unavailable dish',()=>{
 const catalog=base.dishes.filter(d=>d.id!=='h2');const menu=C.applyPackage(C.defaultState(base).menu,base.sets[0],catalog,'replace');
 const diff=C.packageDiff(menu,base.sets,catalog);assert.equal(diff.modified,true);assert.deepEqual(diff.unavailable,['h2']);assert.equal(menu.ids.length,13);
});
test('menu import validates format, filters unknown IDs, preserves metadata',()=>{
 const state=C.defaultState(base);let result=C.parseMenuImport({type:'kailong-menu',version:2,menu:{ids:['h1','missing'],event:{title:'婚宴',tables:12}}},state,base);
 assert.deepEqual(result.menu.ids,['h1']);assert.deepEqual(result.unknown,['missing']);assert.equal(result.menu.event.tables,'12');
 assert.throws(()=>C.parseMenuImport({type:'kailong-menu',version:2,menu:{ids:['missing']}},state,base),/完整备份/);
 assert.throws(()=>C.parseMenuImport({type:'other',menu:{ids:[]}},state,base));
});
test('corrupt catalog and dangerous photo URLs are rejected',()=>{
 assert.throws(()=>C.validateCatalog([{id:'a',category:'hot',name:'a',image:'javascript:alert(1)'}]));
 assert.throws(()=>C.validateCatalog([{id:'a',category:'hot',name:'a',image:'https://external.example/p.jpg'}]));
 assert.throws(()=>C.validateCatalog([{id:'a',category:'hot',name:'a'},{id:'a',category:'hot',name:'b'}]));
 assert.throws(()=>C.validateCatalog([{id:'a',category:'wrong',name:'a'}]));
 assert.throws(()=>C.restoreState({version:99},base));
 assert.equal(C.safeImage('images/../secret.jpg'),'');assert.equal(C.safeImage('data:image/svg+xml;base64,AA=='),'');
});
test('event validation rejects impossible dates and invalid counts',()=>{
 assert.equal(C.normalizeEvent({date:'2026-02-30',tables:-1}).date,'');assert.equal(C.normalizeEvent({tables:2.5}).tables,'');
 assert.equal(C.normalizeEvent({date:'2028-02-29',tables:9999}).date,'2028-02-29');assert.equal(C.normalizeEvent({tables:10000}).tables,'');
});
test('menu grouping keeps selected order inside categories and alias data',()=>{
 const groups=C.groupDishes(['h21','c1','h1','missing'],base.dishes);assert.deepEqual(groups.hot.map(d=>d.id),['h21','h1']);assert.equal(groups.cold[0].id,'c1');assert.equal(groups.hot[0].festiveName,'喜得贵子');
});
test('offline entry has no CDN or remote image references',()=>{
 for(const file of ['index.html','css/style.css','js/main.js','js/dishes.js'])assert.ok(!/https?:\/\//.test(fs.readFileSync(path.join(root,file),'utf8')),file);
});
