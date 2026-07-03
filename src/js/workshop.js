// workshop.js - localStorage-based simple workshop for BBc
(function(){
  const lsKey = 'workshop_items_v1';
  const form = document.getElementById('itemForm');
  const myItemsContainer = document.getElementById('myItems');
  const publishBtn = document.getElementById('publishBtn');

  function uid(){ return 'i_' + Math.random().toString(36).slice(2,9) + Date.now(); }
  function loadItems(){ try{ return JSON.parse(localStorage.getItem(lsKey)||'[]'); }catch(e){return []} }
  function saveItems(items){ localStorage.setItem(lsKey, JSON.stringify(items)); }
  function toRarityClass(r){ return (r||'').toLowerCase(); }

  function render(){
    const items = loadItems().slice().reverse(); // newest first
    if(items.length===0){ myItemsContainer.innerHTML = '<p class="small">У вас ще немає створених елементів.</p>'; return }

    myItemsContainer.innerHTML = items.map(it=>{
      const img = it.imageUrl? `<img src="${it.imageUrl}" alt="${escapeHtml(it.title)}"/>` : '<div style="height:120px;background:#eee;border-radius:4px;display:flex;align-items:center;justify-content:center;color:#888">No image</div>';
      const rclass = toRarityClass(it.rarity);
      const categories = (it.category||[]).join(', ');
      return `\
        <div class="card">\
          ${img}\
          <h3>${escapeHtml(it.title)}</h3>\
          <div class="meta">${escapeHtml(it.type)} • <span class="badge ${rclass}">${escapeHtml(it.rarity)}</span></div>\
          <div class="meta">${escapeHtml(it.status||'draft')} • ${escapeHtml(categories)}</div>\
          <div class="action-row">\
            <button data-id="${it.id}" class="edit">Редагувати</button>\
            <button data-id="${it.id}" class="publish">Опублікувати</button>\
            <button data-id="${it.id}" class="delete">Видалити</button>\
          </div>\
        </div>`;
    }).join('');
  }

  function escapeHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  form.addEventListener('submit', async function(e){
    e.preventDefault();
    const type = document.getElementById('type').value;
    const title = document.getElementById('title').value.trim();
    const categories = document.getElementById('categories').value.split(',').map(x=>x.trim()).filter(Boolean);
    const rarity = document.getElementById('rarity').value;
    const description = document.getElementById('description').value.trim();
    const file = document.getElementById('image').files[0];
    let imageUrl = '';
    if(file){ imageUrl = await readFileAsDataURL(file); }

    const item = { id: uid(), type, title, category:categories, rarity, description, imageUrl, creatorId: 'local-user', price:0, status:'draft', createdAt:new Date().toISOString() };
    const items = loadItems(); items.push(item); saveItems(items);
    form.reset(); render();
    alert('Чернетка збережена');
  });

  publishBtn.addEventListener('click', function(){
    // publish the last saved draft (shortcut) or publish selected - here we'll publish the most recent draft
    const items = loadItems();
    const draft = items.slice().reverse().find(x=>x.status==='draft');
    if(!draft){ alert('Немає чернеток для публікації'); return }
    draft.status = 'pending';
    saveItems(items);
    render();
    alert('Елемент відправлено на модерацію');
  });

  myItemsContainer.addEventListener('click', function(e){
    const id = e.target.dataset.id; if(!id) return;
    const items = loadItems(); const idx = items.findIndex(x=>x.id===id); if(idx===-1) return;
    if(e.target.classList.contains('publish')){
      items[idx].status = 'pending'; saveItems(items); render(); alert('Відправлено на модерацію');
    }
    if(e.target.classList.contains('delete')){
      if(confirm('Видалити елемент?')){ items.splice(idx,1); saveItems(items); render(); }
    }
    if(e.target.classList.contains('edit')){
      const it = items[idx];
      document.getElementById('type').value = it.type;
      document.getElementById('title').value = it.title;
      document.getElementById('categories').value = (it.category||[]).join(', ');
      document.getElementById('rarity').value = it.rarity;
      document.getElementById('description').value = it.description||'';
      // note: editing image not implemented; editing will create a new item on save
      if(confirm('При збереженні буде створена нова чернетка. Продовжити?')){
        // user can edit fields and submit to create new
      }
    }
  });

  // helper
  function readFileAsDataURL(file){ return new Promise((res,rej)=>{ const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.onerror=rej; fr.readAsDataURL(file); }) }

  // initial render
  render();
})();
