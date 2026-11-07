// js/components/board/svgUtils.js
const SVG_NS = 'http://www.w3.org/2000/svg';

// Creates an SVG element and sets all attributes in one call.
export function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
  return el;
}
