/* DualEngine — model.js
 * Document / Node types (SPEC-DUALENGINE §0.2–0.4), factories, validation, id generation,
 * tree helpers and serialisation. Plain JS + JSDoc, no DOM, runs in Node and in the browser.
 *
 * Browser: classic script, registers window.DualEngine.model.
 * Node:    module.exports = the same API.
 */
(function (global, factory) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;
  // resolve.js depends on model.js: it is looked up lazily (at validation time), never at load time
  var api = factory(function () { return isNode ? require('./resolve.js') : (global.DualEngine && global.DualEngine.resolve); });
  if (isNode) module.exports = api;
  else (global.DualEngine = global.DualEngine || {}).model = api;
})(typeof window !== 'undefined' ? window : globalThis, function (getResolve) {
  'use strict';

  /**
   * @typedef {string} NodeId   UUID v4, stable for the node's whole life.
   * @typedef {'base'|string} BreakpointId
   *
   * @typedef {{r:number,g:number,b:number,a:number,space?:'srgb'|'display-p3'}} Color   components in [0,1]
   *
   * @typedef {{x:number,y:number,w:number,h:number,rotation:number,flipH:boolean,flipV:boolean}} Geometry
   *   x,y relative to the parent's top-left corner BEFORE rotation; rotation in degrees, clockwise.
   *
   * @typedef {{tag:string,attrs:Object<string,string>,className?:string}} Semantic
   *
   * @typedef {{kind:'px',value:number}|{kind:'fr',value:number}|{kind:'auto'}|{kind:'minmax',min:Track,max:Track}} Track
   *
   * @typedef {Object} LayoutParent
   * @property {'absolute'|'stack'|'grid'} mode
   * @property {'horizontal'|'vertical'} [direction]
   * @property {boolean} [wrap]
   * @property {number|'auto'} [gap]          'auto' = space-between
   * @property {number} [rowGap]
   * @property {{top:number,right:number,bottom:number,left:number}} [padding]
   * @property {'start'|'center'|'end'|'spaceBetween'} [alignMain]
   * @property {'start'|'center'|'end'|'stretch'|'baseline'} [alignCross]
   * @property {Track[]} [columns]
   * @property {Track[]} [rows]
   * @property {number} [columnGap]
   * @property {boolean} clip
   * @property {boolean} [reverseZ]
   *
   * @typedef {Object} LayoutChild
   * @property {'flow'|'absolute'} position
   * @property {'fixed'|'hug'|'fill'} widthMode
   * @property {'fixed'|'hug'|'fill'} heightMode
   * @property {number} [minW] @property {number} [maxW] @property {number} [minH] @property {number} [maxH]
   * @property {'px'|'vw'|'%'} [widthUnit] @property {'px'|'vh'|'%'} [heightUnit]
   * @property {number} [grow]
   * @property {'auto'|'start'|'center'|'end'|'stretch'} [alignSelf]
   * @property {{h:'left'|'right'|'leftRight'|'center'|'scale', v:'top'|'bottom'|'topBottom'|'center'|'scale'}} [constraints]
   * @property {{col:number,colSpan:number,row:number,rowSpan:number}} [gridArea]
   * @property {number} [order]
   *
   * @typedef {{position:number,color:Color}} Stop
   * @typedef {Object} Paint
   * @property {'solid'|'linear'|'radial'|'angular'|'diamond'|'image'} type
   * @property {Color} [color]
   * @property {Stop[]} [stops]
   * @property {{x:number,y:number}} [start]   gradient handles in the normalised [0,1]² box space
   * @property {{x:number,y:number}} [end]
   * @property {{x:number,y:number}} [radius]  radial: ellipse radii (normalised)
   * @property {string} [asset]
   * @property {'fill'|'fit'|'crop'|'tile'} [fit]
   * @property {number} [scale]
   * @property {number} opacity
   * @property {string} blend
   * @property {boolean} visible
   *
   * @typedef {Object} Stroke
   * @property {Paint} paint
   * @property {number|{top:number,right:number,bottom:number,left:number}} width
   * @property {'inside'|'center'|'outside'} align
   * @property {[number,number]} [dash]
   * @property {'butt'|'round'|'square'} cap
   * @property {'miter'|'round'|'bevel'} join
   * @property {boolean} visible
   *
   * @typedef {{type:'dropShadow'|'innerShadow',x:number,y:number,blur:number,spread:number,color:Color,visible:boolean,showBehindTransparent?:boolean}
   *         |{type:'layerBlur'|'backgroundBlur',radius:number,visible:boolean}} Effect
   *
   * @typedef {{tl:number,tr:number,br:number,bl:number,smoothing:number}} Corners
   *
   * @typedef {Object} TextStyle
   * @property {string} family @property {number} weight @property {boolean} italic
   * @property {Object<string,number>} [axes]
   * @property {number} size
   * @property {{unit:'auto'|'px'|'%',value?:number}} lineHeight
   * @property {{unit:'px'|'%',value:number}} letterSpacing
   * @property {number} paragraphSpacing @property {number} paragraphIndent
   * @property {'left'|'center'|'right'|'justify'} align
   * @property {'top'|'middle'|'bottom'} verticalAlign
   * @property {'none'|'upper'|'lower'|'title'} case
   * @property {'none'|'underline'|'strike'} decoration
   * @property {Paint[]} fills
   * @property {Object<string,boolean>} [features]
   *
   * @typedef {{paragraphs: Array<{runs: Array<{text:string, style?:Partial<TextStyle>}>}>}} RichText
   *
   * @typedef {Object} Node
   * @property {NodeId} id
   * @property {'frame'|'stack'|'grid'|'rect'|'ellipse'|'line'|'vector'|'text'|'image'|'component'|'instance'|'slice'} type
   * @property {string} name
   * @property {NodeId|null} parent
   * @property {NodeId[]} [children]
   * @property {boolean} visible @property {boolean} locked
   * @property {number} opacity @property {string} blendMode @property {boolean} isolate
   * @property {Semantic} semantic
   * @property {Geometry} geometry
   * @property {LayoutChild} layoutChild
   * @property {LayoutParent} [layoutParent]
   * @property {Paint[]} fills @property {Stroke[]} strokes @property {Effect[]} effects
   * @property {Corners} corners
   * @property {Object<string,Object>} overrides   per breakpoint, partial Overridable
   * @property {Object<string,Object>} [states]    per state name, partial Overridable
   * @property {{createdAt:number,updatedAt:number}} meta
   * // text
   * @property {RichText} [text] @property {TextStyle} [style] @property {'autoWidth'|'autoHeight'|'fixed'} [resize]
   * @property {{lines:number}} [truncate]
   * // image
   * @property {string} [asset] @property {'fill'|'fit'|'crop'|'tile'} [fit] @property {string} [alt]
   * // frame
   * @property {boolean} [clipsContent]
   *
   * @typedef {Object} Breakpoint
   * @property {BreakpointId} id @property {string} name @property {number} width @property {number} [minWidth]
   *
   * @typedef {Object} Document
   * @property {3} version
   * @property {string} id @property {string} name
   * @property {Array<{id:string,name:string,children:NodeId[]}>} pages
   * @property {Object<NodeId,Node>} nodes
   * @property {Object} components
   * @property {{sets:Array<{id:string,name:string,tokens:Object}>,modes:Array<{id:string,name:string}>,activeMode:Object<string,string>}} tokens
   * @property {Object} styles
   * @property {Object} assets
   * @property {Breakpoint[]} breakpoints   ordered by width, descending; first is 'base'
   * @property {{snapToPixel:boolean,pixelGrid:boolean,rulers:boolean,units:'px'}} settings
   */

  var NODE_TYPES = ['frame', 'stack', 'grid', 'rect', 'ellipse', 'line', 'vector', 'text', 'image', 'component', 'instance', 'slice'];
  var CONTAINER_TYPES = ['frame', 'stack', 'grid', 'component', 'instance'];
  var OVERRIDABLE = ['visible', 'opacity', 'geometry', 'layoutChild', 'layoutParent', 'fills', 'strokes', 'effects', 'corners', 'text'];
  var TAGS = ['div', 'section', 'header', 'nav', 'main', 'footer', 'article', 'aside', 'h1', 'h2', 'h3', 'h4', 'p', 'span', 'a', 'button', 'img', 'ul', 'li', 'form', 'input', 'label'];
  var BLEND_MODES = ['passThrough', 'normal', 'darken', 'multiply', 'colorBurn', 'linearBurn', 'lighten', 'screen', 'colorDodge', 'linearDodge', 'overlay', 'softLight', 'hardLight', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'];

  /* ------------------------------------------------------------------ ids */

  function uuid() {
    var c = (typeof globalThis !== 'undefined' && globalThis.crypto) || null;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
    var bytes = new Array(16);
    if (c && typeof c.getRandomValues === 'function') { var u = new Uint8Array(16); c.getRandomValues(u); for (var i = 0; i < 16; i++) bytes[i] = u[i]; }
    else for (var j = 0; j < 16; j++) bytes[j] = Math.floor(Math.random() * 256);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80;
    var h = bytes.map(function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  /** Stable CSS class of a node: de-xxxxxxxx (first 8 chars of the id, non-alnum replaced). */
  function classOf(id) { return 'de-' + String(id).slice(0, 8).replace(/[^a-zA-Z0-9]/g, '0'); }

  /* ------------------------------------------------------------------ factories */

  function color(r, g, b, a) { return { r: r, g: g, b: b, a: a === undefined ? 1 : a }; }
  function hex(h) {
    var s = h.replace('#', '');
    if (s.length === 3 || s.length === 4) s = s.split('').map(function (c) { return c + c; }).join('');
    var n = parseInt(s.slice(0, 6), 16);
    var a = s.length === 8 ? parseInt(s.slice(6, 8), 16) / 255 : 1;
    return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a: a };
  }
  function solid(c, opts) {
    var col = typeof c === 'string' ? hex(c) : c;
    return Object.assign({ type: 'solid', color: col, opacity: 1, blend: 'normal', visible: true }, opts || {});
  }
  function defaultTextStyle(over) {
    return Object.assign({
      family: 'Inter', weight: 400, italic: false, size: 16,
      lineHeight: { unit: 'auto' }, letterSpacing: { unit: 'px', value: 0 },
      paragraphSpacing: 0, paragraphIndent: 0, align: 'left', verticalAlign: 'top',
      case: 'none', decoration: 'none', fills: [solid('#111111')]
    }, over || {});
  }
  /** RichText from a plain string ("\n" separates paragraphs). */
  function richText(str, style) {
    return { paragraphs: String(str).split('\n').map(function (p) { return { runs: [style ? { text: p, style: style } : { text: p }] }; }) };
  }
  function plainText(rt) {
    if (typeof rt === 'string') return rt;
    if (!rt || !rt.paragraphs) return '';
    return rt.paragraphs.map(function (p) { return p.runs.map(function (r) { return r.text; }).join(''); }).join('\n');
  }

  function defaultLayoutParent(mode) {
    var lp = { mode: mode || 'absolute', clip: false };
    if (mode === 'stack') Object.assign(lp, { direction: 'vertical', wrap: false, gap: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, alignMain: 'start', alignCross: 'start' });
    if (mode === 'grid') Object.assign(lp, { columns: [{ kind: 'fr', value: 1 }], rows: [], columnGap: 0, rowGap: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 } });
    return lp;
  }

  var DEFAULT_TAG = { text: 'p', image: 'img', frame: 'div', stack: 'div', grid: 'div' };

  /**
   * Create a node with every field defaulted. `props` is deep-merged on top (objects merged one
   * level, arrays replaced).
   * @param {Node['type']} type
   * @param {Object} [props]
   * @returns {Node}
   */
  function createNode(type, props) {
    if (NODE_TYPES.indexOf(type) < 0) throw new Error('createNode: unknown type ' + type);
    props = props || {};
    var now = Date.now();
    var node = {
      id: props.id || uuid(),
      type: type,
      name: props.name || (type.charAt(0).toUpperCase() + type.slice(1)),
      parent: null,
      visible: true, locked: false, opacity: 1, blendMode: type === 'frame' || type === 'stack' || type === 'grid' ? 'passThrough' : 'normal', isolate: false,
      semantic: { tag: DEFAULT_TAG[type] || 'div', attrs: {} },
      geometry: { x: 0, y: 0, w: 100, h: 100, rotation: 0, flipH: false, flipV: false },
      layoutChild: { position: 'flow', widthMode: 'fixed', heightMode: 'fixed' },
      fills: [], strokes: [], effects: [],
      corners: { tl: 0, tr: 0, br: 0, bl: 0, smoothing: 0 },
      overrides: {},
      meta: { createdAt: now, updatedAt: now }
    };
    if (CONTAINER_TYPES.indexOf(type) >= 0) {
      node.children = [];
      node.layoutParent = defaultLayoutParent(type === 'stack' ? 'stack' : type === 'grid' ? 'grid' : 'absolute');
      if (type === 'frame') node.clipsContent = false;
    }
    if (type === 'text') {
      node.text = richText(props.text !== undefined && typeof props.text === 'string' ? props.text : 'Text');
      node.style = defaultTextStyle();
      node.resize = 'autoWidth';
    }
    if (type === 'image') { node.asset = ''; node.fit = 'fill'; node.alt = ''; }
    if (type === 'line') node.geometry.h = 0;
    if (type === 'ellipse' || type === 'rect' || type === 'line' || type === 'vector') node.layoutChild.widthMode = 'fixed';
    // merge props
    Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (k === 'text' && typeof v === 'string') { node.text = richText(v); return; }
      if (v && typeof v === 'object' && !Array.isArray(v) && node[k] && typeof node[k] === 'object' && !Array.isArray(node[k])) {
        node[k] = Object.assign({}, node[k], v);
        if (k === 'layoutParent' && v.padding) node.layoutParent.padding = Object.assign({ top: 0, right: 0, bottom: 0, left: 0 }, v.padding);
      } else node[k] = v;
    });
    if (node.layoutParent && node.layoutParent.mode && (type === 'frame')) {
      // a frame switched to stack/grid mode by props gets stack/grid defaults for missing fields
      var d = defaultLayoutParent(node.layoutParent.mode);
      node.layoutParent = Object.assign(d, node.layoutParent);
    }
    return node;
  }

  /**
   * Semantic tag inference (§0.4), applied by the inspector when a binding changes:
   *   - a text node whose style is bound to a named style 'Heading/N' (doc.styles[node.styleId].name,
   *     N = 1..4) → hN;
   *   - an instance of a component named 'Bouton' / 'Button…' → 'a' when it has an href, else 'button'.
   * Returns null when nothing is inferred. A tag chosen by hand (semantic.tagLocked) always wins.
   */
  function inferTag(doc, node) {
    if (!node) return null;
    if (node.type === 'text') {
      var st = node.styleId && doc.styles && doc.styles[node.styleId];
      var m = st && /^Heading\s*\/\s*([1-4])$/i.exec(String(st.name || ''));
      return m ? 'h' + m[1] : null;
    }
    if (node.type === 'instance') {
      var def = doc.components && doc.components[node.of];
      if (def && /^(bouton|button)\b/i.test(String(def.name || ''))) return node.semantic && node.semantic.attrs && node.semantic.attrs.href ? 'a' : 'button';
    }
    return null;
  }
  /** Apply inferTag to every node whose tag is not locked; returns the ids that changed. */
  function inferTags(doc) {
    var changed = [];
    Object.keys(doc.nodes).forEach(function (id) {
      var n = doc.nodes[id]; if (!n.semantic || n.semantic.tagLocked) return;
      var t = inferTag(doc, n); if (t && n.semantic.tag !== t) { n.semantic.tag = t; changed.push(id); }
    });
    return changed;
  }

  function defaultBreakpoints() {
    return [
      { id: 'base', name: 'Desktop', width: 1440 },
      { id: 'tablet', name: 'Tablette', width: 834 },
      { id: 'phone', name: 'Mobile', width: 390 }
    ];
  }

  /**
   * @param {Object} [props]
   * @returns {Document}
   */
  function createDocument(props) {
    props = props || {};
    var doc = {
      version: 3,
      id: props.id || uuid(),
      name: props.name || 'Untitled',
      pages: [],
      nodes: {},
      components: {},
      tokens: { sets: [], modes: [], activeMode: {} },
      styles: {},
      assets: {},
      breakpoints: props.breakpoints || defaultBreakpoints(),
      settings: { snapToPixel: true, pixelGrid: false, rulers: true, units: 'px' }
    };
    if (props.tokens) doc.tokens = props.tokens;
    if (props.assets) doc.assets = props.assets;
    if (props.settings) Object.assign(doc.settings, props.settings);
    doc.pages.push({ id: props.pageId || uuid(), name: props.pageName || 'Page 1', children: [] });
    return doc;
  }

  /* ------------------------------------------------------------------ tree helpers */

  function getNode(doc, id) { var n = doc.nodes[id]; if (!n) throw new Error('unknown node ' + id); return n; }
  function parentOf(doc, id) { var n = doc.nodes[id]; return n && n.parent ? doc.nodes[n.parent] || null : null; }
  function childrenOf(doc, id) { var n = doc.nodes[id]; return n && n.children ? n.children.map(function (c) { return doc.nodes[c]; }).filter(Boolean) : []; }
  /** Ancestors from the direct parent up to the root. */
  function ancestors(doc, id) {
    var out = [], n = doc.nodes[id], guard = 0;
    while (n && n.parent && guard++ < 10000) { n = doc.nodes[n.parent]; if (n) out.push(n); }
    return out;
  }
  function descendants(doc, id) {
    var out = [], stack = (doc.nodes[id] && doc.nodes[id].children || []).slice();
    while (stack.length) { var c = doc.nodes[stack.shift()]; if (!c) continue; out.push(c); if (c.children) stack = c.children.concat(stack); }
    return out;
  }
  function pageOf(doc, id) {
    var root = doc.nodes[id]; var guard = 0;
    while (root && root.parent && guard++ < 10000) root = doc.nodes[root.parent];
    if (!root) return null;
    for (var i = 0; i < doc.pages.length; i++) if (doc.pages[i].children.indexOf(root.id) >= 0) return doc.pages[i];
    return null;
  }
  function isContainer(node) { return !!(node && node.children && node.layoutParent); }
  function rootsOf(doc, page) { page = page || doc.pages[0]; return page.children.map(function (id) { return doc.nodes[id]; }).filter(Boolean); }

  /**
   * Attach a node (and keep its subtree) to a parent (or a page when parentId is null).
   * Returns the node for chaining.
   */
  function addNode(doc, node, parentId, index) {
    doc.nodes[node.id] = node;
    if (parentId) {
      var p = getNode(doc, parentId);
      if (!p.children) throw new Error('addNode: ' + p.type + ' cannot have children');
      if (index === undefined || index < 0 || index > p.children.length) index = p.children.length;
      p.children.splice(index, 0, node.id);
      node.parent = parentId;
    } else {
      var page = doc.pages[0];
      if (index === undefined) index = page.children.length;
      page.children.splice(index, 0, node.id);
      node.parent = null;
    }
    return node;
  }
  /** Remove a node and its subtree. */
  function removeNode(doc, id) {
    var n = doc.nodes[id]; if (!n) return;
    descendants(doc, id).forEach(function (d) { delete doc.nodes[d.id]; });
    if (n.parent && doc.nodes[n.parent]) { var ch = doc.nodes[n.parent].children; var i = ch.indexOf(id); if (i >= 0) ch.splice(i, 1); }
    doc.pages.forEach(function (p) { var i = p.children.indexOf(id); if (i >= 0) p.children.splice(i, 1); });
    delete doc.nodes[id];
  }
  function indexInParent(doc, id) {
    var n = doc.nodes[id]; if (!n) return -1;
    if (n.parent) return doc.nodes[n.parent].children.indexOf(id);
    for (var i = 0; i < doc.pages.length; i++) { var k = doc.pages[i].children.indexOf(id); if (k >= 0) return k; }
    return -1;
  }

  /* ------------------------------------------------------------------ geometry helpers */

  /** Rotated axis-aligned bounding box (§1.4). */
  function rotatedBBox(box, deg) {
    if (!deg) return { x: box.x, y: box.y, w: box.w, h: box.h };
    var t = deg * Math.PI / 180, c = Math.abs(Math.cos(t)), s = Math.abs(Math.sin(t));
    var cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    var bw = box.w * c + box.h * s, bh = box.w * s + box.h * c;
    return { x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh };
  }

  /**
   * World box of a node from a layout result (layout.js), falling back to stored geometry when no
   * layout is given (sum of ancestor offsets, ignoring rotation).
   */
  function worldBox(doc, id, layout) {
    if (layout && layout.world && layout.world.get(id)) return layout.world.get(id);
    var n = getNode(doc, id); var x = n.geometry.x, y = n.geometry.y;
    ancestors(doc, id).forEach(function (a) { x += a.geometry.x; y += a.geometry.y; });
    return { x: x, y: y, w: n.geometry.w, h: n.geometry.h };
  }

  /* ------------------------------------------------------------------ strokes: how a stroke is rendered (shared by layout + css) */

  /**
   * 'shadow'  → box-shadow (inside/center/outside, solid, continuous)         : no layout impact
   * 'border'  → real CSS border (dashed inside, per-side widths, gradient)    : shrinks the padding box
   * 'outline' → outline + outline-offset (dashed center/outside)              : no layout impact
   */
  function strokeMode(stroke) {
    if (!stroke || stroke.visible === false) return 'none';
    if (typeof stroke.width === 'object') return 'border';
    if (stroke.paint && stroke.paint.type !== 'solid') return 'border';
    if (stroke.dash && stroke.dash[0] > 0) return stroke.align === 'inside' ? 'border' : 'outline';
    return 'shadow';
  }
  /** Border insets (px) produced by strokes rendered as real CSS borders. */
  function borderInsets(strokes) {
    var ins = { top: 0, right: 0, bottom: 0, left: 0 };
    (strokes || []).forEach(function (s) {
      if (strokeMode(s) !== 'border') return;
      if (typeof s.width === 'object') { ins.top += s.width.top || 0; ins.right += s.width.right || 0; ins.bottom += s.width.bottom || 0; ins.left += s.width.left || 0; }
      else { ins.top += s.width; ins.right += s.width; ins.bottom += s.width; ins.left += s.width; }
    });
    return ins;
  }

  /* ------------------------------------------------------------------ validation */

  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  /** Largest coordinate Blink can lay out (LayoutUnit: 2³¹ / 64 px); beyond it browsers clamp. */
  var MAX_COORD = 33554431;
  function isRefLike(v) { return !!(v && typeof v === 'object' && typeof v.ref === 'string'); }
  function isNumOrRef(v) { return isNum(v) || isRefLike(v); }

  /**
   * @param {Document} doc
   * @returns {Array<{path:string,message:string,level:'error'|'warning'}>}
   */
  function validateDocument(doc) {
    var errors = [];
    function err(path, msg) { errors.push({ path: path, message: msg, level: 'error' }); }
    function warn(path, msg) { errors.push({ path: path, message: msg, level: 'warning' }); }
    if (!doc || typeof doc !== 'object') { err('/', 'document is not an object'); return errors; }
    if (doc.version !== 3) err('/version', 'version must be 3');
    if (!Array.isArray(doc.pages) || !doc.pages.length) err('/pages', 'at least one page required');
    if (!doc.nodes || typeof doc.nodes !== 'object') { err('/nodes', 'nodes map required'); return errors; }
    if (!Array.isArray(doc.breakpoints) || !doc.breakpoints.length || doc.breakpoints[0].id !== 'base') err('/breakpoints', "breakpoints must start with 'base'");
    else for (var b = 1; b < doc.breakpoints.length; b++) if (!(doc.breakpoints[b].width < doc.breakpoints[b - 1].width)) err('/breakpoints/' + b, 'breakpoints must be ordered by width, descending');
    var bpIds = (doc.breakpoints || []).map(function (b) { return b.id; });
    /** Value of an object-valued overridable property at a breakpoint (base ← wider ← bp, merged per key). */
    function effective(node, prop, bp) {
      var v = node[prop];
      if (!bp || bp === 'base' || !node.overrides) return v;
      var i = bpIds.indexOf(bp); if (i < 0) return v;
      for (var j = 1; j <= i; j++) { var o = node.overrides[bpIds[j]]; if (o && o[prop] !== undefined) v = Object.assign({}, v || {}, o[prop]); }
      return v;
    }
    var classes = {};
    var seen = {};
    Object.keys(doc.nodes).forEach(function (id) {
      var n = doc.nodes[id], p = '/nodes/' + id;
      if (n.id !== id) err(p + '/id', 'id does not match key');
      if (NODE_TYPES.indexOf(n.type) < 0) err(p + '/type', 'unknown type ' + n.type);
      var cls = classOf(id);
      if (classes[cls]) err(p, 'class collision with ' + classes[cls] + ' (' + cls + ')'); else classes[cls] = id;
      if (!n.geometry || !isNum(n.geometry.x) || !isNum(n.geometry.y) || !isNumOrRef(n.geometry.w) || !isNumOrRef(n.geometry.h) || !isNum(n.geometry.rotation)) err(p + '/geometry', 'geometry must have finite x,y,w,h,rotation');
      else if (n.geometry.w < 0 || n.geometry.h < 0) err(p + '/geometry', 'negative size');
      if (!n.layoutChild || ['fixed', 'hug', 'fill'].indexOf(n.layoutChild.widthMode) < 0 || ['fixed', 'hug', 'fill'].indexOf(n.layoutChild.heightMode) < 0) err(p + '/layoutChild', 'invalid widthMode/heightMode');
      if (!n.semantic || TAGS.indexOf(n.semantic.tag) < 0) err(p + '/semantic/tag', 'invalid tag ' + (n.semantic && n.semantic.tag));
      if (n.blendMode && BLEND_MODES.indexOf(n.blendMode) < 0) err(p + '/blendMode', 'unknown blend mode ' + n.blendMode);
      if (n.parent !== null && n.parent !== undefined) {
        var par = doc.nodes[n.parent];
        if (!par) err(p + '/parent', 'parent ' + n.parent + ' does not exist');
        else if (!par.children || par.children.indexOf(id) < 0) err(p + '/parent', 'parent does not list this node as a child');
      }
      if (n.children) {
        if (!n.layoutParent || ['absolute', 'stack', 'grid'].indexOf(n.layoutParent.mode) < 0) err(p + '/layoutParent', 'container without valid layoutParent.mode');
        n.children.forEach(function (cid, i) {
          var c = doc.nodes[cid];
          if (!c) { err(p + '/children/' + i, 'child ' + cid + ' does not exist'); return; }
          if (c.parent !== id) err(p + '/children/' + i, 'child parent back-pointer mismatch');
          if (seen[cid]) err(p + '/children/' + i, 'node ' + cid + ' appears in two parents'); seen[cid] = true;
        });
        // hug parent + fill child contradiction (§2.2), checked on the resolved values of every
        // breakpoint (an override can flip the direction or a sizing mode)
        bpIds.forEach(function (bp) {
          var lp = effective(n, 'layoutParent', bp), lcP = effective(n, 'layoutChild', bp);
          if (!lp || lp.mode !== 'stack') return;
          var horiz = lp.direction === 'horizontal';
          n.children.forEach(function (cid) {
            var c = doc.nodes[cid]; if (!c) return;
            var lcC = effective(c, 'layoutChild', bp);
            if (!lcC || lcC.position === 'absolute') return;
            var at = bp === 'base' ? '' : ' at breakpoint ' + bp;
            if (horiz && lcP.widthMode === 'hug' && lcC.widthMode === 'fill') err(p, 'hug container with a fill child on the main axis (' + cid + ')' + at);
            if (!horiz && lcP.heightMode === 'hug' && lcC.heightMode === 'fill') err(p, 'hug container with a fill child on the main axis (' + cid + ')' + at);
          });
          if (typeof lp.gap === 'number' && lp.gap < 0 && lp.wrap) warn(p + '/layoutParent/gap', 'negative spacing on a wrapping stack: emitted as margins (line starts shift too)' + (bp === 'base' ? '' : ' at ' + bp));
          if (lp.wrap && typeof lp.rowGap === 'number' && lp.rowGap < 0) warn(p + '/layoutParent/rowGap', 'negative row gap is not expressible in CSS: treated as 0' + (bp === 'base' ? '' : ' at ' + bp));
        });
        bpIds.forEach(function (bp) {
          var lp = effective(n, 'layoutParent', bp);
          if (lp && lp.mode === 'grid' && ((typeof lp.columnGap === 'number' && lp.columnGap < 0) || (typeof lp.rowGap === 'number' && lp.rowGap < 0) || (typeof lp.gap === 'number' && lp.gap < 0))) warn(p + '/layoutParent', 'negative grid gap is not expressible in CSS: treated as 0');
        });
      }
      // geometry checks
      if (n.geometry && isNum(n.geometry.rotation) && (n.geometry.rotation < -180 || n.geometry.rotation >= 180)) warn(p + '/geometry/rotation', 'rotation ' + n.geometry.rotation + ' outside [-180, 180)');
      if (n.geometry && [n.geometry.x, n.geometry.y, n.geometry.w, n.geometry.h].some(function (v) { return isNum(v) && Math.abs(v) > MAX_COORD; })) warn(p + '/geometry', 'coordinate beyond \u00b1' + MAX_COORD + ' px: browsers clamp layout values (Blink LayoutUnit), the export will diverge');
      // x / y are derived for flow children (§1.5): an override on them is meaningless
      if (n.parent && doc.nodes[n.parent] && n.overrides) Object.keys(n.overrides).forEach(function (bp) {
        var g = n.overrides[bp] && n.overrides[bp].geometry; if (!g || (g.x === undefined && g.y === undefined)) return;
        var par = doc.nodes[n.parent], plp = bpIds.indexOf(bp) >= 0 ? effective(par, 'layoutParent', bp) : par.layoutParent;
        var lcC = bpIds.indexOf(bp) >= 0 ? effective(n, 'layoutChild', bp) : n.layoutChild;
        if (plp && plp.mode !== 'absolute' && lcC && lcC.position !== 'absolute') warn(p + '/overrides/' + bp + '/geometry', 'x/y override on a flow child is ignored (position is derived by the layout)');
      });
      if (n.overrides) Object.keys(n.overrides).forEach(function (bp) {
        if (bpIds.indexOf(bp) < 0) err(p + '/overrides/' + bp, 'unknown breakpoint');
        else if (bp === 'base') warn(p + '/overrides/base', "overrides on 'base' are ignored");
        Object.keys(n.overrides[bp] || {}).forEach(function (k) { if (OVERRIDABLE.indexOf(k) < 0 && k !== 'states') warn(p + '/overrides/' + bp + '/' + k, 'not an overridable property'); });
      });
      if (n.type === 'text') {
        if (!n.text || !n.text.paragraphs) err(p + '/text', 'text node needs RichText');
        if (!n.style || !isNumOrRef(n.style.size)) err(p + '/style', 'text node needs a TextStyle');
        if (['autoWidth', 'autoHeight', 'fixed'].indexOf(n.resize) < 0) err(p + '/resize', 'invalid resize mode');
      }
    });
    // cycles
    Object.keys(doc.nodes).forEach(function (id) {
      var n = doc.nodes[id], guard = 0, cur = n;
      while (cur && cur.parent) { cur = doc.nodes[cur.parent]; if (++guard > 10000 || cur === n) { err('/nodes/' + id, 'cycle in parent chain'); break; } }
    });
    // tokens: alias cycles / depth / unknown aliases (§4.4). Reported as warnings: the export
    // resolves such references to a neutral fallback instead of failing.
    var R = getResolve && getResolve();
    if (R && R.checkTokens && doc.tokens) R.checkTokens(doc).forEach(function (m) { warn('/tokens', m); });
    (doc.pages || []).forEach(function (pg, i) {
      (pg.children || []).forEach(function (cid, j) {
        var c = doc.nodes[cid];
        if (!c) err('/pages/' + i + '/children/' + j, 'root ' + cid + ' does not exist');
        else if (c.parent) err('/pages/' + i + '/children/' + j, 'root must have parent null');
      });
    });
    return errors;
  }

  /* ------------------------------------------------------------------ serialisation */

  function serialize(doc) { return JSON.stringify(doc); }
  function deserialize(json) {
    var doc = typeof json === 'string' ? JSON.parse(json) : json;
    if (!doc.version) doc.version = 3;
    if (!doc.tokens) doc.tokens = { sets: [], modes: [], activeMode: {} };
    if (!doc.styles) doc.styles = {}; if (!doc.assets) doc.assets = {}; if (!doc.components) doc.components = {};
    if (!doc.breakpoints) doc.breakpoints = defaultBreakpoints();
    if (!doc.settings) doc.settings = { snapToPixel: true, pixelGrid: false, rulers: true, units: 'px' };
    return doc;
  }
  function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }

  return {
    NODE_TYPES: NODE_TYPES, CONTAINER_TYPES: CONTAINER_TYPES, OVERRIDABLE: OVERRIDABLE, TAGS: TAGS, BLEND_MODES: BLEND_MODES,
    uuid: uuid, classOf: classOf,
    color: color, hex: hex, solid: solid, defaultTextStyle: defaultTextStyle, richText: richText, plainText: plainText,
    defaultLayoutParent: defaultLayoutParent, defaultBreakpoints: defaultBreakpoints,
    createNode: createNode, createDocument: createDocument, inferTag: inferTag, inferTags: inferTags,
    getNode: getNode, parentOf: parentOf, childrenOf: childrenOf, ancestors: ancestors, descendants: descendants, pageOf: pageOf,
    isContainer: isContainer, rootsOf: rootsOf, addNode: addNode, removeNode: removeNode, indexInParent: indexInParent,
    rotatedBBox: rotatedBBox, worldBox: worldBox,
    strokeMode: strokeMode, borderInsets: borderInsets,
    MAX_COORD: MAX_COORD, validateDocument: validateDocument, serialize: serialize, deserialize: deserialize, clone: clone
  };
});
