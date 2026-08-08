/* @ds-bundle: {"format":4,"namespace":"NetskopeDesignSystem0529_1b6215","components":[],"sourceHashes":{"slides/builder.js":"8015e36a7e21","slides/deck-stage.js":"0de1efd241e5","slides/image-slot.js":"5ade9426e255","slides/layouts.js":"aa966ccfa71b","slides/pptx-export/ns-pptx-generate.js":"b1b66436a4da"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.NetskopeDesignSystem0529_1b6215 = window.NetskopeDesignSystem0529_1b6215 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// slides/builder.js
try { (() => {
/**
 * Netskope Slide Template — Builder Mode
 *
 * Behavior:
 *   • Click text → cursor lands, type to edit
 *   • Drag any element (5px threshold) → moves it (auto-converts to position:absolute)
 *   • Click a non-text element (shape, logo) → selects it (handles appear)
 *   • Drag any of 8 handles → resizes
 *   • Double-click logo/img → file picker, replace image
 *   • Toolbar formatting: B / I / U / font size / color / move-up/down — apply to
 *     the selected text range, or to the currently selected/focused element
 *   • Esc or click empty area → deselect / blur
 *   • All changes (style, content, replaced images) persist to localStorage
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'ns-builder-state-v2';
  const DRAG_THRESHOLD = 5;
  const UNDO_MAX = 80;
  const UNDO_COALESCE_MS = 800;
  let state = {};
  try {
    state = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch (e) {
    state = {};
  }

  // ── undo stack ────────────────────────────────────────────────────────
  const undoStack = [];
  const redoStack = [];
  let lastSnapAt = 0;
  function snapshot(opts) {
    const now = Date.now();
    // Coalesce rapid edits (e.g. typing) into a single undo step.
    if (!opts || !opts.force) {
      if (now - lastSnapAt < UNDO_COALESCE_MS && undoStack.length) {
        lastSnapAt = now;
        return;
      }
    }
    lastSnapAt = now;
    undoStack.push(JSON.stringify(state));
    if (undoStack.length > UNDO_MAX) undoStack.shift();
    redoStack.length = 0;
  }
  function applyState(json) {
    try {
      state = JSON.parse(json);
    } catch (e) {
      return;
    }
    // Reset each element to its inline template default first (we don't have
    // those snapshots), then re-apply the saved state. Practical compromise:
    // re-apply everything we have, and clear style/content on elements that
    // no longer have an entry in the new state.
    document.querySelectorAll('[data-edit], [contenteditable="true"]').forEach(el => {
      const k = el.dataset && el.dataset.key;
      if (!k) return;
      const s = state[k];
      if (s) {
        if (s.style != null) el.setAttribute('style', s.style);
        if (s.html != null) el.innerHTML = s.html;
        if (s.src && el.tagName === 'IMG') el.src = s.src;
      }
    });
    saveDebounced();
    // Selection / handles may now point at stale geometry — refresh.
    if (selected && !document.contains(selected)) deselect();else if (selected) positionHandles();
  }
  window.builderUndo = () => {
    if (!undoStack.length) return;
    redoStack.push(JSON.stringify(state));
    const prev = undoStack.pop();
    applyState(prev);
  };
  window.builderRedo = () => {
    if (!redoStack.length) return;
    undoStack.push(JSON.stringify(state));
    const next = redoStack.pop();
    applyState(next);
  };

  // ── persistence ────────────────────────────────────────────────────────
  function saveDebounced() {
    clearTimeout(saveDebounced._t);
    saveDebounced._t = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (e) {}
    }, 200);
  }
  function keyFor(el) {
    if (el.dataset && el.dataset.key) return el.dataset.key;
    const section = el.closest('section');
    if (!section) return null;
    const slides = Array.from(document.querySelectorAll('.deck > section'));
    const slideIdx = slides.indexOf(section);
    const all = section.querySelectorAll('[data-edit], [contenteditable="true"]');
    const idx = Array.from(all).indexOf(el);
    const key = 's' + slideIdx + '-' + el.tagName.toLowerCase() + '-' + idx;
    el.dataset.key = key;
    return key;
  }
  function persistStyle(el) {
    const k = keyFor(el);
    if (!k) return;
    snapshot();
    state[k] = state[k] || {};
    state[k].style = el.getAttribute('style') || '';
    saveDebounced();
  }
  function persistContent(el) {
    const k = keyFor(el);
    if (!k) return;
    snapshot();
    state[k] = state[k] || {};
    state[k].html = el.innerHTML;
    saveDebounced();
  }
  function persistSrc(el, src) {
    const k = keyFor(el);
    if (!k) return;
    snapshot({
      force: true
    });
    state[k] = state[k] || {};
    state[k].src = src;
    saveDebounced();
  }
  function restoreAll() {
    document.querySelectorAll('[data-edit], [contenteditable="true"]').forEach(el => {
      const k = keyFor(el);
      if (!k) return;
      const s = state[k];
      if (!s) return;
      if (s.style) el.setAttribute('style', s.style);
      if (s.html != null) el.innerHTML = s.html;
      if (s.src && el.tagName === 'IMG') el.src = s.src;
    });
  }

  // ── selection + handles ───────────────────────────────────────────────
  let selected = null; // primary selection (anchor for handles/resize)
  const selectedSet = new Set(); // ALL currently-selected elements
  let handles = null;
  let lastFocusedText = null;
  let lastRange = null;
  function deselect() {
    selectedSet.forEach(el => el.classList.remove('builder-selected', 'builder-multi'));
    selectedSet.clear();
    if (handles) {
      handles.remove();
      handles = null;
    }
    selected = null;
  }
  function addToSelection(el) {
    if (!el) return;
    selectedSet.add(el);
    el.classList.add('builder-selected');
    if (selectedSet.size > 1) selectedSet.forEach(e => e.classList.add('builder-multi'));
    selected = el; // last added becomes primary (anchor for resize handles)
    rebuildHandles();
    setTimeout(() => {
      try {
        refreshSizeInput();
      } catch (e) {}
    }, 0);
  }
  function removeFromSelection(el) {
    if (!selectedSet.has(el)) return;
    selectedSet.delete(el);
    el.classList.remove('builder-selected', 'builder-multi');
    if (selectedSet.size <= 1) selectedSet.forEach(e => e.classList.remove('builder-multi'));
    if (selected === el) {
      selected = selectedSet.size ? Array.from(selectedSet).pop() : null;
    }
    rebuildHandles();
  }
  function rebuildHandles() {
    if (handles) {
      handles.remove();
      handles = null;
    }
    if (!selected) return;
    const host = document.getElementById('deck') || document.body;
    handles = document.createElement('div');
    handles.className = 'builder-handles';
    host.appendChild(handles);
    const grip = document.createElement('div');
    grip.className = 'builder-grip';
    grip.title = selectedSet.size > 1 ? 'Drag to move ' + selectedSet.size + ' elements' : 'Drag to move';
    grip.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">' + '<circle cx="4" cy="3" r="1.4"/><circle cx="8" cy="3" r="1.4"/><circle cx="12" cy="3" r="1.4"/>' + '<circle cx="4" cy="8" r="1.4"/><circle cx="8" cy="8" r="1.4"/><circle cx="12" cy="8" r="1.4"/>' + '<circle cx="4" cy="13" r="1.4"/><circle cx="8" cy="13" r="1.4"/><circle cx="12" cy="13" r="1.4"/>' + '</svg>';
    handles.appendChild(grip);
    grip.addEventListener('pointerdown', e => startGripDrag(e));
    // Corner/edge resize handles only render for single-selection.
    if (selectedSet.size <= 1) {
      ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].forEach(dir => {
        const h = document.createElement('div');
        h.className = 'builder-handle builder-handle-' + dir;
        h.dataset.dir = dir;
        handles.appendChild(h);
        h.addEventListener('pointerdown', e => startResize(e, dir));
      });
    }
    positionHandles();
  }
  function select(el) {
    if (selected === el && selectedSet.size === 1) {
      positionHandles();
      return;
    }
    deselect();
    addToSelection(el);
  }
  function startGripDrag(e) {
    if (!selected) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX,
      startY = e.clientY;
    // Snapshot every selected element's starting position.
    const targets = Array.from(selectedSet.size ? selectedSet : [selected]);
    const starts = targets.map(el => {
      normalizeAbsolute(el);
      if (el.isContentEditable && document.activeElement === el) el.blur();
      return {
        el,
        left: parseFloat(el.style.left) || 0,
        top: parseFloat(el.style.top) || 0
      };
    });
    document.body.style.userSelect = 'none';
    function move(ev) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      starts.forEach(({
        el,
        left,
        top
      }) => {
        el.style.left = left + dx + 'px';
        el.style.top = top + dy + 'px';
      });
      positionHandles();
    }
    function up() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.userSelect = '';
      snapshot({
        force: true
      });
      starts.forEach(({
        el
      }) => persistStyle(el));
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
  function positionHandles() {
    if (!handles || !selected) return;
    const host = handles.parentElement;
    if (!host) return;
    const r = selected.getBoundingClientRect();
    const hr = host.getBoundingClientRect();
    handles.style.left = r.left - hr.left + 'px';
    handles.style.top = r.top - hr.top + 'px';
    handles.style.width = r.width + 'px';
    handles.style.height = r.height + 'px';
  }
  function normalizeAbsolute(el) {
    const cs = getComputedStyle(el);
    if (cs.position === 'absolute' || cs.position === 'fixed') return;
    const section = el.closest('section');
    if (!section) return;
    const sr = section.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    el.style.position = 'absolute';
    el.style.left = er.left - sr.left + 'px';
    el.style.top = er.top - sr.top + 'px';
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    el.style.margin = '0';
  }

  // ── drag with click-vs-drag threshold ────────────────────────────────
  function startInteract(e, el) {
    if (e.button !== 0) return;
    // If the user is currently editing text inside this element, never drag.
    if (el.isContentEditable && document.activeElement === el && !e.altKey) return;
    const shift = e.shiftKey || e.metaKey || e.ctrlKey;
    const startX = e.clientX,
      startY = e.clientY;
    let dragging = false;
    let starts = [];
    function move(ev) {
      if (!dragging) {
        if (Math.abs(ev.clientX - startX) < DRAG_THRESHOLD && Math.abs(ev.clientY - startY) < DRAG_THRESHOLD) return;
        // Cross threshold — begin drag
        dragging = true;
        // If shift wasn't held and the clicked element wasn't already in the
        // selection, replace the selection with just this one before dragging.
        if (!shift && !selectedSet.has(el)) {
          deselect();
          addToSelection(el);
        } else if (shift && !selectedSet.has(el)) {
          addToSelection(el);
        }
        const group = Array.from(selectedSet.size ? selectedSet : [el]);
        starts = group.map(g => {
          normalizeAbsolute(g);
          if (g.isContentEditable && document.activeElement === g) g.blur();
          return {
            el: g,
            left: parseFloat(g.style.left) || 0,
            top: parseFloat(g.style.top) || 0
          };
        });
        document.body.style.userSelect = 'none';
      }
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      starts.forEach(({
        el: g,
        left,
        top
      }) => {
        g.style.left = left + dx + 'px';
        g.style.top = top + dy + 'px';
      });
      positionHandles();
    }
    function up() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.userSelect = '';
      if (dragging) {
        snapshot({
          force: true
        });
        starts.forEach(({
          el: g
        }) => persistStyle(g));
      } else {
        // Pure click — selection rules:
        //   plain click  → replace selection with this element
        //   shift-click  → toggle this element in/out of selection
        if (shift) {
          if (selectedSet.has(el)) removeFromSelection(el);else addToSelection(el);
        } else {
          select(el);
        }
      }
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  // ── marquee select ───────────────────────────────────────────────────
  function startMarquee(e) {
    if (e.button !== 0) return;
    // Don't fire when clicking on toolbar / nav / existing handles.
    if (e.target.closest && e.target.closest('.builder-toolbar, .deck-nav, .builder-handle, .builder-grip, [data-edit], [contenteditable="true"]')) return;
    const startX = e.clientX,
      startY = e.clientY;
    let box = null;
    function move(ev) {
      if (!box) {
        if (Math.abs(ev.clientX - startX) < DRAG_THRESHOLD && Math.abs(ev.clientY - startY) < DRAG_THRESHOLD) return;
        box = document.createElement('div');
        box.className = 'builder-marquee';
        document.body.appendChild(box);
        if (!(e.shiftKey || e.metaKey || e.ctrlKey)) deselect();
      }
      const left = Math.min(startX, ev.clientX);
      const top = Math.min(startY, ev.clientY);
      const w = Math.abs(ev.clientX - startX);
      const h = Math.abs(ev.clientY - startY);
      box.style.left = left + 'px';
      box.style.top = top + 'px';
      box.style.width = w + 'px';
      box.style.height = h + 'px';
    }
    function up(ev) {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!box) return;
      // Determine hit set: every [data-edit] or [contenteditable=true] whose
      // bounding rect intersects the marquee.
      const mr = box.getBoundingClientRect();
      const all = document.querySelectorAll('[data-edit], [contenteditable="true"]');
      let added = 0;
      all.forEach(node => {
        const r = node.getBoundingClientRect();
        const hit = !(r.right < mr.left || r.left > mr.right || r.bottom < mr.top || r.top > mr.bottom);
        if (hit) {
          addToSelection(node);
          added++;
        }
      });
      box.remove();
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  // ── resize ────────────────────────────────────────────────────────────
  function startResize(e, dir) {
    if (!selected) return;
    e.preventDefault();
    e.stopPropagation();
    const el = selected;
    normalizeAbsolute(el);
    const startX = e.clientX,
      startY = e.clientY;
    const startLeft = parseFloat(el.style.left) || 0;
    const startTop = parseFloat(el.style.top) || 0;
    const startW = el.offsetWidth;
    const startH = el.offsetHeight;
    function move(ev) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      let l = startLeft,
        t = startTop,
        w = startW,
        h = startH;
      if (dir.includes('e')) w = Math.max(12, startW + dx);
      if (dir.includes('s')) h = Math.max(12, startH + dy);
      if (dir.includes('w')) {
        w = Math.max(12, startW - dx);
        l = startLeft + dx;
      }
      if (dir.includes('n')) {
        h = Math.max(12, startH - dy);
        t = startTop + dy;
      }
      el.style.left = l + 'px';
      el.style.top = t + 'px';
      el.style.width = w + 'px';
      el.style.height = h + 'px';
      positionHandles();
    }
    function up() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      persistStyle(el);
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  // ── image replace ────────────────────────────────────────────────────
  function replaceImage(img) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = () => {
          img.src = reader.result;
          persistSrc(img, reader.result);
        };
        reader.readAsDataURL(file);
      }
      input.remove();
    };
    input.click();
  }

  // ── formatting ───────────────────────────────────────────────────────
  // Track the most-recent text selection so toolbar clicks can re-apply it
  // after focus moves to the toolbar.
  function snapshotSelection() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const r = sel.getRangeAt(0);
    // Only snapshot if the selection is inside a contenteditable
    const node = r.commonAncestorContainer;
    const el = node.nodeType === 1 ? node : node.parentElement;
    if (el && el.closest && el.closest('[contenteditable="true"]')) {
      lastRange = r.cloneRange();
      lastFocusedText = el.closest('[contenteditable="true"]');
    }
  }
  function restoreSelection() {
    if (!lastRange) return false;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(lastRange);
    return true;
  }
  function applyToTextOrElement(prop, val) {
    restoreSelection();
    const sel = window.getSelection();
    if (sel && sel.rangeCount && !sel.isCollapsed) {
      // Wrap selection in a span with the inline style
      const range = sel.getRangeAt(0);
      const span = document.createElement('span');
      span.style[prop] = val;
      try {
        const contents = range.extractContents();
        span.appendChild(contents);
        range.insertNode(span);
        // Restore selection over the new span
        const nr = document.createRange();
        nr.selectNodeContents(span);
        sel.removeAllRanges();
        sel.addRange(nr);
        lastRange = nr.cloneRange();
      } catch (e) {/* range crossing element boundary — fall through */}
      const ce = span.closest('[contenteditable="true"]');
      if (ce) persistContent(ce);
      return;
    }
    // No text selection — apply to every element in selectedSet, or focused
    // contenteditable, or the explicit selected element.
    const targets = selectedSet.size ? Array.from(selectedSet) : [lastFocusedText && document.contains(lastFocusedText) ? lastFocusedText : document.activeElement && document.activeElement.isContentEditable ? document.activeElement : selected].filter(Boolean);
    if (!targets.length) return;
    snapshot({
      force: true
    });
    targets.forEach(target => {
      target.style[prop] = val;
      if (target.isContentEditable) persistContent(target);
      persistStyle(target);
    });
  }
  function toggleInlineTag(tagName, fallbackProp, fallbackVal) {
    restoreSelection();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      // No text selection — apply to whole element via inline style
      applyToTextOrElement(fallbackProp, fallbackVal);
      return;
    }
    document.execCommand(tagName);
    const ce = lastFocusedText && document.contains(lastFocusedText) ? lastFocusedText : null;
    if (ce) persistContent(ce);
  }

  // Public API used by toolbar buttons
  window.builderBold = () => toggleInlineTag('bold', 'fontWeight', 'bold');
  window.builderItalic = () => toggleInlineTag('italic', 'fontStyle', 'italic');
  window.builderUnderline = () => toggleInlineTag('underline', 'textDecoration', 'underline');
  // Apply with explicit "commit" semantics — used by the size input on blur/Enter
  // so partial typing ("3" while typing "32") doesn't transiently set 3px.
  window.builderFontSize = px => {
    px = parseFloat(px);
    if (!isFinite(px) || px < 1) return;
    applyToTextOrElement('fontSize', px + 'px');
  };
  // Increment/decrement by N px relative to current target's computed size.
  window.builderFontSizeStep = delta => {
    const targets = selectedSet.size ? Array.from(selectedSet) : [lastFocusedText && document.contains(lastFocusedText) ? lastFocusedText : document.activeElement && document.activeElement.isContentEditable ? document.activeElement : selected].filter(Boolean);
    if (!targets.length) return;
    snapshot({
      force: true
    });
    targets.forEach(t => {
      const cur = parseFloat(getComputedStyle(t).fontSize) || 16;
      const next = Math.max(4, Math.round(cur + delta));
      t.style.fontSize = next + 'px';
      if (t.isContentEditable) persistContent(t);
      persistStyle(t);
    });
    const tb = document.querySelector('.builder-toolbar input[type=number]');
    if (tb && targets[0]) {
      tb.value = parseFloat(getComputedStyle(targets[0]).fontSize) || '';
    }
  };
  // Update the size input to reflect the currently selected element's size.
  function refreshSizeInput() {
    const tb = document.querySelector('.builder-toolbar input[type=number]');
    if (!tb) return;
    const t = lastFocusedText && document.contains(lastFocusedText) ? lastFocusedText : selected;
    if (!t) return;
    const px = parseFloat(getComputedStyle(t).fontSize);
    if (isFinite(px)) tb.value = Math.round(px);
  }
  window.builderColor = hex => applyToTextOrElement('color', hex);
  window.builderAlign = where => {
    // Find a target: explicit selected element wins, else last-focused text element.
    const target = selected && (selected.classList.contains('builder-selected') ? selected : null) || (lastFocusedText && document.contains(lastFocusedText) ? lastFocusedText : null) || (document.activeElement && document.activeElement.isContentEditable ? document.activeElement : null);
    if (!target) return;
    // Apply text-align directly to the element. Works regardless of whether
    // there is a live caret/selection inside it — keeps the API predictable.
    target.style.textAlign = where;
    persistStyle(target);
    // Also try execCommand for finer-grained alignment within a text run
    // (e.g. one paragraph among several in the same contenteditable).
    if (target.isContentEditable) {
      try {
        target.focus();
        if (lastRange && document.contains(lastRange.startContainer)) {
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(lastRange);
        }
        const cmd = 'justify' + where[0].toUpperCase() + where.slice(1);
        document.execCommand(cmd);
        persistContent(target);
      } catch (e) {}
    }
  };
  window.builderNudge = (dx, dy) => {
    const group = Array.from(selectedSet.size ? selectedSet : selected ? [selected] : []);
    if (!group.length) return;
    group.forEach(el => {
      normalizeAbsolute(el);
      el.style.left = (parseFloat(el.style.left) || 0) + dx + 'px';
      el.style.top = (parseFloat(el.style.top) || 0) + dy + 'px';
      persistStyle(el);
    });
    positionHandles();
  };
  window.builderDelete = () => {
    const group = Array.from(selectedSet.size ? selectedSet : selected ? [selected] : []);
    if (!group.length) return;
    const msg = group.length > 1 ? 'Delete ' + group.length + ' elements?' : 'Delete this element?';
    if (!confirm(msg)) return;
    snapshot({
      force: true
    });
    group.forEach(el => {
      const k = keyFor(el);
      el.remove();
      if (k) delete state[k];
    });
    saveDebounced();
    deselect();
  };

  // Insert a new text box on the currently visible slide. preset: 'title' | 'body'
  window.builderInsertText = preset => {
    preset = preset || 'body';
    const slides = Array.from(document.querySelectorAll('.deck > section'));
    if (!slides.length) return;
    // Find the slide closest to viewport center
    const mid = window.scrollY + window.innerHeight / 2;
    let target = slides[0],
      bestDist = Infinity;
    slides.forEach(s => {
      const c = s.offsetTop + s.offsetHeight / 2;
      const d = Math.abs(c - mid);
      if (d < bestDist) {
        bestDist = d;
        target = s;
      }
    });
    snapshot({
      force: true
    });
    const el = document.createElement('div');
    el.setAttribute('contenteditable', 'true');
    el.setAttribute('data-edit', '');
    el.dataset.key = 'inserted-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
    // Default coords: roughly center-left of slide
    const sr = target.getBoundingClientRect();
    const baseLeft = 200,
      baseTop = 300;
    const presets = {
      title: 'font-size:64px; font-weight:700; line-height:1.05; letter-spacing:-0.01em; min-width:600px;',
      body: 'font-size:28px; font-weight:400; line-height:1.4; min-width:400px;'
    };
    el.setAttribute('style', 'position:absolute; left:' + baseLeft + 'px; top:' + baseTop + 'px; color:inherit; ' + (presets[preset] || presets.body));
    el.textContent = preset === 'title' ? 'New title' : 'New text';
    target.appendChild(el);
    // Persist and select
    persistStyle(el);
    persistContent(el);
    // Scroll the new element into view if it's off-screen, then select+focus
    requestAnimationFrame(() => {
      select(el);
      el.focus();
      // Highlight all so the user can immediately overwrite
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
      lastRange = range.cloneRange();
      lastFocusedText = el;
    });
  };

  // Clear (empty) the focused or selected text element's content.
  window.builderClearText = () => {
    const target = lastFocusedText && document.contains(lastFocusedText) ? lastFocusedText : document.activeElement && document.activeElement.isContentEditable ? document.activeElement : selected && selected.isContentEditable ? selected : null;
    if (!target) return;
    snapshot({
      force: true
    });
    target.innerHTML = '';
    persistContent(target);
    target.focus();
  };
  window.builderReset = () => {
    if (!confirm('Reset all template edits? This cannot be undone.')) return;
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  };

  // ── content edit tracking ────────────────────────────────────────────
  function trackContent() {
    document.addEventListener('input', e => {
      const el = e.target;
      if (el && el.getAttribute && el.getAttribute('contenteditable') === 'true') {
        persistContent(el);
      }
    });
    document.addEventListener('focusin', e => {
      const el = e.target;
      if (el && el.getAttribute && el.getAttribute('contenteditable') === 'true') {
        lastFocusedText = el;
      }
    });
    // Track selection changes inside contenteditable so toolbar can re-apply
    document.addEventListener('selectionchange', snapshotSelection);
  }

  // ── global wiring ────────────────────────────────────────────────────
  function wire() {
    document.addEventListener('pointerdown', e => {
      if (e.target.closest && e.target.closest('.builder-handle, .builder-grip')) return;
      // Don't deselect when the user clicks into the toolbar (button, input, etc.)
      if (e.target.closest && e.target.closest('.builder-toolbar, .deck-nav')) return;
      const edit = e.target.closest && e.target.closest('[data-edit]');
      const ce = e.target.closest && e.target.closest('[contenteditable="true"]');
      const target = edit || ce;
      if (target) {
        startInteract(e, target);
      } else if (!e.target.closest('.builder-handles')) {
        // Empty area — start a marquee selection.
        startMarquee(e);
      }
    });
    document.addEventListener('dblclick', e => {
      const img = e.target.closest && e.target.closest('img');
      if (img) {
        // Only replace if the image is inside a data-edit element
        const inEdit = img.closest('[data-edit]');
        if (inEdit) {
          e.preventDefault();
          replaceImage(img);
          return;
        }
      }
      const txt = e.target.closest && e.target.closest('[contenteditable="true"]');
      if (txt) txt.focus();
    });
    document.addEventListener('keydown', e => {
      // Undo / Redo — global, work whether or not text is focused
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) window.builderRedo();else window.builderUndo();
        return;
      }
      if (mod && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        window.builderRedo();
        return;
      }
      if (e.key === 'Escape') {
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        deselect();
      }
      if (!selected) return;
      // Arrow-key nudging when an element is selected but not editing text
      if (document.activeElement && document.activeElement.isContentEditable) return;
      const step = e.shiftKey ? 10 : 1;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        window.builderNudge(-step, 0);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        window.builderNudge(step, 0);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        window.builderNudge(0, -step);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        window.builderNudge(0, step);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        // Only delete via Backspace if not editing text
        if (e.key === 'Backspace' && document.activeElement && document.activeElement.isContentEditable) return;
        e.preventDefault();
        window.builderDelete();
      }
    });
    window.addEventListener('resize', positionHandles);
    window.addEventListener('scroll', positionHandles, true);
    trackContent();
  }
  function boot() {
    restoreAll();
    wire();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "slides/builder.js", error: String((e && e.message) || e) }); }

// slides/deck-stage.js
try { (() => {
/* BEGIN USAGE */
/**
 * <deck-stage> — reusable web component for HTML decks.
 *
 * Handles:
 *  (a) speaker notes — reads <script type="application/json" id="speaker-notes">
 *      and posts {slideIndexChanged: N} to the parent window on nav.
 *  (b) keyboard navigation — ←/→, PgUp/PgDn, Space, Home/End, number keys.
 *      On touch devices, tapping the left/right half of the stage goes
 *      prev/next — taps on links, buttons and other interactive slide
 *      content are left alone.
 *  (c) press R to reset to slide 0 (with a tasteful keyboard hint).
 *  (d) bottom-center overlay showing slide count + hints, fades out on idle.
 *  (e) auto-scaling — inner canvas is a fixed design size (default 1920×1080)
 *      scaled with `transform: scale()` to fit the viewport, letterboxed.
 *      Set the `noscale` attribute to render at authored size (1:1) — the
 *      PPTX exporter sets this so its DOM capture sees unscaled geometry.
 *  (f) print — `@media print` lays every slide out as its own page at the
 *      design size, so the browser's Print → Save as PDF produces a clean
 *      one-page-per-slide PDF with no extra setup.
 *  (g) thumbnail rail — resizable left-hand column of per-slide thumbnails
 *      (static clones). Click to navigate; ↑/↓ with a thumbnail focused to
 *      step between slides; drag to reorder; right-click for
 *      Skip / Move up / Move down / Delete (opens a Cancel/Delete confirm
 *      dialog). Drag the rail's right edge to resize; width persists to
 *      localStorage. Skipped slides carry `data-deck-skip`, are dimmed in
 *      the rail, omitted from prev/next navigation, and hidden at print.
 *      The rail is suppressed in presenting mode, in the host's Preview
 *      mode (ViewerMode='none'), on `noscale`, on narrow viewports
 *      (≤640px), and via the `no-rail` attribute. Rail mutations dispatch
 *      a `deckchange`
 *      CustomEvent on the element: detail = {action, from, to, slide}.
 *
 * Slides are HIDDEN, not unmounted. Non-active slides stay in the DOM with
 * `visibility: hidden` + `opacity: 0`, so their state (videos, iframes,
 * form inputs, React trees) is preserved across navigation.
 *
 * Lifecycle event — the component dispatches a `slidechange` CustomEvent on
 * itself whenever the active slide changes (including the initial mount).
 * The event bubbles and composes out of shadow DOM, so you can listen on
 * the <deck-stage> element or on document:
 *
 *   document.querySelector('deck-stage').addEventListener('slidechange', (e) => {
 *     e.detail.index         // new 0-based index
 *     e.detail.previousIndex // previous index, or -1 on init
 *     e.detail.total         // total slide count
 *     e.detail.slide         // the new active slide element
 *     e.detail.previousSlide // the prior slide element, or null on init
 *     e.detail.reason        // 'init' | 'keyboard' | 'click' | 'tap' | 'api'
 *   });
 *
 * Persistence: none at the deck level. The host app keeps the current slide
 * in its own URL (?slide=) and re-delivers it via location.hash on load, so a
 * bare load with no hash always starts at slide 1.
 *
 * Usage:
 *   <style>deck-stage:not(:defined){visibility:hidden}</style>
 *   <deck-stage width="1920" height="1080">
 *     <section data-label="Title">...</section>
 *     <section data-label="Agenda">...</section>
 *   </deck-stage>
 *   <script src="deck-stage.js"></script>
 *
 * The :not(:defined) rule prevents a flash of the first slide at its
 * authored styles before this script runs and attaches the shadow root.
 *
 * Slides are the direct element children of <deck-stage>. Each slide is
 * automatically tagged with:
 *   - data-screen-label="NN Label"   (1-indexed, for comment flow)
 *   - data-om-validate="no_overflowing_text,no_overlapping_text,slide_sized_text"
 *
 * Speaker notes stay in sync because the component posts {slideIndexChanged: N}
 * to the parent — just include the #speaker-notes script tag if asked for notes.
 *
 * Authoring guidance:
 *   - Write slide bodies as static HTML inside <deck-stage>, with sizing via
 *     CSS custom properties in a <style> block rather than JS constants.
 *     Static slide markup is what lets the user click a heading in edit mode
 *     and retype it directly; a slide rendered through <script type="text/babel">,
 *     React, or a loop over a JS array has to round-trip every tweak through a
 *     chat message instead. Reach for script-generated slides only when the
 *     content genuinely needs interactive behaviour static HTML can't express.
 *   - Do NOT set position/inset/width/height on the slide <section> elements —
 *     the component absolutely positions every slotted child for you.
 */
/* END USAGE */

(() => {
  const DESIGN_W_DEFAULT = 1920;
  const DESIGN_H_DEFAULT = 1080;
  const OVERLAY_HIDE_MS = 1800;
  const VALIDATE_ATTR = 'no_overflowing_text,no_overlapping_text,slide_sized_text';
  const FINE_POINTER_MQ = matchMedia('(hover: hover) and (pointer: fine)');
  const NARROW_MQ = matchMedia('(max-width: 640px)');
  // Slide-authored controls that should keep a tap instead of it navigating.
  const INTERACTIVE_SEL = 'a[href], button, input, select, textarea, summary, label, video[controls], audio[controls], [role="button"], [onclick], [tabindex]:not([tabindex^="-"]), [contenteditable]:not([contenteditable="false" i])';
  const pad2 = n => String(n).padStart(2, '0');

  // Label precedence: data-label → data-screen-label (number stripped) → first heading → "Slide".
  const getSlideLabel = el => {
    const explicit = el.getAttribute('data-label');
    if (explicit) return explicit;
    const existing = el.getAttribute('data-screen-label');
    if (existing) return existing.replace(/^\s*\d+\s*/, '').trim() || existing;
    const h = el.querySelector('h1, h2, h3, [data-title]');
    const t = h && (h.textContent || '').trim().slice(0, 40);
    if (t) return t;
    return 'Slide';
  };
  const stylesheet = `
    :host {
      position: fixed;
      inset: 0;
      display: block;
      background: #000;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif;
      overflow: hidden;
      -webkit-tap-highlight-color: transparent;
    }
    /* connectedCallback holds this until document.fonts.ready (capped 2s) so
     * the first visible paint has the deck's real typography + final rail
     * layout. opacity (not visibility) so the active slide can't un-hide
     * itself via the ::slotted([data-deck-active]) visibility:visible rule.
     * Only the stage/rail hide — the black :host background stays, so the
     * iframe doesn't flash the page's default white. */
    :host([data-fonts-pending]) .stage,
    :host([data-fonts-pending]) .rail { opacity: 0; pointer-events: none; }

    .stage {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .canvas {
      position: relative;
      transform-origin: center center;
      flex-shrink: 0;
      background: #fff;
      will-change: transform;
    }

    /* Slides live in light DOM (via <slot>) so authored CSS still applies.
       We absolutely position each slotted child to stack them. */
    ::slotted(*) {
      position: absolute !important;
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      box-sizing: border-box !important;
      overflow: hidden;
      opacity: 0;
      pointer-events: none;
      visibility: hidden;
    }
    ::slotted([data-deck-active]) {
      opacity: 1;
      pointer-events: auto;
      visibility: visible;
    }

    .overlay {
      position: fixed;
      left: 50%;
      bottom: 22px;
      transform: translate(-50%, 6px) scale(0.92);
      filter: blur(6px);
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px;
      background: #000;
      color: #fff;
      border-radius: 999px;
      font-size: 12px;
      font-feature-settings: "tnum" 1;
      letter-spacing: 0.01em;
      opacity: 0;
      pointer-events: none;
      transition: opacity 260ms ease, transform 260ms cubic-bezier(.2,.8,.2,1), filter 260ms ease;
      transform-origin: center bottom;
      z-index: 2147483000;
      user-select: none;
    }
    .overlay[data-visible] {
      opacity: 1;
      pointer-events: auto;
      transform: translate(-50%, 0) scale(1);
      filter: blur(0);
    }

    .btn {
      appearance: none;
      -webkit-appearance: none;
      background: transparent;
      border: 0;
      margin: 0;
      padding: 0;
      color: inherit;
      font: inherit;
      cursor: default;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 28px;
      min-width: 28px;
      border-radius: 999px;
      color: rgba(255,255,255,0.72);
      transition: background 140ms ease, color 140ms ease;
      -webkit-tap-highlight-color: transparent;
    }
    .btn:hover { background: rgba(255,255,255,0.12); color: #fff; }
    .btn:active { background: rgba(255,255,255,0.18); }
    .btn:focus { outline: none; }
    .btn:focus-visible { outline: none; }
    .btn::-moz-focus-inner { border: 0; }
    .btn svg { width: 14px; height: 14px; display: block; }
    .btn.reset {
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.02em;
      padding: 0 10px 0 12px;
      gap: 6px;
      color: rgba(255,255,255,0.72);
    }
    .btn.reset .kbd {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 16px;
      height: 16px;
      padding: 0 4px;
      font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
      font-size: 10px;
      line-height: 1;
      color: rgba(255,255,255,0.88);
      background: rgba(255,255,255,0.12);
      border-radius: 4px;
    }

    .count {
      font-variant-numeric: tabular-nums;
      color: #fff;
      font-weight: 500;
      padding: 0 8px;
      min-width: 42px;
      text-align: center;
      font-size: 12px;
    }
    .count .sep { color: rgba(255,255,255,0.45); margin: 0 3px; font-weight: 400; }
    .count .total { color: rgba(255,255,255,0.55); }

    .divider {
      width: 1px;
      height: 14px;
      background: rgba(255,255,255,0.18);
      margin: 0 2px;
    }

    /* ── Thumbnail rail ──────────────────────────────────────────────────
       Fixed column on the left; each thumbnail is a static deep-clone of
       the light-DOM slide scaled into a 16:9 (or design-aspect) frame. The
       stage re-fits around it (see _fit); hidden during present / noscale
       / print so capture geometry and fullscreen output are unchanged. */
    .rail {
      position: fixed;
      left: 0;
      top: 0;
      bottom: 0;
      width: var(--deck-rail-w, 188px);
      background: #141414;
      border-right: 1px solid rgba(255,255,255,0.08);
      overflow-y: auto;
      overflow-x: hidden;
      padding: 12px 10px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 12px;
      z-index: 2147482500;
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,0.18) transparent;
    }
    .rail::-webkit-scrollbar { width: 8px; }
    .rail::-webkit-scrollbar-track { background: transparent; margin: 2px; }
    .rail::-webkit-scrollbar-thumb {
      background: rgba(255,255,255,0.18);
      border-radius: 4px;
      border: 2px solid transparent;
      background-clip: content-box;
    }
    .rail::-webkit-scrollbar-thumb:hover {
      background: rgba(255,255,255,0.28);
      border: 2px solid transparent;
      background-clip: content-box;
    }
    :host([no-rail]) .rail,
    :host([noscale]) .rail { display: none; }
    .rail[data-presenting] { display: none; }
    @media (max-width: 640px) {
      .rail, .rail-resize { display: none; }
    }
    /* User-driven show/hide (the TweaksPanel toggle) slides instead of
       popping. Transitions are gated on :host([data-rail-anim]) — set only
       for the 200ms around the toggle — so window-resize and rail-width
       drag (which also call _fit) don't lag behind the cursor. */
    .rail[data-user-hidden] { transform: translateX(-100%); }
    :host([data-rail-anim]) .rail { transition: transform 200ms cubic-bezier(.3,.7,.4,1); }
    :host([data-rail-anim]) .stage { transition: left 200ms cubic-bezier(.3,.7,.4,1); }
    :host([data-rail-anim]) .canvas { transition: transform 200ms cubic-bezier(.3,.7,.4,1); }
    /* transition shorthand replaces rather than merges — repeat the base
       .overlay opacity/transform/filter transitions so visibility changes
       during the 200ms toggle window still fade instead of popping. */
    :host([data-rail-anim]) .overlay {
      transition: margin-left 200ms cubic-bezier(.3,.7,.4,1),
                  opacity 260ms ease,
                  transform 260ms cubic-bezier(.2,.8,.2,1),
                  filter 260ms ease;
    }

    .thumb {
      position: relative;
      display: flex;
      align-items: flex-start;
      gap: 8px;
      cursor: pointer;
      user-select: none;
    }
    .thumb .num {
      width: 16px;
      flex-shrink: 0;
      font-size: 11px;
      font-weight: 500;
      text-align: right;
      color: rgba(255,255,255,0.55);
      padding-top: 2px;
      font-variant-numeric: tabular-nums;
    }
    .thumb .frame {
      position: relative;
      flex: 1;
      min-width: 0;
      aspect-ratio: var(--deck-aspect);
      background: #fff;
      border-radius: 4px;
      outline: 2px solid transparent;
      outline-offset: 0;
      overflow: hidden;
      transition: outline-color 120ms ease;
    }
    .thumb:hover .frame { outline-color: rgba(255,255,255,0.25); }
    .thumb { outline: none; }
    .thumb:focus-visible .frame { outline-color: rgba(255,255,255,0.5); }
    .thumb[data-current] .num { color: #fff; }
    .thumb[data-current] .frame { outline-color: #D97757; }
    .thumb[data-dragging] { opacity: 0.35; }
    .thumb::before {
      content: '';
      position: absolute;
      left: 24px;
      right: 0;
      height: 3px;
      border-radius: 2px;
      background: #D97757;
      opacity: 0;
      pointer-events: none;
    }
    .thumb[data-drop="before"]::before { top: -8px; opacity: 1; }
    .thumb[data-drop="after"]::before { bottom: -8px; opacity: 1; }
    .thumb[data-skip] .frame { opacity: 0.35; }
    .thumb[data-skip] .frame::after {
      content: 'Skipped';
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0,0,0,0.45);
      color: #fff;
      font-size: 10px;
      font-weight: 500;
      letter-spacing: 0.04em;
    }

    .ctxmenu {
      position: fixed;
      min-width: 150px;
      padding: 4px;
      background: #242424;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 7px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.45);
      z-index: 2147483100;
      display: none;
      font-size: 12px;
    }
    .ctxmenu[data-open] { display: block; }
    .ctxmenu button {
      display: block;
      width: 100%;
      appearance: none;
      border: 0;
      background: transparent;
      color: #e8e8e8;
      font: inherit;
      text-align: left;
      padding: 6px 10px;
      border-radius: 4px;
      cursor: pointer;
    }
    .ctxmenu button:hover:not(:disabled) { background: rgba(255,255,255,0.08); }
    .ctxmenu button:disabled { opacity: 0.35; cursor: default; }
    .ctxmenu hr {
      border: 0;
      border-top: 1px solid rgba(255,255,255,0.1);
      margin: 4px 2px;
    }

    .rail-resize {
      position: fixed;
      left: calc(var(--deck-rail-w, 188px) - 3px);
      top: 0;
      bottom: 0;
      width: 6px;
      cursor: col-resize;
      z-index: 2147482600;
      touch-action: none;
    }
    .rail-resize:hover,
    .rail-resize[data-dragging] { background: rgba(255,255,255,0.12); }
    :host([no-rail]) .rail-resize,
    :host([noscale]) .rail-resize,
    .rail[data-presenting] + .rail-resize,
    .rail[data-user-hidden] + .rail-resize { display: none; }

    /* Delete-confirm popup — matches the SPA's ConfirmDialog layout
       (title + message body, depressed footer with Cancel / Delete). */
    .confirm-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.45);
      z-index: 2147483200;
      display: none;
      align-items: center;
      justify-content: center;
    }
    .confirm-backdrop[data-open] { display: flex; }
    .confirm {
      width: 320px;
      max-width: calc(100vw - 32px);
      background: #2a2a2a;
      color: #e8e8e8;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 12px;
      box-shadow: 0 12px 32px rgba(0,0,0,0.5);
      overflow: hidden;
      font-family: inherit;
      animation: deck-confirm-in 0.18s ease;
    }
    @keyframes deck-confirm-in {
      from { opacity: 0; transform: scale(0.96); }
      to { opacity: 1; transform: scale(1); }
    }
    .confirm .body { padding: 20px 20px 16px; }
    .confirm .title { font-size: 14px; font-weight: 600; margin-bottom: 4px; }
    .confirm .msg { font-size: 13px; line-height: 1.5; color: rgba(255,255,255,0.65); }
    .confirm .footer {
      padding: 14px 20px;
      background: #1f1f1f;
      border-top: 1px solid rgba(255,255,255,0.08);
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
    .confirm button {
      appearance: none;
      font: inherit;
      font-size: 13px;
      font-weight: 500;
      padding: 8px 16px;
      border-radius: 8px;
      cursor: pointer;
    }
    .confirm .cancel {
      background: transparent;
      border: 0;
      color: rgba(255,255,255,0.8);
    }
    .confirm .cancel:hover { background: rgba(255,255,255,0.08); }
    .confirm .danger {
      background: #c96442;
      border: 1px solid rgba(0,0,0,0.15);
      color: #fff;
      box-shadow: 0 1px 3px rgba(166,50,68,0.3), 0 2px 6px rgba(166,50,68,0.18);
    }
    .confirm .danger:hover { background: #b5563a; }

    /* ── Print: one page per slide, no chrome ────────────────────────────
       The screen layout stacks every slide at inset:0 inside a scaled
       canvas; for print we want them in document flow at the authored
       design size so the browser paginates one slide per sheet. The
       @page size is set from the width/height attributes via the inline
       <style id="deck-stage-print-page"> that connectedCallback injects
       into <head> (the @page at-rule has no effect inside shadow DOM). */
    @media print {
      :host {
        position: static;
        inset: auto;
        background: none;
        overflow: visible;
        color: inherit;
      }
      .stage { position: static; display: block; }
      .canvas {
        transform: none !important;
        width: auto !important;
        height: auto !important;
        background: none;
        will-change: auto;
      }
      ::slotted(*) {
        position: relative !important;
        inset: auto !important;
        width: var(--deck-design-w) !important;
        height: var(--deck-design-h) !important;
        box-sizing: border-box !important;
        opacity: 1 !important;
        visibility: visible !important;
        pointer-events: auto;
        break-after: page;
        page-break-after: always;
        break-inside: avoid;
        overflow: hidden;
      }
      /* :last-child alone isn't enough once data-deck-skip hides the
         trailing slide(s) — the last *visible* slide still carries
         break-after:page and prints a blank sheet. _markLastVisible()
         maintains data-deck-last-visible on the last non-skipped slide. */
      ::slotted(*:last-child),
      ::slotted([data-deck-last-visible]) {
        break-after: auto;
        page-break-after: auto;
      }
      ::slotted([data-deck-skip]) { display: none !important; }
      .overlay, .rail, .rail-resize, .ctxmenu, .confirm-backdrop { display: none !important; }
    }
  `;
  class DeckStage extends HTMLElement {
    static get observedAttributes() {
      return ['width', 'height', 'noscale', 'no-rail'];
    }
    constructor() {
      super();
      this._root = this.attachShadow({
        mode: 'open'
      });
      this._index = 0;
      this._slides = [];
      this._notes = [];
      this._hideTimer = null;
      this._mouseIdleTimer = null;
      this._menuIndex = -1;
      this._onKey = this._onKey.bind(this);
      this._onResize = this._onResize.bind(this);
      this._onSlotChange = this._onSlotChange.bind(this);
      this._onMouseMove = this._onMouseMove.bind(this);
      this._onTap = this._onTap.bind(this);
      this._onMessage = this._onMessage.bind(this);
      // Capture-phase close so a click anywhere dismisses the menu, but
      // ignore clicks that land inside the menu itself — otherwise the
      // capture handler runs before the menu's own (bubble) handler and
      // clears _menuIndex out from under it.
      this._onDocClick = e => {
        if (this._menu && e.composedPath && e.composedPath().includes(this._menu)) return;
        this._closeMenu();
      };
    }
    get designWidth() {
      return parseInt(this.getAttribute('width'), 10) || DESIGN_W_DEFAULT;
    }
    get designHeight() {
      return parseInt(this.getAttribute('height'), 10) || DESIGN_H_DEFAULT;
    }
    connectedCallback() {
      // Presenter-view popup loads deckUrl?_snthumb=...#N for its prev/cur/
      // next thumbnails — the rail has no business rendering inside those
      // (wrong scale, and it offsets the stage so the thumb shows a gutter).
      if (/[?&]_snthumb=/.test(location.search)) this.setAttribute('no-rail', '');
      this._render();
      this._loadNotes();
      this._syncPrintPageRule();
      window.addEventListener('keydown', this._onKey);
      window.addEventListener('resize', this._onResize);
      window.addEventListener('mousemove', this._onMouseMove, {
        passive: true
      });
      window.addEventListener('message', this._onMessage);
      window.addEventListener('click', this._onDocClick, true);
      this.addEventListener('click', this._onTap);
      // Initial collection + layout happens via slotchange, which fires on mount.
      this._enableRail();
      // Hold the stage hidden until webfonts are ready so the first visible
      // paint has the deck's real typography — the :not(:defined) guard in
      // the page HTML only covers custom-element upgrade, not font load.
      // Capped so a 404'd font URL can't blank the deck indefinitely.
      this.setAttribute('data-fonts-pending', '');
      const reveal = () => this.removeAttribute('data-fonts-pending');
      // rAF first: fonts.ready is a pre-resolved promise until layout has
      // resolved the slotted text's font-family and pushed a FontFace into
      // 'loading'. Reading it here in connectedCallback (parse-time) would
      // settle the race in a microtask before any font fetch starts.
      requestAnimationFrame(() => {
        Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), new Promise(r => setTimeout(r, 2000))]).then(reveal, reveal);
      });
    }
    _enableRail() {
      // Idempotent — older host builds still post __omelette_rail_enabled.
      // no-rail guard keeps the observers/stylesheet walk off the cheap path
      // for presenter-popup thumbnail iframes (up to 9 per view).
      if (this._railEnabled || this.hasAttribute('no-rail')) return;
      this._railEnabled = true;
      // Per-viewer preference — restored alongside rail width. Default on;
      // only a stored '0' (from the TweaksPanel toggle) hides it.
      this._railVisible = true;
      try {
        if (localStorage.getItem('deck-stage.railVisible') === '0') this._railVisible = false;
      } catch (e) {}
      // Live thumbnail updates: watch the light-DOM slides for content
      // edits and re-clone just the affected thumb(s), debounced. Ignore
      // the data-deck-* / data-screen-label / data-om-validate attributes
      // this component itself writes so nav and skip don't trigger
      // spurious refreshes.
      const OWN_ATTRS = /^data-(deck-|screen-label$|om-validate$)/;
      this._liveDirty = new Set();
      this._liveObserver = new MutationObserver(records => {
        for (const r of records) {
          if (r.type === 'attributes' && OWN_ATTRS.test(r.attributeName || '')) continue;
          let n = r.target;
          while (n && n.parentElement !== this) n = n.parentElement;
          if (n && this._slideSet && this._slideSet.has(n)) this._liveDirty.add(n);
        }
        if (this._liveDirty.size && !this._liveTimer) {
          this._liveTimer = setTimeout(() => {
            this._liveTimer = null;
            this._liveDirty.forEach(s => this._refreshThumb(s));
            this._liveDirty.clear();
          }, 200);
        }
      });
      this._liveObserver.observe(this, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true
      });
      // Lazy thumbnail materialization — clone the slide only when its
      // frame scrolls into (or near) the rail viewport. rootMargin gives
      // ~4 thumbs of pre-load so fast scrolling doesn't flash blanks.
      this._railObserver = new IntersectionObserver(entries => {
        entries.forEach(e => {
          if (e.isIntersecting && e.target.__deckThumb) {
            this._materialize(e.target.__deckThumb);
          }
        });
      }, {
        root: this._rail,
        rootMargin: '400px 0px'
      });
      // Tweaks typically change CSS vars / attrs OUTSIDE <deck-stage>
      // (on <html>, <body>, a wrapper div, or a <style> tag), which
      // _liveObserver can't see. Re-snapshot author CSS (constructable
      // sheet is shared by reference, so one replaceSync updates every
      // thumb shadow root) and re-sync each thumb host's attrs + custom
      // properties. In-slide DOM mutations are _liveObserver's job.
      // Debounced so slider drags don't thrash.
      this._onTweakChange = () => {
        clearTimeout(this._tweakTimer);
        this._tweakTimer = setTimeout(() => {
          this._snapshotAuthorCss();
          // One getComputedStyle for the whole batch — each
          // getPropertyValue read below reuses the same computed style
          // as long as nothing invalidates layout between thumbs.
          const cs = getComputedStyle(this);
          (this._thumbs || []).forEach(t => {
            if (t.host) this._syncThumbHostAttrs(t.host, cs);
          });
        }, 120);
      };
      window.addEventListener('tweakchange', this._onTweakChange);
      this._snapshotAuthorCss();
      // Build the rail now that it's enabled — slotchange already fired,
      // so _renderRail's early-return skipped the initial build.
      this._syncRailHidden();
      this._renderRail();
      this._fit();
    }

    /** Snapshot document stylesheets into a constructable sheet that each
     *  thumbnail's nested shadow root adopts — so author CSS styles the
     *  cloned slide content without touching this component's chrome.
     *  Cross-origin sheets throw on .cssRules — skip them. Re-callable:
     *  the existing constructable sheet is reused via replaceSync so every
     *  already-adopted shadow root picks up the fresh CSS without re-adopt. */
    _snapshotAuthorCss() {
      // :root in an adopted sheet inside a shadow root matches nothing
      // (only the document root qualifies), so author rules like
      // `:root[data-voice="modern"] .serif` never reach the clones.
      // Rewrite :root → :host and mirror <html>'s data-*/class/lang onto
      // each thumb host (see _syncThumbHostAttrs) so the same selectors
      // match inside the thumbnail's shadow tree.
      const authorCss = Array.from(document.styleSheets).map(sh => {
        try {
          return Array.from(sh.cssRules).map(r => r.cssText).join('\n');
        } catch (e) {
          return '';
        }
      }).join('\n')
      // The shadow host is featureless outside the functional :host(...)
      // form, so any compound on :root — [attr], .class, #id, :pseudo —
      // must become :host(<compound>) not :host<compound>. Same for the
      // html type selector (Tailwind class-strategy dark mode emits
      // html.dark; Pico uses html[data-theme]), which has nothing to
      // match inside the thumb's shadow tree.
      .replace(/:root((?:\[[^\]]*\]|[.#][-\w]+|:[-\w]+(?:\([^)]*\))?)+)/g, ':host($1)').replace(/:root\b/g, ':host').replace(/(^|[\s,>~+(}])html((?:\[[^\]]*\]|[.#][-\w]+|:[-\w]+(?:\([^)]*\))?)+)(?![-\w])/g, '$1:host($2)').replace(/(^|[\s,>~+(}])html(?![-\w])/g, '$1:host');
      // Every custom property the author references. _syncThumbHostAttrs
      // mirrors each one's *computed* value at <deck-stage> onto the
      // thumb host so the live value wins over the :host default above
      // regardless of which ancestor the tweak wrote to (<html>, <body>,
      // a wrapper div, or the deck-stage element itself all inherit
      // down to getComputedStyle(this)).
      this._authorVars = new Set(authorCss.match(/--[\w-]+/g) || []);
      try {
        if (!this._adoptedSheet) this._adoptedSheet = new CSSStyleSheet();
        this._adoptedSheet.replaceSync(authorCss);
      } catch (e) {
        this._adoptedSheet = null;
        this._authorCss = authorCss;
      }
    }
    _syncThumbHostAttrs(host, cs) {
      const de = document.documentElement;
      // setAttribute overwrites but can't delete — an attr removed from
      // <html> (toggleAttribute off, classList emptied) would linger on
      // the host and :host([data-*]) / :host(.foo) rules would keep
      // matching. Remove stale mirrored attrs first; iterate backward
      // because removeAttribute mutates the live NamedNodeMap.
      for (let i = host.attributes.length - 1; i >= 0; i--) {
        const n = host.attributes[i].name;
        if ((n.startsWith('data-') || n === 'class' || n === 'lang') && !de.hasAttribute(n)) {
          host.removeAttribute(n);
        }
      }
      for (const a of de.attributes) {
        if (a.name.startsWith('data-') || a.name === 'class' || a.name === 'lang') {
          host.setAttribute(a.name, a.value);
        }
      }
      // The :root→:host rewrite in _snapshotAuthorCss pins each custom
      // property to its stylesheet default on the thumb host, shadowing
      // the live value that would otherwise inherit. Tweaks can write the
      // live value on any ancestor — <html>, <body>, a wrapper div, the
      // deck-stage element — so read it as the *computed* value at
      // <deck-stage> (which sees the whole inheritance chain) rather than
      // trying to guess which element the author wrote to. Inline on the
      // host beats the :host{} rule. remove-stale covers vars dropped
      // from the stylesheet between snapshots.
      const vars = this._authorVars || new Set();
      for (let i = host.style.length - 1; i >= 0; i--) {
        const p = host.style[i];
        if (p.startsWith('--') && !vars.has(p)) host.style.removeProperty(p);
      }
      const live = cs || getComputedStyle(this);
      vars.forEach(p => {
        const v = live.getPropertyValue(p);
        if (v) host.style.setProperty(p, v.trim());else host.style.removeProperty(p);
      });
    }
    disconnectedCallback() {
      window.removeEventListener('keydown', this._onKey);
      window.removeEventListener('resize', this._onResize);
      window.removeEventListener('mousemove', this._onMouseMove);
      window.removeEventListener('message', this._onMessage);
      window.removeEventListener('click', this._onDocClick, true);
      this.removeEventListener('click', this._onTap);
      if (this._hideTimer) clearTimeout(this._hideTimer);
      if (this._mouseIdleTimer) clearTimeout(this._mouseIdleTimer);
      if (this._liveTimer) clearTimeout(this._liveTimer);
      if (this._tweakTimer) clearTimeout(this._tweakTimer);
      if (this._railAnimTimer) clearTimeout(this._railAnimTimer);
      if (this._scaleRaf) cancelAnimationFrame(this._scaleRaf);
      if (this._liveObserver) this._liveObserver.disconnect();
      if (this._railObserver) this._railObserver.disconnect();
      if (this._onTweakChange) window.removeEventListener('tweakchange', this._onTweakChange);
    }
    attributeChangedCallback() {
      if (this._canvas) {
        this._canvas.style.width = this.designWidth + 'px';
        this._canvas.style.height = this.designHeight + 'px';
        this._canvas.style.setProperty('--deck-design-w', this.designWidth + 'px');
        this._canvas.style.setProperty('--deck-design-h', this.designHeight + 'px');
        if (this._rail) {
          this._rail.style.setProperty('--deck-aspect', this.designWidth + '/' + this.designHeight);
        }
        this._fit();
        this._scaleThumbs();
        this._syncPrintPageRule();
      }
    }
    _render() {
      const style = document.createElement('style');
      style.textContent = stylesheet;
      const stage = document.createElement('div');
      stage.className = 'stage';
      const canvas = document.createElement('div');
      canvas.className = 'canvas';
      canvas.style.width = this.designWidth + 'px';
      canvas.style.height = this.designHeight + 'px';
      canvas.style.setProperty('--deck-design-w', this.designWidth + 'px');
      canvas.style.setProperty('--deck-design-h', this.designHeight + 'px');
      const slot = document.createElement('slot');
      slot.addEventListener('slotchange', this._onSlotChange);
      canvas.appendChild(slot);
      stage.appendChild(canvas);

      // Overlay: compact, solid black, with clickable controls.
      const overlay = document.createElement('div');
      overlay.className = 'overlay export-hidden';
      overlay.setAttribute('role', 'toolbar');
      overlay.setAttribute('aria-label', 'Deck controls');
      overlay.setAttribute('data-omelette-chrome', '');
      overlay.innerHTML = `
        <button class="btn prev" type="button" aria-label="Previous slide" title="Previous (←)">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3L5 8l5 5"/></svg>
        </button>
        <span class="count" aria-live="polite"><span class="current">1</span><span class="sep">/</span><span class="total">1</span></span>
        <button class="btn next" type="button" aria-label="Next slide" title="Next (→)">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3l5 5-5 5"/></svg>
        </button>
        <span class="divider"></span>
        <button class="btn reset" type="button" aria-label="Reset to first slide" title="Reset (R)">Reset<span class="kbd">R</span></button>
      `;
      overlay.querySelector('.prev').addEventListener('click', () => this._advance(-1, 'click'));
      overlay.querySelector('.next').addEventListener('click', () => this._advance(1, 'click'));
      overlay.querySelector('.reset').addEventListener('click', () => this._go(0, 'click'));

      // Thumbnail rail + context menu. Thumbnails are populated in
      // _renderRail() after _collectSlides().
      const rail = document.createElement('div');
      rail.className = 'rail export-hidden';
      rail.setAttribute('data-omelette-chrome', '');
      rail.style.setProperty('--deck-aspect', this.designWidth + '/' + this.designHeight);
      // Edge auto-scroll while dragging a thumb near the rail's top/bottom
      // so off-screen drop targets are reachable. Native dragover fires
      // continuously while the pointer is stationary, so a per-event nudge
      // (ramped by edge proximity) is enough — no rAF loop needed.
      rail.addEventListener('dragover', e => {
        if (this._dragFrom == null) return;
        const r = rail.getBoundingClientRect();
        const EDGE = 40;
        const dt = e.clientY - r.top;
        const db = r.bottom - e.clientY;
        if (dt < EDGE) rail.scrollTop -= Math.ceil((EDGE - dt) / 3);else if (db < EDGE) rail.scrollTop += Math.ceil((EDGE - db) / 3);
      });
      const menu = document.createElement('div');
      menu.className = 'ctxmenu export-hidden';
      menu.setAttribute('data-omelette-chrome', '');
      menu.innerHTML = `
        <button type="button" data-act="skip">Skip slide</button>
        <button type="button" data-act="up">Move up</button>
        <button type="button" data-act="down">Move down</button>
        <hr>
        <button type="button" data-act="delete">Delete slide</button>
      `;
      menu.addEventListener('click', e => {
        const act = e.target && e.target.getAttribute && e.target.getAttribute('data-act');
        if (!act) return;
        const i = this._menuIndex;
        this._closeMenu();
        if (act === 'skip') this._toggleSkip(i);else if (act === 'up') this._moveSlide(i, i - 1);else if (act === 'down') this._moveSlide(i, i + 1);else if (act === 'delete') this._openConfirm(i);
      });
      menu.addEventListener('contextmenu', e => e.preventDefault());

      // Rail resize handle — drag to set --deck-rail-w, persisted to
      // localStorage so the width survives reloads.
      const resize = document.createElement('div');
      resize.className = 'rail-resize export-hidden';
      resize.setAttribute('data-omelette-chrome', '');
      resize.addEventListener('pointerdown', e => {
        e.preventDefault();
        resize.setPointerCapture(e.pointerId);
        resize.setAttribute('data-dragging', '');
        const move = ev => this._setRailWidth(ev.clientX);
        const up = () => {
          resize.removeEventListener('pointermove', move);
          resize.removeEventListener('pointerup', up);
          resize.removeEventListener('pointercancel', up);
          resize.removeAttribute('data-dragging');
          try {
            localStorage.setItem('deck-stage.railWidth', String(this._railPx));
          } catch (err) {}
        };
        resize.addEventListener('pointermove', move);
        resize.addEventListener('pointerup', up);
        resize.addEventListener('pointercancel', up);
      });

      // Delete-confirm dialog — mirrors the SPA's ConfirmDialog layout.
      const confirm = document.createElement('div');
      confirm.className = 'confirm-backdrop export-hidden';
      confirm.setAttribute('data-omelette-chrome', '');
      confirm.innerHTML = `
        <div class="confirm" role="dialog" aria-modal="true">
          <div class="body">
            <div class="title">Delete slide?</div>
            <div class="msg">This slide will be removed from the deck.</div>
          </div>
          <div class="footer">
            <button type="button" class="cancel">Cancel</button>
            <button type="button" class="danger">Delete</button>
          </div>
        </div>
      `;
      confirm.addEventListener('click', e => {
        if (e.target === confirm) this._closeConfirm();
      });
      confirm.querySelector('.cancel').addEventListener('click', () => this._closeConfirm());
      confirm.querySelector('.danger').addEventListener('click', () => {
        const i = this._confirmIndex;
        this._closeConfirm();
        this._deleteSlide(i);
      });
      this._root.append(style, rail, resize, stage, overlay, menu, confirm);
      this._canvas = canvas;
      this._stage = stage;
      this._slot = slot;
      this._overlay = overlay;
      this._rail = rail;
      this._resize = resize;
      this._menu = menu;
      this._confirm = confirm;
      this._countEl = overlay.querySelector('.current');
      this._totalEl = overlay.querySelector('.total');

      // Restore persisted rail width.
      let rw = 188;
      try {
        const s = localStorage.getItem('deck-stage.railWidth');
        if (s) rw = parseInt(s, 10) || rw;
      } catch (err) {}
      this._setRailWidth(rw);
      this._syncRailHidden();
    }
    _setRailWidth(px) {
      const w = Math.max(120, Math.min(360, Math.round(px)));
      this._railPx = w;
      this.style.setProperty('--deck-rail-w', w + 'px');
      this._fit();
      // _scaleThumbs forces a sync layout (frame.offsetWidth) then writes
      // N transforms. During a resize drag this runs per-pointermove;
      // coalesce to one per frame.
      if (!this._scaleRaf) {
        this._scaleRaf = requestAnimationFrame(() => {
          this._scaleRaf = null;
          this._scaleThumbs();
        });
      }
    }

    /** @page must live in the document stylesheet — it's a no-op inside
     *  shadow DOM. Inject/update a single <head> style tag so the print
     *  sheet matches the design size and Save-as-PDF yields one slide per
     *  page with no margins. */
    _syncPrintPageRule() {
      const id = 'deck-stage-print-page';
      let tag = document.getElementById(id);
      if (!tag) {
        tag = document.createElement('style');
        tag.id = id;
        document.head.appendChild(tag);
      }
      tag.textContent = '@page { size: ' + this.designWidth + 'px ' + this.designHeight + 'px; margin: 0; } ' + '@media print { html, body { margin: 0 !important; padding: 0 !important; background: none !important; overflow: visible !important; height: auto !important; } ' + '* { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }';
    }
    _onSlotChange() {
      // Rail mutations (delete/move) already reconcile synchronously and
      // emit slidechange with reason 'api'; skip the async slotchange that
      // would otherwise re-broadcast with reason 'init'.
      if (this._squelchSlotChange) {
        this._squelchSlotChange = false;
        return;
      }
      this._collectSlides();
      this._restoreIndex();
      this._applyIndex({
        showOverlay: false,
        broadcast: true,
        reason: 'init'
      });
      this._fit();
    }
    _collectSlides() {
      const assigned = this._slot.assignedElements({
        flatten: true
      });
      this._slides = assigned.filter(el => {
        // Skip template/style/script nodes even if someone slots them.
        const tag = el.tagName;
        return tag !== 'TEMPLATE' && tag !== 'SCRIPT' && tag !== 'STYLE';
      });
      this._slideSet = new Set(this._slides);
      this._slides.forEach((slide, i) => {
        const n = i + 1;
        slide.setAttribute('data-screen-label', `${pad2(n)} ${getSlideLabel(slide)}`);

        // Validation attribute for comment flow / auto-checks.
        if (!slide.hasAttribute('data-om-validate')) {
          slide.setAttribute('data-om-validate', VALIDATE_ATTR);
        }
        slide.setAttribute('data-deck-slide', String(i));
      });
      if (this._totalEl) this._totalEl.textContent = String(this._slides.length || 1);
      if (this._index >= this._slides.length) this._index = Math.max(0, this._slides.length - 1);
      this._markLastVisible();
      this._renderRail();
    }

    /** Tag the last non-skipped slide so print CSS can drop its
     *  break-after (see the @media print comment above — :last-child
     *  alone matches a hidden skipped slide). */
    _markLastVisible() {
      let last = null;
      this._slides.forEach(s => {
        s.removeAttribute('data-deck-last-visible');
        if (!s.hasAttribute('data-deck-skip')) last = s;
      });
      if (last) last.setAttribute('data-deck-last-visible', '');
    }
    _loadNotes() {
      const tag = document.getElementById('speaker-notes');
      if (!tag) {
        this._notes = [];
        return;
      }
      try {
        const parsed = JSON.parse(tag.textContent || '[]');
        if (Array.isArray(parsed)) this._notes = parsed;
      } catch (e) {
        console.warn('[deck-stage] Failed to parse #speaker-notes JSON:', e);
        this._notes = [];
      }
    }
    _restoreIndex() {
      // The host's ?slide= param is delivered as a #<int> hash (1-indexed) on
      // the iframe src. No hash → slide 1; the deck itself keeps no position
      // state across loads.
      const h = (location.hash || '').match(/^#(\d+)$/);
      if (h) {
        const n = parseInt(h[1], 10) - 1;
        if (n >= 0 && n < this._slides.length) this._index = n;
      }
    }
    _applyIndex({
      showOverlay = true,
      broadcast = true,
      reason = 'init'
    } = {}) {
      if (!this._slides.length) return;
      const prev = this._prevIndex == null ? -1 : this._prevIndex;
      const curr = this._index;
      // Keep the iframe's own hash in sync so an in-iframe location.reload()
      // (reload banner path in viewer-handle.ts) lands on the current slide,
      // not the stale deep-link hash from initial load.
      try {
        history.replaceState(null, '', '#' + (curr + 1));
      } catch (e) {}
      this._slides.forEach((s, i) => {
        if (i === curr) s.setAttribute('data-deck-active', '');else s.removeAttribute('data-deck-active');
      });
      if (this._countEl) this._countEl.textContent = String(curr + 1);
      // Follow-scroll on every navigation (init deep-link, keyboard, click,
      // tap, external goTo) — the only time we *don't* want the rail to
      // track current is after a rail-internal mutation, where _renderRail
      // has already restored the user's scroll position and yanking back to
      // current would undo it.
      this._syncRail(reason !== 'mutation');
      if (broadcast) {
        // (1) Legacy: host-window postMessage for speaker-notes renderers.
        try {
          window.postMessage({
            slideIndexChanged: curr,
            deckTotal: this._slides.length,
            deckSkipped: this._skippedIndices()
          }, '*');
        } catch (e) {}

        // (2) In-page CustomEvent on the <deck-stage> element itself.
        //     Bubbles and composes out of shadow DOM so slide code can listen:
        //       document.querySelector('deck-stage').addEventListener('slidechange', e => {
        //         e.detail.index, e.detail.previousIndex, e.detail.total, e.detail.slide, e.detail.reason
        //       });
        const detail = {
          index: curr,
          previousIndex: prev,
          total: this._slides.length,
          slide: this._slides[curr] || null,
          previousSlide: prev >= 0 ? this._slides[prev] || null : null,
          reason: reason // 'init' | 'keyboard' | 'click' | 'tap' | 'api'
        };
        this.dispatchEvent(new CustomEvent('slidechange', {
          detail,
          bubbles: true,
          composed: true
        }));
      }
      this._prevIndex = curr;
      if (showOverlay) this._flashOverlay();
    }
    _flashOverlay() {
      // Host posts __omelette_presenting while in fullscreen/tab presentation
      // mode — suppress the nav footer entirely (both hover and slide-change
      // flash) so the audience sees clean slides.
      if (!this._overlay || this._presenting) return;
      this._overlay.setAttribute('data-visible', '');
      if (this._hideTimer) clearTimeout(this._hideTimer);
      this._hideTimer = setTimeout(() => {
        this._overlay.removeAttribute('data-visible');
      }, OVERLAY_HIDE_MS);
    }
    _railWidth() {
      // State-based, no offsetWidth: the first _fit() can run before the
      // rail has had layout on some load paths, and a 0 there paints the
      // slide full-width for one frame before the post-slotchange _fit()
      // corrects it.
      if (!this._railEnabled || !this._railVisible || this.hasAttribute('no-rail') || this.hasAttribute('noscale') || this._presenting || this._previewMode || NARROW_MQ.matches) return 0;
      return this._railPx || 0;
    }
    _fit() {
      if (!this._canvas) return;
      const stage = this._canvas.parentElement;
      // PPTX export sets noscale so the DOM capture sees authored-size
      // geometry — the scaled canvas is in shadow DOM, so the exporter's
      // resetTransformSelector can't reach .canvas.style.transform directly.
      if (this.hasAttribute('noscale')) {
        this._canvas.style.transform = 'none';
        if (stage) stage.style.left = '0';
        if (this._overlay) this._overlay.style.marginLeft = '0';
        return;
      }
      const rw = this._railWidth();
      if (stage) stage.style.left = rw + 'px';
      // Overlay is centred on the viewport via left:50% + translate(-50%);
      // marginLeft shifts the centre by rw/2 so it lands in the middle of
      // the [rw, innerWidth] stage region.
      if (this._overlay) this._overlay.style.marginLeft = rw / 2 + 'px';
      const vw = window.innerWidth - rw;
      const vh = window.innerHeight;
      const s = Math.min(vw / this.designWidth, vh / this.designHeight);
      this._canvas.style.transform = `scale(${s})`;
    }
    _onResize() {
      this._fit();
      // Crossing the narrow-viewport breakpoint reveals the rail — rerun the
      // thumbnail scale the same way _setRailWidth does.
      if (!this._scaleRaf) {
        this._scaleRaf = requestAnimationFrame(() => {
          this._scaleRaf = null;
          this._scaleThumbs();
        });
      }
    }
    _onMouseMove() {
      // Keep overlay visible while mouse moves; hide after idle.
      this._flashOverlay();
    }
    _onMessage(e) {
      const d = e.data;
      if (d && typeof d.__omelette_presenting === 'boolean') {
        this._presenting = d.__omelette_presenting;
        if (this._presenting && this._overlay) {
          this._overlay.removeAttribute('data-visible');
          if (this._hideTimer) clearTimeout(this._hideTimer);
        }
        this._syncRailHidden();
        this._closeMenu();
        this._closeConfirm();
        this._fit();
        this._scaleThumbs();
      }
      // Host's Preview segment (ViewerMode='none'): the rail's drag-reorder /
      // right-click skip-delete affordances are editing chrome, so hide it
      // while the user is just looking at the deck. Same hard-hide path as
      // presenting; independent of the user's _railVisible preference so
      // returning to Edit restores whatever they had.
      if (d && typeof d.__omelette_preview_mode === 'boolean') {
        if (d.__omelette_preview_mode === this._previewMode) return;
        this._previewMode = d.__omelette_preview_mode;
        this._syncRailHidden();
        this._closeMenu();
        this._closeConfirm();
        this._fit();
        this._scaleThumbs();
      }
      // Per-viewer show/hide, driven by the TweaksPanel's auto-injected
      // "Thumbnail rail" toggle (or any author script). Independent of
      // whether the Tweaks panel itself is open — closing the panel
      // doesn't change rail visibility. Persists alongside rail width.
      if (d && d.type === '__deck_rail_visible' && typeof d.on === 'boolean') {
        if (d.on === this._railVisible) return;
        this._railVisible = d.on;
        try {
          localStorage.setItem('deck-stage.railVisible', d.on ? '1' : '0');
        } catch (e) {}
        // Arm the transition, commit it, then flip state — otherwise the
        // browser coalesces both writes and nothing animates on show.
        this.setAttribute('data-rail-anim', '');
        void (this._rail && this._rail.offsetHeight);
        this._syncRailHidden();
        this._fit();
        this._scaleThumbs();
        clearTimeout(this._railAnimTimer);
        this._railAnimTimer = setTimeout(() => this.removeAttribute('data-rail-anim'), 220);
      }
      if (d && d.type === '__omelette_rail_enabled') this._enableRail();
    }
    _syncRailHidden() {
      if (!this._rail) return;
      // data-presenting is the hard hide (display:none) for flag-off,
      // presentation mode, and the host's Preview segment — instant, no
      // transition. data-user-hidden is the soft hide (translateX(-100%))
      // for the viewer's rail toggle, so show/hide slides under
      // :host([data-rail-anim]).
      const hard = !this._railEnabled || this._presenting || this._previewMode;
      if (hard) this._rail.setAttribute('data-presenting', '');else this._rail.removeAttribute('data-presenting');
      if (!this._railVisible) this._rail.setAttribute('data-user-hidden', '');else this._rail.removeAttribute('data-user-hidden');
      // translateX hide leaves thumbs (tabIndex=0) in the tab order —
      // inert keeps them unfocusable while the rail is off-screen.
      this._rail.inert = hard || !this._railVisible;
    }
    _onTap(e) {
      // Touch-only — keyboard + the overlay toolbar cover nav on desktop.
      if (FINE_POINTER_MQ.matches) return;
      // Only taps that land on the stage (slide content or letterbox); the
      // overlay / rail / menus are siblings with their own click handlers.
      const path = e.composedPath();
      if (!this._stage || !path.includes(this._stage)) return;
      // Let interactive slide content keep the tap. composedPath (not
      // e.target.closest) so we see through open shadow roots — a <button>
      // inside a slide-authored custom element retargets e.target to the
      // host but still appears in the composed path.
      if (e.defaultPrevented) return;
      for (const n of path) {
        if (n === this._stage) break;
        if (n.matches && n.matches(INTERACTIVE_SEL)) return;
      }
      e.preventDefault();
      const rw = this._railWidth();
      const mid = rw + (window.innerWidth - rw) / 2;
      this._advance(e.clientX < mid ? -1 : 1, 'tap');
    }
    _onKey(e) {
      // Ignore when the user is typing.
      const t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      // Confirm dialog swallows nav keys while open; Escape cancels. Enter
      // is left to the focused button's native activation so Tab→Cancel
      // →Enter activates Cancel, not the window-level confirm path.
      if (this._confirm && this._confirm.hasAttribute('data-open')) {
        if (e.key === 'Escape') {
          this._closeConfirm();
          e.preventDefault();
        }
        return;
      }
      if (e.key === 'Escape' && this._menu && this._menu.hasAttribute('data-open')) {
        this._closeMenu();
        e.preventDefault();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key;
      let handled = true;
      if (key === 'ArrowRight' || key === 'PageDown' || key === ' ' || key === 'Spacebar') {
        this._advance(1, 'keyboard');
      } else if (key === 'ArrowLeft' || key === 'PageUp') {
        this._advance(-1, 'keyboard');
      } else if (key === 'Home') {
        this._go(0, 'keyboard');
      } else if (key === 'End') {
        this._go(this._slides.length - 1, 'keyboard');
      } else if (key === 'r' || key === 'R') {
        this._go(0, 'keyboard');
      } else if (/^[0-9]$/.test(key)) {
        // 1..9 jump to that slide; 0 jumps to 10.
        const n = key === '0' ? 9 : parseInt(key, 10) - 1;
        if (n < this._slides.length) this._go(n, 'keyboard');
      } else {
        handled = false;
      }
      if (handled) {
        e.preventDefault();
        this._flashOverlay();
      }
    }
    _go(i, reason = 'api') {
      if (!this._slides.length) return;
      const clamped = Math.max(0, Math.min(this._slides.length - 1, i));
      if (clamped === this._index) {
        this._flashOverlay();
        return;
      }
      this._index = clamped;
      this._applyIndex({
        showOverlay: true,
        broadcast: true,
        reason
      });
    }

    /** Step forward/back skipping any slide marked data-deck-skip. Falls
     *  back to _go's clamp-at-ends behaviour (flash overlay) when there's
     *  nothing further in that direction. */
    _advance(dir, reason) {
      if (!this._slides.length) return;
      let i = this._index + dir;
      while (i >= 0 && i < this._slides.length && this._slides[i].hasAttribute('data-deck-skip')) {
        i += dir;
      }
      if (i < 0 || i >= this._slides.length) {
        this._flashOverlay();
        return;
      }
      this._go(i, reason);
    }

    // ── Thumbnail rail ────────────────────────────────────────────────────
    //
    // Thumbs are keyed by slide element and reused across _renderRail()
    // calls, so a reorder/delete is an O(changed) DOM shuffle instead of an
    // O(N) teardown-and-re-clone. Each thumb starts as a lightweight shell
    // (num + empty frame); the clone is materialized lazily by an
    // IntersectionObserver when the frame scrolls into (or near) view, so
    // only visible-ish slides pay the clone + image-decode cost.

    _renderRail() {
      if (!this._rail || !this._railEnabled) {
        this._thumbs = [];
        return;
      }
      // FLIP: record each *materialized* thumb's top before the reconcile.
      // Off-screen (non-materialized) thumbs don't need the animation and
      // skipping their getBoundingClientRect saves a forced layout per
      // off-screen thumb on large decks.
      const prevTops = new Map();
      (this._thumbs || []).forEach(({
        thumb,
        slide,
        host
      }) => {
        if (host) prevTops.set(slide, thumb.getBoundingClientRect().top);
      });
      const st = this._rail.scrollTop;

      // Reconcile: reuse thumbs that already exist for a slide, create
      // shells for new slides, drop thumbs for removed slides.
      const bySlide = new Map();
      (this._thumbs || []).forEach(t => bySlide.set(t.slide, t));
      const next = [];
      this._slides.forEach(slide => {
        let t = bySlide.get(slide);
        if (t) bySlide.delete(slide);else t = this._makeThumb(slide);
        next.push(t);
      });
      // Orphans — slides removed since last render.
      bySlide.forEach(t => {
        if (this._railObserver) this._railObserver.unobserve(t.frame);
        t.thumb.remove();
      });
      // Put thumbs into document order to match _slides. insertBefore on
      // an already-correctly-placed node is a no-op, so this is cheap
      // when nothing moved.
      next.forEach((t, i) => {
        const want = t.thumb;
        const at = this._rail.children[i];
        if (at !== want) this._rail.insertBefore(want, at || null);
        t.i = i;
        t.num.textContent = String(i + 1);
        if (t.slide.hasAttribute('data-deck-skip')) t.thumb.setAttribute('data-skip', '');else t.thumb.removeAttribute('data-skip');
      });
      this._thumbs = next;
      this._rail.scrollTop = st;
      if (prevTops.size) {
        const moved = [];
        this._thumbs.forEach(({
          thumb,
          slide
        }) => {
          const old = prevTops.get(slide);
          if (old == null) return;
          const dy = old - thumb.getBoundingClientRect().top;
          if (Math.abs(dy) < 1) return;
          thumb.style.transition = 'none';
          thumb.style.transform = `translateY(${dy}px)`;
          moved.push(thumb);
        });
        if (moved.length) {
          // Commit the inverted positions before flipping the transition
          // on — otherwise the browser coalesces both style writes and
          // nothing animates.
          void this._rail.offsetHeight;
          moved.forEach(t => {
            t.style.transition = 'transform 180ms cubic-bezier(.2,.7,.3,1)';
            t.style.transform = '';
          });
          setTimeout(() => moved.forEach(t => {
            t.style.transition = '';
          }), 220);
        }
      }
      requestAnimationFrame(() => this._scaleThumbs());
      this._syncRail(false);
    }

    /** Create a lightweight thumb shell for one slide. The clone is
     *  materialized later by the IntersectionObserver. Event handlers
     *  look up the thumb's *current* index (via _thumbs.indexOf) so the
     *  same element can be reused across reorders. */
    _makeThumb(slide) {
      const thumb = document.createElement('div');
      thumb.className = 'thumb';
      thumb.tabIndex = 0;
      const num = document.createElement('div');
      num.className = 'num';
      const frame = document.createElement('div');
      frame.className = 'frame';
      thumb.append(num, frame);
      const entry = {
        thumb,
        num,
        frame,
        slide,
        clone: null,
        host: null,
        i: -1
      };
      // entry.i is refreshed on every _renderRail reconcile pass, so
      // handlers read the thumb's current position without an O(N) scan.
      const idx = () => entry.i;
      thumb.addEventListener('click', () => this._go(idx(), 'click'));
      // ↑/↓ step through the rail when a thumb has focus. _go clamps at the
      // ends and _applyIndex→_syncRail scrolls the new current thumb into
      // view; we move focus to it (preventScroll — _syncRail already
      // scrolled) so a held key walks the whole list. stopPropagation keeps
      // this out of the window-level _onKey nav handler.
      thumb.addEventListener('keydown', e => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        e.preventDefault();
        e.stopPropagation();
        this._go(idx() + (e.key === 'ArrowDown' ? 1 : -1), 'keyboard');
        const cur = this._thumbs && this._thumbs[this._index];
        if (cur) cur.thumb.focus({
          preventScroll: true
        });
      });
      thumb.addEventListener('contextmenu', e => {
        e.preventDefault();
        this._openMenu(idx(), e.clientX, e.clientY);
      });
      thumb.draggable = true;
      thumb.addEventListener('dragstart', e => {
        this._dragFrom = idx();
        thumb.setAttribute('data-dragging', '');
        e.dataTransfer.effectAllowed = 'move';
        try {
          e.dataTransfer.setData('text/plain', String(this._dragFrom));
        } catch (err) {}
      });
      thumb.addEventListener('dragend', () => {
        thumb.removeAttribute('data-dragging');
        this._clearDrop();
        this._dragFrom = null;
      });
      thumb.addEventListener('dragover', e => {
        if (this._dragFrom == null) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const r = thumb.getBoundingClientRect();
        this._setDrop(idx(), e.clientY < r.top + r.height / 2 ? 'before' : 'after');
      });
      thumb.addEventListener('drop', e => {
        if (this._dragFrom == null) return;
        e.preventDefault();
        const i = idx();
        const r = thumb.getBoundingClientRect();
        let to = e.clientY >= r.top + r.height / 2 ? i + 1 : i;
        if (this._dragFrom < to) to--;
        const from = this._dragFrom;
        this._clearDrop();
        this._dragFrom = null;
        if (to !== from) this._moveSlide(from, to);
      });
      if (this._railObserver) this._railObserver.observe(frame);
      frame.__deckThumb = entry;
      return entry;
    }

    /** Lazily build the clone for a thumb that has scrolled into view. */
    _materialize(entry) {
      if (entry.host) return;
      const dw = this.designWidth,
        dh = this.designHeight;
      let clone = entry.slide.cloneNode(true);
      clone.removeAttribute('id');
      clone.removeAttribute('data-deck-active');
      clone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
      // Neuter heavy media; replace <video> with its poster so the box
      // keeps a visual. <iframe>/<audio> become empty placeholders.
      clone.querySelectorAll('iframe, audio, object, embed').forEach(el => {
        el.removeAttribute('src');
        el.removeAttribute('srcdoc');
        el.removeAttribute('data');
        el.innerHTML = '';
      });
      clone.querySelectorAll('video').forEach(el => {
        if (!el.poster) {
          el.removeAttribute('src');
          el.innerHTML = '';
          return;
        }
        const img = document.createElement('img');
        img.src = el.poster;
        img.alt = '';
        img.style.cssText = el.style.cssText + ';object-fit:cover;width:100%;height:100%;';
        img.className = el.className;
        el.replaceWith(img);
      });
      // Images: defer decode and let the browser pick the smallest
      // srcset candidate for the ~140px thumb. Same-URL clones reuse the
      // slide's decoded bitmap (URL-keyed cache), so the remaining cost
      // is paint/composite — lazy+async keeps that off the main thread.
      clone.querySelectorAll('img').forEach(el => {
        el.loading = 'lazy';
        el.decoding = 'async';
        if (el.srcset) el.sizes = (this._railPx || 188) + 'px';
      });
      // Custom elements inside the slide would have their
      // connectedCallback fire when the clone is appended. Replace them
      // with inert boxes so a component-heavy deck doesn't run N copies
      // of each component's mount logic in the rail. Children are
      // preserved so layout-wrapper elements (<my-column><h2>…</h2>)
      // still show their authored content; the querySelectorAll NodeList
      // is static, so nested custom elements in the moved subtree are
      // still visited on later iterations.
      const neuter = el => {
        const box = document.createElement('div');
        box.style.cssText = (el.getAttribute('style') || '') + ';background:rgba(0,0,0,0.06);border:1px dashed rgba(0,0,0,0.15);';
        box.className = el.className;
        // Preserve theming/i18n hooks so [data-*] / :lang() / [dir]
        // descendant selectors still match the neutered root.
        for (const a of el.attributes) {
          const n = a.name;
          if (n.startsWith('data-') || n.startsWith('aria-') || n === 'lang' || n === 'dir' || n === 'role' || n === 'title') {
            box.setAttribute(n, a.value);
          }
        }
        while (el.firstChild) box.appendChild(el.firstChild);
        return box;
      };
      // querySelectorAll('*') returns descendants only — a custom-element
      // slide root (<my-slide>…</my-slide>) would slip through and upgrade
      // on append. Swap the root first.
      if (clone.tagName.includes('-')) clone = neuter(clone);
      clone.querySelectorAll('*').forEach(el => {
        if (el.tagName.includes('-')) el.replaceWith(neuter(el));
      });
      clone.style.cssText += ';position:absolute;top:0;left:0;transform-origin:0 0;' + 'pointer-events:none;width:' + dw + 'px;height:' + dh + 'px;' + 'box-sizing:border-box;overflow:hidden;visibility:visible;opacity:1;';
      const host = document.createElement('div');
      host.style.cssText = 'position:absolute;inset:0;';
      this._syncThumbHostAttrs(host);
      const sr = host.attachShadow({
        mode: 'open'
      });
      if (this._adoptedSheet) sr.adoptedStyleSheets = [this._adoptedSheet];else {
        const st = document.createElement('style');
        st.textContent = this._authorCss || '';
        sr.appendChild(st);
      }
      sr.appendChild(clone);
      entry.frame.appendChild(host);
      entry.host = host;
      entry.clone = clone;
      if (this._thumbScale) clone.style.transform = 'scale(' + this._thumbScale + ')';
      // Once materialized the IO callback is a no-op early-return —
      // unobserve so scroll doesn't keep firing it.
      if (this._railObserver) this._railObserver.unobserve(entry.frame);
    }

    /** Re-clone a single thumb (live-update path). No-op if the thumb
     *  hasn't been materialized yet — it'll pick up current content when
     *  it scrolls into view. */
    _refreshThumb(slide) {
      const entry = (this._thumbs || []).find(t => t.slide === slide);
      if (!entry || !entry.host) return;
      entry.host.remove();
      entry.host = entry.clone = null;
      this._materialize(entry);
    }
    _scaleThumbs() {
      if (!this._thumbs || !this._thumbs.length) return;
      // Every frame is the same width; if it reads 0 the rail is
      // display:none (noscale / no-rail / presenting / print) — leave the
      // clones as-is and re-run when the rail is revealed.
      const fw = this._thumbs[0].frame.offsetWidth;
      if (!fw) return;
      this._thumbScale = fw / this.designWidth;
      this._thumbs.forEach(({
        clone
      }) => {
        if (clone) clone.style.transform = 'scale(' + this._thumbScale + ')';
      });
    }
    _setDrop(i, where) {
      // dragover fires at pointer-event rate; touch only the previous
      // and new target rather than sweeping all N thumbs.
      const t = this._thumbs && this._thumbs[i];
      if (this._dropOn && this._dropOn !== t) {
        this._dropOn.thumb.removeAttribute('data-drop');
      }
      if (t) t.thumb.setAttribute('data-drop', where);
      this._dropOn = t || null;
    }
    _clearDrop() {
      if (this._dropOn) this._dropOn.thumb.removeAttribute('data-drop');
      this._dropOn = null;
    }
    _syncRail(follow) {
      if (!this._thumbs) return;
      this._thumbs.forEach(({
        thumb
      }, i) => {
        if (i === this._index) {
          thumb.setAttribute('data-current', '');
          if (follow && typeof thumb.scrollIntoView === 'function') {
            thumb.scrollIntoView({
              block: 'nearest'
            });
          }
        } else {
          thumb.removeAttribute('data-current');
        }
      });
    }
    _openMenu(i, x, y) {
      if (!this._menu) return;
      this._menuIndex = i;
      const slide = this._slides[i];
      const skip = slide && slide.hasAttribute('data-deck-skip');
      this._menu.querySelector('[data-act="skip"]').textContent = skip ? 'Unskip slide' : 'Skip slide';
      this._menu.querySelector('[data-act="up"]').disabled = i <= 0;
      this._menu.querySelector('[data-act="down"]').disabled = i >= this._slides.length - 1;
      this._menu.querySelector('[data-act="delete"]').disabled = this._slides.length <= 1;
      // Place, then clamp to viewport after it's measurable.
      this._menu.style.left = x + 'px';
      this._menu.style.top = y + 'px';
      this._menu.setAttribute('data-open', '');
      const r = this._menu.getBoundingClientRect();
      const nx = Math.min(x, window.innerWidth - r.width - 4);
      const ny = Math.min(y, window.innerHeight - r.height - 4);
      this._menu.style.left = Math.max(4, nx) + 'px';
      this._menu.style.top = Math.max(4, ny) + 'px';
    }
    _closeMenu() {
      if (this._menu) this._menu.removeAttribute('data-open');
      this._menuIndex = -1;
    }
    _openConfirm(i) {
      if (!this._confirm) return;
      this._confirmIndex = i;
      this._confirm.querySelector('.title').textContent = 'Delete slide ' + (i + 1) + '?';
      this._confirm.setAttribute('data-open', '');
      const btn = this._confirm.querySelector('.danger');
      if (btn && btn.focus) btn.focus();
    }
    _closeConfirm() {
      if (this._confirm) this._confirm.removeAttribute('data-open');
      this._confirmIndex = -1;
    }
    _emitDeckChange(detail) {
      this.dispatchEvent(new CustomEvent('deckchange', {
        detail,
        bubbles: true,
        composed: true
      }));
    }
    _deleteSlide(i) {
      const slide = this._slides[i];
      if (!slide || this._slides.length <= 1) return;
      const wasCurrent = i === this._index;
      if (i < this._index || wasCurrent && i === this._slides.length - 1) this._index--;
      this._squelchSlotChange = true;
      slide.remove();
      this._emitDeckChange({
        action: 'delete',
        from: i,
        slide
      });
      this._collectSlides();
      this._applyIndex({
        showOverlay: true,
        broadcast: true,
        reason: 'mutation'
      });
    }
    _toggleSkip(i) {
      const slide = this._slides[i];
      if (!slide) return;
      const on = !slide.hasAttribute('data-deck-skip');
      if (on) slide.setAttribute('data-deck-skip', '');else slide.removeAttribute('data-deck-skip');
      if (this._thumbs && this._thumbs[i]) {
        if (on) this._thumbs[i].thumb.setAttribute('data-skip', '');else this._thumbs[i].thumb.removeAttribute('data-skip');
      }
      this._markLastVisible();
      this._emitDeckChange({
        action: on ? 'skip' : 'unskip',
        from: i,
        slide
      });
      // Re-broadcast so the presenter popup's prev/next thumbnails re-pick
      // the nearest non-skipped slide without waiting for a nav event.
      try {
        window.postMessage({
          slideIndexChanged: this._index,
          deckTotal: this._slides.length,
          deckSkipped: this._skippedIndices()
        }, '*');
      } catch (e) {}
    }
    _skippedIndices() {
      const out = [];
      for (let i = 0; i < this._slides.length; i++) {
        if (this._slides[i].hasAttribute('data-deck-skip')) out.push(i);
      }
      return out;
    }
    _moveSlide(i, j) {
      if (j < 0 || j >= this._slides.length || j === i) return;
      const slide = this._slides[i];
      const ref = j < i ? this._slides[j] : this._slides[j].nextSibling;
      // Track the active slide across the reorder so the same content
      // stays on screen.
      const cur = this._index;
      if (cur === i) this._index = j;else if (i < cur && j >= cur) this._index = cur - 1;else if (i > cur && j <= cur) this._index = cur + 1;
      this._squelchSlotChange = true;
      this.insertBefore(slide, ref);
      this._emitDeckChange({
        action: 'move',
        from: i,
        to: j,
        slide
      });
      this._collectSlides();
      this._applyIndex({
        showOverlay: false,
        broadcast: true,
        reason: 'mutation'
      });
    }

    // Public API ------------------------------------------------------------

    /** Current slide index (0-based). */
    get index() {
      return this._index;
    }
    /** Total slide count. */
    get length() {
      return this._slides.length;
    }
    /** Programmatically navigate. */
    goTo(i) {
      this._go(i, 'api');
    }
    next() {
      this._advance(1, 'api');
    }
    prev() {
      this._advance(-1, 'api');
    }
    reset() {
      this._go(0, 'api');
    }
  }
  if (!customElements.get('deck-stage')) {
    customElements.define('deck-stage', DeckStage);
  }
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "slides/deck-stage.js", error: String((e && e.message) || e) }); }

// slides/image-slot.js
try { (() => {
/**
 * <image-slot> — user-fillable image placeholder.
 *
 * Drop this into a deck, mockup, or page wherever you want the user to
 * supply an image. You control the slot's shape and size; the user fills it
 * by dragging an image file onto it (or clicking to browse). The dropped
 * image persists across reloads via a .image-slots.state.json sidecar —
 * same read-via-fetch / write-via-window.omelette pattern as
 * design_canvas.jsx, so the filled slot shows on share links, downloaded
 * zips, and PPTX export. Outside the omelette runtime the slot is read-only.
 *
 * The host bridge only allows sidecar writes at the project root, so the
 * HTML that uses this component is assumed to live at the project root too
 * (same constraint as design_canvas.jsx).
 *
 * Attributes:
 *   id           Persistence key. REQUIRED for the drop to survive reload —
 *                every slot on the page needs a distinct id.
 *   shape        'rect' | 'rounded' | 'circle' | 'pill'   (default 'rounded')
 *                'circle' applies 50% border-radius; on a non-square slot
 *                that's an ellipse — set equal width and height for a true
 *                circle.
 *   radius       Corner radius in px for 'rounded'.       (default 12)
 *   mask         Any CSS clip-path value. Overrides `shape` — use this for
 *                hexagons, blobs, arbitrary polygons.
 *   fit          object-fit: cover | contain | fill.       (default 'cover')
 *                With cover (the default) double-clicking the filled slot
 *                enters a reframe mode: the whole image spills past the mask
 *                (translucent outside, opaque inside), drag to reposition,
 *                corner-drag to scale. The crop persists alongside the image
 *                in the sidecar. contain/fill stay static.
 *   position     object-position for fit=contain|fill.     (default '50% 50%')
 *   placeholder  Empty-state caption.                      (default 'Drop an image')
 *   src          Optional initial/fallback image URL. A user drop overrides
 *                it; clearing the drop reveals src again.
 *
 * Size and layout come from ordinary CSS on the element — width/height
 * inline or from a parent grid — so it composes with any layout.
 *
 * Usage:
 *   <script src="image-slot.js"></script>
 *   <image-slot id="hero"   style="width:800px;height:450px" shape="rounded" radius="20"
 *               placeholder="Drop a hero image"></image-slot>
 *   <image-slot id="avatar" style="width:120px;height:120px" shape="circle"></image-slot>
 *   <image-slot id="kite"   style="width:300px;height:300px"
 *               mask="polygon(50% 0, 100% 50%, 50% 100%, 0 50%)"></image-slot>
 */

(() => {
  const STATE_FILE = '.image-slots.state.json';
  // 2× a ~600px slot in a 1920-wide deck — retina-sharp without making the
  // sidecar enormous. A 1200px WebP at q=0.85 is ~150-300KB.
  const MAX_DIM = 1200;
  // Raster formats only. SVG is excluded (can carry script; createImageBitmap
  // on SVG blobs is inconsistent). GIF is excluded because the canvas
  // re-encode keeps only the first frame, so an animated GIF would silently
  // go still — better to reject than surprise.
  const ACCEPT = ['image/png', 'image/jpeg', 'image/webp', 'image/avif'];

  // ── Shared sidecar store ────────────────────────────────────────────────
  // One fetch + immediate write-on-change for every <image-slot> on the
  // page. Reads via fetch() so viewing works anywhere the HTML and sidecar
  // are served together; writes go through window.omelette.writeFile, which
  // the host allowlists to *.state.json basenames only.
  const subs = new Set();
  let slots = {};
  // ids explicitly cleared before the sidecar fetch resolved — otherwise
  // the merge below can't tell "never set" from "just deleted" and would
  // resurrect the sidecar's stale value.
  const tombstones = new Set();
  let loaded = false;
  let loadP = null;
  function load() {
    if (loadP) return loadP;
    loadP = fetch(STATE_FILE).then(r => r.ok ? r.json() : null).then(j => {
      // Merge: sidecar loses to any in-memory change that raced ahead of
      // the fetch (drop or clear) so neither is clobbered by hydration.
      if (j && typeof j === 'object') {
        const merged = Object.assign({}, j, slots);
        // A framing-only write that raced ahead of hydration must not
        // drop a user image that's only on disk — inherit u from the
        // sidecar for any in-memory entry that lacks one.
        for (const k in slots) {
          if (merged[k] && !merged[k].u && j[k]) {
            merged[k].u = typeof j[k] === 'string' ? j[k] : j[k].u;
          }
        }
        for (const id of tombstones) delete merged[id];
        slots = merged;
      }
      tombstones.clear();
    }).catch(() => {}).then(() => {
      loaded = true;
      subs.forEach(fn => fn());
    });
    return loadP;
  }

  // Serialize writes so two near-simultaneous drops on different slots
  // can't reorder at the backend and leave the sidecar with only the
  // first. A save requested mid-flight just marks dirty and re-fires on
  // completion with the then-current slots.
  let saving = false;
  let saveDirty = false;
  function save() {
    if (saving) {
      saveDirty = true;
      return;
    }
    const w = window.omelette && window.omelette.writeFile;
    if (!w) return;
    saving = true;
    Promise.resolve(w(STATE_FILE, JSON.stringify(slots))).catch(() => {}).then(() => {
      saving = false;
      if (saveDirty) {
        saveDirty = false;
        save();
      }
    });
  }
  const S_MAX = 5;
  const clampS = s => Math.max(1, Math.min(S_MAX, s));

  // Normalize a stored slot value. Pre-reframe sidecars stored a bare
  // data-URL string; newer ones store {u, s, x, y}. Either shape is valid.
  function getSlot(id) {
    const v = slots[id];
    if (!v) return null;
    return typeof v === 'string' ? {
      u: v,
      s: 1,
      x: 0,
      y: 0
    } : v;
  }
  function setSlot(id, val) {
    if (!id) return;
    if (val) {
      slots[id] = val;
      tombstones.delete(id);
    } else {
      delete slots[id];
      if (!loaded) tombstones.add(id);
    }
    subs.forEach(fn => fn());
    // A drop is rare + high-value — write immediately so nav-away can't lose
    // it. Gate on the initial read so we don't overwrite a sidecar we haven't
    // merged yet; the merge in load() keeps this change once the read lands.
    if (loaded) save();else load().then(save);
  }

  // ── Image downscale ─────────────────────────────────────────────────────
  // Encode through a canvas so the sidecar carries resized bytes, not the
  // raw upload. Longest side is capped at 2× the slot's rendered width
  // (retina) and at MAX_DIM. WebP keeps alpha and is ~10× smaller than PNG
  // for photos, so there's no need for per-image format picking.
  async function toDataUrl(file, targetW) {
    const bitmap = await createImageBitmap(file);
    try {
      const cap = Math.min(MAX_DIM, Math.max(1, Math.round(targetW * 2)) || MAX_DIM);
      const scale = Math.min(1, cap / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
      return canvas.toDataURL('image/webp', 0.85);
    } finally {
      bitmap.close && bitmap.close();
    }
  }

  // ── Custom element ──────────────────────────────────────────────────────
  const stylesheet = ':host{display:inline-block;position:relative;vertical-align:top;' + '  font:13px/1.3 system-ui,-apple-system,sans-serif;color:rgba(0,0,0,.55);width:240px;height:160px}' + '.frame{position:absolute;inset:0;overflow:hidden;background:rgba(0,0,0,.04)}' +
  // .frame img (clipped) and .spill (unclipped ghost + handles) share the
  // same left/top/width/height in frame-%, computed by _applyView(), so the
  // inside-mask crop and the outside-mask spill stay pixel-aligned.
  '.frame img{position:absolute;max-width:none;transform:translate(-50%,-50%);' + '  -webkit-user-drag:none;user-select:none;touch-action:none}' +
  // Reframe mode (double-click): the full image spills past the mask. The
  // spill layer is sized to the IMAGE bounds so its corners are where the
  // resize handles belong. The ghost <img> inside is translucent; the real
  // clipped <img> underneath shows the opaque in-mask crop.
  '.spill{position:absolute;transform:translate(-50%,-50%);display:none;z-index:1;' + '  cursor:grab;touch-action:none}' + ':host([data-panning]) .spill{cursor:grabbing}' + '.spill .ghost{position:absolute;inset:0;width:100%;height:100%;opacity:.35;' + '  pointer-events:none;-webkit-user-drag:none;user-select:none;' + '  box-shadow:0 0 0 1px rgba(0,0,0,.2),0 12px 32px rgba(0,0,0,.2)}' + '.spill .handle{position:absolute;width:12px;height:12px;border-radius:50%;' + '  background:#fff;box-shadow:0 0 0 1.5px #c96442,0 1px 3px rgba(0,0,0,.3);' + '  transform:translate(-50%,-50%)}' + '.spill .handle[data-c=nw]{left:0;top:0;cursor:nwse-resize}' + '.spill .handle[data-c=ne]{left:100%;top:0;cursor:nesw-resize}' + '.spill .handle[data-c=sw]{left:0;top:100%;cursor:nesw-resize}' + '.spill .handle[data-c=se]{left:100%;top:100%;cursor:nwse-resize}' + ':host([data-reframe]){z-index:10}' + ':host([data-reframe]) .spill{display:block}' + ':host([data-reframe]) .frame{box-shadow:0 0 0 2px #c96442}' + '.empty{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;' + '  justify-content:center;gap:6px;text-align:center;padding:12px;box-sizing:border-box;' + '  cursor:pointer;user-select:none}' + '.empty svg{opacity:.45}' + '.empty .cap{max-width:90%;font-weight:500;letter-spacing:.01em}' + '.empty .sub{font-size:11px}' + '.empty .sub u{text-underline-offset:2px;text-decoration-color:rgba(0,0,0,.25)}' + '.empty:hover .sub u{color:rgba(0,0,0,.75);text-decoration-color:currentColor}' + ':host([data-over]) .frame{outline:2px solid #c96442;outline-offset:-2px;' + '  background:rgba(201,100,66,.10)}' + '.ring{position:absolute;inset:0;pointer-events:none;border:1.5px dashed rgba(0,0,0,.25);' + '  transition:border-color .12s}' + ':host([data-over]) .ring{border-color:#c96442}' + ':host([data-filled]) .ring{display:none}' +
  // Controls sit BELOW the mask (top:100%), absolutely positioned so the
  // author-declared slot height is unaffected. The gap is padding, not a
  // top offset, so the hover target stays contiguous with the frame.
  '.ctl{position:absolute;top:100%;left:50%;transform:translateX(-50%);padding-top:8px;' + '  display:flex;gap:6px;opacity:0;pointer-events:none;transition:opacity .12s;z-index:2;' + '  white-space:nowrap}' + ':host([data-filled][data-editable]:hover) .ctl,:host([data-reframe]) .ctl' + '  {opacity:1;pointer-events:auto}' + '.ctl button{appearance:none;border:0;border-radius:6px;padding:5px 10px;cursor:pointer;' + '  background:rgba(0,0,0,.65);color:#fff;font:11px/1 system-ui,-apple-system,sans-serif;' + '  backdrop-filter:blur(6px)}' + '.ctl button:hover{background:rgba(0,0,0,.8)}' + '.err{position:absolute;left:8px;bottom:8px;right:8px;color:#b3261e;font-size:11px;' + '  background:rgba(255,255,255,.85);padding:4px 6px;border-radius:5px;pointer-events:none}';
  const icon = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' + 'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>' + '<path d="m21 15-5-5L5 21"/></svg>';
  class ImageSlot extends HTMLElement {
    static get observedAttributes() {
      return ['shape', 'radius', 'mask', 'fit', 'position', 'placeholder', 'src', 'id'];
    }
    constructor() {
      super();
      const root = this.attachShadow({
        mode: 'open'
      });
      // .spill and .ctl sit OUTSIDE .frame so overflow:hidden + border-radius
      // on the frame (circle, pill, rounded) can't clip them.
      root.innerHTML = '<style>' + stylesheet + '</style>' + '<div class="frame" part="frame">' + '  <img part="image" alt="" draggable="false" style="display:none">' + '  <div class="empty" part="empty">' + icon + '    <div class="cap"></div>' + '    <div class="sub">or <u>browse files</u></div></div>' + '  <div class="ring" part="ring"></div>' + '</div>' + '<div class="spill">' + '  <img class="ghost" alt="" draggable="false">' + '  <div class="handle" data-c="nw"></div><div class="handle" data-c="ne"></div>' + '  <div class="handle" data-c="sw"></div><div class="handle" data-c="se"></div>' + '</div>' + '<div class="ctl"><button data-act="replace" title="Replace image">Replace</button>' + '  <button data-act="clear" title="Remove image">Remove</button></div>' + '<input type="file" accept="' + ACCEPT.join(',') + '" hidden>';
      this._frame = root.querySelector('.frame');
      this._ring = root.querySelector('.ring');
      this._img = root.querySelector('.frame img');
      this._empty = root.querySelector('.empty');
      this._cap = root.querySelector('.cap');
      this._sub = root.querySelector('.sub');
      this._spill = root.querySelector('.spill');
      this._ghost = root.querySelector('.ghost');
      this._err = null;
      this._input = root.querySelector('input');
      this._depth = 0;
      this._gen = 0;
      this._view = {
        s: 1,
        x: 0,
        y: 0
      };
      this._subFn = () => this._render();
      // Shadow-DOM listeners live with the shadow DOM — bound once here so
      // disconnect/reconnect (e.g. React remount) doesn't stack handlers.
      this._empty.addEventListener('click', () => this._input.click());
      root.addEventListener('click', e => {
        const act = e.target && e.target.getAttribute && e.target.getAttribute('data-act');
        if (act === 'replace') {
          this._exitReframe(true);
          this._input.click();
        }
        if (act === 'clear') {
          this._exitReframe(false);
          this._gen++;
          this._local = null;
          if (this.id) setSlot(this.id, null);else this._render();
        }
      });
      this._input.addEventListener('change', () => {
        const f = this._input.files && this._input.files[0];
        if (f) this._ingest(f);
        this._input.value = '';
      });
      // naturalWidth/Height aren't known until load — re-apply so the cover
      // baseline is computed from real dimensions, not the 100%×100% fallback.
      this._img.addEventListener('load', () => this._applyView());
      // Gated on editable + fit=cover so share links and contain/fill slots
      // stay static.
      this.addEventListener('dblclick', e => {
        if (!this.hasAttribute('data-editable') || !this._reframes()) return;
        e.preventDefault();
        if (this.hasAttribute('data-reframe')) this._exitReframe(true);else this._enterReframe();
      });
      // Pan + resize both originate on the spill layer. A handle pointerdown
      // drives an aspect-locked resize anchored at the opposite corner; any
      // other pointerdown on the spill pans. Offsets are frame-% so a
      // reframed slot survives responsive resize / PPTX export.
      this._spill.addEventListener('pointerdown', e => {
        if (e.button !== 0 || !this.hasAttribute('data-reframe')) return;
        e.preventDefault();
        e.stopPropagation();
        this._spill.setPointerCapture(e.pointerId);
        const rect = this.getBoundingClientRect();
        const fw = rect.width || 1,
          fh = rect.height || 1;
        const corner = e.target.getAttribute && e.target.getAttribute('data-c');
        let move;
        if (corner) {
          // Resize about the OPPOSITE corner. Viewport-px throughout (rect
          // fw/fh, not clientWidth) so the math survives a transform:scale()
          // ancestor — deck_stage renders slides scaled-to-fit.
          const iw = this._img.naturalWidth || 1,
            ih = this._img.naturalHeight || 1;
          const base = Math.max(fw / iw, fh / ih);
          const sx = corner.includes('e') ? 1 : -1;
          const sy = corner.includes('s') ? 1 : -1;
          const s0 = this._view.s;
          const w0 = iw * base * s0,
            h0 = ih * base * s0;
          const cx0 = (50 + this._view.x) / 100 * fw;
          const cy0 = (50 + this._view.y) / 100 * fh;
          const ox = cx0 - sx * w0 / 2,
            oy = cy0 - sy * h0 / 2;
          const diag0 = Math.hypot(w0, h0);
          const ux = sx * w0 / diag0,
            uy = sy * h0 / diag0;
          move = ev => {
            const proj = (ev.clientX - rect.left - ox) * ux + (ev.clientY - rect.top - oy) * uy;
            const s = clampS(s0 * proj / diag0);
            const d = diag0 * s / s0;
            this._view.s = s;
            this._view.x = (ox + ux * d / 2) / fw * 100 - 50;
            this._view.y = (oy + uy * d / 2) / fh * 100 - 50;
            this._clampView();
            this._applyView();
          };
        } else {
          this.setAttribute('data-panning', '');
          const start = {
            px: e.clientX,
            py: e.clientY,
            x: this._view.x,
            y: this._view.y
          };
          move = ev => {
            this._view.x = start.x + (ev.clientX - start.px) / fw * 100;
            this._view.y = start.y + (ev.clientY - start.py) / fh * 100;
            this._clampView();
            this._applyView();
          };
        }
        const up = () => {
          try {
            this._spill.releasePointerCapture(e.pointerId);
          } catch {}
          this._spill.removeEventListener('pointermove', move);
          this._spill.removeEventListener('pointerup', up);
          this._spill.removeEventListener('pointercancel', up);
          this.removeAttribute('data-panning');
          this._dragUp = null;
        };
        // Stashed so _exitReframe (Escape / outside-click mid-drag) can
        // tear the capture + listeners down synchronously.
        this._dragUp = up;
        this._spill.addEventListener('pointermove', move);
        this._spill.addEventListener('pointerup', up);
        this._spill.addEventListener('pointercancel', up);
      });
      // Wheel zoom stays available inside reframe mode as a trackpad nicety —
      // zooms toward the cursor (offset' = cursor·(1-k) + offset·k).
      this.addEventListener('wheel', e => {
        if (!this.hasAttribute('data-reframe')) return;
        e.preventDefault();
        const r = this.getBoundingClientRect();
        const cx = (e.clientX - r.left) / r.width * 100 - 50;
        const cy = (e.clientY - r.top) / r.height * 100 - 50;
        const prev = this._view.s;
        const next = clampS(prev * Math.pow(1.0015, -e.deltaY));
        if (next === prev) return;
        const k = next / prev;
        this._view.s = next;
        this._view.x = cx * (1 - k) + this._view.x * k;
        this._view.y = cy * (1 - k) + this._view.y * k;
        this._clampView();
        this._applyView();
      }, {
        passive: false
      });
    }
    connectedCallback() {
      // Warn once per page — an id-less slot works for the session but
      // cannot persist, and two id-less slots would share nothing.
      if (!this.id && !ImageSlot._warned) {
        ImageSlot._warned = true;
        console.warn('<image-slot> without an id will not persist its dropped image.');
      }
      this.addEventListener('dragenter', this);
      this.addEventListener('dragover', this);
      this.addEventListener('dragleave', this);
      this.addEventListener('drop', this);
      subs.add(this._subFn);
      // width%/height% in _applyView encode the frame aspect at call time —
      // a host resize (responsive grid, pane divider) would stretch the
      // image until the next _render. Re-render on size change: _render()
      // re-seeds _view from stored before clamp/apply, so a shrink→grow
      // cycle round-trips instead of ratcheting x/y toward the narrower
      // frame's clamp range.
      this._ro = new ResizeObserver(() => this._render());
      this._ro.observe(this);
      load();
      this._render();
    }
    disconnectedCallback() {
      subs.delete(this._subFn);
      this.removeEventListener('dragenter', this);
      this.removeEventListener('dragover', this);
      this.removeEventListener('dragleave', this);
      this.removeEventListener('drop', this);
      if (this._ro) {
        this._ro.disconnect();
        this._ro = null;
      }
      this._exitReframe(false);
    }
    _enterReframe() {
      if (this.hasAttribute('data-reframe')) return;
      this.setAttribute('data-reframe', '');
      this._applyView();
      // Close on click outside (the spill handler stopPropagation()s so
      // in-image drags don't reach this) and on Escape. Listeners are held
      // on the instance so _exitReframe / disconnectedCallback can detach
      // exactly what was attached.
      this._outside = e => {
        if (e.composedPath && e.composedPath().includes(this)) return;
        this._exitReframe(true);
      };
      this._esc = e => {
        if (e.key === 'Escape') this._exitReframe(true);
      };
      document.addEventListener('pointerdown', this._outside, true);
      document.addEventListener('keydown', this._esc, true);
    }
    _exitReframe(commit) {
      if (!this.hasAttribute('data-reframe')) return;
      if (this._dragUp) this._dragUp();
      this.removeAttribute('data-reframe');
      this.removeAttribute('data-panning');
      if (this._outside) document.removeEventListener('pointerdown', this._outside, true);
      if (this._esc) document.removeEventListener('keydown', this._esc, true);
      this._outside = this._esc = null;
      if (commit) this._commitView();
    }
    attributeChangedCallback() {
      if (this.shadowRoot) this._render();
    }

    // handleEvent — one listener object for all four drag events keeps the
    // add/remove symmetric and the depth counter correct.
    handleEvent(e) {
      if (e.type === 'dragenter' || e.type === 'dragover') {
        // Without preventDefault the browser never fires 'drop'.
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        if (e.type === 'dragenter') this._depth++;
        this.setAttribute('data-over', '');
      } else if (e.type === 'dragleave') {
        // dragenter/leave fire for every descendant crossing — count depth
        // so hovering the icon inside the empty state doesn't flicker.
        if (--this._depth <= 0) {
          this._depth = 0;
          this.removeAttribute('data-over');
        }
      } else if (e.type === 'drop') {
        e.preventDefault();
        e.stopPropagation();
        this._depth = 0;
        this.removeAttribute('data-over');
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) this._ingest(f);
      }
    }
    async _ingest(file) {
      this._setError(null);
      if (!file || ACCEPT.indexOf(file.type) < 0) {
        this._setError('Drop a PNG, JPEG, WebP, or AVIF image.');
        return;
      }
      // toDataUrl can take hundreds of ms on a large photo. A Clear or a
      // newer drop during that window would be clobbered when this await
      // resumes — bump + capture a generation so stale encodes bail.
      const gen = ++this._gen;
      try {
        const w = this.clientWidth || this.offsetWidth || MAX_DIM;
        const url = await toDataUrl(file, w);
        if (gen !== this._gen) return;
        // Only exit reframe once the new image is in hand — a rejected type
        // or decode failure leaves the in-progress crop untouched.
        this._exitReframe(false);
        const val = {
          u: url,
          s: 1,
          x: 0,
          y: 0
        };
        setSlot(this.id || '', val);
        // Keep a session-local copy for id-less slots so the drop still
        // shows, even though it cannot persist.
        if (!this.id) {
          this._local = val;
          this._render();
        }
      } catch (err) {
        if (gen !== this._gen) return;
        this._setError('Could not read that image.');
        console.warn('<image-slot> ingest failed:', err);
      }
    }
    _setError(msg) {
      if (this._err) {
        this._err.remove();
        this._err = null;
      }
      if (!msg) return;
      const d = document.createElement('div');
      d.className = 'err';
      d.textContent = msg;
      this.shadowRoot.appendChild(d);
      this._err = d;
      setTimeout(() => {
        if (this._err === d) {
          d.remove();
          this._err = null;
        }
      }, 3000);
    }

    // Reframing (pan/resize) is only meaningful for fit=cover — contain/fill
    // keep the old object-fit path and double-click is a no-op.
    _reframes() {
      return this.hasAttribute('data-filled') && (this.getAttribute('fit') || 'cover') === 'cover';
    }

    // Cover-baseline geometry, shared by clamp/apply/resize. Null until the
    // img has loaded (naturalWidth is 0 before that) or when the slot has no
    // layout box — ResizeObserver fires with a 0×0 rect under display:none,
    // and clamping against a degenerate 1×1 frame would silently pull the
    // stored pan toward zero.
    _geom() {
      const iw = this._img.naturalWidth,
        ih = this._img.naturalHeight;
      const fw = this.clientWidth,
        fh = this.clientHeight;
      if (!iw || !ih || !fw || !fh) return null;
      return {
        iw,
        ih,
        fw,
        fh,
        base: Math.max(fw / iw, fh / ih)
      };
    }
    _clampView() {
      // Pan range on each axis is half the overflow past the frame edge.
      const g = this._geom();
      if (!g) return;
      const mx = Math.max(0, (g.iw * g.base * this._view.s / g.fw - 1) * 50);
      const my = Math.max(0, (g.ih * g.base * this._view.s / g.fh - 1) * 50);
      this._view.x = Math.max(-mx, Math.min(mx, this._view.x));
      this._view.y = Math.max(-my, Math.min(my, this._view.y));
    }
    _applyView() {
      const g = this._geom();
      const fit = this.getAttribute('fit') || 'cover';
      if (fit !== 'cover' || !g) {
        // Non-cover, or dimensions not known yet (before img load).
        this._img.style.width = '100%';
        this._img.style.height = '100%';
        this._img.style.left = '50%';
        this._img.style.top = '50%';
        this._img.style.objectFit = fit;
        this._img.style.objectPosition = this.getAttribute('position') || '50% 50%';
        return;
      }
      // Cover baseline: img fills the frame on its tighter axis at s=1, so
      // pan works immediately on the overflowing axis without zooming first.
      // Width/height and left/top are all frame-% — depends only on the
      // frame aspect ratio, so a responsive resize keeps the same crop. The
      // spill layer mirrors the same box so its corners = image corners.
      const k = g.base * this._view.s;
      const w = g.iw * k / g.fw * 100 + '%';
      const h = g.ih * k / g.fh * 100 + '%';
      const l = 50 + this._view.x + '%';
      const t = 50 + this._view.y + '%';
      this._img.style.width = w;
      this._img.style.height = h;
      this._img.style.left = l;
      this._img.style.top = t;
      this._img.style.objectFit = '';
      this._spill.style.width = w;
      this._spill.style.height = h;
      this._spill.style.left = l;
      this._spill.style.top = t;
    }
    _commitView() {
      const v = {
        s: this._view.s,
        x: this._view.x,
        y: this._view.y
      };
      if (this._userUrl) v.u = this._userUrl;
      // Framing-only (no u) persists too so an author-src slot remembers its
      // crop; clearing the sidecar still falls through to src=.
      if (this.id) setSlot(this.id, v);else {
        this._local = v;
      }
    }
    _render() {
      // Shape / mask. Presets use border-radius so the dashed ring can
      // follow the rounded outline; clip-path is only applied for an
      // explicit `mask` (the ring is hidden there since a rectangle
      // dashed border chopped by an arbitrary polygon looks broken).
      const mask = this.getAttribute('mask');
      const shape = (this.getAttribute('shape') || 'rounded').toLowerCase();
      let radius = '';
      if (shape === 'circle') radius = '50%';else if (shape === 'pill') radius = '9999px';else if (shape === 'rounded') {
        const n = parseFloat(this.getAttribute('radius'));
        radius = (Number.isFinite(n) ? n : 12) + 'px';
      }
      this._frame.style.borderRadius = mask ? '' : radius;
      this._frame.style.clipPath = mask || '';
      this._ring.style.borderRadius = mask ? '' : radius;
      this._ring.style.display = mask ? 'none' : '';

      // Controls and reframe entry gate on this so share links stay read-only.
      const editable = !!(window.omelette && window.omelette.writeFile);
      this.toggleAttribute('data-editable', editable);
      this._sub.style.display = editable ? '' : 'none';

      // Content. The sidecar is also writable by the agent's write_file
      // tool, so its value isn't guaranteed canvas-originated — only accept
      // data:image/ URLs from it. The `src` attribute is author-controlled
      // (Claude wrote it into the HTML) so it passes through unchanged.
      let stored = this.id ? getSlot(this.id) : this._local;
      if (stored && stored.u && !/^data:image\//i.test(stored.u)) stored = null;
      const srcAttr = this.getAttribute('src') || '';
      this._userUrl = stored && stored.u || null;
      const url = this._userUrl || srcAttr;
      // Don't clobber an in-flight reframe with a store-triggered re-render.
      if (!this.hasAttribute('data-reframe')) {
        this._view = {
          s: stored && Number.isFinite(stored.s) ? clampS(stored.s) : 1,
          x: stored && Number.isFinite(stored.x) ? stored.x : 0,
          y: stored && Number.isFinite(stored.y) ? stored.y : 0
        };
      }
      this._cap.textContent = this.getAttribute('placeholder') || 'Drop an image';
      // Toggle via style.display — the [hidden] attribute alone loses to
      // the display:flex / display:block rules in the stylesheet above.
      if (url) {
        if (this._img.getAttribute('src') !== url) {
          this._img.src = url;
          this._ghost.src = url;
        }
        this._img.style.display = 'block';
        this._empty.style.display = 'none';
        this.setAttribute('data-filled', '');
        this._clampView();
        this._applyView();
      } else {
        this._img.style.display = 'none';
        this._img.removeAttribute('src');
        this._ghost.removeAttribute('src');
        this._empty.style.display = 'flex';
        this.removeAttribute('data-filled');
      }
    }
  }
  if (!customElements.get('image-slot')) {
    customElements.define('image-slot', ImageSlot);
  }
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "slides/image-slot.js", error: String((e && e.message) || e) }); }

// slides/layouts.js
try { (() => {
/**
 * Netskope Slide Template — Layout System ("New Slide from layout")
 *
 * Mirrors PowerPoint's slide-master/layout model on top of the HTML deck:
 *   • Every <section> in the deck is captured (pristine, at load) as a reusable
 *     LAYOUT BLUEPRINT, keyed by its data-screen-label.
 *   • A "＋ Slide" button opens a layout picker (grouped Dark / White / Light /
 *     Utility) — choosing one clones that blueprint in after the current slide.
 *   • "⧉ Duplicate" copies the current slide; "🗑 Slide" deletes it.
 *   • Inserted slides (and deletions of built-in slides) persist to localStorage
 *     and are replayed on load BEFORE builder.js restores per-element edits, so
 *     edits made to new slides survive a refresh.
 *
 * Loads with `defer` BEFORE builder.js so blueprint capture + replay happen
 * before the builder reads the DOM.
 */
(function () {
  'use strict';

  const INS_KEY = 'ns-inserted-v1'; // ordered list of inserted slides
  const HID_KEY = 'ns-hidden-v1'; // built-in slides the user deleted

  const deck = document.getElementById('deck');
  if (!deck) return;

  // ── blueprint capture (pristine, before any edits applied) ───────────────
  const blueprints = {}; // label -> outerHTML
  const order = []; // label list in document order (for picker grouping)
  Array.from(deck.querySelectorAll(':scope > section')).forEach(sec => {
    const label = sec.getAttribute('data-screen-label') || 'slide-' + order.length;
    if (!sec.getAttribute('data-screen-label')) sec.setAttribute('data-screen-label', label);
    blueprints[label] = cleanBlueprint(sec);
    order.push(label);
  });

  // Strip transient edit state from a section so clones start clean.
  function cleanBlueprint(sec) {
    const c = sec.cloneNode(true);
    c.removeAttribute('data-uid');
    c.removeAttribute('data-after');
    c.querySelectorAll('[data-key]').forEach(el => el.removeAttribute('data-key'));
    // image-slots reset to empty (drop any reflected saved value/attrs)
    c.querySelectorAll('image-slot').forEach(s => {
      ['value', 'saved', 'src'].forEach(a => s.removeAttribute(a));
    });
    return c.outerHTML;
  }

  // ── storage helpers ──────────────────────────────────────────────────────
  function load(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || '[]');
    } catch (e) {
      return [];
    }
  }
  function save(key, v) {
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch (e) {}
  }
  let inserted = load(INS_KEY); // [{uid, label, after, html}]
  let hidden = load(HID_KEY); // [label, ...]

  function refOf(sec) {
    return sec.getAttribute('data-uid') || sec.getAttribute('data-screen-label');
  }
  function sectionByRef(ref) {
    return deck.querySelector('[data-uid="' + cssEsc(ref) + '"]') || deck.querySelector('[data-screen-label="' + cssEsc(ref) + '"]');
  }
  function cssEsc(s) {
    return String(s).replace(/["\\]/g, '\\$&');
  }

  // Build a live, ready-to-insert <section> from stored HTML.
  function elFromHTML(html) {
    const w = document.createElement('div');
    w.innerHTML = html.trim();
    return w.firstElementChild;
  }

  // ── replay deletions + insertions (runs before builder boot) ─────────────
  function replay() {
    // 1. remove user-deleted built-in slides
    hidden.forEach(label => {
      const s = deck.querySelector('[data-screen-label="' + cssEsc(label) + '"]:not([data-uid])');
      if (s) s.remove();
    });
    // 2. re-inject inserted slides, in order, anchoring after their ref.
    //    Multiple passes handle chains (insert-after-an-insert).
    let pending = inserted.slice();
    let guard = 0;
    while (pending.length && guard++ < pending.length + 4) {
      const still = [];
      pending.forEach(rec => {
        const anchor = sectionByRef(rec.after);
        if (anchor) anchor.after(elFromHTML(rec.html));else still.push(rec);
      });
      if (still.length === pending.length) {
        // anchors missing (deleted) — append to end as fallback
        still.forEach(rec => deck.appendChild(elFromHTML(rec.html)));
        break;
      }
      pending = still;
    }
  }
  replay();

  // ── current-slide detection ──────────────────────────────────────────────
  function liveSlides() {
    return Array.from(deck.querySelectorAll(':scope > section'));
  }
  function currentIndex() {
    const slides = liveSlides();
    const mid = window.scrollY + window.innerHeight / 2;
    let best = 0,
      bestDist = Infinity;
    slides.forEach((s, n) => {
      const c = s.offsetTop + s.offsetHeight / 2;
      const d = Math.abs(c - mid);
      if (d < bestDist) {
        bestDist = d;
        best = n;
      }
    });
    return best;
  }

  // ── footer page-number renumber (visual position) ─────────────────────────
  function renumber() {
    liveSlides().forEach((sec, i) => {
      const pg = sec.querySelector('.footer .pg');
      if (pg) pg.textContent = i + 1;
    });
    const tot = document.getElementById('deck-tot');
    if (tot) tot.textContent = liveSlides().length;
  }

  // ── create a fresh, uniquely-keyed slide from a blueprint ─────────────────
  function freshSlide(label, sourceHTML) {
    const sec = elFromHTML(sourceHTML || blueprints[label]);
    const uid = 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    sec.setAttribute('data-uid', uid);
    sec.setAttribute('data-screen-label', (label || 'Slide') + ' · copy');
    let i = 0;
    sec.querySelectorAll('[data-edit], [contenteditable="true"]').forEach(el => {
      el.removeAttribute('data-key');
      el.dataset.key = uid + '-' + i++;
    });
    sec.querySelectorAll('image-slot').forEach((s, j) => {
      s.id = uid + '-slot' + j;
      ['value', 'saved', 'src'].forEach(a => s.removeAttribute(a));
    });
    return {
      sec,
      uid
    };
  }
  function insertAfter(anchorSec, label, sourceHTML) {
    const {
      sec,
      uid
    } = freshSlide(label, sourceHTML);
    anchorSec.after(sec);
    inserted.push({
      uid,
      label: label,
      after: refOf(anchorSec),
      html: sec.outerHTML
    });
    save(INS_KEY, inserted);
    renumber();
    requestAnimationFrame(() => {
      sec.scrollIntoView ? window.scrollTo({
        top: sec.offsetTop - 48,
        behavior: 'smooth'
      }) : null;
    });
    return sec;
  }

  // Keep a record's stored HTML in sync after the user edits a new slide, so a
  // refresh keeps both structure AND edits. (Edits are also keyed in builder
  // state; storing html is a belt-and-suspenders fallback.)
  function syncInsertedHTML(sec) {
    const uid = sec.getAttribute('data-uid');
    if (!uid) return;
    const rec = inserted.find(r => r.uid === uid);
    if (rec) {
      rec.html = sec.outerHTML;
      save(INS_KEY, inserted);
    }
  }
  function deleteSlide(sec) {
    const uid = sec.getAttribute('data-uid');
    if (uid) {
      inserted = inserted.filter(r => r.uid !== uid);
      save(INS_KEY, inserted);
    } else {
      const label = sec.getAttribute('data-screen-label');
      if (label && hidden.indexOf(label) === -1) {
        hidden.push(label);
        save(HID_KEY, hidden);
      }
    }
    sec.remove();
    renumber();
  }

  // ── picker UI ──────────────────────────────────────────────────────────────
  function familyOf(label) {
    if (/\(Dark\)/i.test(label)) return 'Dark Blue';
    if (/\(White\)/i.test(label)) return 'White';
    if (/\(Light\)/i.test(label)) return 'Light Blue';
    return 'Utility';
  }
  function pretty(label) {
    return label.replace(/^\d+\s*/, '').replace(/\s*\((Dark|White|Light)\)$/i, '').trim();
  }
  const FAM_ORDER = ['Dark Blue', 'White', 'Light Blue', 'Utility'];
  const FAM_CHIP = {
    'Dark Blue': '#081A59',
    'White': '#FFFFFF',
    'Light Blue': '#D9FAFF',
    'Utility': '#00A9CE'
  };
  let overlay = null;
  function openPicker() {
    if (overlay) {
      closePicker();
      return;
    }
    const anchorIdx = currentIndex();
    const anchorSec = liveSlides()[anchorIdx];
    overlay = document.createElement('div');
    overlay.id = 'ns-layout-picker';
    overlay.innerHTML = '<div class="nslp-panel" role="dialog" aria-label="Choose a slide layout">' + '<div class="nslp-head">' + '<div><div class="nslp-eyebrow">New slide</div>' + '<div class="nslp-title">Choose a layout</div></div>' + '<button class="nslp-x" title="Close">✕</button>' + '</div>' + '<div class="nslp-sub">Inserts after slide ' + (anchorIdx + 1) + '. The layout becomes the underlying template for the new slide.</div>' + '<div class="nslp-body"></div>' + '</div>';
    document.body.appendChild(overlay);
    const body = overlay.querySelector('.nslp-body');
    const byFam = {};
    order.forEach(label => {
      (byFam[familyOf(label)] = byFam[familyOf(label)] || []).push(label);
    });
    FAM_ORDER.forEach(fam => {
      if (!byFam[fam]) return;
      const group = document.createElement('div');
      group.className = 'nslp-group';
      group.innerHTML = '<div class="nslp-glabel"><span class="nslp-chip" style="background:' + FAM_CHIP[fam] + '"></span>' + fam + '</div>';
      const grid = document.createElement('div');
      grid.className = 'nslp-grid';
      byFam[fam].forEach(label => {
        const card = document.createElement('button');
        card.className = 'nslp-card nslp-fam-' + fam.replace(/\s/g, '');
        card.innerHTML = '<span class="nslp-thumb"><span class="nslp-mini"></span></span><span class="nslp-name">' + pretty(label) + '</span>';
        // Render a real, scaled-down preview of the blueprint into the thumb.
        const mini = card.querySelector('.nslp-mini');
        const src = elFromHTML(blueprints[label]);
        src.style.margin = '0';
        src.style.boxShadow = 'none';
        src.querySelectorAll('[contenteditable]').forEach(e => e.removeAttribute('contenteditable'));
        src.querySelectorAll('[id]').forEach(e => e.removeAttribute('id'));
        mini.appendChild(src);
        card.addEventListener('click', () => {
          insertAfter(anchorSec, label);
          closePicker();
        });
        grid.appendChild(card);
      });
      group.appendChild(grid);
      body.appendChild(group);
    });

    // Scale each mini-preview to fit its thumb (blueprints are 1920×1080).
    // Run synchronously (elements are already in the DOM) plus once on the next
    // frame, so it works even when rAF is throttled (backgrounded tab).
    function scaleThumbs() {
      overlay.querySelectorAll('.nslp-thumb').forEach(thumb => {
        const mini = thumb.querySelector('.nslp-mini');
        if (!mini || !thumb.clientWidth) return;
        const scale = thumb.clientWidth / 1920;
        mini.style.transform = 'scale(' + scale + ')';
        thumb.style.height = 1080 * scale + 'px';
      });
    }
    scaleThumbs();
    requestAnimationFrame(scaleThumbs);
    overlay.addEventListener('pointerdown', e => {
      e.stopPropagation();
      if (e.target === overlay) closePicker();
    });
    overlay.querySelector('.nslp-x').addEventListener('click', closePicker);
    document.addEventListener('keydown', escClose);
  }
  function closePicker() {
    if (overlay) {
      overlay.remove();
      overlay = null;
    }
    document.removeEventListener('keydown', escClose);
  }
  function escClose(e) {
    if (e.key === 'Escape') closePicker();
  }

  // ── toolbar buttons ────────────────────────────────────────────────────────
  function mountToolbar() {
    const tb = document.querySelector('.builder-toolbar');
    if (!tb) return;
    const sep = document.createElement('span');
    sep.className = 'tb-sep';
    tb.appendChild(sep);
    const add = mkBtn('＋ Slide', 'New slide from a layout', openPicker);
    const dup = mkBtn('⧉', 'Duplicate current slide', () => {
      const sec = liveSlides()[currentIndex()];
      if (sec) insertAfter(sec, pretty(sec.getAttribute('data-screen-label') || 'Slide'), cleanBlueprint(sec));
    });
    const del = mkBtn('🗑 Slide', 'Delete current slide', () => {
      const slides = liveSlides();
      if (slides.length <= 1) {
        alert('Can’t delete the last slide.');
        return;
      }
      const sec = slides[currentIndex()];
      if (sec && confirm('Delete this entire slide?')) deleteSlide(sec);
    });
    tb.appendChild(add);
    tb.appendChild(dup);
    tb.appendChild(del);
  }
  function mkBtn(text, title, fn) {
    const b = document.createElement('button');
    b.textContent = text;
    b.title = title;
    b.addEventListener('mousedown', e => e.preventDefault());
    b.addEventListener('click', fn);
    return b;
  }

  // Persist edits made to inserted slides (delegated) so refresh keeps them.
  document.addEventListener('input', e => {
    const sec = e.target.closest && e.target.closest('section[data-uid]');
    if (sec) clearTimeout(syncInsertedHTML._t), syncInsertedHTML._t = setTimeout(() => syncInsertedHTML(sec), 400);
  });
  function boot() {
    renumber();
    mountToolbar();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);else boot();

  // expose a tiny API (used by nav + debugging)
  window.nsLayouts = {
    liveSlides,
    currentIndex,
    openPicker,
    renumber
  };
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "slides/layouts.js", error: String((e && e.message) || e) }); }

// slides/pptx-export/ns-pptx-generate.js
try { (() => {
/**
 * Netskope native-PPTX generator
 * ------------------------------------------------------------------
 * Turns a plain "deck spec" into a REAL PowerPoint .pptx whose every slide is
 * bound to one of the 25 native Netskope slide layouts. Masters / layouts /
 * theme / fonts / media come straight from the brand template, so the output
 * opens in PowerPoint fully on-brand and "New Slide" still offers all 25 layouts.
 *
 * HOW IT WORKS
 *  • Reads the brand template package (Netskope-Blank-Native.pptx by default,
 *    or the original .pptx — anything with the 3 masters + 25 layouts).
 *  • Keeps every master/layout/theme/media part untouched (byte-for-byte).
 *  • Generates one slideN.xml per spec slide. Each slide only declares the
 *    placeholders it fills (title / subtitle / body bullets) and OMITS geometry
 *    so position + styling inherit from the layout. Picture placeholders are
 *    left as inherited prompts ("click to add image").
 *  • Rewrites presentation.xml (sldIdLst), presentation.xml.rels and
 *    [Content_Types].xml, then repackages the ZIP (store + CRC32).
 *
 * USAGE (inside a run_script call):
 *   const code = await readFile('slides/pptx-export/ns-pptx-generate.js');
 *   eval(code);                                  // defines generateNetskopePptx
 *   await generateNetskopePptx({
 *     templatePath: 'slides/Netskope-Blank-Native.pptx',
 *     outPath: 'slides/exports/My-Deck.pptx',
 *     spec: { slides: [
 *       { layout:'cover' },
 *       { layout:'title-slide-dark', title:'Q3 Security Review', subtitle:'Cloud, data & AI everywhere' },
 *       { layout:'title-bullets-dark', title:'Why now', heading:'THE SHIFT',
 *         bullets:['Work moved off the network', {text:'Apps are SaaS-first', level:1}] },
 *       { layout:'title-bullets-image-white', title:'Platform', bullets:['One console','One policy'] },
 *       { layout:'quote-light', quote:'Security and networking, reimagined.', attribution:'Sanjay Beri, CEO' },
 *       { layout:'thankyou-dark', title:'Thank You' },
 *     ]}
 *   });
 *
 * SPEC FIELDS per slide
 *   layout      one of the keys in LAYOUT_KEYS below (required)
 *   title       title / section / cover / thank-you headline
 *   subtitle    subtitle (title-slide) — also used as thank-you secondary line
 *   quote       quote body (quote layouts)        — alias of title
 *   attribution quote attribution (quote layouts) — alias of subtitle
 *   heading     small accent eyebrow above bullets (body layouts)
 *   bullets     array of strings, or {text, level} (level 0 or 1)
 *
 * Layouts with no text placeholders (cover, blank-*) emit an empty slide bound
 * to that layout — the brand background/art still renders.
 */

const LAYOUT_KEYS = {
  'cover': 1,
  'title-slide-dark': 2,
  'title-only-dark': 3,
  'title-bullets-dark': 4,
  'title-bullets-image-dark': 5,
  'title-bullets-half-dark': 6,
  'blank-dark': 7,
  'quote-dark': 8,
  'thankyou-dark': 9,
  'title-slide-white': 10,
  'title-only-white': 11,
  'title-bullets-white': 12,
  'title-bullets-image-white': 13,
  'title-bullets-half-white': 14,
  'blank-white': 15,
  'quote-white': 16,
  'thankyou-white': 17,
  'title-slide-light': 18,
  'title-only-light': 19,
  'title-bullets-light': 20,
  'title-bullets-image-light': 21,
  'title-bullets-half-light': 22,
  'blank-light': 23,
  'quote-light': 24,
  'thankyou-light': 25
};
function nsXmlEsc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---- txBody builders ----
function nsParaSimple(text) {
  // multi-line → <a:br/>
  const parts = String(text == null ? '' : text).split('\n');
  let runs = '';
  parts.forEach((line, i) => {
    if (i) runs += '<a:br/>';
    runs += '<a:r><a:rPr lang="en-US" dirty="0"/><a:t>' + nsXmlEsc(line) + '</a:t></a:r>';
  });
  return '<a:p>' + runs + '</a:p>';
}
function nsTitleTxBody(text) {
  return '<p:txBody><a:bodyPr/><a:lstStyle/>' + nsParaSimple(text) + '</p:txBody>';
}
function nsBodyTxBody(heading, bullets) {
  let xml = '<p:txBody><a:bodyPr/><a:lstStyle/>';
  if (heading) {
    xml += '<a:p><a:pPr marL="127000" indent="0"><a:buNone/></a:pPr>' + '<a:r><a:rPr lang="en-US" dirty="0"><a:solidFill><a:schemeClr val="accent5"/></a:solidFill></a:rPr>' + '<a:t>' + nsXmlEsc(heading) + '</a:t></a:r></a:p>';
  }
  (bullets || []).forEach(b => {
    const text = typeof b === 'string' ? b : b.text;
    const lvl = typeof b === 'object' && b.level ? b.level : 0;
    xml += '<a:p><a:pPr lvl="' + lvl + '"/>' + '<a:r><a:rPr lang="en-US" dirty="0"/><a:t>' + nsXmlEsc(text) + '</a:t></a:r></a:p>';
  });
  if (!heading && !(bullets || []).length) xml += '<a:p><a:endParaRPr lang="en-US" dirty="0"/></a:p>';
  xml += '</p:txBody>';
  return xml;
}

// ---- native table (self-contained <a:tbl> graphicFrame) ----
const NS_TABLE = {
  x: 457200,
  y: 1081887,
  w: 8229575,
  rowH: 396000
};
function nsTableCell(text, {
  header = false,
  band = false
} = {}) {
  const fill = header ? '00A9CE' : band ? 'D9FAFF' : 'FFFFFF';
  const color = header ? 'FFFFFF' : '081A59';
  const b = header ? ' b="1"' : '';
  return '<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>' + '<a:p><a:pPr algn="l"/><a:r><a:rPr lang="en-US" sz="1300"' + b + ' dirty="0">' + '<a:solidFill><a:srgbClr val="' + color + '"/></a:solidFill></a:rPr>' + '<a:t>' + nsXmlEsc(text) + '</a:t></a:r></a:p></a:txBody>' + '<a:tcPr marL="91440" marR="91440" marT="45720" marB="45720" anchor="ctr">' + '<a:solidFill><a:srgbClr val="' + fill + '"/></a:solidFill></a:tcPr></a:tc>';
}
function nsBuildTable(table, id) {
  const headers = table.headers || [];
  const rows = table.rows || [];
  const ncols = Math.max(headers.length, ...rows.map(r => r.length), 1);
  const colW = Math.floor(NS_TABLE.w / ncols);
  let grid = '';
  for (let c = 0; c < ncols; c++) grid += '<a:gridCol w="' + colW + '"/>';
  let trs = '';
  if (headers.length) {
    let tcs = '';
    for (let c = 0; c < ncols; c++) tcs += nsTableCell(headers[c] || '', {
      header: true
    });
    trs += '<a:tr h="' + NS_TABLE.rowH + '">' + tcs + '</a:tr>';
  }
  rows.forEach((row, ri) => {
    let tcs = '';
    for (let c = 0; c < ncols; c++) tcs += nsTableCell(row[c] != null ? row[c] : '', {
      band: ri % 2 === 1
    });
    trs += '<a:tr h="' + NS_TABLE.rowH + '">' + tcs + '</a:tr>';
  });
  const nrows = (headers.length ? 1 : 0) + rows.length;
  const cy = NS_TABLE.rowH * nrows;
  return '<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="' + id + '" name="Table ' + id + '"/>' + '<p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>' + '<p:xfrm><a:off x="' + NS_TABLE.x + '" y="' + NS_TABLE.y + '"/><a:ext cx="' + NS_TABLE.w + '" cy="' + cy + '"/></p:xfrm>' + '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">' + '<a:tbl><a:tblPr firstRow="1" bandRow="1"><a:noFill/></a:tblPr><a:tblGrid>' + grid + '</a:tblGrid>' + trs + '</a:tbl></a:graphicData></a:graphic></p:graphicFrame>';
}

// ---- native chart graphicFrame (references a chart part via rId) ----
const NS_CHART = {
  x: 457007,
  y: 1177289,
  w: 8229794,
  h: 3108960
};
// Brand series palette (cyan, teal, mid-teal, light, orange)
const NS_SERIES_COLORS = ['00A9CE', '008C95', '5FB6BA', 'BCE3EA', 'FF8200'];
function nsChartFrame(id, rId) {
  return '<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="' + id + '" name="Chart ' + id + '"/>' + '<p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>' + '<p:xfrm><a:off x="' + NS_CHART.x + '" y="' + NS_CHART.y + '"/><a:ext cx="' + NS_CHART.w + '" cy="' + NS_CHART.h + '"/></p:xfrm>' + '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">' + '<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" ' + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="' + rId + '"/>' + '</a:graphicData></a:graphic></p:graphicFrame>';
}
// Build a self-contained (cache-only, no embedded workbook) bar/column chart part.
function nsBuildChartXml(chart) {
  const cats = chart.categories || [];
  const series = chart.series || [];
  const ncat = cats.length;
  const dir = chart.type === 'barh' ? 'bar' : 'col';
  const ax1 = 111111111,
    ax2 = 222222222;
  const catCache = '<c:strCache><c:ptCount val="' + ncat + '"/>' + cats.map((c, i) => '<c:pt idx="' + i + '"><c:v>' + nsXmlEsc(c) + '</c:v></c:pt>').join('') + '</c:strCache>';
  let serXml = '';
  series.forEach((s, si) => {
    const color = s.color ? s.color.replace('#', '') : NS_SERIES_COLORS[si % NS_SERIES_COLORS.length];
    const vals = s.values || [];
    const valCache = '<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="' + ncat + '"/>' + vals.map((v, i) => '<c:pt idx="' + i + '"><c:v>' + v + '</c:v></c:pt>').join('') + '</c:numCache>';
    serXml += '<c:ser><c:idx val="' + si + '"/><c:order val="' + si + '"/>' + '<c:tx><c:strRef><c:f>Sheet1!$' + String.fromCharCode(66 + si) + '$1</c:f>' + '<c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>' + nsXmlEsc(s.name || 'Series ' + (si + 1)) + '</c:v></c:pt></c:strCache></c:strRef></c:tx>' + '<c:spPr><a:solidFill><a:srgbClr val="' + color + '"/></a:solidFill></c:spPr>' + '<c:cat><c:strRef><c:f>Sheet1!$A$2:$A$' + (ncat + 1) + '</c:f>' + catCache + '</c:strRef></c:cat>' + '<c:val><c:numRef><c:f>Sheet1!$' + String.fromCharCode(66 + si) + '$2:$' + String.fromCharCode(66 + si) + '$' + (ncat + 1) + '</c:f>' + valCache + '</c:numRef></c:val>' + '</c:ser>';
  });
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' + '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" ' + 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' + '<c:roundedCorners val="0"/><c:chart><c:autoTitleDeleted val="1"/><c:plotArea><c:layout/>' + '<c:barChart><c:barDir val="' + dir + '"/><c:grouping val="clustered"/><c:varyColors val="0"/>' + serXml + '<c:gapWidth val="80"/><c:axId val="' + ax1 + '"/><c:axId val="' + ax2 + '"/></c:barChart>' + '<c:catAx><c:axId val="' + ax1 + '"/><c:scaling><c:orientation val="minMax"/></c:scaling>' + '<c:delete val="0"/><c:axPos val="b"/><c:crossAx val="' + ax2 + '"/></c:catAx>' + '<c:valAx><c:axId val="' + ax2 + '"/><c:scaling><c:orientation val="minMax"/></c:scaling>' + '<c:delete val="0"/><c:axPos val="l"/><c:crossAx val="' + ax1 + '"/></c:valAx>' + '</c:plotArea><c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>' + '<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>';
}

// Build one <p:sp> for a placeholder given its type+idx and the content role.
function nsPlaceholderSp(id, phType, phIdx, txBody, name) {
  const phAttr = 'type="' + phType + '"' + (phIdx != null ? ' idx="' + phIdx + '"' : '');
  return '<p:sp><p:nvSpPr><p:cNvPr id="' + id + '" name="' + name + '"/>' + '<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>' + '<p:nvPr><p:ph ' + phAttr + '/></p:nvPr></p:nvSpPr>' + '<p:spPr/>' + txBody + '</p:sp>';
}

// Build the full slide XML for one spec entry, given the layout's placeholders.
// extraFrames = concatenated <p:graphicFrame> XML (tables/charts) appended after placeholders.
function nsBuildSlideXml(slide, layoutPhs, extraFrames) {
  const title = slide.title != null ? slide.title : slide.quote;
  const subtitle = slide.subtitle != null ? slide.subtitle : slide.attribution;
  let shapes = '';
  let id = 2;
  layoutPhs.forEach(ph => {
    const t = ph.type,
      idx = ph.idx;
    if (t === 'title' || t === 'ctrTitle') {
      if (title != null) shapes += nsPlaceholderSp(id++, t, idx, nsTitleTxBody(title), 'Title');
    } else if (t === 'subTitle') {
      if (subtitle != null) shapes += nsPlaceholderSp(id++, t, idx, nsTitleTxBody(subtitle), 'Subtitle');
    } else if (t === 'body') {
      const hasBody = slide.heading || slide.bullets && slide.bullets.length || slide.subtitle;
      if (hasBody) shapes += nsPlaceholderSp(id++, t, idx, nsBodyTxBody(slide.heading, slide.bullets), 'Text Placeholder');
    }
    // 'pic' and others: omit → inherits layout prompt
  });
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' + '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' + 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree>' + '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' + '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' + shapes + (extraFrames || '') + '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>';
}

// ---- ZIP helpers (read raw + write store) ----
const NS_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ c >>> 1 : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function nsCrc32(u8) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < u8.length; i++) c = NS_CRC[(c ^ u8[i]) & 0xFF] ^ c >>> 8;
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function nsReadZip(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  const cdOffset = dv.getUint32(eocd + 16, true),
    cdCount = dv.getUint16(eocd + 10, true);
  const dec = new TextDecoder();
  let p = cdOffset;
  const list = [];
  for (let n = 0; n < cdCount; n++) {
    const method = dv.getUint16(p + 10, true),
      crc = dv.getUint32(p + 16, true),
      compSize = dv.getUint32(p + 20, true),
      uncompSize = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true),
      extraLen = dv.getUint16(p + 30, true),
      commentLen = dv.getUint16(p + 32, true),
      localOff = dv.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
    const nl = dv.getUint16(localOff + 26, true),
      el = dv.getUint16(localOff + 28, true);
    const dataStart = localOff + 30 + nl + el;
    const raw = buf.subarray(dataStart, dataStart + compSize);
    list.push({
      name,
      method,
      crc,
      compSize,
      uncompSize,
      raw
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return list;
}
async function nsInflate(u8) {
  const ds = new DecompressionStream('deflate-raw');
  const w = ds.writable.getWriter();
  w.write(u8);
  w.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}
async function nsEntryText(list, name) {
  const e = list.find(x => x.name === name);
  return new TextDecoder().decode(e.method === 0 ? e.raw : await nsInflate(e.raw));
}
function nsStored(name, text) {
  const bytes = new TextEncoder().encode(text);
  return {
    name,
    method: 0,
    crc: nsCrc32(bytes),
    raw: bytes,
    uncompSize: bytes.length
  };
}
function nsWriteZip(entries) {
  const enc = new TextEncoder();
  const chunks = [];
  let offset = 0;
  const central = [];
  for (const e of entries) {
    const nameB = enc.encode(e.name);
    const lh = new Uint8Array(30);
    const ld = new DataView(lh.buffer);
    ld.setUint32(0, 0x04034b50, true);
    ld.setUint16(4, 20, true);
    ld.setUint16(8, e.method, true);
    ld.setUint16(12, 0x21, true);
    ld.setUint32(14, e.crc, true);
    ld.setUint32(18, e.raw.length, true);
    ld.setUint32(22, e.uncompSize, true);
    ld.setUint16(26, nameB.length, true);
    chunks.push(lh, nameB, e.raw);
    central.push({
      nameB,
      e,
      lhOff: offset
    });
    offset += 30 + nameB.length + e.raw.length;
  }
  const cdStart = offset;
  const cdChunks = [];
  for (const c of central) {
    const ch = new Uint8Array(46);
    const cd = new DataView(ch.buffer);
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(10, c.e.method, true);
    cd.setUint16(14, 0x21, true);
    cd.setUint32(16, c.e.crc, true);
    cd.setUint32(20, c.e.raw.length, true);
    cd.setUint32(24, c.e.uncompSize, true);
    cd.setUint16(28, c.nameB.length, true);
    cd.setUint32(42, c.lhOff, true);
    cdChunks.push(ch, c.nameB);
    offset += 46 + c.nameB.length;
  }
  const cdSize = offset - cdStart;
  const eo = new Uint8Array(22);
  const ed = new DataView(eo.buffer);
  ed.setUint32(0, 0x06054b50, true);
  ed.setUint16(8, central.length, true);
  ed.setUint16(10, central.length, true);
  ed.setUint32(12, cdSize, true);
  ed.setUint32(16, cdStart, true);
  const all = [...chunks, ...cdChunks, eo];
  let total = 0;
  all.forEach(a => total += a.length);
  const out = new Uint8Array(total);
  let o = 0;
  all.forEach(a => {
    out.set(a, o);
    o += a.length;
  });
  return out;
}

// Parse a layout's placeholders (type + idx) in document order.
function nsLayoutPlaceholders(layoutXml) {
  const sps = [...layoutXml.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)].map(m => m[0]);
  return sps.filter(sp => /<p:ph/.test(sp)).map(sp => ({
    type: (sp.match(/<p:ph[^>]*\btype="([^"]*)"/) || [])[1] || 'body',
    idx: (sp.match(/<p:ph[^>]*\bidx="([^"]*)"/) || [])[1] || null
  }));
}
async function generateNetskopePptx({
  templatePath,
  outPath,
  spec
}) {
  const blob = await readFileBinary(templatePath);
  const buf = new Uint8Array(await blob.arrayBuffer());
  const list = nsReadZip(buf);

  // resolve layouts + placeholders
  const slides = spec.slides.map(s => {
    const layoutNum = LAYOUT_KEYS[s.layout];
    if (!layoutNum) throw new Error('Unknown layout key: ' + s.layout);
    return {
      ...s,
      layoutNum
    };
  });
  const layoutPhCache = {};
  for (const s of slides) {
    if (!layoutPhCache[s.layoutNum]) {
      const xml = await nsEntryText(list, 'ppt/slideLayouts/slideLayout' + s.layoutNum + '.xml');
      layoutPhCache[s.layoutNum] = nsLayoutPlaceholders(xml);
    }
  }

  // modified package parts
  let ct = await nsEntryText(list, '[Content_Types].xml');
  ct = ct.replace(/<Override PartName="\/ppt\/slides\/slide\d+\.xml"[^>]*\/>/g, '').replace(/<Override PartName="\/ppt\/notesSlides\/notesSlide\d+\.xml"[^>]*\/>/g, '').replace(/<Override PartName="\/ppt\/charts\/[^"]*"[^>]*\/>/g, '');
  let ctAdds = '';
  slides.forEach((s, i) => {
    ctAdds += '<Override PartName="/ppt/slides/slide' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>';
  });
  // chart parts get content-type overrides too (assigned in the slide loop below)
  const chartParts = []; // {name, xml}
  slides.forEach((s, i) => {
    if (s.chart) {
      const idx = chartParts.length + 1;
      chartParts.push({
        name: 'ppt/charts/chart' + idx + '.xml',
        xml: nsBuildChartXml(s.chart)
      });
      s._chartPart = idx;
    }
  });
  chartParts.forEach(c => {
    ctAdds += '<Override PartName="/' + c.name + '" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>';
  });
  ct = ct.replace('</Types>', ctAdds + '</Types>');
  let pr = await nsEntryText(list, 'ppt/_rels/presentation.xml.rels');
  pr = pr.replace(/<Relationship Id="rId\d+" Type="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships\/slide" Target="slides\/slide\d+\.xml"\/>/g, '');
  let prAdds = '';
  slides.forEach((s, i) => {
    prAdds += '<Relationship Id="rIdSlide' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide' + (i + 1) + '.xml"/>';
  });
  pr = pr.replace('</Relationships>', prAdds + '</Relationships>');
  let px = await nsEntryText(list, 'ppt/presentation.xml');
  let sldIds = '';
  slides.forEach((s, i) => {
    sldIds += '<p:sldId id="' + (256 + i) + '" r:id="rIdSlide' + (i + 1) + '"/>';
  });
  px = px.replace(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/, '<p:sldIdLst>' + sldIds + '</p:sldIdLst>');
  if (!/<p:sldIdLst>/.test(px)) {
    // some presentations omit it when empty — insert after sldMasterIdLst
    px = px.replace(/(<\/p:sldMasterIdLst>)/, '$1<p:sldIdLst>' + sldIds + '</p:sldIdLst>');
  }

  // assemble output entries
  const drop = name => /^ppt\/slides\/slide\d+\.xml$/.test(name) || /^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/.test(name) || /^ppt\/notesSlides\//.test(name) || /^ppt\/charts\//.test(name) || /^ppt\/embeddings\//.test(name);
  const modified = {
    '[Content_Types].xml': ct,
    'ppt/_rels/presentation.xml.rels': pr,
    'ppt/presentation.xml': px
  };
  const out = [];
  for (const e of list) {
    if (drop(e.name)) continue;
    if (modified[e.name]) out.push(nsStored(e.name, modified[e.name]));else out.push(e);
  }
  // new slide parts + rels
  let frameId = 100;
  slides.forEach((s, i) => {
    // build extra graphic frames (table, chart) + per-slide extra rels
    let extra = '';
    let extraRels = '';
    if (s.table) extra += nsBuildTable(s.table, frameId++);
    if (s._chartPart) {
      const rId = 'rIdChart' + s._chartPart;
      extra += nsChartFrame(frameId++, rId);
      extraRels += '<Relationship Id="' + rId + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart' + s._chartPart + '.xml"/>';
    }
    const slideXml = nsBuildSlideXml(s, layoutPhCache[s.layoutNum], extra);
    const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout' + s.layoutNum + '.xml"/>' + extraRels + '</Relationships>';
    out.push(nsStored('ppt/slides/slide' + (i + 1) + '.xml', slideXml));
    out.push(nsStored('ppt/slides/_rels/slide' + (i + 1) + '.xml.rels', rels));
  });
  // chart parts
  chartParts.forEach(c => {
    out.push(nsStored(c.name, c.xml));
  });
  const outBytes = nsWriteZip(out);
  await saveFile(outPath, new Blob([outBytes], {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  }));
  return {
    bytes: outBytes.length,
    slides: slides.length,
    parts: out.length
  };
}

// expose for eval-based usage in run_script
if (typeof globalThis !== 'undefined') globalThis.generateNetskopePptx = generateNetskopePptx;
})(); } catch (e) { __ds_ns.__errors.push({ path: "slides/pptx-export/ns-pptx-generate.js", error: String((e && e.message) || e) }); }

})();
