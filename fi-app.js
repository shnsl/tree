(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // FI / Soyağacı — index ile ASLA karışmaz.
  // Proje:     familyTrees/default      (index: projects/default)
  // Son işlem: familyTrees/activityLog  (index: activityLog)
  // Yerel:     family_tree_editor_*
  // Düzen:     yukarıdan aşağıya (top-down)
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
  // Index activityLog ile karışmasın — yalnızca FI soyağacı geçmişi
  const ACTIVITY_LOG_PATH = 'familyTrees/activityLog';
  const CANVAS_SIZE_KEY = 'family_canvas_size_' + window.location.pathname;
  const PROJECT_KIND = 'familyTree';

  const CFG = window.PWA_CONFIG || {};
  const CARD_MAX_FIELDS = (CFG.CARD && typeof CFG.CARD.maxVisibleFields === 'number') ? CFG.CARD.maxVisibleFields : 6;
  const FIELD_HINT_AT = (CFG.CARD && typeof CFG.CARD.fieldHintAt === 'number') ? CFG.CARD.fieldHintAt : 3;
  const FIELD_ROW_H = (CFG.CARD && typeof CFG.CARD.fieldRowHeight === 'number') ? CFG.CARD.fieldRowHeight : 22;
  const RECENT_LIMIT = (typeof CFG.RECENT_ACTIVITIES_LIMIT === 'number') ? CFG.RECENT_ACTIVITIES_LIMIT : 50;

  let project = null;
  let recentActivities = [];
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
      relations: [],
      lastModified: null
    };
  }
  if (!Array.isArray(project.trees)) project.trees = [];
  if (!Array.isArray(project.relations)) project.relations = [];

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
  let relationConnectingSourceId = null;
  let mouseCanvasX = 0;
  let mouseCanvasY = 0;
  let selectedRelColor = '#8b5cf6';

  const RELATION_COLORS = [
    { name: 'Mor', hex: '#8b5cf6' },
    { name: 'Mavi', hex: '#3b82f6' },
    { name: 'Zümrüt', hex: '#10b981' },
    { name: 'Amber', hex: '#f59e0b' },
    { name: 'Gül', hex: '#f43f5e' },
    { name: 'İndigo', hex: '#6366f1' },
    { name: 'Teal', hex: '#14b8a6' },
    { name: 'Turuncu', hex: '#f97316' },
    { name: 'Gri', hex: '#64748b' }
  ];

  const CARD_WIDTH = 220;
  const HORIZONTAL_GAP = 28;
  const VERTICAL_SPACING = 72;
  const SPOUSE_GAP = 48;
  const UNION_STACK_GAP = 56;
  const MARRIAGE_COLOR = '#e11d48';
  const STEP_SPOUSE_COLOR = '#7c3aed'; // üvey / sonraki eşler

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

  function createPerson(partial) {
    return Object.assign({
      id: generateId('node'),
      title: 'Yeni Kişi',
      subtitle: '',
      gender: '',
      icon: 'user',
      color: 'emerald',
      fields: [],
      tags: [],
      children: [],
      spouses: []
    }, partial || {});
  }

  function genderLabel(gender) {
    if (gender === 'female') return 'Kadın';
    if (gender === 'male') return 'Erkek';
    return '';
  }

  function colorForGender(gender) {
    if (gender === 'female') return 'rose';
    if (gender === 'male') return 'blue';
    return null;
  }

  function applyGenderTheme(node) {
    if (!node) return;
    const color = colorForGender(node.gender);
    if (color) node.color = color;
  }

  function genderSelectHtml(nodeId, gender, compact) {
    const g = gender === 'female' || gender === 'male' ? gender : '';
    const cls = compact
      ? 'w-full max-w-full bg-white border border-slate-200 rounded-lg px-1.5 py-1 text-[10px] font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer'
      : 'w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none';
    return '<select class="' + cls + '"' +
      ' data-gender-select="1"' +
      (compact ? ' onclick="event.stopPropagation()" onmousedown="event.stopPropagation()" ontouchstart="event.stopPropagation()"' : '') +
      ' onchange="event.stopPropagation(); window.setNodeGender(\'' + nodeId + '\', this.value)">' +
      '<option value=""' + (g === '' ? ' selected' : '') + '>Cinsiyet</option>' +
      '<option value="female"' + (g === 'female' ? ' selected' : '') + '>♀ Kadın</option>' +
      '<option value="male"' + (g === 'male' ? ' selected' : '') + '>♂ Erkek</option>' +
      '</select>';
  }

  function ensureFamilyShape(node) {
    if (!node) return;
    if (!Array.isArray(node.children)) node.children = [];
    if (!Array.isArray(node.spouses)) node.spouses = [];
    applyGenderTheme(node);
    node.spouses.forEach((u) => {
      if (!u.id) u.id = generateId('union');
      if (!u.person) u.person = createPerson({ title: 'Eş', subtitle: 'Eş', icon: 'heart', color: 'rose' });
      if (!Array.isArray(u.children)) u.children = [];
      ensureFamilyShape(u.person);
      u.children.forEach(ensureFamilyShape);
    });
    node.children.forEach(ensureFamilyShape);
  }

  function migrateProjectFamilyShapes() {
    (project.trees || []).forEach((t) => {
      if (t.rootNode) ensureFamilyShape(t.rootNode);
    });
  }
  migrateProjectFamilyShapes();

  function createUnion(spousePartial) {
    return {
      id: generateId('union'),
      person: createPerson(Object.assign({
        title: 'Eş',
        subtitle: 'Eş',
        icon: 'heart',
        color: 'rose'
      }, spousePartial || {})),
      children: []
    };
  }

  function estimateNodeHeight(node) {
    let h = 78;
    h += 28; // cinsiyet spinner satırı
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
      const walk = (node, parent, ctx) => {
        if (node.id === nodeId) {
          return {
            node,
            parent,
            tree,
            isSpouse: Boolean(ctx && ctx.isSpouse),
            union: (ctx && ctx.union) || null,
            anchor: (ctx && ctx.anchor) || null
          };
        }
        for (const child of (node.children || [])) {
          const found = walk(child, node, null);
          if (found) return found;
        }
        for (const union of (node.spouses || [])) {
          if (union.person) {
            if (union.person.id === nodeId) {
              return { node: union.person, parent: node, tree, isSpouse: true, union, anchor: node };
            }
            const nested = walk(union.person, node, { isSpouse: true, union, anchor: node });
            if (nested) return nested;
          }
          for (const child of (union.children || [])) {
            const found = walk(child, node, { union, anchor: node });
            if (found) return found;
          }
        }
        return null;
      };
      const found = walk(tree.rootNode, null, null);
      if (found) return found;
    }
    return null;
  }

  function collectAllNodeIds(node, set) {
    if (!node) return;
    set.add(node.id);
    (node.children || []).forEach((c) => collectAllNodeIds(c, set));
    (node.spouses || []).forEach((u) => {
      if (u.person) collectAllNodeIds(u.person, set);
      (u.children || []).forEach((c) => collectAllNodeIds(c, set));
    });
  }

  function saveProject() {
    try {
      project.kind = PROJECT_KIND;
      if (!Array.isArray(project.relations)) project.relations = [];
      project.lastModified = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
      if (firebaseDatabase) {
        firebaseDatabase.ref(FIREBASE_PATH).set(project).catch((error) => {
          console.warn('FI Firebase kaydı başarısız:', error);
        });
      }
      updateRelCount();
    } catch (e) {
      console.error(e);
    }
  }

  function updateRelCount() {
    const el = document.getElementById('header-rel-count');
    if (el) el.textContent = String((project.relations || []).length);
  }

  function getAllProjectNodes() {
    const list = [];
    (project.trees || []).forEach((tree) => {
      const scan = (n, tag) => {
        if (!n) return;
        list.push({
          node: n,
          tree,
          treeName: tree.name,
          label: '[' + tree.name + ']' + (tag ? ' ' + tag : '') + ' ' + n.title
        });
        (n.children || []).forEach((c) => scan(c, ''));
        (n.spouses || []).forEach((u) => {
          if (u.person) scan(u.person, '(eş)');
          (u.children || []).forEach((c) => scan(c, '(öz)'));
        });
      };
      if (tree.rootNode) scan(tree.rootNode, '');
    });
    return list;
  }

  function getActivityDate(timestamp) {
    return new Intl.DateTimeFormat('tr-TR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).format(new Date(timestamp));
  }

  // Yalnız familyTrees/activityLog — index activityLog'a ASLA yazılmaz
  function recordActivity(action, entityType, entityId, entityName, details) {
    if (!firebaseDatabase) return;
    const timestamp = new Date().toISOString();
    firebaseDatabase.ref(ACTIVITY_LOG_PATH).push({
      action,
      entityType,
      entityId,
      entityName,
      details: details || '',
      source: 'familyTree',
      timestamp,
      timestampMs: Date.now(),
      timestampDisplay: getActivityDate(timestamp)
    })
      .then(() => firebaseDatabase.ref(ACTIVITY_LOG_PATH).once('value'))
      .then((snap) => {
        const records = snap.val() || {};
        const ids = Object.keys(records).sort((ia, ib) =>
          (records[ib].timestampMs || 0) - (records[ia].timestampMs || 0)
        );
        const excess = ids.slice(RECENT_LIMIT);
        if (excess.length) {
          const updates = {};
          excess.forEach((id) => { updates[id] = null; });
          return firebaseDatabase.ref(ACTIVITY_LOG_PATH).update(updates);
        }
      }).catch((error) => {
        console.warn('FI işlem geçmişi kaydedilemedi:', error);
      });
  }

  function listenForRecentActivities() {
    if (!firebaseDatabase) return;
    firebaseDatabase.ref(ACTIVITY_LOG_PATH).on('value', (snapshot) => {
      const values = snapshot.val() || {};
      recentActivities = Object.entries(values)
        .map(([id, activity]) => ({ id, ...activity }))
        .sort((a, b) => (b.timestampMs || Date.parse(b.timestamp) || 0) - (a.timestampMs || Date.parse(a.timestamp) || 0))
        .slice(0, RECENT_LIMIT);
      renderRecentActivities();
    }, (error) => {
      console.warn('FI işlem geçmişi okunamadı:', error);
    });
  }

  function findActivityEntity(activity) {
    if (activity.entityType === 'relation') {
      return (project.relations || []).find((relation) => relation.id === activity.entityId) || null;
    }
    if (activity.entityType === 'tree') {
      return project.trees.find((tree) => tree.id === activity.entityId) || null;
    }
    if (activity.entityType === 'node') {
      const match = findNodeInTree(project.trees, activity.entityId);
      return match ? match.node : null;
    }
    return null;
  }

  function getActivityActionLabel(action) {
    return { created: 'Eklendi', updated: 'Düzeltildi', deleted: 'Silindi', imported: 'İçe aktarıldı' }[action] || action;
  }

  function renderRecentActivities() {
    const list = document.getElementById('recent-actions-list');
    if (!list) return;
    if (recentActivities.length === 0) {
      list.innerHTML = '<div class="text-center text-slate-400 text-xs py-8">Henüz soyağacı işlem kaydı yok.</div>';
      return;
    }
    list.innerHTML = recentActivities.map((activity) => {
      const entityExists = Boolean(findActivityEntity(activity));
      const canEdit = entityExists && activity.action !== 'deleted' && ['node', 'tree', 'relation'].includes(activity.entityType);
      const canDelete = entityExists && activity.action !== 'deleted' && ['node', 'tree', 'relation'].includes(activity.entityType);
      const actionColor = activity.action === 'deleted' ? 'text-rose-600 bg-rose-50' : activity.action === 'created' ? 'text-emerald-700 bg-emerald-50' : 'text-cyan-700 bg-cyan-50';
      return `
        <div class="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50/70">
          <span class="shrink-0 px-2 py-1 rounded-lg text-[10px] font-bold ${actionColor}">${escapeHtml(getActivityActionLabel(activity.action))}</span>
          <div class="min-w-0 flex-1">
            <div class="text-xs font-bold text-slate-800 truncate">${escapeHtml(activity.entityName || 'İsimsiz')}</div>
            <div class="text-[11px] text-slate-500 truncate">${escapeHtml(activity.details || activity.entityType || '')}</div>
            <div class="text-[10px] text-slate-400 mt-0.5">${escapeHtml(activity.timestampDisplay || getActivityDate(activity.timestamp))}</div>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            ${canEdit ? '<button type="button" onclick="editRecentActivity(\'' + activity.id + '\')" class="p-1.5 rounded-lg text-slate-600 hover:bg-white hover:text-cyan-700" title="Düzenle">✏️</button>' : ''}
            ${canDelete ? '<button type="button" onclick="deleteRecentActivity(\'' + activity.id + '\')" class="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50" title="Sil">🗑️</button>' : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  function listenForFirebaseProject() {
    if (!firebaseDatabase) return;
    firebaseDatabase.ref(FIREBASE_PATH).on('value', (snapshot) => {
      const remote = snapshot.val();
      if (!remote || remote.kind !== PROJECT_KIND) return;
      if (remote.lastModified === project.lastModified) return;
      project = remote;
      if (!Array.isArray(project.trees)) project.trees = [];
      if (!Array.isArray(project.relations)) project.relations = [];
      migrateProjectFamilyShapes();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
      updateRelCount();
      if (viewMode === 'canvas') renderCanvas();
      else renderOutline();
    }, (error) => {
      console.warn('FI Firebase okunamadı:', error);
    });
  }

  // Soyağacı yerleşimi: eşler yatay, çocuklar çift ebeveyne (öz); çoklu eş = üvey grupları
  let marriageLinks = [];
  let parentChildLinks = [];

  function getChildrenRowWidth(children) {
    if (!children || !children.length) return 0;
    let total = 0;
    for (let i = 0; i < children.length; i++) {
      total += getFamilyBlockWidth(children[i]);
      if (i < children.length - 1) total += HORIZONTAL_GAP;
    }
    return total;
  }

  function getFamilyBlockWidth(node) {
    ensureFamilyShape(node);
    if (node.collapsed) return CARD_WIDTH;
    const coupleW = CARD_WIDTH + SPOUSE_GAP + CARD_WIDTH;
    let maxW = CARD_WIDTH;
    (node.spouses || []).forEach((u) => {
      maxW = Math.max(maxW, coupleW, getChildrenRowWidth(u.children || []));
    });
    maxW = Math.max(maxW, getChildrenRowWidth(node.children || []));
    return maxW;
  }

  function getFamilyBlockHeight(node) {
    ensureFamilyShape(node);
    const nodeH = estimateNodeHeight(node);
    if (node.collapsed) return nodeH;
    let bottom = nodeH;
    let cursor = 0;
    (node.spouses || []).forEach((u, ui) => {
      const spouseH = estimateNodeHeight(u.person);
      const coupleTop = ui === 0 ? 0 : cursor + UNION_STACK_GAP;
      const coupleBottom = coupleTop + Math.max(ui === 0 ? nodeH : 0, spouseH);
      let kidsH = 0;
      if ((u.children || []).length) {
        let maxKid = 0;
        (u.children || []).forEach((c) => { maxKid = Math.max(maxKid, getFamilyBlockHeight(c)); });
        kidsH = VERTICAL_SPACING + maxKid;
      }
      cursor = coupleBottom + kidsH;
      bottom = Math.max(bottom, cursor);
    });
    if ((node.children || []).length) {
      let maxKid = 0;
      (node.children || []).forEach((c) => { maxKid = Math.max(maxKid, getFamilyBlockHeight(c)); });
      bottom = Math.max(bottom, nodeH + VERTICAL_SPACING + maxKid);
      if ((node.spouses || []).length) bottom = Math.max(bottom, cursor + VERTICAL_SPACING + maxKid);
    }
    return bottom;
  }

  function computeLayouts() {
    const nodeLayouts = new Map();
    marriageLinks = [];
    parentChildLinks = [];

    function placeFamily(node, depth, startX, startY, parentIds, tree, meta) {
      ensureFamilyShape(node);
      const nodeH = estimateNodeHeight(node);
      const blockW = getFamilyBlockWidth(node);
      const personX = startX + (node.offsetX || 0);
      const personY = startY + (node.offsetY || 0);

      const hasFamilyKids = (node.spouses || []).some((u) => (u.children || []).length > 0) ||
        (node.children || []).length > 0;

      nodeLayouts.set(node.id, {
        id: node.id,
        node,
        treeId: tree.id,
        x: personX,
        y: personY,
        width: CARD_WIDTH,
        height: nodeH,
        depth,
        parentIds: parentIds || [],
        parentId: (parentIds && parentIds[0]) || null,
        hasChildren: hasFamilyKids,
        isCollapsed: Boolean(node.collapsed),
        isSpouse: Boolean(meta && meta.isSpouse),
        unionId: (meta && meta.unionId) || null,
        kinship: (meta && meta.kinship) || null,
        anchorId: (meta && meta.anchorId) || null
      });

      if (node.collapsed) return { right: personX + CARD_WIDTH, bottom: personY + nodeH };

      let maxBottom = personY + nodeH;
      let maxRight = personX + CARD_WIDTH;

      (node.spouses || []).forEach((union, ui) => {
        const spouse = union.person;
        const spouseH = estimateNodeHeight(spouse);
        const isStepSpouse = ui > 0;
        const spouseX = personX + CARD_WIDTH + SPOUSE_GAP + (spouse.offsetX || 0);
        const spouseY = (ui === 0 ? personY : maxBottom + UNION_STACK_GAP) + (spouse.offsetY || 0);

        nodeLayouts.set(spouse.id, {
          id: spouse.id,
          node: spouse,
          treeId: tree.id,
          x: spouseX,
          y: spouseY,
          width: CARD_WIDTH,
          height: spouseH,
          depth,
          parentIds: [],
          parentId: null,
          hasChildren: (union.children || []).length > 0,
          isCollapsed: false,
          isSpouse: true,
          stepSpouse: isStepSpouse,
          unionId: union.id,
          kinship: null,
          anchorId: node.id
        });

        marriageLinks.push({
          a: node.id,
          b: spouse.id,
          unionId: union.id,
          step: isStepSpouse
        });

        const coupleBottom = Math.max(personY + nodeH, spouseY + spouseH);
        const midCoupleX = (personX + CARD_WIDTH / 2 + spouseX + CARD_WIDTH / 2) / 2;
        let kidsBottom = coupleBottom;
        let kidsLeft = midCoupleX;
        let kidsRight = midCoupleX;

        if ((union.children || []).length) {
          const kidsW = getChildrenRowWidth(union.children);
          let kidX = midCoupleX - kidsW / 2;
          const kidY = coupleBottom + VERTICAL_SPACING;
          kidsLeft = kidX;
          (union.children || []).forEach((child) => {
            const cw = getFamilyBlockWidth(child);
            const placed = placeFamily(child, depth + 1, kidX, kidY, [node.id, spouse.id], tree, {
              unionId: union.id,
              kinship: 'oz',
              anchorId: node.id
            });
            parentChildLinks.push({
              parents: [node.id, spouse.id],
              childId: child.id,
              kinship: 'oz',
              unionId: union.id,
              step: isStepSpouse,
              lineColor: isStepSpouse ? STEP_SPOUSE_COLOR : MARRIAGE_COLOR
            });
            kidX += cw + HORIZONTAL_GAP;
            kidsBottom = Math.max(kidsBottom, placed.bottom);
            kidsRight = Math.max(kidsRight, placed.right);
          });
        }

        maxBottom = Math.max(maxBottom, kidsBottom, coupleBottom);
        maxRight = Math.max(maxRight, spouseX + CARD_WIDTH, kidsRight);
      });

      // Eşsiz doğrudan çocuklar (tek ebeveyn / bilinmeyen diğer ebeveyn)
      if ((node.children || []).length) {
        const kidsW = getChildrenRowWidth(node.children);
        let kidX = personX + CARD_WIDTH / 2 - kidsW / 2;
        const kidY = maxBottom + VERTICAL_SPACING;
        (node.children || []).forEach((child) => {
          const cw = getFamilyBlockWidth(child);
          const placed = placeFamily(child, depth + 1, kidX, kidY, [node.id], tree, {
            kinship: 'tek',
            anchorId: node.id
          });
          parentChildLinks.push({
            parents: [node.id],
            childId: child.id,
            kinship: 'tek',
            unionId: null
          });
          kidX += cw + HORIZONTAL_GAP;
          maxBottom = Math.max(maxBottom, placed.bottom);
          maxRight = Math.max(maxRight, placed.right);
        });
      }

      return { right: Math.max(maxRight, startX + blockW), bottom: maxBottom };
    }

    for (const tree of project.trees) {
      if (!tree.rootNode) continue;
      ensureFamilyShape(tree.rootNode);
      placeFamily(tree.rootNode, 0, tree.x, tree.y, null, tree, null);
    }

    return nodeLayouts;
  }

  function isNodeMatch(node) {
    if (!searchQuery) return false;
    const q = searchQuery.toLowerCase();
    if ((node.title || '').toLowerCase().includes(q)) return true;
    if (node.subtitle && node.subtitle.toLowerCase().includes(q)) return true;
    const gLabel = genderLabel(node.gender);
    if (gLabel && gLabel.toLowerCase().includes(q)) return true;
    if (node.gender === 'female' && (q === 'kadin' || q === 'kadın' || q === '♀')) return true;
    if (node.gender === 'male' && (q === 'erkek' || q === '♂')) return true;
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
      if (!node) return;
      if (isNodeMatch(node)) searchMatches.push(node.id);
      (node.children || []).forEach(walk);
      (node.spouses || []).forEach((u) => {
        if (u.person) walk(u.person);
        (u.children || []).forEach(walk);
      });
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

    // Evlilik (eş) bağları — öz eş kırmızı, üvey eş mor çift çizgi
    marriageLinks.forEach((link) => {
      const a = nodeLayouts.get(link.a);
      const b = nodeLayouts.get(link.b);
      if (!a || !b) return;
      const color = link.step ? STEP_SPOUSE_COLOR : MARRIAGE_COLOR;
      const label = link.step ? '♥ üvey eş' : '♥ eş';
      const y1 = a.y + a.height / 2;
      const y2 = b.y + b.height / 2;
      const x1 = a.x + a.width;
      const x2 = b.x;
      // Eşler farklı Y'deyse orta noktadan çift çizgi
      const midY = (y1 + y2) / 2;
      svgPaths += `
        <g>
          <path d="M ${x1} ${y1 - 3} C ${(x1 + x2) / 2} ${y1 - 3}, ${(x1 + x2) / 2} ${y2 - 3}, ${x2} ${y2 - 3}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" />
          <path d="M ${x1} ${y1 + 3} C ${(x1 + x2) / 2} ${y1 + 3}, ${(x1 + x2) / 2} ${y2 + 3}, ${x2} ${y2 + 3}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" />
          <text x="${(x1 + x2) / 2}" y="${midY - 10}" text-anchor="middle" fill="${color}" font-size="10" font-weight="700">${label}</text>
        </g>`;
    });

    // Ebeveyn → çocuk: çizgi rengi o birimin eş çizgisiyle aynı
    parentChildLinks.forEach((link) => {
      const child = nodeLayouts.get(link.childId);
      if (!child) return;
      const endX = child.x + child.width / 2;
      const endY = child.y;
      const parents = (link.parents || []).map((id) => nodeLayouts.get(id)).filter(Boolean);
      if (!parents.length) return;

      const stroke = link.lineColor || (link.kinship === 'oz' ? MARRIAGE_COLOR : '#94a3b8');
      const dash = link.kinship === 'tek' ? '4,3' : '';
      const isCouple = parents.length === 2;

      if (isCouple) {
        const p1 = parents[0];
        const p2 = parents[1];
        const jx = (p1.x + p1.width / 2 + p2.x + p2.width / 2) / 2;
        const jy = Math.max(p1.y + p1.height, p2.y + p2.height) + 16;
        svgPaths += `
          <g>
            <path d="M ${p1.x + p1.width / 2} ${p1.y + p1.height} L ${jx} ${jy}" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round" />
            <path d="M ${p2.x + p2.width / 2} ${p2.y + p2.height} L ${jx} ${jy}" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round" />
            <path d="M ${jx} ${jy} L ${endX} ${endY}" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round" />
            <circle cx="${endX}" cy="${endY}" r="3.5" fill="${stroke}" />
          </g>`;
      } else {
        const p = parents[0];
        const sx = p.x + p.width / 2;
        const sy = p.y + p.height;
        const midY = sy + (endY - sy) / 2;
        svgPaths += `
          <g>
            <path d="M ${sx} ${sy} C ${sx} ${midY}, ${endX} ${midY}, ${endX} ${endY}" fill="none" stroke="${stroke}" stroke-width="2" stroke-dasharray="${dash}" stroke-linecap="round" />
            <circle cx="${endX}" cy="${endY}" r="3" fill="${stroke}" />
          </g>`;
      }
    });

    (project.relations || []).forEach((rel) => {
      const source = nodeLayouts.get(rel.sourceNodeId);
      const target = nodeLayouts.get(rel.targetNodeId);
      if (!source || !target) return;
      const startX = source.x + source.width / 2;
      const startY = source.y + source.height / 2;
      const endX = target.x + target.width / 2;
      const endY = target.y + target.height / 2;
      const dx = Math.abs(endX - startX);
      const dy = Math.abs(endY - startY);
      const curve = Math.max(40, Math.max(dx, dy) * 0.25);
      const pathData = 'M ' + startX + ' ' + startY +
        ' C ' + startX + ' ' + (startY + (endY > startY ? curve : -curve)) + ', ' +
        endX + ' ' + (endY + (endY > startY ? -curve : curve)) + ', ' + endX + ' ' + endY;
      const color = rel.color || '#8b5cf6';
      const dash = rel.style === 'dashed' ? '6,4' : rel.style === 'dotted' ? '2,3' : '';
      const midX = (startX + endX) / 2;
      const midY = (startY + endY) / 2;
      svgPaths += `
        <g class="cursor-pointer">
          <path d="${pathData}" fill="none" stroke="transparent" stroke-width="16" class="pointer-events-auto" onclick="window.openEditRelationModal('${rel.id}')" />
          <path d="${pathData}" fill="none" stroke="${color}" stroke-width="2.5" stroke-dasharray="${dash}" stroke-linecap="round" class="pointer-events-auto" onclick="window.openEditRelationModal('${rel.id}')" />
          <circle cx="${endX}" cy="${endY}" r="4" fill="${color}" />
          <foreignObject x="${midX - 85}" y="${midY - 14}" width="170" height="30" class="overflow-visible pointer-events-auto">
            <div class="flex items-center justify-center">
              <span onclick="window.openEditRelationModal('${rel.id}')" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold shadow-sm border bg-white cursor-pointer" style="border-color:${color};color:${color};">
                🔗 <span class="truncate max-w-[90px]">${escapeHtml(rel.label || 'Bağ')}</span>
                <span class="text-slate-400 hover:text-rose-600" onclick="event.stopPropagation(); window.deleteRelation('${rel.id}')">✕</span>
              </span>
            </div>
          </foreignObject>
        </g>`;
    });

    if (relationConnectingSourceId && nodeLayouts.has(relationConnectingSourceId)) {
      const srcLayout = nodeLayouts.get(relationConnectingSourceId);
      const startX = srcLayout.x + srcLayout.width / 2;
      const startY = srcLayout.y + srcLayout.height;
      const endX = mouseCanvasX || (startX + 40);
      const endY = mouseCanvasY || (startY + 80);
      const midY = startY + (endY - startY) / 2;
      const previewPath = 'M ' + startX + ' ' + startY + ' C ' + startX + ' ' + midY + ', ' + endX + ' ' + midY + ', ' + endX + ' ' + endY;
      svgPaths += '<g><path d="' + previewPath + '" fill="none" stroke="' + selectedRelColor + '" stroke-width="2.5" stroke-dasharray="6,4" stroke-linecap="round" />' +
        '<circle cx="' + endX + '" cy="' + endY + '" r="4" fill="' + selectedRelColor + '" /></g>';
    }

    svg.innerHTML = svgPaths;

    const hasSearch = Boolean(searchQuery);
    const isConnecting = Boolean(relationConnectingSourceId);
    let nodesHtml = '';
    nodeLayouts.forEach((layout) => {
      const node = layout.node;
      const theme = COLOR_PALETTE[node.color || 'emerald'] || COLOR_PALETTE.emerald;
      const isMatch = isNodeMatch(node);
      const isSelected = selectedNodeId === node.id;
      const isConnSource = isConnecting && relationConnectingSourceId === node.id;
      const isConnTargetCandidate = isConnecting && !isConnSource;

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
      if (isConnSource) cardClasses += 'ring-4 ring-violet-500 shadow-xl shadow-violet-500/30 scale-[1.02] z-30 ';
      else if (isConnTargetCandidate) cardClasses += 'ring-2 ring-violet-400 ring-dashed bg-violet-50/40 hover:scale-[1.02] cursor-pointer z-30 ';
      else if (isSelected) cardClasses += 'ring-2 ring-emerald-500 shadow-md ';
      else if (hasSearch) {
        cardClasses += isMatch
          ? 'ring-4 ring-amber-400 border-amber-500 bg-amber-50/70 shadow-xl scale-[1.03] z-30 '
          : 'opacity-40 grayscale-[40%] scale-[0.98] ';
      } else {
        cardClasses += 'hover:shadow-md hover:border-slate-300 ';
      }

      nodesHtml += `
        <div class="${cardClasses}"
          style="left: ${layout.x}px; top: ${layout.y}px; width: ${layout.width}px; border-color: ${isConnSource ? '#8b5cf6' : isMatch ? '#f59e0b' : theme.border};"
          id="node-card-${node.id}"
          ${isConnTargetCandidate ? `onclick="window.handleTargetNodeSelect('${node.id}')"` : ''}>
          <div
            onclick="event.stopPropagation(); ${isConnecting ? `window.handleTargetNodeSelect('${node.id}')` : `window.startRelationConnect('${node.id}')`}"
            class="absolute -bottom-2.5 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-white border-2 border-violet-500 shadow-xs hover:scale-125 hover:bg-violet-600 flex items-center justify-center cursor-pointer z-30"
            title="${isConnecting ? 'Hedef olarak bağla' : 'Çapraz ilişki başlat'}">
            <div class="w-1.5 h-1.5 rounded-full bg-violet-600"></div>
          </div>
          <div
            onmousedown="window.startNodeDrag(event, '${node.id}')"
            ontouchstart="window.startTouchDrag(event, '${node.id}', null)"
            class="px-3 py-2 rounded-t-xl flex items-center justify-between border-b ${dragEnabled ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}"
            style="background-color: ${isConnSource ? '#ede9fe' : isMatch ? '#fef3c7' : theme.headerBg}; border-color: ${theme.border}40;">
            <div class="flex items-center gap-1.5 truncate">
              <span class="text-sm cursor-pointer" onclick="event.stopPropagation(); window.openEditModal('${node.id}')">${getIconEmoji(node.icon)}</span>
              <span class="text-xs font-bold truncate cursor-pointer hover:underline" onclick="event.stopPropagation(); window.openEditModal('${node.id}')" style="color: ${isConnSource ? '#5b21b6' : isMatch ? '#92400e' : theme.headerText};">${escapeHtml(node.title)}</span>
            </div>
            <div class="flex items-center gap-1">
              ${isConnSource ? '<span class="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-violet-600 text-white">🔗 Kaynak</span>' : ''}
              ${layout.isSpouse ? (layout.stepSpouse
                ? '<span class="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-violet-600 text-white">💑 Üvey eş</span>'
                : '<span class="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-rose-500 text-white">💑 Eş</span>') : ''}
              ${layout.kinship === 'oz' ? '<span class="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-emerald-600 text-white" title="Aynı anne-baba birimi">Öz</span>' : ''}
              ${layout.kinship === 'tek' ? '<span class="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-slate-500 text-white" title="Tek ebeveyn kaydı">Tek</span>' : ''}
              ${layout.hasChildren ? `
                <button onclick="event.stopPropagation(); window.toggleNodeCollapse('${node.id}')"
                  class="p-1 rounded hover:bg-black/5 text-slate-600 font-mono text-[10px] font-bold"
                  title="${node.collapsed ? 'Genişlet' : 'Daralt'}">${node.collapsed ? '+' : '−'}</button>
              ` : ''}
            </div>
          </div>
          <div class="p-2.5 cursor-pointer" onclick="${isConnTargetCandidate ? `window.handleTargetNodeSelect('${node.id}')` : `window.openEditModal('${node.id}')`}">
            ${node.subtitle ? '<div class="text-[11px] font-medium text-slate-500 truncate">' + escapeHtml(node.subtitle) + '</div>' : ''}
            <div class="mt-1.5" onclick="event.stopPropagation()">
              ${genderSelectHtml(node.id, node.gender, true)}
            </div>
            ${tagsHtml}
            ${fieldsHtml}
          </div>
          <div class="px-2 py-1.5 bg-slate-50/80 rounded-b-xl border-t border-slate-100 flex flex-wrap items-center gap-1 text-[10px] text-slate-600">
            <button onclick="event.stopPropagation(); window.addSpouseNode('${node.id}')"
              class="px-1.5 py-0.5 rounded bg-white hover:bg-rose-50 text-rose-700 border border-slate-200 font-bold" title="Eş ekle">💑 Eş</button>
            <button onclick="event.stopPropagation(); window.addChildNode('${node.id}')"
              class="px-1.5 py-0.5 rounded bg-white hover:bg-emerald-50 text-emerald-700 border border-slate-200 font-bold" title="Öz çocuk (eş ile)">➕ Çocuk</button>
            <button onclick="event.stopPropagation(); window.addSiblingNode('${node.id}')"
              class="px-1.5 py-0.5 rounded bg-white hover:bg-blue-50 text-blue-700 border border-slate-200 font-bold" title="Öz kardeş (aynı anne-baba)">👥 Öz</button>
            <button onclick="event.stopPropagation(); window.addStepChildNode('${node.id}')"
              class="px-1.5 py-0.5 rounded bg-white hover:bg-amber-50 text-amber-700 border border-slate-200 font-bold" title="Üvey: diğer eşin çocuğu">🔀 Üvey</button>
            <button onclick="event.stopPropagation(); window.startRelationConnect('${node.id}')" class="px-1.5 py-0.5 rounded bg-white hover:bg-violet-50 text-violet-700 border border-slate-200" title="Çapraz ilişki">🔗</button>
            <button onclick="event.stopPropagation(); window.openEditModal('${node.id}')" class="p-1 rounded bg-white hover:bg-slate-200 border border-slate-200">✏️</button>
            <button onclick="event.stopPropagation(); window.deleteNode('${node.id}')" class="p-1 rounded bg-white hover:bg-rose-50 text-rose-600 border border-slate-200">🗑️</button>
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
      ensureFamilyShape(node);
      const theme = COLOR_PALETTE[node.color || 'emerald'] || COLOR_PALETTE.emerald;
      const spousesHtml = (node.spouses || []).map((u) => `
        <div class="ml-3 mt-2 border-l-2 border-rose-300 pl-3">
          <div class="text-[10px] font-bold text-rose-600 mb-1">💑 Eş birimi</div>
          ${u.person ? renderOutlineNode(u.person) : ''}
          <div class="text-[10px] font-bold text-emerald-700 mt-2 mb-1">Öz çocuklar</div>
          ${(u.children || []).map(renderOutlineNode).join('') || '<div class="text-[10px] text-slate-400">—</div>'}
        </div>
      `).join('');
      const childrenHtml = (node.children || []).map(renderOutlineNode).join('');
      return `
        <div class="ml-0 sm:ml-4 mt-2 border-l-2 pl-3" style="border-color: ${theme.border}55;" id="outline-node-${node.id}">
          <div class="bg-white rounded-xl border border-slate-200 p-3 flex items-start justify-between gap-2">
            <div class="min-w-0 cursor-pointer flex-1" onclick="window.openEditModal('${node.id}')">
              <div class="text-sm font-bold text-slate-800">${getIconEmoji(node.icon)} ${escapeHtml(node.title)}</div>
              ${node.subtitle ? '<div class="text-[11px] text-slate-500">' + escapeHtml(node.subtitle) + '</div>' : ''}
              <div class="mt-1.5 max-w-[140px]" onclick="event.stopPropagation()">
                ${genderSelectHtml(node.id, node.gender, true)}
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-1 shrink-0">
              <button onclick="window.addSpouseNode('${node.id}')" class="px-1.5 py-0.5 text-[10px] font-bold bg-rose-50 text-rose-700 rounded-lg border">💑</button>
              <button onclick="window.addChildNode('${node.id}')" class="px-1.5 py-0.5 text-[10px] font-bold bg-emerald-50 text-emerald-700 rounded-lg border">➕</button>
              <button onclick="window.addStepChildNode('${node.id}')" class="px-1.5 py-0.5 text-[10px] font-bold bg-amber-50 text-amber-700 rounded-lg border">🔀</button>
              <button onclick="window.deleteNode('${node.id}')" class="p-1 text-rose-500 hover:bg-rose-50 rounded-lg">🗑️</button>
            </div>
          </div>
          ${spousesHtml}
          ${childrenHtml ? '<div class="text-[10px] font-bold text-slate-500 mt-2">Diğer çocuklar</div>' + childrenHtml : ''}
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
            <button onclick="window.addSpouseNode('${tree.rootNode.id}')" class="px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold">💑 Eş</button>
            <button onclick="window.addChildNode('${tree.rootNode.id}')" class="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold">➕ Çocuk</button>
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
      rootNode: createPerson({
        title: name.trim(),
        subtitle: 'Ata / kök',
        icon: 'users',
        color: 'emerald'
      })
    };
    project.trees.push(newTree);
    saveProject();
    recordActivity('created', 'tree', newTree.id, newTree.name, 'Yeni soyağacı oluşturuldu');
    refreshView();
    window.openEditModal(newTree.rootNode.id);
  };

  window.renameTree = function (treeId) {
    const tree = project.trees.find((t) => t.id === treeId);
    if (!tree) return;
    const newName = prompt('Yeni ad:', tree.name);
    if (newName && newName.trim()) {
      const oldName = tree.name;
      tree.name = newName.trim();
      saveProject();
      recordActivity('updated', 'tree', tree.id, tree.name, 'Ağaç adı: ' + oldName + ' → ' + tree.name);
      refreshView();
    }
  };

  window.deleteTree = function (treeId) {
    const tree = project.trees.find((t) => t.id === treeId);
    if (!tree) return;
    if (!confirm('"' + tree.name + '" soyağacını ve tüm kişileri silmek istediğinize emin misiniz?')) return;
    const nodeIds = new Set();
    collectAllNodeIds(tree.rootNode, nodeIds);
    project.trees = project.trees.filter((t) => t.id !== treeId);
    project.relations = (project.relations || []).filter((r) => !nodeIds.has(r.sourceNodeId) && !nodeIds.has(r.targetNodeId));
    saveProject();
    recordActivity('deleted', 'tree', treeId, tree.name, 'Soyağacı silindi');
    refreshView();
  };

  function resolveAnchor(match) {
    if (!match) return null;
    if (match.isSpouse && match.anchor) return match.anchor;
    return match.node;
  }

  function pickUnionForChild(anchor, preferExisting) {
    ensureFamilyShape(anchor);
    const unions = anchor.spouses || [];
    if (!unions.length) {
      const union = createUnion();
      anchor.spouses.push(union);
      return { union, createdSpouse: true };
    }
    if (unions.length === 1 || preferExisting === true) {
      return { union: unions[0], createdSpouse: false };
    }
    const lines = unions.map((u, i) => (i + 1) + ') ' + ((u.person && u.person.title) || 'Eş') + ' — ' + ((u.children || []).length) + ' çocuk');
    const choice = prompt(
      'Hangi eş birimine öz çocuk eklensin?\n' + lines.join('\n') + '\n\nNumara girin (yeni eş için 0):',
      '1'
    );
    if (choice === null) return null;
    const n = parseInt(choice, 10);
    if (n === 0) {
      const union = createUnion();
      anchor.spouses.push(union);
      return { union, createdSpouse: true };
    }
    if (!n || n < 1 || n > unions.length) {
      alert('Geçersiz seçim.');
      return null;
    }
    return { union: unions[n - 1], createdSpouse: false };
  }

  function pickOtherUnionForStep(anchor, currentUnionId) {
    ensureFamilyShape(anchor);
    let unions = (anchor.spouses || []).filter((u) => u.id !== currentUnionId);
    if (!unions.length) {
      const union = createUnion({ title: 'Diğer eş', subtitle: 'Üvey ebeveyn' });
      anchor.spouses.push(union);
      return { union, createdSpouse: true };
    }
    if (unions.length === 1) return { union: unions[0], createdSpouse: false };
    const lines = unions.map((u, i) => (i + 1) + ') ' + ((u.person && u.person.title) || 'Eş'));
    const choice = prompt('Üvey çocuk hangi eş birimine eklensin?\n' + lines.join('\n') + '\n\nYeni eş: 0', '1');
    if (choice === null) return null;
    const n = parseInt(choice, 10);
    if (n === 0) {
      const union = createUnion({ title: 'Diğer eş', subtitle: 'Üvey ebeveyn' });
      anchor.spouses.push(union);
      return { union, createdSpouse: true };
    }
    if (!n || n < 1 || n > unions.length) {
      alert('Geçersiz seçim.');
      return null;
    }
    return { union: unions[n - 1], createdSpouse: false };
  }

  // 💑 Eş ekle (birden fazla eş desteklenir → üvey çocuklar için zemin)
  window.addSpouseNode = function (personId) {
    const match = findNodeInTree(project.trees, personId);
    if (!match) return;
    const anchor = resolveAnchor(match);
    ensureFamilyShape(anchor);
    const union = createUnion();
    anchor.spouses.push(union);
    anchor.collapsed = false;
    saveProject();
    recordActivity('created', 'node', union.person.id, union.person.title, '"' + anchor.title + '" eş olarak eklendi');
    refreshView();
    window.openEditModal(union.person.id);
  };

  // ➕ Öz çocuk: eş birimine eklenir (eş yoksa önce eş oluşur); iki ebeveyne bağlanır
  window.addChildNode = function (personId) {
    const match = findNodeInTree(project.trees, personId);
    if (!match) return;
    const anchor = resolveAnchor(match);
    let unionInfo;
    if (match.isSpouse && match.union) {
      unionInfo = { union: match.union, createdSpouse: false };
    } else {
      unionInfo = pickUnionForChild(anchor, false);
    }
    if (!unionInfo) return;
    const child = createPerson({ title: 'Yeni Çocuk', subtitle: 'Öz çocuk', color: 'emerald' });
    unionInfo.union.children.push(child);
    anchor.collapsed = false;
    saveProject();
    recordActivity('created', 'node', child.id, child.title, 'Öz çocuk: ' + anchor.title + ' + ' + (unionInfo.union.person.title || 'Eş'));
    refreshView();
    if (unionInfo.createdSpouse) {
      alert('Eş otomatik oluşturuldu. Önce eşi, sonra çocuğu düzenleyebilirsiniz.');
      window.openEditModal(unionInfo.union.person.id);
    } else {
      window.openEditModal(child.id);
    }
  };

  // 👥 Öz kardeş: aynı anne-baba birimine (aynı union) eklenir
  window.addSiblingNode = function (nodeId) {
    const match = findNodeInTree(project.trees, nodeId);
    if (!match) return;

    if (match.isSpouse) {
      alert('Eş kartında öz kardeş eklenmez. Ata kişiye veya çocuğa öz kardeş ekleyin.');
      return;
    }

    // Aynı union içindeki çocuk → öz kardeş
    if (match.union && match.anchor) {
      const sibling = createPerson({ title: 'Öz Kardeş', subtitle: 'Öz kardeş', color: 'blue' });
      const list = match.union.children;
      const idx = list.findIndex((c) => c.id === nodeId);
      if (idx >= 0) list.splice(idx + 1, 0, sibling);
      else list.push(sibling);
      saveProject();
      recordActivity('created', 'node', sibling.id, sibling.title, 'Öz kardeş eklendi (aynı eş birimi)');
      refreshView();
      window.openEditModal(sibling.id);
      return;
    }

    // Doğrudan children dizisinde → kardeş
    if (match.parent) {
      const sibling = createPerson({ title: 'Kardeş', subtitle: 'Kardeş', color: 'blue' });
      const list = match.parent.children;
      const idx = list.findIndex((c) => c.id === nodeId);
      if (idx >= 0) list.splice(idx + 1, 0, sibling);
      else list.push(sibling);
      saveProject();
      recordActivity('created', 'node', sibling.id, sibling.title, 'Kardeş eklendi');
      refreshView();
      window.openEditModal(sibling.id);
      return;
    }

    // Kök: yanına eşsiz kardeş yerine yeni soyağacı
    window.addNewTree();
  };

  // 🔀 Üvey: diğer eş birimine çocuk (aynı ata, farklı eş → üvey kardeşler)
  window.addStepChildNode = function (personId) {
    const match = findNodeInTree(project.trees, personId);
    if (!match) return;

    let anchor = resolveAnchor(match);
    let currentUnionId = null;

    if (match.union && match.anchor && !match.isSpouse) {
      // Bir çocuktan üvey kardeş ekleniyor
      anchor = match.anchor;
      currentUnionId = match.union.id;
    } else if (match.isSpouse && match.union) {
      // Eş kartından: bu eş dışındaki birime veya yeni eşe
      currentUnionId = match.union.id;
    }

    const step = pickOtherUnionForStep(anchor, currentUnionId);
    if (!step) return;
    const child = createPerson({ title: 'Üvey çocuk', subtitle: 'Üvey', color: 'amber', icon: 'user' });
    step.union.children.push(child);
    anchor.collapsed = false;
    saveProject();
    recordActivity('created', 'node', child.id, child.title, 'Üvey çocuk: ' + anchor.title + ' + ' + (step.union.person.title || 'Diğer eş'));
    refreshView();
    if (step.createdSpouse) {
      alert('Üvey için yeni eş oluşturuldu. Eşi düzenleyip çocuğu kaydedin.');
      window.openEditModal(step.union.person.id);
    } else {
      window.openEditModal(child.id);
    }
  };

  window.deleteNode = function (nodeId) {
    const match = findNodeInTree(project.trees, nodeId);
    if (!match) return;

    if (!match.parent && !match.isSpouse) {
      window.deleteTree(match.tree.id);
      return;
    }

    if (!confirm('"' + match.node.title + '" ve bağlı kayıtları silmek istediğinize emin misiniz?')) return;
    const nodeIds = new Set();
    collectAllNodeIds(match.node, nodeIds);

    if (match.isSpouse && match.union && match.anchor) {
      // Eş silinince birim çocukları da gider (veya ata.children'a taşınabilir — burada birim kalkar)
      match.anchor.spouses = (match.anchor.spouses || []).filter((u) => u.id !== match.union.id);
    } else if (match.union && match.anchor) {
      match.union.children = (match.union.children || []).filter((c) => c.id !== nodeId);
    } else if (match.parent) {
      match.parent.children = (match.parent.children || []).filter((c) => c.id !== nodeId);
      // Eş birimi olarak da duruyor olabilir
      (match.parent.spouses || []).forEach((u) => {
        u.children = (u.children || []).filter((c) => c.id !== nodeId);
      });
    }

    project.relations = (project.relations || []).filter((r) => !nodeIds.has(r.sourceNodeId) && !nodeIds.has(r.targetNodeId));
    if (editingNodeId === nodeId) closeModal();
    saveProject();
    recordActivity('deleted', 'node', nodeId, match.node.title, 'Kişi silindi');
    refreshView();
  };

  window.toggleNodeCollapse = function (nodeId) {
    const match = findNodeInTree(project.trees, nodeId);
    if (!match) return;
    match.node.collapsed = !match.node.collapsed;
    saveProject();
    refreshView();
  };

  window.setNodeGender = function (nodeId, gender) {
    const match = findNodeInTree(project.trees, nodeId);
    if (!match) return;
    match.node.gender = (gender === 'female' || gender === 'male') ? gender : '';
    applyGenderTheme(match.node);
    saveProject();
    recordActivity('updated', 'node', match.node.id, match.node.title, 'Cinsiyet güncellendi');
    refreshView();
  };

  window.syncGenderColorInModal = function () {
    const genderEl = document.getElementById('edit-node-gender');
    const colorEl = document.getElementById('edit-node-color');
    if (!genderEl || !colorEl) return;
    const color = colorForGender(genderEl.value);
    if (color) colorEl.value = color;
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
    const genderEl = document.getElementById('edit-node-gender');
    if (genderEl) genderEl.value = (node.gender === 'female' || node.gender === 'male') ? node.gender : '';
    document.getElementById('edit-node-description').value = node.description || '';
    document.getElementById('edit-node-icon').value = node.icon || 'user';
    applyGenderTheme(node);
    document.getElementById('edit-node-color').value = node.color || 'emerald';
    document.getElementById('edit-node-tags').value = (node.tags || []).join(', ');
    const fieldsContainer = document.getElementById('modal-fields-container');
    fieldsContainer.innerHTML = '';
    (node.fields || []).forEach((f) => addModalFieldRow(f.key, f.value));

    const nodeRels = (project.relations || []).filter((r) => r.sourceNodeId === nodeId || r.targetNodeId === nodeId);
    const relBadge = document.getElementById('modal-node-rel-badge');
    const relsListContainer = document.getElementById('modal-node-relations-list');
    if (relBadge) relBadge.textContent = String(nodeRels.length);
    if (relsListContainer) {
      if (nodeRels.length === 0) {
        relsListContainer.innerHTML = '<div class="text-slate-400 py-1.5 text-center bg-slate-50 rounded-lg border border-dashed border-slate-200">Bu kişiye bağlı çapraz ilişki yok.</div>';
      } else {
        relsListContainer.innerHTML = nodeRels.map((r) => {
          const isSrc = r.sourceNodeId === nodeId;
          const otherId = isSrc ? r.targetNodeId : r.sourceNodeId;
          const otherMatch = findNodeInTree(project.trees, otherId);
          const otherTitle = otherMatch ? otherMatch.node.title : 'Bilinmeyen';
          const color = r.color || '#8b5cf6';
          return `
            <div class="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-slate-50 border border-slate-200">
              <div class="flex items-center gap-1.5 truncate">
                <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color:${color};"></span>
                <span class="text-slate-500">${isSrc ? '→' : '←'}</span>
                <span class="font-bold text-slate-800 truncate">${escapeHtml(otherTitle)}</span>
                <span class="text-slate-500">(${escapeHtml(r.label || 'Bağ')})</span>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <button type="button" onclick="window.openEditRelationModal('${r.id}')" class="p-1">✏️</button>
                <button type="button" onclick="window.deleteRelation('${r.id}')" class="p-1 text-rose-600">🗑️</button>
              </div>
            </div>`;
        }).join('');
      }
    }

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
    const genderVal = document.getElementById('edit-node-gender');
    match.node.gender = genderVal && (genderVal.value === 'female' || genderVal.value === 'male') ? genderVal.value : '';
    match.node.description = document.getElementById('edit-node-description').value.trim();
    match.node.icon = document.getElementById('edit-node-icon').value;
    match.node.color = document.getElementById('edit-node-color').value;
    applyGenderTheme(match.node);
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
    recordActivity('updated', 'node', match.node.id, match.node.title, 'Kişi bilgileri güncellendi');
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

  window.centerCanvas = function (zoomValue) {
    zoom = typeof zoomValue === 'number' ? zoomValue : 0.25;
    try {
      const layouts = computeLayouts();
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      layouts.forEach(function (l) {
        minX = Math.min(minX, l.x);
        minY = Math.min(minY, l.y);
        maxX = Math.max(maxX, l.x + l.width);
        maxY = Math.max(maxY, l.y + l.height);
      });
      if (isFinite(minX) && isFinite(maxX)) {
        const cX = (minX + maxX) / 2;
        const cY = (minY + maxY) / 2;
        const rect = document.getElementById('canvas-container').getBoundingClientRect();
        panX = Math.round(rect.width / 2 - cX * zoom);
        panY = Math.round(rect.height / 2 - cY * zoom);
      }
    } catch (e) {}
    const zt = document.getElementById('zoom-text');
    if (zt) zt.textContent = Math.round(zoom * 100) + '%';
    renderCanvas();
  };

  window.reloadAppView = function () {
    if (viewMode === 'canvas') window.centerCanvas(0.25);
    else renderOutline();
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
        recordActivity('imported', 'project', 'project', project.projectName || 'Soyağacı', 'JSON dosyasından yüklendi');
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
    // Kök (eş değil) → tüm ağacı taşı
    if (!match.parent && !match.isSpouse) {
      window.startTreeDrag(e, match.tree.id);
      return;
    }
    e.stopPropagation();
    e.preventDefault();
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
      if (!match.parent && !match.isSpouse) {
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

  // Tuval kaydırma (pan) — window seviyesinde; katmanlar pointer-events:none
  (function setupPanZoom() {
    const container = document.getElementById('canvas-container');
    if (!container) return;

    // Boş alan dokunuşları container'a düşsün; sadece kart/başlık tıklanabilir
    ['nodes-layer', 'tree-headers-layer', 'grid-labels', 'canvas-svg'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.style.pointerEvents = 'none';
    });

    const getTouchCenter = (touches) => ({
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2
    });
    const getTouchDistance = (touches) => Math.hypot(
      touches[1].clientX - touches[0].clientX,
      touches[1].clientY - touches[0].clientY
    );

    function pointInContainer(clientX, clientY) {
      const rect = container.getBoundingClientRect();
      return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    }

    function restoreLayerPointerEvents() {
      const nodesLayer = document.getElementById('nodes-layer');
      const headersLayer = document.getElementById('tree-headers-layer');
      if (nodesLayer) {
        nodesLayer.style.pointerEvents = 'none';
        Array.prototype.forEach.call(nodesLayer.children, function (child) {
          child.style.pointerEvents = 'auto';
        });
      }
      if (headersLayer) {
        headersLayer.style.pointerEvents = 'none';
        Array.prototype.forEach.call(headersLayer.children, function (child) {
          child.style.pointerEvents = 'auto';
        });
      }
      const grid = document.getElementById('grid-labels');
      if (grid) grid.style.pointerEvents = 'none';
      const svg = document.getElementById('canvas-svg');
      if (svg) svg.style.pointerEvents = 'none';
    }

    const _renderCanvas = renderCanvas;
    renderCanvas = function () {
      _renderCanvas();
      restoreLayerPointerEvents();
    };
    restoreLayerPointerEvents();

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

    // capture: true — mobilde tek parmak pan kaçmasın
    window.addEventListener('touchstart', (e) => {
      if (!e.touches.length) return;
      const t0 = e.touches[0];
      if (!pointInContainer(t0.clientX, t0.clientY)) return;

      if (e.touches.length >= 2) {
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
      if (isCanvasInteractiveTarget(e.target)) {
        touchPanStart = null;
        return;
      }

      touchPanStart = {
        x: t0.clientX - panX,
        y: t0.clientY - panY
      };
      isPanning = true;
      e.preventDefault();
    }, { passive: false, capture: true });

    window.addEventListener('touchmove', (e) => {
      if (touchDragState) return;
      if (!touchPanStart && !pinchStart) return;

      if (e.touches.length >= 2 && pinchStart) {
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
    }, { passive: false, capture: true });

    window.addEventListener('touchend', (e) => {
      if (e.touches.length < 2) pinchStart = null;
      if (e.touches.length === 0) {
        touchPanStart = null;
        isPanning = false;
      }
    }, { passive: false, capture: true });

    window.addEventListener('touchcancel', () => {
      pinchStart = null;
      touchPanStart = null;
      isPanning = false;
    }, { capture: true });
  })();

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (relationConnectingSourceId) cancelRelationConnect();
      else if (document.getElementById('relation-modal') && !document.getElementById('relation-modal').classList.contains('hidden')) closeRelationModal();
      else if (document.getElementById('recent-actions-modal') && !document.getElementById('recent-actions-modal').classList.contains('hidden')) closeRecentActionsModal();
      else closeModal();
    }
  });

  // ---- Çapraz ilişkiler + Son işlemler (FI — familyTrees/activityLog) ----
  window.openRecentActionsModal = function () {
    renderRecentActivities();
    document.getElementById('recent-actions-modal').classList.remove('hidden');
  };
  window.closeRecentActionsModal = function () {
    document.getElementById('recent-actions-modal').classList.add('hidden');
  };
  window.editRecentActivity = function (activityId) {
    const activity = recentActivities.find((item) => item.id === activityId);
    if (!activity || activity.action === 'deleted') return;
    closeRecentActionsModal();
    if (activity.entityType === 'node') window.openEditModal(activity.entityId);
    if (activity.entityType === 'tree') window.renameTree(activity.entityId);
    if (activity.entityType === 'relation') window.openEditRelationModal(activity.entityId);
  };
  window.deleteRecentActivity = function (activityId) {
    const activity = recentActivities.find((item) => item.id === activityId);
    if (!activity || activity.action === 'deleted' || !findActivityEntity(activity)) return;
    if (!confirm('"' + activity.entityName + '" kaydını silmek istediğinize emin misiniz?')) return;
    if (activity.entityType === 'node') window.deleteNode(activity.entityId);
    if (activity.entityType === 'tree') window.deleteTree(activity.entityId);
    if (activity.entityType === 'relation') window.deleteRelation(activity.entityId);
  };

  window.startRelationConnect = function (sourceId) {
    const match = findNodeInTree(project.trees, sourceId);
    if (!match) return;
    relationConnectingSourceId = sourceId;
    const banner = document.getElementById('relation-connecting-bar');
    const sourceNameEl = document.getElementById('rel-conn-source-name');
    if (banner && sourceNameEl) {
      sourceNameEl.textContent = match.node.title;
      banner.classList.remove('hidden');
    }
    renderCanvas();
  };
  window.cancelRelationConnect = function () {
    relationConnectingSourceId = null;
    const banner = document.getElementById('relation-connecting-bar');
    if (banner) banner.classList.add('hidden');
    renderCanvas();
  };
  window.handleTargetNodeSelect = function (targetId) {
    if (!relationConnectingSourceId) return;
    if (relationConnectingSourceId === targetId) {
      alert('Bir kişi kendisine bağlanamaz.');
      return;
    }
    const sId = relationConnectingSourceId;
    window.cancelRelationConnect();
    window.openRelationModal(null, sId, targetId);
  };
  window.startRelationFromCurrentModalNode = function () {
    if (!editingNodeId) return;
    const nodeSrcId = editingNodeId;
    closeModal();
    if (viewMode !== 'canvas') setViewMode('canvas');
    window.startRelationConnect(nodeSrcId);
  };

  function renderRelColorPicker() {
    const container = document.getElementById('rel-color-picker-container');
    if (!container) return;
    container.innerHTML = RELATION_COLORS.map((c) => `
      <button type="button" onclick="window.selectRelColor('${c.hex}')"
        class="w-6 h-6 rounded-full border transition-all flex items-center justify-center cursor-pointer ${selectedRelColor.toLowerCase() === c.hex.toLowerCase() ? 'ring-2 ring-violet-500 scale-110' : 'hover:scale-105'}"
        style="background-color:${c.hex};border-color:${c.hex};" title="${c.name}">
        ${selectedRelColor.toLowerCase() === c.hex.toLowerCase() ? '<span class="text-white text-[10px] font-bold">✓</span>' : ''}
      </button>`).join('');
  }

  window.selectRelColor = function (colorHex) {
    selectedRelColor = colorHex;
    renderRelColorPicker();
  };

  window.openRelationModal = function (relationIdToEdit, preSourceId, preTargetId) {
    const allNodes = getAllProjectNodes();
    if (allNodes.length < 2) {
      alert('Çapraz ilişki için en az 2 kişi gerekir.');
      return;
    }
    const sourceSelect = document.getElementById('rel-source-select');
    const targetSelect = document.getElementById('rel-target-select');
    const editIdInput = document.getElementById('rel-edit-id');
    const labelInput = document.getElementById('rel-label-input');
    const styleSelect = document.getElementById('rel-style-select');
    const titleEl = document.getElementById('rel-modal-title');
    const btnDelete = document.getElementById('rel-btn-delete');
    const optsHtml = allNodes.map((item) => '<option value="' + escapeHtml(item.node.id) + '">' + escapeHtml(item.label) + '</option>').join('');
    sourceSelect.innerHTML = optsHtml;
    targetSelect.innerHTML = optsHtml;

    if (relationIdToEdit) {
      const rel = (project.relations || []).find((r) => r.id === relationIdToEdit);
      if (!rel) return;
      editIdInput.value = rel.id;
      titleEl.textContent = 'Çapraz İlişkiyi Düzenle';
      sourceSelect.value = rel.sourceNodeId;
      targetSelect.value = rel.targetNodeId;
      labelInput.value = rel.label || '';
      styleSelect.value = rel.style || 'solid';
      selectedRelColor = rel.color || '#8b5cf6';
      if (btnDelete) btnDelete.classList.remove('hidden');
    } else {
      editIdInput.value = '';
      titleEl.textContent = 'Yeni Çapraz İlişki';
      sourceSelect.value = preSourceId || allNodes[0].node.id;
      if (preTargetId) targetSelect.value = preTargetId;
      else {
        const second = allNodes.find((n) => n.node.id !== sourceSelect.value) || allNodes[1];
        targetSelect.value = second.node.id;
      }
      labelInput.value = '';
      styleSelect.value = 'solid';
      selectedRelColor = '#8b5cf6';
      if (btnDelete) btnDelete.classList.add('hidden');
    }
    renderRelColorPicker();

    const relsList = document.getElementById('rel-modal-list');
    const relsCount = document.getElementById('rel-modal-list-count');
    const relations = project.relations || [];
    if (relsCount) relsCount.textContent = String(relations.length);
    if (relsList) {
      if (!relations.length) {
        relsList.innerHTML = '<div class="text-slate-400 text-center py-3 bg-slate-50 rounded-xl border border-dashed">Henüz çapraz ilişki yok.</div>';
      } else {
        relsList.innerHTML = relations.map((r) => {
          const srcMatch = findNodeInTree(project.trees, r.sourceNodeId);
          const tgtMatch = findNodeInTree(project.trees, r.targetNodeId);
          const color = r.color || '#8b5cf6';
          return `
            <div class="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-50 border border-slate-200">
              <div class="flex items-center gap-2 truncate">
                <span class="w-3 h-3 rounded-full shrink-0" style="background-color:${color};"></span>
                <span class="font-bold truncate">${escapeHtml(srcMatch ? srcMatch.node.title : '?')}</span>
                <span class="text-slate-400">→</span>
                <span class="font-bold truncate">${escapeHtml(tgtMatch ? tgtMatch.node.title : '?')}</span>
                <span class="px-2 py-0.5 rounded-full text-[10px] bg-white border">${escapeHtml(r.label || 'İlişkili')}</span>
              </div>
              <div class="flex gap-1 shrink-0">
                <button type="button" onclick="window.openRelationModal('${r.id}')">✏️</button>
                <button type="button" onclick="window.deleteRelation('${r.id}')" class="text-rose-600">🗑️</button>
              </div>
            </div>`;
        }).join('');
      }
    }
    document.getElementById('relation-modal').classList.remove('hidden');
  };

  window.closeRelationModal = function () {
    document.getElementById('relation-modal').classList.add('hidden');
  };

  window.saveRelationModal = function () {
    const sourceId = document.getElementById('rel-source-select').value;
    const targetId = document.getElementById('rel-target-select').value;
    const label = document.getElementById('rel-label-input').value.trim() || 'İlişkili';
    const style = document.getElementById('rel-style-select').value || 'solid';
    const editId = document.getElementById('rel-edit-id').value;
    if (!sourceId || !targetId) { alert('Kaynak ve hedef seçin.'); return; }
    if (sourceId === targetId) { alert('Kaynak ve hedef aynı olamaz.'); return; }
    const sourceMatch = findNodeInTree(project.trees, sourceId);
    const targetMatch = findNodeInTree(project.trees, targetId);
    if (!sourceMatch || !targetMatch || sourceMatch.tree.id === targetMatch.tree.id) {
      alert('Çapraz ilişki için farklı soyağaçlarından kişiler seçin.');
      return;
    }
    if (!project.relations) project.relations = [];
    let activityAction = 'created';
    let activityRelationId = editId;
    if (editId) {
      const rel = project.relations.find((r) => r.id === editId);
      if (rel) {
        activityAction = 'updated';
        rel.sourceNodeId = sourceId;
        rel.targetNodeId = targetId;
        rel.label = label;
        rel.style = style;
        rel.color = selectedRelColor;
      }
    } else {
      activityRelationId = generateId('rel');
      project.relations.push({
        id: activityRelationId,
        sourceNodeId: sourceId,
        targetNodeId: targetId,
        label,
        style,
        color: selectedRelColor
      });
    }
    saveProject();
    recordActivity(activityAction, 'relation', activityRelationId, sourceMatch.node.title + ' → ' + targetMatch.node.title, 'Çapraz ilişki: ' + label);
    closeRelationModal();
    refreshView();
  };

  window.deleteCurrentEditingRelation = function () {
    const editId = document.getElementById('rel-edit-id').value;
    if (!editId) return;
    window.deleteRelation(editId);
    closeRelationModal();
  };

  window.deleteRelation = function (relId) {
    if (!confirm('Bu çapraz bağlantıyı silmek istediğinize emin misiniz?')) return;
    const relation = (project.relations || []).find((item) => item.id === relId);
    if (!relation) return;
    const source = findNodeInTree(project.trees, relation.sourceNodeId);
    const target = findNodeInTree(project.trees, relation.targetNodeId);
    project.relations = (project.relations || []).filter((r) => r.id !== relId);
    saveProject();
    recordActivity('deleted', 'relation', relId, (source ? source.node.title : '?') + ' → ' + (target ? target.node.title : '?'), 'Çapraz ilişki silindi');
    refreshView();
    const relModal = document.getElementById('relation-modal');
    if (relModal && !relModal.classList.contains('hidden')) window.openRelationModal();
  };

  window.openEditRelationModal = function (relId) {
    window.openRelationModal(relId);
  };

  // İlişki önizleme çizgisi için fare konumu
  (function trackMouseForRelations() {
    const container = document.getElementById('canvas-container');
    if (!container) return;
    container.addEventListener('mousemove', (e) => {
      const rect = container.getBoundingClientRect();
      mouseCanvasX = Math.round((e.clientX - rect.left - panX) / zoom);
      mouseCanvasY = Math.round((e.clientY - rect.top - panY) / zoom);
      if (relationConnectingSourceId) renderCanvas();
    });
  })();

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
  listenForRecentActivities();
  updateRelCount();
  renderCanvas();
})();
