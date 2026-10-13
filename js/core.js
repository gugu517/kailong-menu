/* Shared data rules, also runnable by node for regression checks. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MenuCore = api;
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  const CATEGORY_IDS = ['cold', 'hot', 'soup', 'staple', 'dessert'];
  const clone = value => JSON.parse(JSON.stringify(value));
  const text = (value, max = 240) => typeof value === 'string' ? value.trim().slice(0, max) : '';
  const safeImage = value => {
    if (typeof value !== 'string') return '';
    if (/^images\/dishes\/[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp)$/.test(value)) return value;
    if (value.length <= 550000 && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value)) return value;
    return '';
  };
  function validateCatalog(value) {
    if (!Array.isArray(value) || !value.length || value.length > 500) throw new Error('菜品列表需包含 1–500 道菜。');
    const ids = new Set();
    return value.map(d => {
      if (!d || typeof d !== 'object' || !/^[a-zA-Z0-9_-]{1,60}$/.test(d.id || '') || ids.has(d.id)) throw new Error('菜品 ID 无效或重复。');
      if (!CATEGORY_IDS.includes(d.category) || !text(d.name, 60)) throw new Error('菜品分类或名称无效。');
      for (const key of ['image', 'sourceImage']) if (d[key] && !safeImage(d[key])) throw new Error('照片需使用项目内路径或 JPEG、PNG、WebP 数据。');
      ids.add(d.id);
      return {id:d.id, category:d.category, name:text(d.name,60), festiveName:text(d.festiveName,60), description:text(d.description), image:safeImage(d.image), sourceImage:safeImage(d.sourceImage || d.image), reviewNote:text(d.reviewNote,300), originalName:text(d.originalName || d.name,60)};
    });
  }
  function normalizeConfig(value, fallback) {
    value = value && typeof value === 'object' ? value : {};
    return {restaurant:text(value.restaurant,40) || fallback.restaurant, slogan:text(value.slogan,80), phone:text(value.phone,30), blessing:text(value.blessing,80)};
  }
  function normalizeEvent(value) {
    value = value && typeof value === 'object' ? value : {};
    const date = text(value.date,10);
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date+'T00:00:00Z')) && new Date(date+'T00:00:00Z').toISOString().slice(0,10)===date;
    const tables = Number(value.tables);
    return {title:text(value.title,60), date:validDate ? date : '', tables:Number.isInteger(tables) && tables>0 && tables<=9999 ? String(tables) : '', note:text(value.note,300)};
  }
  function normalizeMenu(value, catalog, sets) {
    if (!value || typeof value !== 'object' || !Array.isArray(value.ids)) throw new Error('菜单数据无效。');
    const known = new Set(catalog.map(d=>d.id));
    const ids = [...new Set(value.ids.filter(id=>typeof id==='string' && known.has(id)))].slice(0,500);
    return {ids, setId:sets.some(s=>s.id===value.setId) ? value.setId : null, event:normalizeEvent(value.event), style:['illustrated','simple','festive'].includes(value.style) ? value.style : 'illustrated', useAlias:value.useAlias===true};
  }
  function defaultState(base) {
    return {version:2,catalog:clone(base.dishes),config:clone(base.config),menu:{ids:[],setId:null,event:normalizeEvent({}),style:'illustrated',useAlias:false}};
  }
  function restoreState(value, base) {
    if (!value || value.version!==2 || !value.menu || !value.config) throw new Error('备份版本或结构不受支持。');
    const catalog = validateCatalog(value.catalog);
    return {version:2,catalog,config:normalizeConfig(value.config,base.config),menu:normalizeMenu(value.menu,catalog,base.sets)};
  }
  function parseMenuImport(value, state, base) {
    if (!value || value.type!=='kailong-menu' || value.version!==2 || !value.menu) throw new Error('请选择由本项目导出的菜单 JSON。');
    const menu = normalizeMenu(value.menu,state.catalog,base.sets);
    const unknown = [...new Set(value.menu.ids)].filter(id=>!state.catalog.some(d=>d.id===id));
    if (value.menu.ids.length && !menu.ids.length) throw new Error('菜单中的菜品均不在当前资料中，请先导入完整备份。');
    return {menu,unknown};
  }
  function packageDiff(menu, sets, catalog) {
    const set = sets.find(s=>s.id===menu.setId);
    if (!set) return null;
    const known = new Set(catalog.map(d=>d.id));
    const current = new Set(menu.ids);
    return {set,added:menu.ids.filter(id=>!set.dishes.includes(id)),removed:set.dishes.filter(id=>!current.has(id)),unavailable:set.dishes.filter(id=>!known.has(id)),modified:menu.ids.length!==set.dishes.length || set.dishes.some(id=>!current.has(id)) || menu.ids.some(id=>!set.dishes.includes(id))};
  }
  function toggle(ids, id) {return ids.includes(id) ? ids.filter(value=>value!==id) : [...ids,id];}
  function replace(ids, oldId, newId) {
    if (!ids.includes(oldId)) throw new Error('要替换的菜品已不在菜单中。');
    if (oldId===newId) return [...ids];
    if (ids.includes(newId)) throw new Error('这道菜已经在菜单中，请选择另一道。');
    return ids.map(id=>id===oldId ? newId : id);
  }
  function applyPackage(menu, set, catalog, mode) {
    const known = new Set(catalog.map(d=>d.id));
    const ids = set.dishes.filter(id=>known.has(id));
    return {...menu,ids:mode==='append' ? [...new Set([...menu.ids,...ids])] : ids, setId:set.id};
  }
  function groupDishes(ids,catalog) {
    const lookup = new Map(catalog.map(d=>[d.id,d]));
    return Object.fromEntries(CATEGORY_IDS.map(cat=>[cat,ids.map(id=>lookup.get(id)).filter(d=>d && d.category===cat)]));
  }
  return {clone,text,safeImage,validateCatalog,normalizeConfig,normalizeEvent,normalizeMenu,defaultState,restoreState,parseMenuImport,packageDiff,toggle,replace,applyPackage,groupDishes};
});
