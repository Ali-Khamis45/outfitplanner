// Minimal standalone runtime for the design boards in this folder.
// Renders <x-dc> templates: {{expr}} bindings, <sc-for list as>, <sc-if value>,
// onClick / onChange handlers and the board's Component class (state + renderVals).
// Reference only. The real app is built in Next.js; do not import this file there.
(function () {
  class DCLogic {
    constructor(props) { this.props = props || {}; this.state = {}; }
    setState(patch) { Object.assign(this.state, typeof patch === 'function' ? patch(this.state) : patch); render(); }
    renderVals() { return {}; }
  }
  window.DCLogic = DCLogic;

  let root, template, inst;
  const BIND = /\{\{([\s\S]+?)\}\}/g;
  const ONE = /^\s*\{\{([\s\S]+?)\}\}\s*$/;
  const evalIn = (expr, scope) => {
    try { return new Function('s', 'with (s) { return (' + expr + '); }')(scope); }
    catch (e) { return undefined; }
  };
  const interp = (text, scope) => text.replace(BIND, (_, e) => { const v = evalIn(e, scope); return v == null ? '' : String(v); });

  function build(node, scope, out) {
    if (node.nodeType === 3) { out.push(document.createTextNode(interp(node.nodeValue, scope))); return; }
    if (node.nodeType !== 1) { out.push(node.cloneNode(true)); return; }
    const tag = node.tagName.toLowerCase();
    if (tag === 'sc-for') {
      const m = ONE.exec(node.getAttribute('list') || '');
      const list = m ? evalIn(m[1], scope) : [];
      const as = node.getAttribute('as') || 'item';
      (list || []).forEach((item, index) => {
        const sub = Object.create(scope); sub[as] = item; sub.index = index;
        node.childNodes.forEach((c) => build(c, sub, out));
      });
      return;
    }
    if (tag === 'sc-if') {
      const m = ONE.exec(node.getAttribute('value') || '');
      if (m && evalIn(m[1], scope)) node.childNodes.forEach((c) => build(c, scope, out));
      return;
    }
    const el = node.cloneNode(false);
    for (const a of Array.from(node.attributes)) {
      if (a.value.indexOf('{{') < 0) continue;
      const m = ONE.exec(a.value);
      const name = a.name.toLowerCase();
      if (m && name.startsWith('on')) {
        el.removeAttribute(a.name);
        const fn = evalIn(m[1], scope);
        if (typeof fn === 'function') el.addEventListener(name === 'onchange' ? 'change' : name.slice(2), fn);
      } else if (m && name === 'checked') {
        el.removeAttribute(a.name);
        el.checked = !!evalIn(m[1], scope);
      } else {
        el.setAttribute(a.name, interp(a.value, scope));
      }
    }
    const kids = [];
    node.childNodes.forEach((c) => build(c, scope, kids));
    kids.forEach((k) => el.appendChild(k));
    out.push(el);
  }

  function render() {
    const vals = Object.assign({}, inst ? inst.state : {}, inst ? inst.renderVals() : {});
    const scope = Object.create(null);
    Object.assign(scope, vals);
    const out = [];
    template.forEach((n) => build(n, scope, out));
    root.replaceChildren(...out);
  }

  document.addEventListener('DOMContentLoaded', () => {
    root = document.querySelector('x-dc');
    if (!root) return;
    template = Array.from(root.childNodes).map((n) => n.cloneNode(true));
    const script = document.querySelector('script[data-dc-script]');
    if (script) {
      try {
        const Component = new Function('DCLogic', script.textContent + '\n;return Component;')(DCLogic);
        inst = new Component({});
      } catch (e) { console.error('board script failed', e); }
    }
    render();
  });
})();
