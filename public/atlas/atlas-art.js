(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var CREAM = '#f5efdf';
  var PAPER = '#fffaf0';
  var INK = '#183f35';
  var FOREST = '#28624c';
  var MOSS = '#78a478';
  var SAGE = '#b8cfa7';
  var GOLD = '#d7a654';
  var BLUE = '#4d91a4';
  var BLUE_DARK = '#286275';
  var FUTURE = '#927583';

  function node(name, attributes) {
    var element = document.createElementNS(NS, name);
    Object.keys(attributes || {}).forEach(function (key) {
      element.setAttribute(key, String(attributes[key]));
    });
    return element;
  }

  function add(parent, name, attributes) {
    var element = node(name, attributes);
    parent.appendChild(element);
    return element;
  }

  function line(parent, x1, y1, x2, y2, stroke, width, extra) {
    var attributes = Object.assign({ x1: x1, y1: y1, x2: x2, y2: y2, stroke: stroke, 'stroke-width': width, 'stroke-linecap': 'round' }, extra || {});
    return add(parent, 'line', attributes);
  }

  function polygon(parent, points, fill, stroke, width, extra) {
    var attributes = Object.assign({ points: points, fill: fill, stroke: stroke || 'none' }, extra || {});
    if (width) attributes['stroke-width'] = width;
    return add(parent, 'polygon', attributes);
  }

  function base(svg) {
    polygon(svg, '46,179 198,83 355,160 202,221', PAPER, '#d9d0b9', 2);
    line(svg, 68, 178, 202, 215, '#e2dac5', 1);
    line(svg, 119, 145, 272, 199, '#e2dac5', 1);
    line(svg, 198, 84, 202, 215, '#e2dac5', 1);
  }

  function tree(svg, x, y, scale) {
    var g = add(svg, 'g', { transform: 'translate(' + x + ' ' + y + ') scale(' + scale + ')' });
    polygon(g, '0,28 17,18 35,28 18,39', '#386e53', INK, 1.5);
    polygon(g, '2,17 18,7 34,17 18,27', MOSS, INK, 1.5);
    polygon(g, '5,8 18,0 31,8 18,18', '#9fc28f', INK, 1.5);
    polygon(g, '16,38 20,38 23,54 19,57', '#9c7547', INK, 1.5);
    return g;
  }

  function playground(svg) {
    tree(svg, 69, 117, 1.15);
    tree(svg, 282, 105, 1.28);
    tree(svg, 318, 143, 0.82);
    var g = add(svg, 'g', { 'stroke-linejoin': 'round' });
    polygon(g, '123,140 184,102 239,127 177,168', '#e2b55f', INK, 2);
    polygon(g, '123,140 177,168 177,199 123,171', '#c98c45', INK, 2);
    polygon(g, '177,168 239,127 239,158 177,199', GOLD, INK, 2);
    polygon(g, '135,134 184,104 224,122 176,151', '#f4d48b', INK, 2);
    line(g, 144, 169, 144, 121, INK, 4);
    line(g, 144, 121, 194, 142, INK, 4);
    line(g, 194, 142, 194, 184, INK, 4);
    line(g, 159, 127, 159, 178, '#fff8e5', 3);
    line(g, 175, 134, 175, 180, '#fff8e5', 3);
    polygon(g, '193,185 228,158 233,161 202,196', '#e97e55', INK, 2);
    polygon(g, '202,196 233,161 233,169 207,202', '#c95d43', INK, 2);
    line(g, 112, 177, 139, 187, FOREST, 4);
    line(g, 112, 177, 112, 193, FOREST, 4);
    line(g, 139, 187, 139, 201, FOREST, 4);
  }

  function courts(svg) {
    tree(svg, 67, 135, 0.83);
    tree(svg, 309, 112, 1.05);
    var g = add(svg, 'g', { 'stroke-linejoin': 'round' });
    polygon(g, '84,154 211,90 317,134 188,203', BLUE, INK, 2.5);
    polygon(g, '84,154 188,203 188,215 84,166', '#397c86', INK, 2);
    polygon(g, '188,203 317,134 317,146 188,215', BLUE_DARK, INK, 2);
    polygon(g, '105,151 210,99 295,135 189,190', '#69aeb0', '#e9e6cb', 2);
    line(g, 150, 128, 239, 164, '#f8f1d9', 2);
    line(g, 132, 164, 219, 113, '#f8f1d9', 2);
    line(g, 195, 189, 281, 137, '#f8f1d9', 2);
    line(g, 194, 119, 194, 180, '#fff9e8', 3);
    line(g, 194, 119, 254, 143, '#fff9e8', 3);
    line(g, 194, 180, 254, 155, '#fff9e8', 3);
    line(g, 194, 119, 194, 184, INK, 2);
    line(g, 254, 143, 254, 158, INK, 2);
    line(g, 200, 127, 249, 146, INK, 1, { 'stroke-dasharray': '3 3' });
    line(g, 200, 137, 249, 155, INK, 1, { 'stroke-dasharray': '3 3' });
  }

  function center(svg) {
    tree(svg, 61, 132, 0.92);
    tree(svg, 303, 119, 1.05);
    var g = add(svg, 'g', { 'stroke-linejoin': 'round' });
    polygon(g, '103,151 191,100 289,133 199,190', '#e7d3a7', INK, 2);
    polygon(g, '103,151 199,190 199,210 103,171', '#c99056', INK, 2);
    polygon(g, '199,190 289,133 289,157 199,210', '#d9ac6f', INK, 2);
    polygon(g, '118,146 191,105 272,133 198,174', '#fcf4dc', INK, 2);
    polygon(g, '118,154 197,184 274,143 274,154 198,196 118,166', '#b45a45', INK, 2);
    line(g, 140, 166, 140, 183, INK, 2);
    line(g, 162, 174, 162, 191, INK, 2);
    line(g, 224, 164, 224, 187, INK, 2);
    line(g, 247, 151, 247, 174, INK, 2);
    add(g, 'circle', { cx: 225, cy: 120, r: 13, fill: FOREST, stroke: INK, 'stroke-width': 2 });
    add(g, 'path', { d: 'M219 116c3-5 11-4 11 2 0 6-8 9-10 13l-2-1c1-4 6-7 6-11 0-2-2-3-4-1z', fill: PAPER });
    line(g, 225, 133, 225, 147, INK, 2);
  }

  function park(svg) {
    var g = add(svg, 'g', { 'stroke-linejoin': 'round' });
    polygon(g, '70,172 198,100 326,151 201,215', '#bdd49f', INK, 2);
    polygon(g, '144,181 183,153 247,177 203,201', '#f2d28b', '#c59e61', 2);
    polygon(g, '144,181 203,201 203,211 144,191', '#d2aa64', '#c59e61', 1.5);
    tree(svg, 87, 124, 1.35);
    tree(svg, 136, 111, 0.88);
    tree(svg, 269, 114, 1.28);
    tree(svg, 302, 151, 0.8);
    add(g, 'circle', { cx: 205, cy: 154, r: 14, fill: '#84b375', stroke: INK, 'stroke-width': 2 });
    add(g, 'circle', { cx: 205, cy: 154, r: 5, fill: PAPER, stroke: INK, 'stroke-width': 1.5 });
  }

  function future(svg) {
    var g = add(svg, 'g', { opacity: 0.95, 'stroke-linejoin': 'round' });
    polygon(g, '86,158 193,98 305,140 198,204', 'none', FUTURE, 2, { 'stroke-dasharray': '6 5' });
    polygon(g, '119,149 191,109 264,135 197,174', 'none', FUTURE, 2);
    polygon(g, '119,149 197,174 197,199 119,173', 'none', FUTURE, 2);
    polygon(g, '197,174 264,135 264,159 197,199', 'none', FUTURE, 2);
    line(g, 143, 148, 143, 175, FUTURE, 2);
    line(g, 166, 157, 166, 184, FUTURE, 2);
    line(g, 223, 159, 223, 182, FUTURE, 2);
    add(g, 'circle', { cx: 193, cy: 83, r: 18, fill: PAPER, stroke: FUTURE, 'stroke-width': 2 });
    line(g, 193, 72, 193, 94, FUTURE, 2);
    line(g, 182, 83, 204, 83, FUTURE, 2);
    line(g, 193, 101, 193, 110, FUTURE, 2, { 'stroke-dasharray': '3 3' });
  }

  function landmark(kind) {
    var allowed = ['playground', 'courts', 'center', 'park', 'future'];
    var selected = allowed.indexOf(kind) === -1 ? 'future' : kind;
    var svg = node('svg', {
      viewBox: '0 0 400 240',
      xmlns: NS,
      role: 'img',
      'aria-label': 'Illustrative ' + selected + ' landmark',
      focusable: 'false'
    });
    var title = add(svg, 'title');
    title.textContent = 'Illustrative ' + selected + ' landmark';
    base(svg);
    ({ playground: playground, courts: courts, center: center, park: park, future: future })[selected](svg);
    return svg;
  }

  window.AtlasArt = window.AtlasArt || {};
  window.AtlasArt.landmark = landmark;
}());
