(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // FI / Soyağacı — index (projects/default) ile ASLA karışmaz.
  // Firebase: familyTrees/default
  // Yerel: family_tree_editor_*
  // Düzen: yukarıdan aşağıya (top-down)
  // ---------------------------------------------------------------------------

  const firebaseConfig = window.FIREBASE_CONFIG || null;
  let firebaseDatabase = null;
  try {
    if (!firebaseConfig) throw new Error('Firebase yapılandırması bulunamadı.');
    if (!window.firebase) throw new Error('Firebase SDK yüklenemedi.');
    if (!firebase.apps || !firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    firebaseDatabase = firebase.database();
  } catch (e) {
    console.warn('FI Firebase başlatılamadı, yerel kayıt kullanılacak:', e);
  }

  const STORAGE_KEY = 'family_tree_editor_' + window.location.pathname;
  const FIREBASE_PATH = 'familyTrees/default';
  const ACTIVITY_LOG_PATH = 'familyTrees/activityLog';
  const CANVAS_SIZE_KEY = 'family_canvas_size_' + window.location.pathname;
  const PROJECT_KIND = 'familyTree';

  const CFG = window.PWA_CONFIG || {};
  const CARD_MAX_FIELDS = (CFG.CARD && typeof CFG.CARD.maxVisibleFields === 'number') ? CFG.CARD.maxVisibleFields : 6;
  const FIELD_HINT_AT = (CFG.CARD && typeof CFG.CARD.fieldHintAt === 'number') ? CFG.CARD.fieldHintAt : 3;
  const FIELD_ROW_H = (CFG.CARD && typeof CFG.CARD.fieldRowHeight === 'number') ? CFG.CARD.fieldRowHeight : 22;

  let project = null;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) project = JSON.parse(saved);
  } catch (e) {
    console.warn(e);
  }

  if (!project || project.kind !== PROJECT_KIND) {
    project = {
      kind: PROJECT_KIND,
      projectName: 'Soyağacı',
      trees: [],
      lastModified: null
    };
  }
  if (!Array.isArray(project.trees)) project.trees = [];

  let viewMode = 'canvas';
  let panX = 40;
  let panY = 40;
  let zoom = 1.0;
  let searchQuery = '';
  let searchMatches = [];
  let activeSearchIndex = -1;
  let isPanning = false;
  let panStartX = 0;
  let panStartY = 0;
  let selectedNodeId = null;
  let editingNodeId = null;
  let dragEnabled = false;
  let activeTreeDrag = null;
  let canvasWidth = 10000;
  let canvasHeight = 10000;

  const CARD_WIDTH = 220;
  const HORIZONTAL_GAP = 28;
  const VERTICAL_SPACING = 72;

  const COLOR_PALETTE = {
    emerald: { border: '#10b981', headerBg: '#ecfdf5', headerText: '#065f46' },
    blue: { border: '#3b82f6', headerBg: '#eff6ff', headerText: '#1e40af' },
    violet: { border: '#8b5cf6', headerBg: '#f5f3ff', headerText: '#5b21b6' },
    amber: { border: '#f59e0b', headerBg: '#fffbeb', headerText: '#92400e' },
    rose: { border: '#f43f5e', headerBg: '#fff1f2', headerText: '#9f1239' },
    indigo: { border: '#6366f1', headerBg: '#eef2ff', headerText: '#3730a3' },
    teal: { border: '#14b8a6', headerBg: '#f0fdfa', headerText: '#115e59' },
    orange: { border: '#f97316', headerBg: '#fff7ed', headerText: '#9a3412' },
    slate: { border: '#64748b', headerBg: '#f8fafc', headerText: '#1e293b' }
  };

  const ICON_EMOJIS = Object.assign({
    user: '👤',
    users: '👥',
    sparkles: '✨',
    heart: '❤️',
    folder: '📁'
  }, (CFG.ICONS || {}));

  function getIconEmoji(icon) {
    return ICON_EMOJIS[icon] || ICON_EMOJIS.user || '👤';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function generateId(prefix) {
    return (prefix || 'node') + '_' + Math.random().toString(36).substr(2, 9);
  }

  function estimateNodeHeight(node) {
    let h = 78;
    if (node.subtitle) h += 16;
    if (node.tags && node.tags.length) h += 22;
    if (node.fields && node.fields.length > 0) {
      const visibleCount = Math.min(node.fields.length, CARD_MAX_FIELDS);
      h += 12 + visibleCount * FIELD_ROW_H;
      if (node.fields.length > FIELD_HINT_AT) h += 14;
    }
    h += 36;
    return h;
  }

  function findNodeInTree(trees, nodeId) {
    for (const tree of trees) {
      const walk = (node, parent) => {
        if (node.id === nodeId) return { node, parent, tree };
        if (!node.children) return null;
        for (const child of node.children) {
          const found = walk(child, node);
          if (found) return found;
        }
        return null;
      };
      const found = walk(tree.rootNode, null);
      if (found) return found;
    }
    return null;
  }

  function saveProject() {
    try {
      project.kind = PROJECT_KIND;
      project.lastModified = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
      if (firebaseDatabase) {
        firebaseDatabase.ref(FIREBASE_PATH).set(project).catch((error) => {
          console.warn('FI Firebase kaydı başarısız:', error);
        });
      }
    } catch (e) {
      console.error(e);
    }
  }

  function listenForFirebaseProject() {
    if (!firebaseDatabase) return;
    firebaseDatabase.ref(FIREBASE_PATH).on('value', (snapshot) => {
      const remote = snapshot.val();
      if (!remote || remote.kind !== PROJECT_KIND) return;
      if (remote.lastModified === project.lastModified) return;
      project = remote;
      if (!Array.isArray(project.trees)) project.trees = [];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
      if (viewMode === 'canvas') renderCanvas();
      else renderOutline();
    }, (error) => {
      console.warn('FI Firebase okunamadı:', error);
    });
  }

  // Yukarıdan aşağıya yerleşim (index soldan sağa; burada X çocuklara göre yayılır, Y derinlik artar)
  function computeLayouts() {
    const nodeLayouts = new Map();

    for (const tree of project.trees) {
      const getSubtreeWidth = (node) => {
        if (!node.children || node.children.length === 0 || node.collapsed) {
          return CARD_WIDTH;
        }
        let total = 0;
        for (let i = 0; i < node.children.length; i++) {
          total += getSubtreeWidth(node.children[i]);
          if (i < node.children.length - 1) total += HORIZONTAL_GAP;
        }
        return Math.max(CARD_WIDTH, total);
      };

      const placeNode = (node, depth, startX, startY, parentId) => {
        const nodeH = estimateNodeHeight(node);
        const subtreeW = getSubtreeWidth(node);
        const nodeX = startX + (subtreeW - CARD_WIDTH) / 2 + (node.offsetX || 0);
        const nodeY = startY + (node.offsetY || 0);

        nodeLayouts.set(node.id, {
          id: node.id,
          node,
          treeId: tree.id,
          x: nodeX,
          y: nodeY,
          width: CARD_WIDTH,
          height: nodeH,
          depth,
          parentId,
          hasChildren: Boolean(node.children && node.children.length > 0),
          isCollapsed: Boolean(node.collapsed)
        });

        if (!node.collapsed && node.children && node.children.length > 0) {
          let childStartX = startX + (node.offsetX || 0);
          const childStartY = startY + nodeH + VERTICAL_SPACING + (node.offsetY || 0);
          for (const child of node.children) {
            const childW = getSubtreeWidth(child);
            placeNode(child, depth + 1, childStartX, childStartY, node.id);
            childStartX += childW + HORIZONTAL_GAP;
          }
        }
      };

      placeNode(tree.rootNode, 0, tree.x, tree.y, null);
    }

    return nodeLayouts;
  }

  function isNodeMatch(node) {
    if (!searchQuery) return false;
    const q = searchQuery.toLowerCase();
    if ((node.title || '').toLowerCase().includes(q)) return true;
    if (node.subtitle && node.subtitle.toLowerCase().includes(q)) return true;
    if (node.description && node.description.toLowerCase().includes(q)) return true;
    if (node.tags && node.tags.some((t) => t.toLowerCase().includes(q))) return true;
    if (node.fields && node.fields.some((f) =>
      String(f.key || '').toLowerCase().includes(q) || String(f.value || '').toLowerCase().includes(q)
    )) return true;
    return false;
  }

  function collectSearchMatches() {
    searchMatches = [];
    const walk = (node) => {
      if (isNodeMatch(node)) searchMatches.push(node.id);
      (node.children || []).forEach(walk);
    };
    project.trees.forEach((t) => walk(t.rootNode));
  }

  function renderCanvas() {
    const stage = document.getElementById('canvas-stage');
    const svg = document.getElementById('canvas-svg');
    const treeHeadersLayer = document.getElementById('tree-headers-layer');
    const nodesLayer = document.getElementById('nodes-layer');
    const container = document.getElementById('canvas-container');
    if (!stage || !svg || !treeHeadersLayer || !nodesLayer || !container) return;

    stage.style.width = canvasWidth + 'px';
    stage.style.height = canvasHeight + 'px';
    stage.style.transform = 'translate3d(' + panX + 'px, ' + panY + 'px, 0) scale(' + zoom + ')';
    container.style.backgroundPosition = panX + 'px ' + panY + 'px';
    container.style.backgroundSize = (24 * zoom) + 'px ' + (24 * zoom) + 'px';

    const nodeLayouts = computeLayouts();

    treeHeadersLayer.innerHTML = project.trees.map((tree) => `
      <div class="absolute select-none" style="left: ${tree.x}px; top: ${tree.y - 48}px;" data-tree-id="${tree.id}">
        <div class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold shadow-md border border-slate-700">
          <div class="flex items-center gap-1.5 ${dragEnabled ? 'cursor-move' : 'cursor-default'}" onmousedown="window.startTreeDrag(event, '${tree.id}')" ontouchstart="window.startTouchDrag(event, null, '${tree.id}')" title="Ağacı taşı">
            <span class="text-emerald-400">✥</span>
            <span>${escapeHtml(tree.name)}</span>
          </div>
          <div class="flex items-center gap-1 ml-2 border-l border-slate-700 pl-2">
            <button onclick="window.addChildNode('${tree.rootNode.id}')" class="p-1 hover:bg-slate-800 rounded text-emerald-400" title="Kök altına çocuk ekle">➕</button>
            <button onclick="window.renameTree('${tree.id}')" class="p-1 hover:bg-slate-800 rounded text-slate-300" title="Yeniden adlandır">✏️</button>
            <button onclick="window.deleteTree('${tree.id}')" class="p-1 hover:bg-rose-950 rounded text-rose-400" title="Soyağacını sil">🗑️</button>
          </div>
        </div>
      </div>
    `).join('');

    let svgPaths = '';
    nodeLayouts.forEach((layout) => {
      if (!layout.parentId || !nodeLayouts.has(layout.parentId)) return;
      const parent = nodeLayouts.get(layout.parentId);
      const startX = parent.x + parent.width / 2;
      const startY = parent.y + parent.height;
      const endX = layout.x + layout.width / 2;
      const endY = layout.y;
      const midY = startY + (endY - startY) / 2;
      const pathData = 'M ' + startX + ' ' + startY +
        ' C ' + startX + ' ' + midY + ', ' + endX + ' ' + midY + ', ' + endX + ' ' + endY;
      svgPaths += '<g><path d="' + pathData + '" fill="none" stroke="#cbd5e1" stroke-width="2" stroke-linecap="round" />' +
        '<circle cx="' + endX + '" cy="' + endY + '" r="3" fill="#94a3b8" /></g>';
    });
    svg.innerHTML = svgPaths;

    const hasSearch = Boolean(searchQuery);
    let nodesHtml = '';
    nodeLayouts.forEach((layout) => {
      const node = layout.node;
      const theme = COLOR_PALETTE[node.color || 'emerald'] || COLOR_PALETTE.emerald;
      const isMatch = isNodeMatch(node);
      const isSelected = selectedNodeId === node.id;

      const fieldsHtml = node.fields && node.fields.length > 0 ? `
        <div class="mt-2 pt-2 border-t border-slate-100 space-y-1 text-[11px]">
          ${node.fields.slice(0, CARD_MAX_FIELDS).map((f) => `
            <div class="flex items-center justify-between gap-1">
              <span class="text-slate-500 font-medium truncate">${escapeHtml(f.key)}:</span>
              <span class="text-slate-800 font-bold truncate">${escapeHtml(f.value)}</span>
            </div>
          `).join('')}
          ${node.fields.length > FIELD_HINT_AT ? '<div class="text-[10px] text-slate-400">+' + (node.fields.length - FIELD_HINT_AT) + ' alan…</div>' : ''}
        </div>
      ` : '';

      const tagsHtml = node.tags && node.tags.length > 0 ? `
        <div class="flex flex-wrap gap-1 mt-1.5">
          ${node.tags.slice(0, 2).map((t) => '<span class="px-1.5 py-0.2 rounded text-[10px] font-medium bg-slate-100 text-slate-600">' + escapeHtml(t) + '</span>').join('')}
        </div>
      ` : '';

      let cardClasses = 'absolute rounded-xl bg-white shadow-sm border transition-all duration-200 select-none ';
      if (isSelected) cardClasses += 'ring-2 ring-emerald-500 shadow-md ';
      else if (hasSearch) {
        cardClasses += isMatch
          ? 'ring-4 ring-amber-400 border-amber-500 bg-amber-50/70 shadow-xl scale-[1.03] z-30 '
          : 'opacity-40 grayscale-[40%] scale-[0.98] ';
      } else {
        cardClasses += 'hover:shadow-md hover:border-slate-300 ';
      }

      nodesHtml += `
        <div class="${cardClasses}"
          style="left: ${layout.x}px; top: ${layout.y}px; width: ${layout.width}px; border-color: ${isMatch ? '#f59e0b' : theme.border};"
          id="node-card-${node.id}">
          <div
            onmousedown="window.startNodeDrag(event, '${node.id}')"
            ontouchstart="window.startTouchDrag(event, '${node.id}', null)"
            class="px-3 py-2 rounded-t-xl flex items-center justify-between border-b ${dragEnabled ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}"
            style="background-color: ${isMatch ? '#fef3c7' : theme.headerBg}; border-color: ${theme.border}40;">
            <div class="flex items-center gap-1.5 truncate">
              <span class="text-sm cursor-pointer" onclick="event.stopPropagation(); window.openEditModal('${node.id}')">${getIconEmoji(node.icon)}</span>
              <span class="text-xs font-bold truncate cursor-pointer hover:underline" onclick="event.stopPropagation(); window.openEditModal('${node.id}')" style="color: ${isMatch ? '#92400e' : theme.headerText};">${escapeHtml(node.title)}</span>
            </div>
            <div class="flex items-center gap-1">
              ${layout.hasChildren ? `
                <button onclick="event.stopPropagation(); window.toggleNodeCollapse('${node.id}')"
                  class="p-1 rounded hover:bg-black/5 text-slate-600 font-mono text-[10px] font-bold"
                  title="${node.collapsed ? 'Genişlet' : 'Daralt'}">${node.collapsed ? '+' : '−'}</button>
              ` : ''}
            </div>
          </div>
          <div class="p-2.5 cursor-pointer" onclick="window.openEditModal('${node.id}')">
            ${node.subtitle ? '<div class="text-[11px] font-medium text-slate-500 truncate">' + escapeHtml(node.subtitle) + '</div>' : ''}
            ${tagsHtml}
            ${fieldsHtml}
          </div>
          <div class="px-2.5 py-1.5 bg-slate-50/80 rounded-b-xl border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-600">
            <div class="flex items-center gap-1">
              <button onclick="event.stopPropagation(); window.addChildNode('${node.id}')"
                class="px-2 py-0.5 rounded bg-white hover:bg-emerald-50 text-emerald-700 border border-slate-200 font-bold" title="Çocuk ekle">➕ Çocuk</button>
              <button onclick="event.stopPropagation(); window.addSiblingNode('${node.id}')"
                class="px-1.5 py-0.5 rounded bg-white hover:bg-blue-50 text-blue-700 border border-slate-200" title="Kardeş ekle">👥 Kardeş</button>
            </div>
            <div class="flex items-center gap-1">
              <button onclick="event.stopPropagation(); window.openEditModal('${node.id}')" class="p-1 rounded bg-white hover:bg-slate-200 border border-slate-200">✏️</button>
              <button onclick="event.stopPropagation(); window.deleteNode('${node.id}')" class="p-1 rounded bg-white hover:bg-rose-50 text-rose-600 border border-slate-200">🗑️</button>
            </div>
          </div>
        </div>
      `;
    });
    nodesLayer.innerHTML = nodesHtml;

    const hudEl = document.getElementById('coord-hud');
    if (hudEl) hudEl.textContent = 'X:' + Math.round((-panX) / zoom) + '  Y:' + Math.round((-panY) / zoom);

    const gridEl = document.getElementById('grid-labels');
    if (gridEl) {
      const ccRect = container.getBoundingClientRect();
      const z = zoom || 1;
      const gx0 = Math.floor((-panX) / z / 100) * 100;
      const gx1 = Math.floor((-panX + ccRect.width) / z / 100) * 100;
      const gy0 = Math.floor((-panY) / z / 100) * 100;
      const gy1 = Math.floor((-panY + ccRect.height) / z / 100) * 100;
      let gs = '';
      for (let gx = gx0; gx <= gx1; gx += 100) gs += '<div style="position:absolute;left:' + gx + 'px;top:' + gy0 + 'px;">' + gx + '</div>';
      for (let gy = gy0; gy <= gy1; gy += 100) gs += '<div style="position:absolute;left:' + gx0 + 'px;top:' + gy + 'px;">' + gy + '</div>';
      gridEl.innerHTML = gs;
    }

    const zoomText = document.getElementById('zoom-text');
    if (zoomText) zoomText.textContent = Math.round(zoom * 100) + '%';
  }

  function renderOutline() {
    const container = document.getElementById('outline-content');
    if (!container) return;

    const renderOutlineNode = (node) => {
      const theme = COLOR_PALETTE[node.color || 'emerald'] || COLOR_PALETTE.emerald;
      const childrenHtml = (node.children || []).map(renderOutlineNode).join('');
      return `
        <div class="ml-0 sm:ml-4 mt-2 border-l-2 pl-3" style="border-color: ${theme.border}55;" id="outline-node-${node.id}">
          <div class="bg-white rounded-xl border border-slate-200 p-3 flex items-start justify-between gap-2">
            <div class="min-w-0 cursor-pointer" onclick="window.openEditModal('${node.id}')">
              <div class="text-sm font-bold text-slate-800">${getIconEmoji(node.icon)} ${escapeHtml(node.title)}</div>
              ${node.subtitle ? '<div class="text-[11px] text-slate-500">' + escapeHtml(node.subtitle) + '</div>' : ''}
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <button onclick="window.addChildNode('${node.id}')" class="px-2 py-0.5 text-[10px] font-bold bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-200">➕</button>
              <button onclick="window.deleteNode('${node.id}')" class="p-1 text-rose-500 hover:bg-rose-50 rounded-lg">🗑️</button>
            </div>
          </div>
          ${childrenHtml}
        </div>
      `;
    };

    if (!project.trees.length) {
      container.innerHTML = '<div class="text-center text-slate-400 py-16 text-sm">Henüz soyağacı yok. «Yeni Soyağacı» ile başlayın.</div>';
      return;
    }

    container.innerHTML = project.trees.map((tree, idx) => `
      <div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
        <div class="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
          <div class="flex items-center gap-2">
            <span class="w-6 h-6 rounded bg-emerald-600 text-white text-xs font-bold flex items-center justify-center">${idx + 1}</span>
            <h2 class="text-base font-bold text-slate-900">${escapeHtml(tree.name)}</h2>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="window.addChildNode('${tree.rootNode.id}')" class="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold">➕ Kişi</button>
            <button onclick="window.renameTree('${tree.id}')" class="p-1 text-slate-500 hover:bg-slate-100 rounded-lg">✏️</button>
            <button onclick="window.deleteTree('${tree.id}')" class="p-1 text-rose-500 hover:bg-rose-50 rounded-lg">🗑️</button>
          </div>
        </div>
        ${renderOutlineNode(tree.rootNode)}
      </div>
    `).join('');
  }

  function refreshView() {
    if (viewMode === 'canvas') renderCanvas();
    else renderOutline();
  }

  window.setViewMode = function (mode) {
    viewMode = mode;
    const canvas = document.getElementById('canvas-container');
    const outline = document.getElementById('outline-container');
    const btnC = document.getElementById('btn-view-canvas');
    const btnO = document.getElementById('btn-view-outline');
    if (mode === 'canvas') {
      canvas.classList.remove('hidden');
      outline.classList.add('hidden');
      btnC.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-slate-900 shadow-xs transition-colors';
      btnO.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 transition-colors';
      renderCanvas();
    } else {
      canvas.classList.add('hidden');
      outline.classList.remove('hidden');
      btnO.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-slate-900 shadow-xs transition-colors';
      btnC.className = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 transition-colors';
      renderOutline();
    }
  };

  window.addNewTree = function () {
    const name = prompt('Soyağacı adı:', 'Aile Soyağacı');
    if (!name || !name.trim()) return;

    let maxY = 80;
    project.trees.forEach((t) => { if (t.y > maxY) maxY = t.y; });

    const newTree = {
      id: generateId('tree'),
      name: name.trim(),
      x: 200 + Math.floor(Math.random() * 400),
      y: maxY + 280,
      rootNode: {
        id: generateId('node'),
        title: name.trim(),
        subtitle: 'Ata / kök',
        icon: 'users',
        color: 'emerald',
        fields: [],
        tags: [],
        children: []
      }
    };
    project.trees.push(newTree);
    saveProject();
    refreshView();
    window.openEditModal(newTree.rootNode.id);
  };

  window.renameTree = function (treeId) {
    const tree = project.trees.find((t) => t.id === treeId);
    if (!tree) return;
    const newName = prompt('Yeni ad:', tree.name);
    if (newName && newName.trim()) {
      tree.name = newName.trim();
      saveProject();
      refreshView();
    }
  };

  window.deleteTree = function (treeId) {
    const tree = project.trees.find((t) => t.id === treeId);
    if (!tree) return;
    if (!confirm('"' + tree.name + '" soyağacını ve tüm kişileri silmek istediğinize emin misiniz?')) return;
    project.trees = project.trees.filter((t) => t.id !== treeId);
    saveProject();
    refreshView();
  };

  window.addChildNode = function (parentId) {
    const match = findNodeInTree(project.trees, parentId);
    if (!match) return;
    const newNode = {
      id: generateId('node'),
      title: 'Yeni Kişi',
      subtitle: '',
      icon: 'user',
      color: match.node.color || 'emerald',
      fields: [],
      tags: [],
      children: []
    };
    if (!match.node.children) match.node.children = [];
    match.node.children.push(newNode);
    match.node.collapsed = false;
    saveProject();
    refreshView();
    window.openEditModal(newNode.id);
  };

  window.addSiblingNode = function (nodeId) {
    const match = findNodeInTree(project.trees, nodeId);
    if (!match) return;
    if (!match.parent) {
      window.addNewTree();
      return;
    }
    const newNode = {
      id: generateId('node'),
      title: 'Yeni Kardeş',
      subtitle: '',
      icon: 'user',
      color: match.parent.color || 'emerald',
      fields: [],
      tags: [],
      children: []
    };
    const idx = match.parent.children.findIndex((c) => c.id === nodeId);
    if (idx >= 0) match.parent.children.splice(idx + 1, 0, newNode);
    else match.parent.children.push(newNode);
    saveProject();
    refreshView();
    window.openEditModal(newNode.id);
  };

  window.deleteNode = function (nodeId) {
    const match = findNodeInTree(project.trees, nodeId);
    if (!match) return;
    if (!match.parent) {
      window.deleteTree(match.tree.id);
      return;
    }
    if (!confirm('"' + match.node.title + '" ve altındaki kişileri silmek istediğinize emin misiniz?')) return;
    match.parent.children = match.parent.children.filter((c) => c.id !== nodeId);
    if (editingNodeId === nodeId) closeModal();
    saveProject();
    refreshView();
  };

  window.toggleNodeCollapse = function (nodeId) {
    const match = findNodeInTree(project.trees, nodeId);
    if (!match) return;
    match.node.collapsed = !match.node.collapsed;
    saveProject();
    refreshView();
  };

  window.openEditModal = function (nodeId) {
    const match = findNodeInTree(project.trees, nodeId);
    if (!match) return;
    editingNodeId = nodeId;
    selectedNodeId = nodeId;
    const node = match.node;
    document.getElementById('modal-header-icon').textContent = getIconEmoji(node.icon);
    document.getElementById('modal-header-title').textContent = 'Kişiyi Düzenle';
    document.getElementById('modal-header-tree-name').textContent = match.tree.name;
    document.getElementById('edit-node-title').value = node.title || '';
    document.getElementById('edit-node-subtitle').value = node.subtitle || '';
    document.getElementById('edit-node-description').value = node.description || '';
    document.getElementById('edit-node-icon').value = node.icon || 'user';
    document.getElementById('edit-node-color').value = node.color || 'emerald';
    document.getElementById('edit-node-tags').value = (node.tags || []).join(', ');
    const fieldsContainer = document.getElementById('modal-fields-container');
    fieldsContainer.innerHTML = '';
    (node.fields || []).forEach((f) => addModalFieldRow(f.key, f.value));
    document.getElementById('node-modal').classList.remove('hidden');
  };

  window.addModalFieldRow = function (key, value) {
    const container = document.getElementById('modal-fields-container');
    const row = document.createElement('div');
    row.className = 'flex items-center gap-2 modal-field-row';
    row.innerHTML =
      '<input type="text" placeholder="Alan (örn: Doğum)" value="' + escapeHtml(key || '') + '" class="field-key w-1/3 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs" />' +
      '<input type="text" placeholder="Değer" value="' + escapeHtml(value || '') + '" class="field-value flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs" />' +
      '<button type="button" onclick="this.parentElement.remove()" class="p-1 text-slate-400 hover:text-rose-600">✕</button>';
    container.appendChild(row);
  };

  window.saveModalChanges = function () {
    if (!editingNodeId) return;
    const match = findNodeInTree(project.trees, editingNodeId);
    if (!match) return;
    match.node.title = document.getElementById('edit-node-title').value.trim() || 'İsimsiz';
    match.node.subtitle = document.getElementById('edit-node-subtitle').value.trim();
    match.node.description = document.getElementById('edit-node-description').value.trim();
    match.node.icon = document.getElementById('edit-node-icon').value;
    match.node.color = document.getElementById('edit-node-color').value;
    const tagsInput = document.getElementById('edit-node-tags').value;
    match.node.tags = tagsInput ? tagsInput.split(',').map((t) => t.trim()).filter(Boolean) : [];
    const fieldsVal = [];
    document.querySelectorAll('#modal-fields-container .modal-field-row').forEach((row) => {
      const k = row.querySelector('.field-key').value.trim();
      const v = row.querySelector('.field-value').value.trim();
      if (k || v) fieldsVal.push({ key: k || 'Alan', value: v });
    });
    match.node.fields = fieldsVal;
    saveProject();
    closeModal();
    refreshView();
  };

  window.deleteCurrentModalNode = function () {
    if (!editingNodeId) return;
    const id = editingNodeId;
    closeModal();
    window.deleteNode(id);
  };

  window.closeModal = function () {
    document.getElementById('node-modal').classList.add('hidden');
    editingNodeId = null;
    selectedNodeId = null;
  };

  window.handleZoom = function (delta) {
    zoom = Math.min(2.5, Math.max(0.25, zoom + delta));
    renderCanvas();
  };

  window.handleZoomReset = function () {
    zoom = 1;
    panX = 40;
    panY = 40;
    renderCanvas();
  };

  window.setCanvasSize = function () {
    const input = prompt('Tuval boyutu (px):', String(canvasWidth));
    if (input === null) return;
    const size = parseInt(input, 10);
    if (isNaN(size) || size < 100) {
      alert('Geçerli bir sayı girin (en az 100).');
      return;
    }
    canvasWidth = size;
    canvasHeight = size;
    try { localStorage.setItem(CANVAS_SIZE_KEY, String(size)); } catch (e) {}
    renderCanvas();
  };

  window.toggleDragMode = function () {
    dragEnabled = !dragEnabled;
    const icon = document.getElementById('drag-toggle-icon');
    const text = document.getElementById('drag-toggle-text');
    const btn = document.getElementById('drag-toggle-btn');
    if (dragEnabled) {
      icon.textContent = '🔓';
      text.textContent = 'Sürükleme Açık';
      btn.classList.remove('bg-amber-500', 'hover:bg-amber-600');
      btn.classList.add('bg-emerald-600', 'hover:bg-emerald-700');
    } else {
      icon.textContent = '🔒';
      text.textContent = 'Sürüklemeyi Aç';
      btn.classList.add('bg-amber-500', 'hover:bg-amber-600');
      btn.classList.remove('bg-emerald-600', 'hover:bg-emerald-700');
    }
  };

  window.toggleDarkMode = function () {
    const isDark = document.body.classList.toggle('dark-mode');
    document.getElementById('theme-icon').textContent = isDark ? '☀️' : '🌙';
    document.getElementById('theme-text').textContent = isDark ? 'Açık Mod' : 'Koyu Mod';
    localStorage.setItem('theme-preference', isDark ? 'dark' : 'light');
  };

  window.handleSearch = function (value) {
    searchQuery = (value || '').trim();
    collectSearchMatches();
    activeSearchIndex = searchMatches.length ? 0 : -1;
    if (activeSearchIndex >= 0) focusSearchMatch(activeSearchIndex);
    else refreshView();
  };

  function focusSearchMatch(index) {
    if (!searchMatches.length) return;
    activeSearchIndex = ((index % searchMatches.length) + searchMatches.length) % searchMatches.length;
    const nodeId = searchMatches[activeSearchIndex];
    selectedNodeId = nodeId;
    if (viewMode === 'canvas') {
      renderCanvas();
      const layout = computeLayouts().get(nodeId);
      if (layout) {
        const rect = document.getElementById('canvas-container').getBoundingClientRect();
        panX = Math.round(rect.width / 2 - (layout.x + layout.width / 2) * zoom);
        panY = Math.round(rect.height / 2 - (layout.y + layout.height / 2) * zoom);
        renderCanvas();
      }
    } else {
      renderOutline();
      setTimeout(() => {
        const el = document.getElementById('outline-node-' + nodeId);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 0);
    }
  }

  window.navigateSearch = function (direction) {
    if (!searchMatches.length) return;
    focusSearchMatch(activeSearchIndex + direction);
  };

  window.downloadJSON = function () {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'soyagaci-' + (project.projectName || 'fi') + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  window.uploadJSON = function (file) {
    if (!file) return;
    const input = document.getElementById('json-upload-input');
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const imported = JSON.parse(reader.result);
        const ok =
          imported &&
          imported.kind === PROJECT_KIND &&
          Array.isArray(imported.trees) &&
          imported.trees.every((t) => t && t.rootNode && typeof t.rootNode === 'object');
        if (!ok) {
          alert('Geçersiz soyağacı dosyası. kind: "familyTree" ve trees[].rootNode gerekli. (Index proje dosyası yüklenemez.)');
          if (input) input.value = '';
          return;
        }
        project = imported;
        saveProject();
        refreshView();
        if (input) input.value = '';
        alert('Soyağacı yüklendi (familyTrees/ ile eşitlendi).');
      } catch (e) {
        alert('JSON okunamadı.');
        if (input) input.value = '';
      }
    };
    reader.readAsText(file);
  };

  window.startNodeDrag = function (e, nodeId) {
    if (!dragEnabled) return;
    const match = findNodeInTree(project.trees, nodeId);
    if (!match) return;
    if (!match.parent) {
      window.startTreeDrag(e, match.tree.id);
      return;
    }
    e.stopPropagation();
    const startOffsetX = match.node.offsetX || 0;
    const startOffsetY = match.node.offsetY || 0;
    const mouseStartX = e.clientX;
    const mouseStartY = e.clientY;
    const handleMove = (moveEvt) => {
      match.node.offsetX = Math.round(startOffsetX + (moveEvt.clientX - mouseStartX) / zoom);
      match.node.offsetY = Math.round(startOffsetY + (moveEvt.clientY - mouseStartY) / zoom);
      renderCanvas();
    };
    const handleUp = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      saveProject();
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  };

  window.startTreeDrag = function (e, treeId) {
    if (!dragEnabled) return;
    e.stopPropagation();
    const tree = project.trees.find((t) => t.id === treeId);
    if (!tree) return;
    activeTreeDrag = { tree, startX: tree.x, startY: tree.y, mouseStartX: e.clientX, mouseStartY: e.clientY };
    const handleMove = (moveEvt) => {
      if (!activeTreeDrag) return;
      activeTreeDrag.tree.x = Math.round(activeTreeDrag.startX + (moveEvt.clientX - activeTreeDrag.mouseStartX) / zoom);
      activeTreeDrag.tree.y = Math.round(activeTreeDrag.startY + (moveEvt.clientY - activeTreeDrag.mouseStartY) / zoom);
      renderCanvas();
    };
    const handleUp = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      activeTreeDrag = null;
      saveProject();
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  };

  let touchDragState = null;
  let suppressNextTouchClick = false;
  let touchPanStart = null;
  let pinchStart = null;

  function isCanvasInteractiveTarget(target) {
    if (!target || !target.closest) return false;
    return Boolean(
      target.closest('[id^="node-card-"]') ||
      target.closest('[data-tree-id]') ||
      target.closest('button, input, select, a, textarea')
    );
  }

  window.startTouchDrag = function (e, nodeId, treeId) {
    if (!dragEnabled) return;
    if (e.touches.length !== 1 || e.target.closest('button, input, select, a, textarea')) {
      touchDragState = null;
      return;
    }
    const touch = e.touches[0];
    if (treeId) {
      const tree = project.trees.find((item) => item.id === treeId);
      if (!tree) return;
      touchDragState = { type: 'tree', tree, startX: tree.x, startY: tree.y, startTouchX: touch.clientX, startTouchY: touch.clientY, moved: false };
    } else {
      const match = findNodeInTree(project.trees, nodeId);
      if (!match) return;
      if (!match.parent) {
        window.startTouchDrag(e, null, match.tree.id);
        return;
      }
      touchDragState = {
        type: 'node',
        node: match.node,
        startOffsetX: match.node.offsetX || 0,
        startOffsetY: match.node.offsetY || 0,
        startTouchX: touch.clientX,
        startTouchY: touch.clientY,
        moved: false
      };
    }
    touchPanStart = null;
    isPanning = false;
    e.stopPropagation();
  };

  window.addEventListener('touchmove', (e) => {
    if (!touchDragState) return;
    if (e.touches.length !== 1) {
      touchDragState = null;
      return;
    }
    const touch = e.touches[0];
    const dx = touch.clientX - touchDragState.startTouchX;
    const dy = touch.clientY - touchDragState.startTouchY;
    if (!touchDragState.moved && Math.hypot(dx, dy) < 6) return;
    touchDragState.moved = true;
    suppressNextTouchClick = true;
    e.preventDefault();
    if (touchDragState.type === 'tree') {
      touchDragState.tree.x = Math.round(touchDragState.startX + dx / zoom);
      touchDragState.tree.y = Math.round(touchDragState.startY + dy / zoom);
    } else {
      touchDragState.node.offsetX = Math.round(touchDragState.startOffsetX + dx / zoom);
      touchDragState.node.offsetY = Math.round(touchDragState.startOffsetY + dy / zoom);
    }
    renderCanvas();
  }, { passive: false });

  window.addEventListener('touchend', () => {
    if (!touchDragState) return;
    const moved = touchDragState.moved;
    touchDragState = null;
    if (moved) saveProject();
  });

  window.addEventListener('touchcancel', () => {
    touchDragState = null;
  });

  document.addEventListener('click', (e) => {
    if (!suppressNextTouchClick) return;
    suppressNextTouchClick = false;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  // Tuval kaydırma (pan) — boş alana dokununca; katmanlar inset-0 olduğu için kart/başlık seçicisi kullanılır
  (function setupPanZoom() {
    const container = document.getElementById('canvas-container');
    if (!container) return;

    const getTouchCenter = (touches) => ({
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2
    });
    const getTouchDistance = (touches) => Math.hypot(
      touches[1].clientX - touches[0].clientX,
      touches[1].clientY - touches[0].clientY
    );

    container.addEventListener('mousedown', (e) => {
      if (isCanvasInteractiveTarget(e.target)) return;
      isPanning = true;
      panStartX = e.clientX - panX;
      panStartY = e.clientY - panY;
      container.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
      if (!isPanning) return;
      panX = e.clientX - panStartX;
      panY = e.clientY - panStartY;
      renderCanvas();
    });

    window.addEventListener('mouseup', () => {
      if (!isPanning) return;
      isPanning = false;
      container.style.cursor = 'default';
    });

    container.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.08 : 0.08;
      const prev = zoom;
      zoom = Math.min(2.5, Math.max(0.25, zoom + delta));
      const rect = container.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      panX = mx - ((mx - panX) / prev) * zoom;
      panY = my - ((my - panY) / prev) * zoom;
      renderCanvas();
    }, { passive: false });

    container.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        const center = getTouchCenter(e.touches);
        const rect = container.getBoundingClientRect();
        pinchStart = {
          distance: getTouchDistance(e.touches),
          zoom: zoom,
          canvasX: (center.x - rect.left - panX) / zoom,
          canvasY: (center.y - rect.top - panY) / zoom
        };
        touchPanStart = null;
        isPanning = false;
        e.preventDefault();
        return;
      }

      if (touchDragState) return;

      if (e.touches.length === 1 && !isCanvasInteractiveTarget(e.target)) {
        touchPanStart = {
          x: e.touches[0].clientX - panX,
          y: e.touches[0].clientY - panY
        };
        isPanning = true;
        e.preventDefault();
      }
    }, { passive: false });

    container.addEventListener('touchmove', (e) => {
      if (touchDragState) return;

      if (e.touches.length === 2 && pinchStart) {
        const center = getTouchCenter(e.touches);
        const rect = container.getBoundingClientRect();
        const nextZoom = Math.max(0.25, Math.min(2.5,
          Math.round(pinchStart.zoom * getTouchDistance(e.touches) / pinchStart.distance * 100) / 100));
        zoom = nextZoom;
        panX = Math.round(center.x - rect.left - pinchStart.canvasX * zoom);
        panY = Math.round(center.y - rect.top - pinchStart.canvasY * zoom);
        const zoomText = document.getElementById('zoom-text');
        if (zoomText) zoomText.textContent = Math.round(zoom * 100) + '%';
        renderCanvas();
        e.preventDefault();
        return;
      }

      if (e.touches.length === 1 && touchPanStart) {
        panX = e.touches[0].clientX - touchPanStart.x;
        panY = e.touches[0].clientY - touchPanStart.y;
        renderCanvas();
        e.preventDefault();
      }
    }, { passive: false });

    container.addEventListener('touchend', (e) => {
      if (e.touches.length < 2) pinchStart = null;
      if (e.touches.length === 0) {
        touchPanStart = null;
        isPanning = false;
      }
    }, { passive: false });
  })();

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  // Tema
  (function initTheme() {
    const saved = localStorage.getItem('theme-preference');
    if (saved !== 'light') {
      document.body.classList.add('dark-mode');
      const icon = document.getElementById('theme-icon');
      const text = document.getElementById('theme-text');
      if (icon) icon.textContent = '☀️';
      if (text) text.textContent = 'Açık Mod';
    }
  })();

  try {
    const savedSize = localStorage.getItem(CANVAS_SIZE_KEY);
    if (savedSize) {
      const size = parseInt(savedSize, 10);
      if (!isNaN(size) && size >= 100) {
        canvasWidth = size;
        canvasHeight = size;
      }
    }
  } catch (e) {}

  // SW (index ile aynı)
  const APP_VERSION = (window.PWA_CONFIG && window.PWA_CONFIG.VERSION) ? window.PWA_CONFIG.VERSION : '1';
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./service-worker.js?v=' + APP_VERSION).catch(function (err) {
        console.warn('SW kaydı başarısız:', err);
      });
    });
  }

  listenForFirebaseProject();
  renderCanvas();
})();
